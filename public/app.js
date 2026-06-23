

/* ============================================================================
 * FILE 2: app.js  (API client + IndexedDB Write Queue)
 * Place in project root. Loaded by index.html before the React bundle.
 * ============================================================================
 *
 * Exports (as globals, available to the React frontend):
 *   window.apiCall(action, payload)   → Promise<{ success, data?, error? }>
 *   window.writeQueue                 → WriteQueueManager instance
 *   window.queueWrite(action,payload) → wraps writeQueue.add with toast
 *   window.pendingState               → Map of entityKey → pending payload
 *   window.updateUnsavedIndicator()   → refreshes the unsaved-writes badge
 * ============================================================================ */

// ── Constants ─────────────────────────────────────────────────────────────────
const API_BASE        = '/api';              // proxied by Netlify to Apps Script
const FLUSH_INTERVAL  = 30_000;             // 30 s between automatic flushes
const MAX_RETRIES     = 5;
const QUEUE_SIZE_MAX  = 100;

// ── Session helpers ───────────────────────────────────────────────────────────
// Token + sessionSecret are written here by handleLogin() (see index.html)
// and read back by apiCall on every request. Using sessionStorage means they
// are cleared when the tab closes (no persistent auth token on disk).

function getSession() {
  return {
    token:         sessionStorage.getItem('milkapp_token')  || '',
    sessionSecret: sessionStorage.getItem('milkapp_secret') || '',
  };
}

// Exposed on window because the pre-React PIN login flow in index.html calls
// saveSession(...) before this module's bundle would export anything — same
// cross-file contract as window.apiCall / window.queueWrite below.
window.saveSession = function saveSession(token, sessionSecret) {
  sessionStorage.setItem('milkapp_token',  token);
  sessionStorage.setItem('milkapp_secret', sessionSecret);
};

function clearSession() {
  sessionStorage.removeItem('milkapp_token');
  sessionStorage.removeItem('milkapp_secret');
}

// ── Core API call ─────────────────────────────────────────────────────────────
/**
 * apiCall — sends a POST to /api (the Netlify proxy). Automatically attaches
 * the current session token + sessionSecret. Returns the parsed JSON body.
 * Never throws — callers check res.success instead.
 */
window.apiCall = async function apiCall(action, payload = {}) {
  const { token, sessionSecret } = getSession();
  try {
    const res = await fetch(API_BASE, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action, payload, token, sessionSecret }),
    });
    const json = await res.json();
    // If the session expired on the server, clear local session and reload
    if (!json.success && json.error?.code === 'UNAUTHORIZED') {
      clearSession();
      window.location.reload();
    }
    return json;
  } catch (err) {
    return { success: false, error: { code: 'NETWORK_ERROR', message: err.message } };
  }
};

// ── resolveEntityKey ──────────────────────────────────────────────────────────
function resolveEntityKey(action, payload) {
  switch (action) {
    case 'recordPayment':     return 'payment:'    + payload.billId;
    case 'addAdjustment':     return 'adj:'        + payload.customerId + ':' + (payload.date || '');
    case 'addCustomer':       return 'cust:'       + String(payload.deliveryAddress || '').trim();
    case 'updateCustomer':    return 'cust-upd:'   + payload.customerId;
    case 'bulkUpsertLogs':    return 'logs-bulk:'  + (payload.logs || []).map(l => l.logId || '?').join(',');
    case 'updateLogEntry':    return 'log-upd:'    + payload.logId;
    case 'updateBill':        return 'bill-upd:'   + payload.billId;
    case 'addPausePeriod':    return 'pause:'      + payload.customerId + ':' + payload.startDate;
    case 'finalizeBill':      return 'bill-fin:'   + payload.billId;
    case 'lockBill':          return 'bill-lock:'  + payload.billId;
    case 'generateMonthBill': return 'bill-gen:'   + payload.customerId + ':' + payload.month;
    case 'addMilkImport':     return 'milk-imp:'   + payload.date + ':' + payload.brandName;
    case 'updateMilkImport':  return 'milk-upd:'   + payload.importId;
    case 'confirmMilkImport': return 'milk-conf:'  + payload.importId;
    default:                  return action + ':'  + JSON.stringify(payload).substring(0, 80);
  }
}

