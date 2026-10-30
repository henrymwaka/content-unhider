(() => {
  'use strict';

  // Guard against adding multiple listeners when the user clicks Apply repeatedly.
  if (globalThis.__contentUnhiderControllerV1) return;

  const changed = new Map();
  let observer = null;
  let debounceTimer = null;
  let currentSettings = null;

  function queryAll(selectors) {
    return selectors ? Array.from(document.querySelectorAll(selectors)) : [];
  }

  function setInlineStyle(element, property, value) {
    if (!(element instanceof Element)) return false;
    if (element.style.getPropertyValue(property) === value &&
        element.style.getPropertyPriority(property) === 'important') return false;
    if (!changed.has(element)) changed.set(element, new Map());
    const original = changed.get(element);
    if (!original.has(property)) {
      original.set(property, {
        value: element.style.getPropertyValue(property),
        priority: element.style.getPropertyPriority(property)
      });
    }
    element.style.setProperty(property, value, 'important');
    return true;
  }

  function blurPresent(style) {
    return /blur\s*\(/i.test(style);
  }

  function adjustPage(settings) {
    if (!document.body) throw new Error('The page is not ready yet.');
    let changedNow = 0;

    const targets = queryAll(settings.textSelectors);
    const targetSet = new Set(targets);

    if (settings.hideOverlays) {
      for (const el of queryAll(settings.overlaySelectors)) {
        // Don't accidentally hide an entire article or a container that holds one.
        if (el.matches('article, main, [itemprop="articleBody"]') ||
            el.querySelector('article, main, [itemprop="articleBody"]')) continue;
        if (targetSet.has(el)) continue;
        if (setInlineStyle(el, 'display', 'none')) changedNow++;
      }
    }

    if (settings.revealText || settings.removeBlur) {
      for (const target of targets) {
        // Only modify the target and the ancestor chain, not arbitrary divs in the page.
        // This also handles paragraphs hidden by a parent wrapper's display:none.
        let el = target;
        let levels = 0;
        while (el && el !== document.documentElement && levels < 24) {
          const style = getComputedStyle(el);
          if (settings.revealText) {
            if (style.display === 'none' && setInlineStyle(el, 'display', 'revert')) changedNow++;
            if (style.visibility === 'hidden' && setInlineStyle(el, 'visibility', 'visible')) changedNow++;
          }
          if (settings.removeBlur) {
            if (blurPresent(style.filter) && setInlineStyle(el, 'filter', 'none')) changedNow++;
            if (blurPresent(style.backdropFilter || '') && setInlineStyle(el, 'backdrop-filter', 'none')) changedNow++;
          }
          // Avoid changing page/body-wide visibility in an effort to unhide one paragraph.
          if (el === document.body) break;
          el = el.parentElement;
          levels++;
        }
      }
    }

    if (settings.restoreScroll) {
      for (const el of [document.body, document.documentElement]) {
        const style = getComputedStyle(el);
        for (const prop of ['overflow', 'overflow-y']) {
          const computed = prop === 'overflow' ? style.overflow : style.overflowY;
          if (computed === 'hidden' || computed === 'clip') {
            if (setInlineStyle(el, prop, 'auto')) changedNow++;
          }
        }
      }
    }
    return changedNow;
  }

  function stopObserver() {
    if (observer) observer.disconnect();
    observer = null;
    if (debounceTimer !== null) clearTimeout(debounceTimer);
    debounceTimer = null;
  }

  function restoreStyles() {
    stopObserver();
    const count = changed.size;
    for (const [el, properties] of changed) {
      for (const [property, original] of properties) {
        if (original.value) el.style.setProperty(property, original.value, original.priority);
        else el.style.removeProperty(property);
      }
    }
    changed.clear();
    currentSettings = null;
    return { elementsRestored: count };
  }

  function apply(settings) {
    // If applying a new configuration, undo the previous one first.
    restoreStyles();
    currentSettings = settings;
    adjustPage(settings);
    if (settings.watchChanges) {
      observer = new MutationObserver(() => {
        if (debounceTimer !== null) return;
        debounceTimer = setTimeout(() => {
          debounceTimer = null;
          if (currentSettings) adjustPage(currentSettings);
        }, 180);
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'hidden']
      });
    }
    return { elementsChanged: changed.size, observerEnabled: !!observer };
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message?.channel !== 'CONTENT_UNHIDER_V1') return;
    try {
      if (message.action === 'apply') {
        sendResponse({ ok: true, data: apply(message.settings || {}) });
      } else if (message.action === 'restore') {
        sendResponse({ ok: true, data: restoreStyles() });
      } else if (message.action === 'status') {
        sendResponse({ ok: true, data: { active: !!currentSettings, elementsChanged: changed.size } });
      } else {
        sendResponse({ ok: false, error: 'Unknown action.' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err?.message || 'Failed to modify this page.' });
    }
  });

  globalThis.__contentUnhiderControllerV1 = true;
})();
