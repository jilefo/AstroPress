/**
 * Multilingual — admin Language panel injector.
 * Served at /ml-asset/panel.js and injected into /admin pages by the
 * plugin's admin middleware (zero core modification).
 *
 * Why: the core editors render registered sidebar panels as EMPTY boxes —
 * only SeoPanel has a mounted island (apps limitation). The
 * MultilingualPanel island exists but is never imported, so the Language
 * postbox renders without a body on posts/CPT editors, and not at all on
 * pages editors. This script fills the empty box (or creates one in the
 * pages editor's <aside>) with a vanilla-DOM equivalent that talks to the
 * same /admin-ext/api/ml/* endpoints the island would use.
 */
(function () {
  "use strict";
  if (window.__apMlPanel) return;
  window.__apMlPanel = true;

  var postId = detectPostId();
  if (!postId) return;

  function detectPostId() {
    var m = /^\/admin\/(?:posts|pages|cpt\/[^/]+)\/(\d+)\/?$/.exec(location.pathname);
    return m ? Number(m[1]) : null;
  }

  function el(tag, style, text) {
    var e = document.createElement(tag);
    if (style) for (var k in style) e.style[k] = style[k];
    if (text != null) e.textContent = text;
    return e;
  }

  function findAside() {
    var eds = document.querySelector(".ap-wysiwyg-editor, [data-ap-editor]");
    var scope = eds ? eds.closest("body") : document;
    var asides = scope.querySelectorAll("aside");
    // Pick the aside that holds publish/box widgets (the right column)
    for (var i = 0; i < asides.length; i++) {
      if (asides[i].querySelector("select, button")) return asides[i];
    }
    return asides[0] || null;
  }

  function boxHeaderText(box) {
    var h = box.querySelector(".postbox-title") || box.firstElementChild;
    return h ? (h.textContent || "").trim() : "";
  }

  function findLanguageBox(aside) {
    var children = aside.children;
    for (var i = 0; i < children.length; i++) {
      var c = children[i];
      var t = (c.textContent || "").trim();
      if (t === "Language" || t === "语言") return { box: c, empty: true };
    }
    return null;
  }

  function createBox(aside) {
    // Mirror the aside's existing box styling (works for pages editor)
    var box = el("div", {
      background: "#fff",
      border: "1px solid #dcdcde",
      borderRadius: "4px",
      overflow: "hidden",
      marginBottom: "16px",
    });
    var head = el("div", {
      background: "#f6f7f7",
      padding: "10px 14px",
      fontSize: "13px",
      fontWeight: "600",
      borderBottom: "1px solid #dcdcde",
    }, "Language");
    var body = el("div", { padding: "14px" });
    box.appendChild(head);
    box.appendChild(body);
    aside.appendChild(box);
    return body;
  }

  function mount() {
    var aside = findAside();
    if (!aside) return false;

    var body;
    var hit = findLanguageBox(aside);
    if (hit) {
      body = hit.box.children[1];
      if (!body) {
        body = el("div", { padding: "14px" });
        hit.box.appendChild(body);
      }
      if (body.querySelector("[data-ml-panel]")) return true; // already mounted
    } else {
      body = createBox(aside);
    }

    body.innerHTML = "";
    var root = el("div");
    root.setAttribute("data-ml-panel", "1");
    root.appendChild(el("div", { fontSize: "12px", color: "#646970" }, "加载中…"));
    body.appendChild(root);

    render(root);
    return true;
  }

  function render(root) {
    Promise.all([
      fetch("/admin-ext/api/ml/settings", { credentials: "same-origin" }).then(function (r) { return r.json(); }),
      fetch("/admin-ext/api/ml/links?postId=" + postId, { credentials: "same-origin" }).then(function (r) { return r.json(); }),
    ]).then(function (results) {
      var settings = results[0];
      var group = (results[1] && results[1].group) || null;
      draw(root, settings, group);
    }).catch(function () {
      root.textContent = "语言面板加载失败（multilingual 插件未启用？）";
    });
  }

  function draw(root, settings, group) {
    root.innerHTML = "";
    if (!settings || !Array.isArray(settings.languages)) {
      var cfg = el("div", { fontSize: "12px", color: "#646970", lineHeight: "1.6" });
      cfg.textContent = "Multilingual 插件尚未配置语言。";
      var cfgLink = el("a", { color: "#2271b1", fontSize: "12px" }, "去配置语言 →");
      cfgLink.href = "/admin-ext/multilingual";
      cfg.appendChild(cfgLink);
      root.appendChild(cfg);
      return;
    }

    var enabledLangs = settings.languages.filter(function (l) { return l.enabled; });
    var translations = (group && group.translations) || [];
    var self = translations.filter(function (t) { return t.postId === postId; })[0];
    var others = translations.filter(function (t) { return t.postId !== postId; });

    // ── language selector ─────────────────────────────────────────
    root.appendChild(el("label", { fontSize: "12px", fontWeight: "600", display: "block", marginBottom: "3px" }, "文章语言"));
    var sel = document.createElement("select");
    sel.style.cssText = "width:100%;font-size:12px;padding:6px 8px;border:1px solid #dcdcde;border-radius:3px;outline:none";
    sel.appendChild(new Option("— 选择 —", ""));
    enabledLangs.forEach(function (l) { sel.appendChild(new Option(l.nativeLabel + " (" + l.code + ")", l.code)); });
    sel.value = self ? self.lang : "";
    root.appendChild(sel);
    root.appendChild(el("p", { fontSize: "10px", color: "#646970", margin: "3px 0 8px" }, "设置本文语言，用于 hreflang 与翻译分组。"));

    var btn = el("button", {
      width: "100%",
      padding: "7px",
      fontSize: "12px",
      fontWeight: "600",
      background: "#2271b1",
      color: "#fff",
      border: "none",
      borderRadius: "3px",
      cursor: "pointer",
    }, "保存语言设置");
    btn.addEventListener("click", function () {
      if (!sel.value) return;
      btn.textContent = "保存中…";
      fetch("/admin-ext/api/ml/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "link", baseId: (group && group.baseId) || postId, lang: sel.value, targetId: postId }),
      }).then(function (r) {
        btn.textContent = r.ok ? "已保存 ✓" : "失败，重试";
        btn.style.background = r.ok ? "#146c43" : "#d63638";
        if (r.ok) setTimeout(function () { location.reload(); }, 800);
      }).catch(function () { btn.textContent = "网络错误"; });
    });
    root.appendChild(btn);

    // ── existing translations ─────────────────────────────────────
    if (others.length) {
      root.appendChild(el("label", {
        fontSize: "12px", fontWeight: "600", display: "block",
        margin: "12px 0 4px", paddingTop: "10px", borderTop: "1px solid #f0f0f1",
      }, "已有翻译"));
      others.forEach(function (t) {
        var row = el("div", { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0", fontSize: "12px" });
        var left = el("span");
        var tag = el("span", {
          display: "inline-block", background: "#f6f7f7", border: "1px solid #dcdcde",
          borderRadius: "2px", padding: "0 5px", marginRight: "6px", fontSize: "10px",
          fontWeight: "600", textTransform: "uppercase",
        }, t.lang);
        left.appendChild(tag);
        var a = el("a", { color: "#2271b1" }, (labelOf(enabledLangs, t.lang)) || t.lang);
        a.href = t.editUrl;
        left.appendChild(a);
        row.appendChild(left);
        var x = el("button", {
          background: "none", border: "none", color: "#d63638",
          cursor: "pointer", fontSize: "11px", padding: "0 2px",
        }, "✕");
        x.title = "取消关联";
        x.addEventListener("click", function () {
          fetch("/admin-ext/api/ml/links", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ action: "unlink", targetId: t.postId }),
          }).then(function () { location.reload(); });
        });
        row.appendChild(x);
        root.appendChild(row);
      });
    }

    var manage = el("a", { display: "inline-block", marginTop: "10px", paddingTop: "8px", fontSize: "11px", color: "#2271b1" }, "管理翻译 →");
    manage.style.borderTop = "1px solid #f0f0f1";
    manage.href = "/admin-ext/multilingual";
    root.appendChild(manage);
  }

  function labelOf(langs, code) {
    for (var i = 0; i < langs.length; i++) if (langs[i].code === code) return langs[i].nativeLabel;
    return null;
  }

  // Editors render server-side boxes at HTML parse time; a short retry
  // covers late layout for robustness (same pattern as editor-upload).
  var tries = 0;
  var timer = setInterval(function () {
    if (mount() || ++tries > 20) clearInterval(timer);
  }, 600);
})();
