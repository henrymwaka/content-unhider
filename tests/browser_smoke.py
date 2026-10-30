"""Chromium smoke tests for page DOM logic and the popup, with Chrome APIs mocked.

Usage:
  pip install playwright
  playwright install chromium
  python tests/browser_smoke.py

This is NOT a full extension-installation or activeTab permission test.
"""
import os
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


def test_controller(browser):
    p = browser.new_page()
    p.set_content((ROOT / 'examples/demo.html').read_text())
    p.evaluate("""() => {
      window._listeners=[];
      window.chrome={runtime:{onMessage:{addListener:f=>_listeners.push(f)}}};
      window.command=(action,settings)=>{
        let result;
        _listeners[0]({channel:'CONTENT_UNHIDER_V1',action,settings},null,r=>result=r);
        return result;
      };
    }""")
    p.add_script_tag(content=(ROOT / 'content.js').read_text())
    assert p.evaluate('_listeners.length') == 1
    before = p.evaluate("""() => ({
      overlay:getComputedStyle(document.querySelector('.demo-overlay')).display,
      hidden:getComputedStyle(document.querySelector('.locked')).display,
      blur:getComputedStyle(document.querySelector('.blurred')).filter,
      scroll:getComputedStyle(document.body).overflow})""")
    assert before['overlay'] == 'grid' and before['hidden'] == 'none'
    assert 'blur(' in before['blur'] and before['scroll'] == 'hidden'
    config = dict(hideOverlays=True, revealText=True, removeBlur=True,
        restoreScroll=True, watchChanges=True,
        overlaySelectors='.demo-overlay', textSelectors='article p')
    assert p.evaluate('(s)=>command("apply",s)',config)['ok']
    after = p.evaluate("""() => ({
      overlay:getComputedStyle(document.querySelector('.demo-overlay')).display,
      hidden:getComputedStyle(document.querySelector('.locked')).display,
      blur:getComputedStyle(document.querySelector('.blurred')).filter,
      scroll:getComputedStyle(document.body).overflow})""")
    assert after['overlay'] == 'none' and after['hidden'] != 'none'
    assert after['blur'] == 'none' and after['scroll'] == 'auto'
    p.evaluate("""() => {
      const el=document.createElement('aside'); el.id='dynamic-overlay';
      el.className='demo-overlay'; el.style.display='flex';
      document.body.appendChild(el);
    }""")
    p.wait_for_function("getComputedStyle(document.querySelector('#dynamic-overlay')).display === 'none'")
    assert p.evaluate('command("restore")')['ok']
    restored = p.evaluate("""() => ({
      overlay:getComputedStyle(document.querySelector('.demo-overlay')).display,
      hidden:getComputedStyle(document.querySelector('.locked')).display,
      blur:getComputedStyle(document.querySelector('.blurred')).filter,
      scroll:getComputedStyle(document.body).overflow,
      dynamic:document.querySelector('#dynamic-overlay').style.display})""")
    assert restored['overlay'] == 'grid' and restored['hidden'] == 'none'
    assert 'blur(' in restored['blur'] and restored['scroll'] == 'hidden'
    assert restored['dynamic'] == 'flex'
    assert not p.evaluate('(s)=>command("apply",s)',{**config,'overlaySelectors':'article['})['ok']
    assert p.evaluate('command("restore")')['ok']
    p.close()
    print('PASS Chromium: DOM modifications, dynamic updates, restore and invalid CSS')


def test_popup(browser):
    p=browser.new_page()
    html=(ROOT/'popup.html').read_text()
    html=html.replace('<script src="popup.js" defer></script>', '')
    html=html.replace('<link rel="stylesheet" href="popup.css">',
                      '<style>'+(ROOT/'popup.css').read_text()+'</style>')
    p.set_content(html)
    p.evaluate("""() => {
      window._saved={};
      window.chrome={
        tabs:{query:async()=>[{id:123,url:'https://example.org/demo'}],
          sendMessage:async()=>({ok:true,data:{elementsChanged:4,observerEnabled:true,elementsRestored:4}})},
        scripting:{executeScript:async()=>[]},
        storage:{local:{get:async key=>({[key]:_saved[key]}),
                        set:async obj=>Object.assign(_saved,obj)}}
      };
    }""")
    p.add_script_tag(content=(ROOT/'popup.js').read_text())
    p.locator('#host').get_by_text('example.org').wait_for()
    p.locator('#apply').click()
    p.locator('#status.success').wait_for()
    assert 'Adjusted 4' in p.locator('#status').inner_text()
    p.locator('#save').click()
    assert p.evaluate("Object.keys(_saved).includes('siteSettings:example.org')")
    p.locator('#restore').click()
    assert 'Restored 4' in p.locator('#status').inner_text()
    p.locator('#selectors-section summary').click()
    p.locator('#overlaySelectors').fill('article[')
    p.locator('#apply').click()
    p.locator('#status.error').wait_for()
    assert 'Invalid CSS selector' in p.locator('#status').inner_text()
    p.close()
    print('PASS Chromium: popup Apply, Save, Restore and validation')


if __name__ == '__main__':
    with sync_playwright() as pw:
        options={'headless':True}
        if os.environ.get('CHROMIUM_PATH'):
            options['executable_path']=os.environ['CHROMIUM_PATH']
        browser=pw.chromium.launch(**options)
        try:
            test_controller(browser)
            test_popup(browser)
        finally:
            browser.close()
    print('Browser smoke tests passed (Chrome extension APIs mocked).')
