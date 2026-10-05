/* Light / dark theme switch. Loaded in <head> so the saved choice applies
   before the page is drawn. "Auto" follows the phone or computer setting. */
(function () {
  'use strict';
  var KEY = 'ap-theme';
  var root = document.documentElement;
  var NEXT = { auto: 'light', light: 'dark', dark: 'auto' };
  var HINDI = /^hi\b/i.test(root.lang || '');
  var NAMES = HINDI ? { auto: 'ऑटो', light: 'लाइट', dark: 'डार्क' } : { auto: 'Auto', light: 'Light', dark: 'Dark' };

  function read() {
    try {
      var v = localStorage.getItem(KEY);
      return v === 'light' || v === 'dark' ? v : 'auto';
    } catch (e) {
      return 'auto';
    }
  }

  function save(mode) {
    try {
      if (mode === 'auto') localStorage.removeItem(KEY);
      else localStorage.setItem(KEY, mode);
    } catch (e) { /* the choice just will not be remembered */ }
  }

  function apply(mode) {
    if (mode === 'auto') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', mode);
  }

  var mode = read();
  if (mode !== 'auto') apply(mode);

  function render() {
    var buttons = document.querySelectorAll('.theme-toggle');
    for (var i = 0; i < buttons.length; i += 1) {
      var btn = buttons[i];
      btn.setAttribute('aria-label', HINDI
        ? 'थीम: ' + NAMES[mode] + '। ' + NAMES[NEXT[mode]] + ' पर बदलने के लिए टैप करें।'
        : 'Theme: ' + NAMES[mode] + '. Tap to change to ' + NAMES[NEXT[mode]] + '.');
      btn.title = (HINDI ? 'थीम: ' : 'Theme: ') + NAMES[mode];
      var use = btn.querySelector('use');
      if (use) use.setAttribute('href', use.getAttribute('href').split('#')[0] + '#i-theme-' + mode);
      var label = btn.querySelector('.theme-label');
      if (label) label.textContent = NAMES[mode];
    }
  }

  function init() {
    render();
    document.addEventListener('click', function (event) {
      var btn = event.target.closest && event.target.closest('.theme-toggle');
      if (!btn) return;
      mode = NEXT[mode];
      apply(mode);
      save(mode);
      render();
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
