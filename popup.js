'use strict';

const DEFAULTS = {
  hideOverlays: true,
  revealText: true,
  removeBlur: true,
  restoreScroll: true,
  watchChanges: true,
  overlaySelectors: '.paywall-overlay\n[class*="paywall-overlay"]\n[id*="paywall-overlay"]\n#premium-gate\n.modal-backdrop',
  textSelectors: 'article p\nmain article p\n[itemprop="articleBody"] p\n.article-body p'
};
const CHECKBOXES = ['hideOverlays', 'revealText', 'removeBlur', 'restoreScroll', 'watchChanges'];
const TEXTFIELDS = ['overlaySelectors', 'textSelectors'];
const $ = id => document.getElementById(id);
let tab = null;
let siteKey = null;

function showStatus(message, type = '') {
  $('status').textContent = message;
  $('status').className = `status ${type}`.trim();
}

function updateInputs(settings) {
  for (const name of CHECKBOXES) $(name).checked = !!settings[name];
  for (const name of TEXTFIELDS) $(name).value = settings[name];
}

function readSettings() {
  const settings = {};
  for (const name of CHECKBOXES) settings[name] = $(name).checked;
  for (const name of TEXTFIELDS) settings[name] = $(name).value;
  return settings;
}

// Newlines separate selectors. A line can itself contain a comma-separated selector list.
function normalizedSelectors(value) {
  return value.split(/\r?\n/).map(s => s.trim()).filter(Boolean).join(', ');
}

function validatedSettings() {
  const settings = readSettings();
  for (const field of TEXTFIELDS) {
    const css = normalizedSelectors(settings[field]);
    if (css) {
      try { document.querySelector(css); }
      catch { throw new Error(`Invalid CSS selector in ${field === 'overlaySelectors' ? 'Overlay elements' : 'Article text elements'}.`); }
    }
    settings[field] = css;
  }
  return settings;
}

function setButtonsEnabled(enabled) {
  for (const id of ['apply', 'restore', 'save']) $(id).disabled = !enabled;
}

async function injectController() {
  await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['content.js'] });
}

async function sendCommand(action, settings) {
  // Injection is idempotent and runs only after an explicit user action.
  await injectController();
  const response = await chrome.tabs.sendMessage(tab.id, { channel: 'CONTENT_UNHIDER_V1', action, settings });
  if (!response?.ok) throw new Error(response?.error || 'Could not update this page.');
  return response.data || {};
}

async function perform(action) {
  if (!tab?.id) return;
  try {
    setButtonsEnabled(false);
    const settings = action === 'apply' ? validatedSettings() : undefined;
    const result = await sendCommand(action, settings);
    if (action === 'apply') {
      showStatus(`Applied to this tab. Adjusted ${result.elementsChanged} element(s). ${result.observerEnabled ? 'Dynamic watching enabled.' : 'Dynamic watching off.'}`, 'success');
    } else {
      showStatus(`Restored ${result.elementsRestored} element(s) to their previous inline styles.`, 'success');
    }
  } catch (err) {
    showStatus(err?.message || 'Operation failed.', 'error');
  } finally {
    setButtonsEnabled(true);
  }
}

async function initialize() {
  updateInputs(DEFAULTS);
  setButtonsEnabled(false);
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    tab = tabs[0];
    const url = new URL(tab?.url || '');
    if (!['http:', 'https:'].includes(url.protocol)) {
      $('host').textContent = 'Unsupported browser page';
      $('tab-support').textContent = 'Open a normal HTTP or HTTPS webpage to use this extension.';
      showStatus('Chrome blocks extensions from modifying browser and internal pages.', 'error');
      return;
    }
    $('host').textContent = url.hostname;
    siteKey = `siteSettings:${url.hostname}`;
    const stored = await chrome.storage.local.get(siteKey);
    if (stored[siteKey]) updateInputs({ ...DEFAULTS, ...stored[siteKey] });
    showStatus(stored[siteKey] ? 'Saved site settings loaded.' : 'Ready. Using default settings.');
    setButtonsEnabled(true);
  } catch (err) {
    showStatus(`Cannot access this tab: ${err.message}`, 'error');
  }
}

$('settings').addEventListener('submit', e => { e.preventDefault(); perform('apply'); });
$('restore').addEventListener('click', () => perform('restore'));
$('save').addEventListener('click', async () => {
  if (!siteKey) return;
  try {
    setButtonsEnabled(false);
    // Validate before saving. Keep the multiline form as entered.
    validatedSettings();
    await chrome.storage.local.set({ [siteKey]: readSettings() });
    showStatus('Saved settings for this website. Apply manually on each new page.', 'success');
  } catch (err) {
    showStatus(err?.message || 'Could not save settings.', 'error');
  } finally { setButtonsEnabled(true); }
});
initialize();
