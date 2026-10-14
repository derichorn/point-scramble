/*
 * Point Scramble storage layer.
 *
 * Two backends behind one interface:
 *   - "local"    (default): the browser's localStorage. No server, no account, works offline.
 *   - "supabase" (optional): per-user cloud copy, enabled by filling in config.js.
 *                Each visitor gets an anonymous Supabase identity and can only ever
 *                read or write their own row (enforced by Row Level Security, see supabase/schema.sql).
 *
 * localStorage is always written first, so the app works instantly and offline.
 * The cloud copy is a sync/backup on top of that.
 *
 * API:
 *   PointScrambleStore.create({ onItems }) -> Promise<{ mode, save(items) -> Promise<{cloud:boolean}> }>
 *   onItems(items) is called once with the initial list and again when another tab changes it.
 *   `items` is the raw list of custom activities: [{ id, name, pts }]. The app validates it.
 */
(function () {
  'use strict';

  var LOCAL_KEY = 'pointScramble.v1';
  var SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.min.js';
  var MAX_ITEMS = 60;

  function cfg() { return window.POINT_SCRAMBLE_CONFIG || {}; }

  function sanitize(items) {
    if (!Array.isArray(items)) return [];
    var out = [];
    for (var i = 0; i < items.length && out.length < MAX_ITEMS; i++) {
      var it = items[i];
      if (it && typeof it.id === 'string' && it.id.length <= 40 && typeof it.name === 'string') {
        out.push({ id: it.id, name: it.name.slice(0, 40), pts: it.pts });
      }
    }
    return out;
  }

  /* ---------- local ---------- */
  function readLocal() {
    try {
      var raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return null;
      var d = JSON.parse(raw);
      return d && Array.isArray(d.items) ? sanitize(d.items) : null;
    } catch (e) { return null; }
  }
  function writeLocal(items) {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify({ v: 1, items: items, savedAt: Date.now() }));
      return true;
    } catch (e) { return false; } // private mode / quota / blocked storage
  }

  /* ---------- supabase (optional) ---------- */
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (window.supabase && window.supabase.createClient) return resolve();
      var s = document.createElement('script');
      s.src = src; s.async = true; s.crossOrigin = 'anonymous';
      s.onload = resolve;
      s.onerror = function () { reject(new Error('supabase-js failed to load')); };
      document.head.appendChild(s);
    });
  }

  function connectCloud(c) {
    return loadScript(SUPABASE_JS).then(function () {
      var sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      return sb.auth.getSession().then(function (r) {
        if (r.data && r.data.session) return { sb: sb, uid: r.data.session.user.id };
        return sb.auth.signInAnonymously().then(function (a) {
          if (a.error || !a.data || !a.data.user) throw (a.error || new Error('anonymous sign-in failed'));
          return { sb: sb, uid: a.data.user.id };
        });
      });
    });
  }

  function cloudLoad(cl) {
    return cl.sb.from('scramble_settings').select('items').eq('user_id', cl.uid).maybeSingle()
      .then(function (r) {
        if (r.error) throw r.error;
        return r.data ? sanitize(r.data.items) : null;
      });
  }
  function cloudSave(cl, items) {
    return cl.sb.from('scramble_settings')
      .upsert({ user_id: cl.uid, items: items, updated_at: new Date().toISOString() }, { onConflict: 'user_id' })
      .then(function (r) { if (r.error) throw r.error; });
  }

  /* ---------- public ---------- */
  function create(opts) {
    var onItems = (opts && opts.onItems) || function () {};
    var c = cfg();
    var wantsCloud = !!(c.supabaseUrl && c.supabaseAnonKey);
    var cloud = null;

    var local = readLocal();
    onItems(local || []);

    // keep multiple open tabs in sync
    window.addEventListener('storage', function (e) {
      if (e.key === LOCAL_KEY) onItems(readLocal() || []);
    });

    var store = {
      mode: 'local',
      save: function (items) {
        items = sanitize(items);
        var ok = writeLocal(items);
        if (!cloud) {
          return ok ? Promise.resolve({ cloud: false }) : Promise.reject(new Error('storage unavailable'));
        }
        return cloudSave(cloud, items).then(
          function () { return { cloud: true }; },
          function () {
            // cloud failed but the local copy is safe
            if (ok) return { cloud: false };
            throw new Error('save failed');
          }
        );
      }
    };

    if (!wantsCloud) return Promise.resolve(store);

    return connectCloud(c).then(function (cl) {
      cloud = cl;
      store.mode = 'supabase';
      return cloudLoad(cl).then(function (remote) {
        if (remote) {
          writeLocal(remote);
          onItems(remote);
        } else if (local && local.length) {
          return cloudSave(cl, local).catch(function () {}); // first sync: push this device's list up
        }
      });
    }).then(function () { return store; }, function () {
      // Any cloud problem: stay fully functional on local storage
      cloud = null; store.mode = 'local';
      return store;
    });
  }

  window.PointScrambleStore = { create: create };
})();
