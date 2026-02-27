/* /_sdk/data_sdk.js
   Minimal Data SDK stub:
   - Stores records in localStorage (array of objects)
   - Supports init(handler), create, update, delete
   - Adds __backendId to created records
   - Calls handler.onDataChanged(data) on every mutation
*/

(function () {
  const STORAGE_KEY = 'padel_americano_data_v1';

  function safeJsonParse(str, fallback) {
    try {
      const v = JSON.parse(str);
      return Array.isArray(v) ? v : fallback;
    } catch {
      return fallback;
    }
  }

  function safeJsonStringify(obj) {
    try {
      return JSON.stringify(obj);
    } catch {
      return '[]';
    }
  }

  function loadAll() {
    const raw = localStorage.getItem(STORAGE_KEY);
    return safeJsonParse(raw, []);
  }

  function saveAll(arr) {
    localStorage.setItem(STORAGE_KEY, safeJsonStringify(arr || []));
  }

  function genId() {
    // reasonably unique for local usage
    return 't_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
  }

  const dataSdk = {
    _handler: null,

    async init(handler) {
      this._handler = handler && typeof handler.onDataChanged === 'function' ? handler : null;

      // ensure storage exists
      const data = loadAll();
      saveAll(data);

      // notify initial
      if (this._handler) {
        try {
          this._handler.onDataChanged(data);
        } catch (e) {
          console.error(e);
        }
      }

      return { isOk: true };
    },

    async _emit() {
      if (!this._handler) return;
      const data = loadAll();
      try {
        this._handler.onDataChanged(data);
      } catch (e) {
        console.error(e);
      }
    },

    async list() {
      return { isOk: true, data: loadAll() };
    },

    async create(record) {
      try {
        const data = loadAll();

        const item = { ...(record || {}) };
        if (!item.__backendId) item.__backendId = genId();

        data.unshift(item);
        saveAll(data);
        await this._emit();

        return { isOk: true, data: item };
      } catch (e) {
        console.error(e);
        return { isOk: false, error: String(e) };
      }
    },

    async update(record) {
      try {
        const data = loadAll();
        const id = record && record.__backendId;
        if (!id) return { isOk: false, error: '__backendId is required' };

        const idx = data.findIndex((x) => x && x.__backendId === id);
        if (idx === -1) return { isOk: false, error: 'Record not found' };

        data[idx] = { ...(data[idx] || {}), ...(record || {}) };
        saveAll(data);
        await this._emit();

        return { isOk: true, data: data[idx] };
      } catch (e) {
        console.error(e);
        return { isOk: false, error: String(e) };
      }
    },

    async delete(record) {
      try {
        const data = loadAll();
        const id = record && record.__backendId;
        if (!id) return { isOk: false, error: '__backendId is required' };

        const next = data.filter((x) => x && x.__backendId !== id);
        saveAll(next);
        await this._emit();

        return { isOk: true };
      } catch (e) {
        console.error(e);
        return { isOk: false, error: String(e) };
      }
    },

    // Optional helper (handy for debugging)
    async clearAll() {
      try {
        saveAll([]);
        await this._emit();
        return { isOk: true };
      } catch (e) {
        console.error(e);
        return { isOk: false, error: String(e) };
      }
    }
  };

  window.dataSdk = dataSdk;
})();