# Content Unhider v1.0

A working, local-only Chrome Manifest V3 extension for on-demand page-style adjustments. It can hide specific CSS overlays, reveal article paragraphs that are hidden in the page's existing DOM, remove blur filters, and restore scrolling. It can watch for dynamic changes, remember settings per hostname, and reverse its inline-style changes.

## Install in Chrome

1. Unzip `content-unhider-extension.zip` to a folder on your computer.
2. Open Chrome at `chrome://extensions/`.
3. Turn on **Developer mode**.
4. Click **Load unpacked** and select the **content-unhider-extension** folder containing `manifest.json`.
5. Pin **Content Unhider** to your toolbar from the Extensions menu.
6. Open an ordinary `https://` website, click the extension icon, and choose **Apply to this tab**.

## Configure a website

- Expand **Site-specific CSS selectors** in the popup.
- Use Chrome DevTools (`F12` or **Inspect**) to identify precise overlay classes/IDs and the article paragraphs you need to adjust.
- Enter one CSS selector per line. The sample defaults can be replaced as needed.
- Click **Apply to this tab**. Changes apply to the current page, not globally.
- Click **Save settings for this site** to keep that site's preferences for next time. It saves the configuration only, not permission to run automatically.
- Click **Restore page** to undo inline style modifications made by the extension. A reload also removes temporary page changes.

### Test page

In a terminal, from the extension folder run `python -m http.server 8000` and visit `http://localhost:8000/examples/demo.html`. The sample deliberately contains an overlay, a hidden paragraph, a blurred paragraph, and a body scroll lock. Click **Apply to this tab**, then **Restore page** to see the effect. Use Ctrl+C to stop the local server.

## Permissions and privacy

- `activeTab`: temporary access to the tab you explicitly choose.
- `scripting`: run the extension controller in that tab.
- `storage`: save per-site selector preferences locally.

No permanent `<all_urls>` host permission, background service, analytics, remote code, external requests, or browsing-history collection. No account or API key needed.

## Limitations

- Can only change content that the browser has already received. It cannot retrieve missing subscriber-only text, bypass an authentication service, decrypt content, or grant access to a protected server.
- The default CSS selectors are only examples. Different websites use different CSS and may need custom selectors.
- Scroll locks and text masking implemented by complex site JavaScript, frames, shadow DOM, canvas, or server-side controls may not be adjustable.
- Hiding a full article container by mistake will obscure the article; use targeted overlay selectors.
- Undo restores the original inline styles recorded by the extension. It cannot guarantee restoration of site scripts or layout changes made by the website itself in the meantime; reload to reset.
- Respect website access rules and content rights. Use only where you are authorized to view the content.

## Source files

- `manifest.json` defines the extension and minimal permissions.
- `popup.html`, `popup.css`, `popup.js` implement the control panel and per-site settings.
- `content.js` contains the reversible DOM-style controller and mutation observer.
- `icons/` contains PNG icons for Chrome.
- `examples/demo.html` provides a local test page.

## Developer notes

No build step or third-party dependencies. If you edit code, reload the extension at `chrome://extensions/`, then refresh the tested webpage. You can inspect popup errors by right-clicking the extension popup and choosing **Inspect**. Use Chrome's DevTools for page-specific CSS selectors.
