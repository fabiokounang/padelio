/* /_sdk/element_sdk.js
   Minimal Element SDK stub:
   - Persists config in localStorage
   - Calls onConfigChange on init and whenever config is updated
*/

(function () {
  const STORAGE_KEY = 'padel_americano_element_config_v1';

  function safeJsonParse(str, fallback) {
    try {
      const v = JSON.parse(str);
      return v && typeof v === 'object' ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function safeJsonStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch {
      return '{}';
    }
  }

  function loadConfig(defaultConfig) {
    const raw = localStorage.getItem(STORAGE_KEY);
    const stored = safeJsonParse(raw, {});
    return { ...(defaultConfig || {}), ...(stored || {}) };
  }

  function saveConfig(config) {
    localStorage.setItem(STORAGE_KEY, safeJsonStringify(config || {}));
  }

  const elementSdk = {
    _config: {},
    _callbacks: {
      onConfigChange: null,
    },

    init(opts) {
      const {
        defaultConfig = {},
        onConfigChange,
        mapToCapabilities,
        mapToEditPanelValues,
      } = opts || {};

      this._callbacks.onConfigChange = typeof onConfigChange === 'function' ? onConfigChange : null;

      // Load merged config (default + stored)
      this._config = loadConfig(defaultConfig);
      saveConfig(this._config);

      // Fire config change immediately
      if (this._callbacks.onConfigChange) {
        Promise.resolve(this._callbacks.onConfigChange(this._config)).catch(console.error);
      }

      // Expose capabilities + edit panel values (not used by your app right now, but kept for compatibility)
      this.capabilities = typeof mapToCapabilities === 'function' ? mapToCapabilities(this._config) : {};
      this.editPanelValues = typeof mapToEditPanelValues === 'function' ? mapToEditPanelValues(this._config) : new Map();

      return { isOk: true };
    },

    getConfig() {
      return { ...(this._config || {}) };
    },

    // Optional helper if someday you want to update config programmatically
    updateConfig(patch) {
      const next = { ...(this._config || {}), ...(patch || {}) };
      this._config = next;
      saveConfig(next);

      if (this._callbacks.onConfigChange) {
        Promise.resolve(this._callbacks.onConfigChange(next)).catch(console.error);
      }
      return { isOk: true };
    },

    resetConfig(defaultConfig) {
      this._config = { ...(defaultConfig || {}) };
      saveConfig(this._config);

      if (this._callbacks.onConfigChange) {
        Promise.resolve(this._callbacks.onConfigChange(this._config)).catch(console.error);
      }
      return { isOk: true };
    }
  };

  window.elementSdk = elementSdk;
})();