// ── Pending state (optimistic UI overlay) ─────────────────────────────────────
window.pendingState = new Map();

window.updateUnsavedIndicator = function () {
  const count = window.writeQueue ? window.writeQueue.size() : 0;
  // Dispatch a custom event that the React tree can listen to
  window.dispatchEvent(new CustomEvent('milkapp:queuechange', { detail: { count } }));
  // Also update the browser tab title as a simple visual cue
  document.title = count > 0
    ? `(${count} pending) Milk Admin V17`
    : 'Milk Admin V17';
};

// ── WriteQueueManager ─────────────────────────────────────────────────────────
class WriteQueueManager {
  constructor() {
    this.dbName    = 'MilkAppQueue_V17';
    this.storeName = 'pendingWrites';
    this.db        = null;
    this.isReady   = false;
    this._flushing = false;
    this._size     = 0;
    this._snapshot = [];
    this._flushTimer = null;

    // Cross-tab sync via BroadcastChannel (not available in all browsers)
    this._channel = typeof BroadcastChannel !== 'undefined'
      ? new BroadcastChannel('milkapp_queue_v17')
      : null;

    if (this._channel) {
      let _debounceTimer = null;
      this._channel.onmessage = e => {
        if (!this.isReady) return;
        if (e.data?.type === 'flush_needed') {
          clearTimeout(_debounceTimer);
          _debounceTimer = setTimeout(() => this.flush(), 200);
        }
        if (e.data?.type === 'entry_deleted') {
          this._removeFromSnapshot(e.data.entityKey);
          window.pendingState.delete(e.data.entityKey);
          this._size = Math.max(0, this._size - 1);
          window.updateUnsavedIndicator();
        }
        if (e.data?.type === 'state_update') {
          if (e.data.size !== undefined)     this._size = e.data.size;
          if (e.data.snapshot)               this._snapshot = e.data.snapshot;
          window.updateUnsavedIndicator();
        }
      };
      window.addEventListener('beforeunload', () => this._channel?.close());
    }
  }

  // ── IndexedDB init ──────────────────────────────────────────────────────────
  async init() {
    if (this.isReady) return;
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);

      req.onblocked = () => {
        console.warn('[Queue] IndexedDB upgrade blocked — close other tabs and refresh');
        window.showToast?.('Database upgrade blocked. Close other tabs.', 'warning');
      };

      req.onerror = () => reject(req.error);

      req.onsuccess = async () => {
        this.db = req.result;
        this.db.onversionchange = () => {
          this.db.close();
          window.showToast?.('App updated — refreshing…', 'info');
          setTimeout(() => window.location.reload(), 1200);
        };
        this.isReady = true;
        try {
          const all = await this.getAll();
          this._size = all.length;
          this._snapshot = all.filter(w => w.status !== 'done');
        } catch (e) { console.warn('[Queue] getAll on init failed:', e); }
        resolve();
      };

