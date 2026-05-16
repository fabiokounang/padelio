(function () {
  'use strict';

  var STORAGE_KEY = 'padelio-theme';
  var META_DARK = '#100e14';
  var META_LIGHT = '#f4f2ef';

  function getStoredTheme() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function setStoredTheme(theme) {
    try {
      localStorage.setItem(STORAGE_KEY, theme);
    } catch {
      /* ignore */
    }
  }

  /**
   * Apply theme to document root (Tailwind darkMode: 'class').
   * @param {'dark'|'light'} theme
   * @param {boolean} [persist]
   */
  function applyTheme(theme, persist) {
    var root = document.documentElement;
    var isDark = theme === 'dark';
    root.classList.toggle('dark', isDark);
    var metas = document.querySelectorAll('meta[name="theme-color"]');
    var color = isDark ? META_DARK : META_LIGHT;
    metas.forEach(function (m) {
      m.setAttribute('content', color);
    });
    if (persist) setStoredTheme(theme);
  }

  /** First paint: avoid wrong flash (runs before layout; safe if <html> has class="dark" in markup). */
  function initThemeFromStorage() {
    var t = getStoredTheme();
    if (t === 'light') {
      applyTheme('light', false);
    } else {
      applyTheme('dark', false);
    }
  }

  function getTheme() {
    return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
  }

  function setTheme(theme) {
    var t = theme === 'light' ? 'light' : 'dark';
    applyTheme(t, true);
  }

  function toggleTheme() {
    setTheme(getTheme() === 'dark' ? 'light' : 'dark');
  }

  initThemeFromStorage();

  window.padelioTheme = {
    get: getTheme,
    set: setTheme,
    toggle: toggleTheme,
    STORAGE_KEY: STORAGE_KEY,
  };
  window.padelioToggleTheme = toggleTheme;
})();
