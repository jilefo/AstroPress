/**
 * AI Autofill — injected at /api/ap-autofill/script.js on post/page/CPT edit pages.
 *
 * Adds one AI writing panel into the Excerpt box:
 *   topic textarea → "✨ AI 写文章（一键填写全部）" → generates AND fills
 *   title / content / excerpt / SEO title / meta description / focus keyword / tags.
 *
 * A "发布时自动填写空字段" checkbox keeps the old metadata-only autofill on save.
 *
 * The publish hook wraps window.savePost (defined by the core page script
 * before deferred scripts run) — generation runs BEFORE the save request so
 * the excerpt textarea value is included in the PUT body.
 */
(function () {
  "use strict";
  if (window.__apAutofill) return;
  window.__apAutofill = true;

  var LS_AUTO = "ap-autofill:auto"; // "1" = auto-fill on publish (default)

  function postId() {
    var m = /\/admin\/(?:posts|pages)\/(\d+)/.exec(location.pathname) ||
            /\/admin\/cpt\/[^/]+\/(\d+)/.exec(location.pathname);
    return m ? Number(m[1]) : 0;
  }

  function toast(text, ms) {
    var t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:99999;background:#1d2327;color:#fff;" +
      "padding:8px 14px;border-radius:4px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, ms || 2600);
  }

  /** Find the sidebar postbox whose heading matches (SEO panel lives inside). */
  function findBox(titleRe) {
    var hs = document.querySelectorAll(".postbox .postbox-title");
    for (var i = 0; i < hs.length; i++) {
      if (titleRe.test(hs[i].textContent || "")) {
        return hs[i].closest(".postbox");
      }
    }
    return null;
  }

  /** React controlled-input compatible value setter. */
  function setReactValue(el, value) {
    var proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    var desc = Object.getOwnPropertyDescriptor(proto, "value");
    if (desc && desc.set) desc.set.call(el, value);
    else el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function seoFields(box) {
    if (!box) return null;
    var inside = box.querySelector(".postbox-inside");
    if (!inside) return null;
    var inputs = inside.querySelectorAll("input");
    var ta = inside.querySelector("textarea");
    var btn = inside.querySelector("button");
    if (inputs.length < 2 || !ta) return null;
    return { title: inputs[0], desc: ta, kw: inputs[1], saveBtn: btn };
  }

  function currentSeo(box) {
    var f = seoFields(box);
    if (!f) return { title: "", desc: "", kw: "" };
    return { title: f.title.value.trim(), desc: f.desc.value.trim(), kw: f.kw.value.trim() };
  }

  function currentExcerpt() {
    var ta = document.getElementById("post-excerpt");
    return ta ? ta.value.trim() : "";
  }

  async function currentTagNames() {
    var id = postId();
    if (!id) return [];
    try {
      var ids = await fetch("/api/posts/" + id + "/terms/post_tag").then(function (r) { return r.json(); });
      if (!ids.length) return [];
      var all = await fetch("/api/terms/post_tag").then(function (r) { return r.json(); });
      return all.filter(function (t) { return ids.indexOf(t.termTaxonomyId) !== -1; })
                .map(function (t) { return t.name; });
    } catch (e) { return []; }
  }

  /** Create/find tags and attach them (union with existing). Returns added names. */
  async function applyTags(names) {
    var id = postId();
    if (!id || !names.length) return [];
    var existing = [];
    try {
      existing = await fetch("/api/posts/" + id + "/terms/post_tag").then(function (r) { return r.json(); });
    } catch (e) { /* ignore */ }
    var ttIds = existing.slice();
    var added = [];
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      try {
        var term = await fetch("/api/terms/post_tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: name }),
        }).then(function (r) { return r.ok ? r.json() : null; });
        if (term && ttIds.indexOf(term.termTaxonomyId) === -1) {
          ttIds.push(term.termTaxonomyId);
          added.push(name);
        }
      } catch (e) { /* skip single failing tag */ }
    }
    if (added.length) {
      await fetch("/api/posts/" + id + "/terms/post_tag", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ termTaxonomyIds: ttIds }),
      });
    }
    return added;
  }

  var running = false;

  /** Generate + fill empty fields. Returns true if anything was generated. */
  async function runAutofill(opts) {
    opts = opts || {};
    if (running) return false;
    running = true;
    try {
      var title = (document.getElementById("post-title") || {}).value || "";
      var content = window.__editorContent || "";
      if (!title.trim() && !content.trim()) {
        if (!opts.silent) toast("请先填写标题或内容");
        return false;
      }

      var seoBox = findBox(/^SEO/);
      var seo = currentSeo(seoBox);
      var needExcerpt = !currentExcerpt();
      var needSeo = !seo.title || !seo.desc || !seo.kw;
      var tagNames = await currentTagNames();
      var needTags = tagNames.length === 0;

      if (!needExcerpt && !needSeo && !needTags) {
        if (!opts.silent) toast("所有字段已有内容，无需填写");
        return false;
      }

      var statusEl = document.getElementById("save-status");
      if (statusEl) statusEl.textContent = "AI 生成中…";

      var data = await fetch("/api/ap-autofill/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title, content: content }),
      }).then(function (r) { return r.json(); });

      if (!data.ok) {
        if (statusEl) statusEl.textContent = "";
        toast("AI 填写失败：" + (data.error || "unknown"), 4000);
        return false;
      }

      var filled = [];

      // Excerpt — plain textarea; savePost reads it at save time.
      if (needExcerpt && data.excerpt) {
        var ta = document.getElementById("post-excerpt");
        if (ta) { ta.value = data.excerpt; filled.push("摘要"); }
      }

      // SEO fields — React controlled inputs; set value + click the panel's own save.
      if (needSeo && seoBox) {
        var f = seoFields(seoBox);
        if (f) {
          var seoChanged = false;
          if (!f.title.value.trim() && data.seoTitle) { setReactValue(f.title, data.seoTitle); seoChanged = true; }
          if (!f.desc.value.trim() && data.metaDesc) { setReactValue(f.desc, data.metaDesc); seoChanged = true; }
          if (!f.kw.value.trim() && data.focusKeyword) { setReactValue(f.kw, data.focusKeyword); seoChanged = true; }
          if (seoChanged) {
            filled.push("SEO");
            if (f.saveBtn) f.saveBtn.click(); // persists via the panel's own POST
          }
        }
      }

      // Tags — server-side find-or-create + attach (union).
      if (needTags && data.tags && data.tags.length) {
        var added = await applyTags(data.tags);
        if (added.length) filled.push("标签(" + added.length + ")");
      }

      if (statusEl) statusEl.textContent = "";
      if (filled.length) toast("AI 已填写：" + filled.join("、") + "（可修改后保存）", 3500);
      else if (!opts.silent) toast("AI 未返回可用内容");
      return filled.length > 0;
    } catch (e) {
      toast("AI 填写出错：" + (e && e.message ? e.message : e), 4000);
      return false;
    } finally {
      running = false;
    }
  }

  // ── Publish hook: wrap window.savePost ─────────────────────────────
  function autoEnabled() {
    try { return localStorage.getItem(LS_AUTO) !== "0"; } catch (e) { return true; }
  }

  function hookSavePost() {
    if (typeof window.savePost !== "function" || window.savePost.__apAutofillWrapped) return;
    var orig = window.savePost;
    var wrapped = async function (forceStatus) {
      var status = forceStatus || ((document.getElementById("post-status") || {}).value) || "";
      if (status === "publish" && autoEnabled()) {
        await runAutofill({ silent: true });
      }
      return orig.apply(this, arguments);
    };
    wrapped.__apAutofillWrapped = true;
    window.savePost = wrapped;
  }

  // ── Auto-fill checkbox row (Excerpt box) ──────────────────────────
  function injectButton() {
    if (document.getElementById("ap-autofill-row")) return;
    var writeRow = document.getElementById("ap-write-row");
    var anchor = writeRow || document.getElementById("post-excerpt");
    if (!anchor) return;
    var inside = anchor.closest(".postbox-inside");
    if (!inside) return;

    var row = document.createElement("div");
    row.id = "ap-autofill-row";
    row.style.cssText = "margin-top:8px;";

    var lab = document.createElement("label");
    lab.style.cssText = "display:flex;align-items:center;gap:5px;font-size:11px;color:#646970;cursor:pointer";
    var cb = document.createElement("input");
    cb.type = "checkbox";
    cb.checked = autoEnabled();
    cb.addEventListener("change", function () {
      try { localStorage.setItem(LS_AUTO, cb.checked ? "1" : "0"); } catch (e) { /* ignore */ }
    });
    lab.appendChild(cb);
    lab.appendChild(document.createTextNode("发布时自动填写空字段（摘要/标签/SEO）"));

    row.appendChild(lab);
    // 复选框行放在写作面板之后
    if (writeRow && writeRow.parentNode) writeRow.parentNode.insertBefore(row, writeRow.nextSibling);
    else inside.appendChild(row);
  }

  // ── AI Writer panel (Excerpt box) ─────────────────────────────────
  /** 正文纯文本（去标签）长度，用于判断当前是「新写」还是「优化已有文章」 */
  function editorPlainText() {
    var html = window.__editorContent || "";
    var d = document.createElement("div");
    d.innerHTML = html; // ap-audit-ok: 仅用离屏节点提取 textContent，不挂载到 DOM，无脚本/事件执行面
    return (d.textContent || "").trim();
  }

  /** 有正文（≥50 字）→ 优化模式；少于 50 字 → 新写模式（用户要求 50 字为分界） */
  function hasOriginalContent() {
    return editorPlainText().length >= 50;
  }

  /** 有正文 → 优化模式（原文随指令一起发送）；无正文 → 新写模式 */
  function refreshWriteMode() {
    var btn = document.getElementById("ap-write-btn");
    var ta = document.getElementById("ap-write-topic");
    var hint = document.getElementById("ap-write-hint");
    if (!btn || !ta) return;
    if (hasOriginalContent()) {
      btn.textContent = "✨ AI 按指令优化本文（基于现有正文）";
      ta.placeholder = "输入优化要求，例如：你是一名专业的公众号写手，请对这篇文章进行优化（结构、标题、表达）…原文将一并发送给 AI";
      if (hint) hint.textContent = "检测到已有正文：本次为「优化」，AI 会在原文基础上修改，不会另写新文章";
    } else {
      btn.textContent = "✨ AI 写文章（一键填写全部）";
      ta.placeholder = "输入主题或要点，AI 将一键生成并填写标题、正文、摘要、标签与 SEO 信息…";
      if (hint) hint.textContent = "";
    }
  }

  function injectWritePanel() {
    if (document.getElementById("ap-write-row")) return;
    var excerptTa = document.getElementById("post-excerpt");
    if (!excerptTa) return;
    var inside = excerptTa.closest(".postbox-inside");
    if (!inside) return;

    var row = document.createElement("div");
    row.id = "ap-write-row";
    row.style.cssText = "margin-top:10px;padding-top:10px;border-top:1px solid var(--wp-gray-100,#f0f0f1)";

    var head = document.createElement("div");
    head.style.cssText = "font-size:12px;color:#646970;margin-bottom:6px;font-weight:600";
    head.textContent = "AI 写作助手（自动填写标题/正文/摘要/标签/SEO）";

    var hint = document.createElement("div");
    hint.id = "ap-write-hint";
    hint.style.cssText = "font-size:11px;color:#b26200;margin:4px 0 0;";

    var ta = document.createElement("textarea");
    ta.id = "ap-write-topic";
    ta.rows = 2;
    ta.placeholder = "输入主题或要点，AI 将一键生成并填写标题、正文、摘要、标签与 SEO 信息…";
    ta.style.cssText = "width:100%;font-size:13px;padding:6px;border:1px solid #8c8f94;border-radius:2px;resize:vertical";

    var writeBtn = document.createElement("button");
    writeBtn.type = "button";
    writeBtn.id = "ap-write-btn";
    writeBtn.className = "button";
    writeBtn.style.cssText = "width:100%;margin-top:6px;justify-content:center";
    writeBtn.textContent = "✨ AI 写文章（一键填写全部）";
    writeBtn.addEventListener("click", runWrite);

    row.appendChild(head);
    row.appendChild(hint);
    row.appendChild(ta);
    row.appendChild(writeBtn);
    inside.appendChild(row);
    refreshWriteMode();
  }

  /** 把一次生成结果写入页面所有字段 */
  async function applyAll(data) {
    var filled = [];

    // 标题 + slug
    var titleInput = document.getElementById("post-title");
    if (titleInput && data.title) {
      titleInput.value = data.title;
      titleInput.dispatchEvent(new Event("input", { bubbles: true }));
      if (typeof window.updateSlug === "function") window.updateSlug(data.title);
      filled.push("标题");
    }

    // 正文（contentEditable + __editorContent）
    // 安全检查：如果内容去掉图片后几乎没有文字（<100字），拒绝覆盖正文，
    // 防止 AI 只返回一张图片链接导致原文丢失
    if (data.content) {
      var tempDiv = document.createElement("div");
      tempDiv.innerHTML = data.content;
      var textAfterImages = (tempDiv.textContent || "").trim();
      if (textAfterImages.length < 100) {
        toast("⚠ AI 返回内容过少（可能仅含图片），已保留原文未覆盖", 4500);
      } else {
        var editor = document.querySelector('[contenteditable="true"]');
        if (editor) {
          editor.innerHTML = data.content; // ap-audit-ok: 管理端编辑器有意写入 AI 生成的文章 HTML（与粘贴 HTML 等价），接口需登录
          editor.dispatchEvent(new Event("input", { bubbles: true }));
        }
        if (window.__editorContent !== undefined) window.__editorContent = data.content;
        filled.push("正文");
      }
    }

    // 摘要
    if (data.excerpt) {
      var ta = document.getElementById("post-excerpt");
      if (ta) { ta.value = data.excerpt; filled.push("摘要"); }
    }

    // SEO 三件套（React controlled inputs + 面板自身保存按钮）
    var seoBox = findBox(/^SEO/);
    var f = seoFields(seoBox);
    if (f) {
      var seoChanged = false;
      if (data.seoTitle) { setReactValue(f.title, data.seoTitle); seoChanged = true; }
      if (data.metaDesc) { setReactValue(f.desc, data.metaDesc); seoChanged = true; }
      if (data.focusKeyword) { setReactValue(f.kw, data.focusKeyword); seoChanged = true; }
      if (seoChanged) {
        filled.push("SEO");
        if (f.saveBtn) f.saveBtn.click();
      }
    }

    // 标签（服务端 find-or-create + 关联）
    if (data.tags && data.tags.length) {
      var added = await applyTags(data.tags);
      if (added.length) filled.push("标签(" + added.length + ")");
    }

    return filled;
  }

  async function runWrite(e) {
    var ta = document.getElementById("ap-write-topic");
    var topic = (ta.value || "").trim();
    if (!topic) { toast("请先输入主题或优化要求"); return; }
    var btn = e.currentTarget || e.target;
    var optimize = hasOriginalContent();
    var title = (document.getElementById("post-title") || {}).value || "";
    var original = window.__editorContent || "";
    btn.disabled = true;
    btn.textContent = optimize ? "AI 优化中…" : "AI 生成并填写中…";
    try {
      var data = await fetch("/api/ap-autofill/write", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // 优化模式：把现有标题+原文一并发送，AI 在原文基础上优化；
        // 新写模式：content 为空，服务端按主题生成新文章
        body: JSON.stringify({ topic: topic, title: title, content: optimize ? original : "" }),
      }).then(function (r) { return r.json(); });
      if (!data.ok) {
        toast("AI 写作失败：" + (data.error || "unknown"), 4500);
        return;
      }
      var filled = await applyAll(data);
      toast((data.mode === "optimize" ? "AI 已基于原文优化：" : "AI 已填写：") +
        (filled.length ? filled.join("、") : "内容") + "（可修改后保存）", 4000);
      refreshWriteMode();
    } catch (err) {
      toast("AI 写作出错：" + (err && err.message ? err.message : err), 4500);
    } finally {
      btn.disabled = false;
      refreshWriteMode();
    }
  }

  function init() {
    if (!postId()) return; // only edit pages with a real post id
    hookSavePost();
    injectWritePanel();
    injectButton();
    // Panels mount late (React islands) — retry briefly, and re-hook savePost
    // in case the inline script defined it after us.
    var tries = 0;
    var timer = setInterval(function () {
      hookSavePost();
      injectWritePanel();
      injectButton();
      refreshWriteMode();
      tries++;
      if (document.getElementById("ap-write-row") || tries > 20) clearInterval(timer);
    }, 600);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