      req.onupgradeneeded = e => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'entityKey' });
          store.createIndex('status',    'status',    { unique: false });
          store.createIndex('createdAt', 'createdAt', { unique: false });
        }
      };
    });
  }

  size() { return this._size; }

  // ── Low-level IDB operation wrapper ────────────────────────────────────────
  // Rule 15 from your spec: IndexedDB writes resolve on tx.oncomplete,
  // not req.onsuccess, to guarantee durability before we consider them done.
  async _dbOp(mode, fn, useOnComplete = false) {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (ok, val) => {
        if (!settled) { settled = true; ok ? resolve(val) : reject(val); }
      };
      const t = setTimeout(() => settle(false, new Error('IndexedDB timeout (5 s)')), 5000);
      let tx;
      try { tx = this.db.transaction(this.storeName, mode); }
      catch (e) { clearTimeout(t); reject(e); return; }

      tx.onabort = () => { clearTimeout(t); settle(false, new Error('IndexedDB tx aborted (quota or lock?)')); };
      tx.onerror = () => { clearTimeout(t); settle(false, tx.error); };

      let reqResult;
      try {
        const store = tx.objectStore(this.storeName);
        const req = fn(store);
        req.onsuccess = () => {
          reqResult = req.result;
          if (!useOnComplete) { clearTimeout(t); settle(true, reqResult); }
        };
        req.onerror = () => { clearTimeout(t); settle(false, req.error); };
        if (useOnComplete) tx.oncomplete = () => { clearTimeout(t); settle(true, reqResult); };
      } catch (e) { clearTimeout(t); settle(false, e); }
    });
  }

  // ── add ────────────────────────────────────────────────────────────────────
  async add(action, payload) {
    if (this._size >= QUEUE_SIZE_MAX) {
      const dead = this._snapshot.filter(w => w.status === 'dead');
      if (dead.length > 0) {
        window.showToast?.(`Queue full — clearing ${dead.length} dead write(s)`, 'warning');
        for (const d of dead) await this.delete(d.entityKey);
      }
      if (this._size >= QUEUE_SIZE_MAX) {
        throw new Error(`Write queue is full (${QUEUE_SIZE_MAX}). Wait for flush.`);
      }
    }

    const entityKey     = resolveEntityKey(action, payload);
    const idempotencyKey = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);

    // Merge updates into an existing pending entry for the same entity
    const isUpdate = /^(update|record|finalize|lock|confirm)/.test(action);
    if (isUpdate) {
      try {
        const existing = await this._dbOp('readonly', s => s.get(entityKey));
        if (existing?.status === 'pending') {
          const merged = { ...existing.payload, ...payload, idempotencyKey: existing.idempotencyKey };
          const updated = { ...existing, payload: merged, lastAttempt: null };
          await this._dbOp('readwrite', s => s.put(updated), true);
          this._updateSnapshot(updated);
          return entityKey;
        }
      } catch { /* merge failed — fall through to a fresh entry */ }
    }

    const jitter = [10000, 30000, 60000, 120000, 300000].map(
      b => b + Math.floor(b * 0.3 * (Math.random() * 2 - 1))
    );

    const write = {
      entityKey,
      idempotencyKey,
      action,
      payload: { ...payload, idempotencyKey },
      status: 'pending',
      retryCount: 0,
      lastAttempt: null,
      createdAt: Date.now(),
      jitterSchedule: jitter,
    };

    await this._dbOp('readwrite', s => s.put(write), true);
    this._size++;
    this._updateSnapshot(write);
    window.pendingState.set(entityKey, { ...payload });
    window.updateUnsavedIndicator();
    this._broadcastStateUpdate();
    this.scheduleFlush();
    return entityKey;
  }

  // ── delete ─────────────────────────────────────────────────────────────────
  async delete(entityKey) {
    try { await this._dbOp('readwrite', s => s.delete(entityKey), true); }
    catch (e) { console.error('[Queue] delete failed:', e); }
    this._size = Math.max(0, this._size - 1);
    this._removeFromSnapshot(entityKey);
    window.pendingState.delete(entityKey);
    this._channel?.postMessage({ type: 'entry_deleted', entityKey });
    this._broadcastStateUpdate();
    window.updateUnsavedIndicator();
  }

  // ── getAll ─────────────────────────────────────────────────────────────────
  async getAll() {
    if (!this.db) await this.init();
    return new Promise((resolve, reject) => {
      let settled = false;
      const settle = (ok, v) => { if (!settled) { settled = true; ok ? resolve(v) : reject(v); } };
      const t = setTimeout(() => settle(false, new Error('getAll timeout')), 8000);
      try {
        const tx = this.db.transaction(this.storeName, 'readonly');
        tx.onabort = () => { clearTimeout(t); settle(false, new Error('getAll aborted')); };
        const req = tx.objectStore(this.storeName).getAll();
        req.onsuccess = () => { clearTimeout(t); settle(true, req.result || []); };
        req.onerror   = () => { clearTimeout(t); settle(false, req.error); };
      } catch (e) { clearTimeout(t); settle(false, e); }
    });
  }

  // ── flush ──────────────────────────────────────────────────────────────────
  async flush() {
    if (this._flushing) return;
    this._flushing = true;
    try {
      let all;
      try { all = await this.getAll(); }
      catch (e) { console.error('[Queue] getAll failed during flush:', e); return; }

      const now = Date.now();
      const toProcess = all.filter(w => {
        if (w.status === 'pending') return true;
        if (w.status !== 'failed')  return false;
        if (w.retryCount >= MAX_RETRIES) return false;
        const delay = (w.jitterSchedule || [10000, 30000, 60000, 120000, 300000])[Math.min(w.retryCount, 4)];
        return now - (w.lastAttempt || 0) > delay;
      });

      const dead = all.filter(w => w.status === 'dead');
      if (dead.length > 0) this._showDeadWritesModal(dead);

      for (const w of toProcess) {
        w.status      = 'sending';
        w.lastAttempt = now;
        try { await this._dbOp('readwrite', s => s.put(w)); } catch { continue; }

        let res;
        try { res = await window.apiCall(w.action, w.payload); }
        catch { res = { success: false, error: { code: 'NETWORK_ERROR' } }; }

        const shouldMarkDone = res.success || ['DUPLICATE', 'CONFLICT', 'VERSION_CONFLICT'].includes(res.error?.code);
        if (shouldMarkDone) {
          await this.delete(w.entityKey);
        } else {
          w.retryCount++;
          w.status = w.retryCount >= MAX_RETRIES ? 'dead' : 'failed';
          try { await this._dbOp('readwrite', s => s.put(w)); } catch { /* best effort */ }
          this._updateSnapshot(w);
        }
      }

      window.updateUnsavedIndicator();
      this.scheduleFlush();
      if (this._channel && toProcess.length > 0) {
        this._channel.postMessage({ type: 'flush_needed' });
      }
    } finally {
      this._flushing = false;
    }
  }

  scheduleFlush() {
    clearTimeout(this._flushTimer);
    this._flushTimer = setTimeout(() => this.flush(), FLUSH_INTERVAL);
  }

  async retryDeadWrite(entityKey) {
    try {
      const all = await this.getAll();
      const w   = all.find(x => x.entityKey === entityKey);
      if (w) {
        w.status     = 'pending';
        w.retryCount = 0;
        await this._dbOp('readwrite', s => s.put(w));
        this._updateSnapshot(w);
      }
      this.flush();
    } catch (e) { console.error('[Queue] retryDeadWrite failed:', e); }
  }

  async dismissDeadWrite(entityKey) {
    await this.delete(entityKey);
    window.updateUnsavedIndicator();
  }

  // ── snapshot helpers ───────────────────────────────────────────────────────
  _updateSnapshot(w) {
    const idx = this._snapshot.findIndex(x => x.entityKey === w.entityKey);
    if (idx >= 0) this._snapshot[idx] = w; else this._snapshot.push(w);
  }
  _removeFromSnapshot(entityKey) {
    this._snapshot = this._snapshot.filter(w => w.entityKey !== entityKey);
  }
  getPendingSnapshot() {
    return this._snapshot.filter(w => w.status !== 'done');
  }
  _broadcastStateUpdate() {
    this._channel?.postMessage({
      type:     'state_update',
      size:     this._size,
      snapshot: this._snapshot.slice(0, 20),
    });
  }

  // ── Dead writes modal (XSS-safe: all values via textContent) ───────────────
  _showDeadWritesModal(items) {
    if (document.getElementById('fwm')) return;
    const overlay = document.createElement('div');
    overlay.id = 'fwm';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:flex-end';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');

    const sheet = document.createElement('div');
    sheet.style.cssText = 'background:#fff;width:100%;max-height:70vh;overflow-y:auto;border-radius:16px 16px 0 0;padding:20px;box-sizing:border-box';

    const h = document.createElement('h3');
    h.textContent = `Failed writes (${items.length})`;
    h.id = 'fwm-title';
    h.style.margin = '0 0 12px';
    overlay.setAttribute('aria-labelledby', 'fwm-title');
    sheet.appendChild(h);

    items.forEach(w => {
      const card = document.createElement('div');
      card.style.cssText = 'border:1px solid #fee2e2;border-radius:8px;padding:10px;margin-bottom:8px';
      const act  = document.createElement('div'); act.style.fontWeight = '500'; act.textContent = String(w.action || 'Unknown');
      const key  = document.createElement('div'); key.style.cssText = 'font-size:11px;color:#6b7280'; key.textContent = String(w.entityKey || '');
      const btns = document.createElement('div'); btns.style.cssText = 'display:flex;gap:8px;margin-top:8px';

      const retry = document.createElement('button');
      retry.textContent = 'Retry';
      retry.style.cssText = 'flex:1;padding:6px;background:#3b82f6;color:#fff;border:none;border-radius:6px;cursor:pointer';
      retry.onclick = () => this.retryDeadWrite(w.entityKey);

      const dismiss = document.createElement('button');
      dismiss.textContent = 'Dismiss';
      dismiss.style.cssText = 'flex:1;padding:6px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:6px;cursor:pointer';
      dismiss.onclick = () => this.dismissDeadWrite(w.entityKey);

      btns.append(retry, dismiss);
      card.append(act, key, btns);
      sheet.appendChild(card);
    });

    const close = document.createElement('button');
    close.textContent = 'Close';
    close.style.cssText = 'width:100%;padding:10px;background:#f3f4f6;border:none;border-radius:8px;cursor:pointer;margin-top:8px';
    close.onclick = () => overlay.remove();
    sheet.appendChild(close);
    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    close.focus();

    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
    const esc = e => {
      if (e.key === 'Escape') { overlay.remove(); document.removeEventListener('keydown', esc); }
    };
    document.addEventListener('keydown', esc);
  }
}

