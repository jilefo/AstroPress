/**
 * AstroPress Admin UI i18n — client engine.
 * Served at /api/ap-i18n/script.js with these globals prepended:
 *   window.__AP_I18N_DICT__  built-in dictionary { "UI string": "翻译" }
 *   window.__AP_I18N_CFG__   { enabled, target, configured }
 *
 * Mechanics:
 *  - TreeWalker replaces text nodes whose trimmed/whitespace-collapsed
 *    content exactly matches the dictionary or the runtime n8n cache
 *    (leading/trailing whitespace of the original node is preserved).
 *  - placeholder / title / aria-label attributes are translated too.
 *  - A MutationObserver re-translates React re-renders and late mounts.
 *  - Uncovered strings are batched (1.5s debounce) to the server-side
 *    /api/ap-i18n/translate proxy → user's n8n webhook; results are
 *    cached in localStorage (ap-i18n-cache-v1) so n8n is only asked once
 *    per string. Identity results are cached as well to avoid re-asking.
 *  - Skipped: editor content ([data-ap-editor], .ap-wysiwyg-editor,
 *    contenteditable, textarea/code/pre), script/style/svg, and the
 *    floating AI widget panel (position:fixed with z-index ≥ 9999x).
 */
(function () {
  "use strict";
  if (window.__apAdminI18n) return;
  window.__apAdminI18n = true;

  var DICT = window.__AP_I18N_DICT__ || {};
  var CFG = window.__AP_I18N_CFG__ || { enabled: true, target: "zh-CN", configured: false };

  var LS_CACHE = "ap-i18n-cache-v1";
  var LS_MISSED = "ap-i18n-missed-v1";
  var CACHE_CAP = 800;
  var MISS_CAP = 300;
  var BATCH = 40;

  var runtime = {};      // { key: translation } — incl. identity results
  var pending = {};      // keys currently in flight
  var queued = {};       // keys waiting to be flushed
  var missedLog = {};    // keys already logged as untranslated this session
  var missBudget = 600;  // hard stop for pathological pages
  var batches = 0;       // webhook requests sent this page
  var stats = { hits: 0, missed: 0, nodes: 0 };

  // ── localStorage helpers ──────────────────────────────────────────
  function lsGet(key, fallback) {
    try {
      var v = localStorage.getItem(key);
      return v ? JSON.parse(v) : fallback;
    } catch (e) { return fallback; }
  }
  function lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) { /* quota */ }
  }

  function loadRuntime() {
    var stored = lsGet(LS_CACHE, {});
    runtime = (stored && typeof stored === "object") ? stored : {};
  }
  function saveRuntime() {
    var keys = Object.keys(runtime);
    if (keys.length > CACHE_CAP) {
      var trimmed = {};
      for (var i = keys.length - CACHE_CAP; i < keys.length; i++) trimmed[keys[i]] = runtime[keys[i]];
      runtime = trimmed;
    }
    lsSet(LS_CACHE, runtime);
  }
  function logMissed(key) {
    if (missedLog[key]) return;
    missedLog[key] = 1;
    var log = lsGet(LS_MISSED, {});
    if (!log || typeof log !== "object") log = {};
    log[key] = Date.now();
    var keys = Object.keys(log);
    if (keys.length > MISS_CAP) {
      keys.sort(function (a, b) { return log[a] - log[b]; });
      for (var i = 0; i < keys.length - MISS_CAP; i++) delete log[keys[i]];
    }
    lsSet(LS_MISSED, log);
  }

  // ── translation lookup ────────────────────────────────────────────
  function normalize(s) { return String(s).replace(/\s+/g, " ").trim(); }

  function lookup(key) {
    var t = DICT[key] !== undefined ? DICT[key] : runtime[key];
    return typeof t === "string" && t.length ? t : null;
  }

  var NUMBERISH = /^(?:[\d.,:%\s\-–—/()+]*(?:px|em|rem|pt|vw|vh)?|https?:\/\/\S+)$/i;

  // Dynamic strings where a trailing interpolation is merged into the same
  // text node by the server renderer ("Howdy, Admin") — translate the
  // stable prefix (incl. its trailing space) and keep the dynamic tail.
  var PREFIX_RULES = [
    { prefix: "Howdy, ", t: "你好，" },
    { prefix: "Welcome, ", t: "欢迎，" },
    { prefix: "Edit User: ", t: "编辑用户：" },
    { prefix: "Edit Menu: ", t: "编辑菜单：" },
    { prefix: "Edit Form: ", t: "编辑表单：" },
    { prefix: "Entries: ", t: "提交记录：" },
    { prefix: "Edit: ", t: "编辑：" },
    { prefix: "No posts with status", t: "没有此状态的文章" },
    { prefix: "No pages with status", t: "没有此状态的页面" },
    { prefix: "No files matching", t: "没有匹配的文件" },
    { prefix: "Uploading ", t: "正在上传 " },
  ];

  function translatable(key) {
    if (key.length < 2 || key.length > 120) return false;
    if (!/[a-z]/i.test(key)) return false;      // needs a latin letter (skip pure numbers/symbols/CJK)
    if (NUMBERISH.test(key)) return false;
    return true;
  }

  var SKIP_ATTR = "script,style,noscript,template,svg,code,pre,textarea" +
    ",[contenteditable=''],[contenteditable='true']" +
    ",[data-ap-editor],.ap-wysiwyg-editor" +
    ",[style*='z-index: 9999'],[style*='z-index:9999'],[style*='z-index:999'],[style*='z-index: 999']";

  function translateTextNode(node) {
    var raw = node.nodeValue;
    if (!raw || !raw.trim()) return;
    stats.nodes++;
    var key = normalize(raw);
    if (!key) return;
    var t = lookup(key);
    var rule = null;
    if (!t) {
      for (var r = 0; r < PREFIX_RULES.length; r++) {
        if (key.indexOf(PREFIX_RULES[r].prefix) === 0) { rule = PREFIX_RULES[r]; break; }
      }
    }
    if (t || rule) {
      stats.hits++;
      // Prefix rules replace only the stable prefix so the dynamic tail
      // (e.g. the display name) survives; exact rules replace the whole key.
      var nv = rule ? replaceIn(raw, rule.prefix, rule.t) : replaceIn(raw, key, t);
      if (nv !== raw) node.nodeValue = nv;
      return;
    }
    stats.missed++;
    if (CFG.enabled && translatable(key)) queueMiss(key);
  }

  // Replace the first occurrence of `key` (the whitespace-collapsed text)
  // in `raw` while preserving surrounding whitespace, without regex
  // metachar issues.
  function replaceIn(raw, key, t) {
    var start = raw.indexOf(key);
    if (start < 0) return raw;
    return raw.slice(0, start) + t + raw.slice(start + key.length);
  }

  function translateAttrs(el) {
    var attrs = ["placeholder", "title", "aria-label", "data-placeholder"];
    for (var i = 0; i < attrs.length; i++) {
      var a = attrs[i];
      var v = el.getAttribute(a);
      if (!v) continue;
      var key = normalize(v);
      if (!key) continue;
      var t = lookup(key);
      if (t) {
        if (t !== key) el.setAttribute(a, v.replace(key, t));
      } else if (CFG.enabled && translatable(key)) {
        queueMiss(key);
      }
    }
  }

  function walk(root) {
    if (!root || !CFG.enabled) return;
    if (root.nodeType === 3) {
      var par = root.parentElement;
      if (par && !par.closest(SKIP_ATTR)) translateTextNode(root);
      return;
    }
    if (root.nodeType !== 1) return;
    if (root.closest && root.closest(SKIP_ATTR)) return;

    var walker = document.createTreeWalker(root, 4 /* SHOW_TEXT */, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return 2 /* FILTER_REJECT */;
        var p = n.parentElement;
        if (!p) return 2;
        return p.closest(SKIP_ATTR) ? 2 : 1 /* FILTER_ACCEPT */;
      }
    });
    var n;
    while ((n = walker.nextNode())) translateTextNode(n);

    if (root.querySelectorAll) {
      var els = root.querySelectorAll("[placeholder],[title],[aria-label],[data-placeholder]");
      for (var i = 0; i < els.length; i++) {
        if (!els[i].closest(SKIP_ATTR)) translateAttrs(els[i]);
      }
    }
  }

  // ── miss queue → n8n proxy ────────────────────────────────────────
  function queueMiss(key) {
    if (pending[key] || queued[key] || missedLog[key] || runtime[key] !== undefined) return;
    if (missBudget-- <= 0) return;
    queued[key] = 1;
    scheduleFlush();
  }

  var flushTimer = null;
  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(flushMisses, 1500);
  }

  function flushMisses() {
    flushTimer = null;
    var keys = Object.keys(queued);
    if (!keys.length) return;

    if (!CFG.configured) {
      queued = {};
      keys.forEach(logMissed);
      return;
    }
    if (batches >= 30) { // session cap — avoid webhook hammering
      queued = {};
      keys.forEach(logMissed);
      return;
    }
    batches++;

    var texts = keys.slice(0, BATCH);
    texts.forEach(function (k) { delete queued[k]; pending[k] = 1; });

    fetch("/api/ap-i18n/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ texts: texts, target: CFG.target })
    }).then(function (r) { return r.ok ? r.json() : { translations: {} }; })
      .then(function (data) {
        var tr = (data && data.translations) || {};
        texts.forEach(function (k) {
          delete pending[k];
          var v = tr[k];
          if (typeof v === "string" && v.length) {
            runtime[k] = v;                    // real translation (or identity → cached to not re-ask)
          } else {
            logMissed(k);                      // webhook had nothing for this key
          }
        });
        saveRuntime();
        if (document.body) walk(document.body); // apply new translations
      })
      .catch(function () {
        texts.forEach(function (k) { delete pending[k]; logMissed(k); });
      });

    if (Object.keys(queued).length) scheduleFlush();
  }

  // ── MutationObserver (React re-renders, late mounts) ─────────────
  var walkTimer = null;
  var pendingRoots = [];
  var mo = null;
  function scheduleWalk(root) {
    if (root) pendingRoots.push(root);
    if (walkTimer) return;
    walkTimer = setTimeout(function () {
      walkTimer = null;
      var roots = pendingRoots;
      pendingRoots = [];
      for (var i = 0; i < roots.length; i++) walk(roots[i]);
    }, 120);
  }

  function startObserver() {
    if (mo) return;
    mo = new MutationObserver(function (muts) {
      for (var i = 0; i < muts.length; i++) {
        var m = muts[i];
        if (m.type === "characterData" && m.target) scheduleWalk(m.target);
        var added = m.addedNodes;
        for (var j = 0; j < added.length; j++) {
          var n = added[j];
          if (n.nodeType === 1 || n.nodeType === 3) scheduleWalk(n);
        }
      }
    });
    mo.observe(document.body, { childList: true, subtree: true, characterData: true });
  }

  function stopObserver() {
    if (mo) { mo.disconnect(); mo = null; }
    if (walkTimer) { clearTimeout(walkTimer); walkTimer = null; }
    pendingRoots = [];
  }

  // Stop observing when the tab is hidden to save CPU/battery; resume on visible.
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stopObserver();
    else if (CFG.enabled) startObserver();
  });
  window.addEventListener("beforeunload", stopObserver);

  // ── sidebar link to the management page ───────────────────────────
  function addMenuLink() {
    var nav = document.querySelector(".wp-sidebar-nav");
    if (!nav || nav.querySelector("a[href='/admin-ext/i18n']")) return;
    var a = document.createElement("a");
    a.href = "/admin-ext/i18n";
    a.textContent = CFG.target === "zh-CN" ? "界面翻译" : "Admin i18n";
    var active = location.pathname.indexOf("/admin-ext/i18n") === 0;
    if (active) a.className = "is-active";
    // Prefer the Settings sub-menu; fall back to the top-level nav.
    var settingsLink = nav.querySelector("a[href='/admin/settings']");
    var submenu = settingsLink && settingsLink.nextElementSibling;
    if (submenu && submenu.classList.contains("wp-sidebar-submenu")) {
      if (active) { submenu.classList.add("is-open"); settingsLink.classList.add("is-active"); }
      submenu.appendChild(a);
    } else {
      nav.appendChild(a);
    }
  }

  // ── public stats handle (management page reads this) ──────────────
  window.__apI18n = {
    stats: stats,
    cfg: CFG,
    clearCache: function () {
      try {
        localStorage.removeItem(LS_CACHE);
        localStorage.removeItem(LS_MISSED);
      } catch (e) { /* ignore */ }
      runtime = {};
    },
    cacheSize: function () { return Object.keys(runtime).length; },
    missedSize: function () { return Object.keys(lsGet(LS_MISSED, {})).length; },
    missedKeys: function () { return Object.keys(lsGet(LS_MISSED, {})); }
  };

  // ── init ──────────────────────────────────────────────────────────
  function init() {
    if (!CFG.enabled) return; // disabled in settings → inert
    loadRuntime();
    if (document.body) walk(document.body);
    startObserver();
    addMenuLink();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