// ── queueWrite helper (used by React components via window.queueWrite) ────────
window.queueWrite = async function (action, payload) {
  try {
    return await window.writeQueue.add(action, payload);
  } catch (err) {
    window.showToast?.('Write queue error: ' + err.message, 'error');
    return null;
  }
};

// ── Bootstrap ─────────────────────────────────────────────────────────────────
window.writeQueue = new WriteQueueManager();

document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    try {
      const reg = await navigator.serviceWorker.register('/sw.js');
      let refreshing = false;
      reg.addEventListener('updatefound', () => {
        const nw = reg.installing;
        nw.addEventListener('statechange', () => {
          if (nw.state === 'installed' && navigator.serviceWorker.controller) {
            window.showToast?.('App updated — refreshing in 5 s…', 'info');
            setTimeout(() => { refreshing = true; window.location.reload(); }, 5000);
          }
        });
      });
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) window.location.reload();
      });
    } catch (err) {
      console.warn('[SW] Registration failed:', err.message);
    }
  }

  // Initialise the write queue (opens IndexedDB, loads any persisted writes)
  try {
    await window.writeQueue.init();
    window.writeQueue.flush();
  } catch (err) {
    console.error('[Queue] Init failed — falling back to isReady=true:', err);
    window.writeQueue.isReady = true;
  }
});

// ── Page lifecycle: beacon pending writes on unload ───────────────────────────
window.addEventListener('pagehide', () => {
  const pending = window.writeQueue.getPendingSnapshot();
  if (!pending.length) return;
  const { token, sessionSecret } = getSession();
  navigator.sendBeacon?.(API_BASE, JSON.stringify({
    action:        'batchFlush',
    payload:       { writes: pending.map(w => ({ action: w.action, payload: w.payload })) },
    token,
    sessionSecret,
  }));
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') window.writeQueue.flush();
});

window.addEventListener('beforeunload', e => {
  const pending = window.writeQueue.getPendingSnapshot();
  if (pending.length > 0) {
    e.returnValue = `You have ${pending.length} unsaved write(s). Leave?`;
  }
});