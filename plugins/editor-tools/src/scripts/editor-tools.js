/**
 * Editor Tools — injected at /api/ap-etools/tools.js on admin pages.
 * Adds two toolbar buttons next to the core editor (toolbar is located by
 * DOM position: previousElementSibling of .ap-wysiwyg-editor, which has no
 * stable class — same anchoring as the editor-upload plugin):
 *
 *   排版 — one-click auto-format of the editor content:
 *     · collapse/remove leading, repeated and trailing empty paragraphs
 *     · CJK ↔ Latin/digit spacing (pangu-lite)
 *     · half-width → full-width punctuation right after a CJK char
 *     · wraps stray top-level text into <p>
 *
 *   互译 — one-click translate the editor content between Chinese and
 *     English (auto direction detection), chunked block-by-block, tags
 *     preserved. Uses the site's AI provider via /api/ap-etools/translate
 *     (login-protected proxy reading the Settings → AI configuration).
 *
 * The editable root is a contentEditable div (React island) that syncs its
 * content into window.__editorContent on "input" — every mutation ends by
 * dispatching a bubbling input event so the save flow picks up new content.
 */
(function () {
  "use strict";
  if (window.__apEditorTools) return;
  window.__apEditorTools = true;

  var CHUNK = 3500;
  var FULL = { ".": "。", ",": "，", "?": "？", "!": "！", ";": "；", ":": "：" };

  function editor() { return document.querySelector(".ap-wysiwyg-editor"); }

  function syncEditor(ed) {
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }

  function toast(ed, text) {
    var t = document.createElement("div");
    t.textContent = text;
    t.style.cssText = "position:fixed;right:20px;bottom:20px;z-index:99999;background:#1d2327;color:#fff;" +
      "padding:8px 14px;border-radius:4px;font-size:13px;box-shadow:0 2px 8px rgba(0,0,0,.3)";
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 2200);
  }

  // ── auto-format ─────────────────────────────────────────────────────
  function isEmptyBlock(el) {
    if (!el || !/^(P|DIV)$/.test(el.tagName)) return false;
    if (el.querySelector("img,iframe,video,audio,hr,table,ul,ol,blockquote,figure")) return false;
    return el.textContent.replace(/\u00a0/g, " ").trim() === "";
  }

  function fmtText(s) {
    // half→full punctuation when the preceding char is CJK
    s = s.replace(/([.,;:!?])(?=[\u4e00-\u9fff（【「《“\s]|$)/g, function (m, p, off, str) {
      var prev = off > 0 ? str.charAt(off - 1) : "";
      return /[\u4e00-\u9fff）】」》”]/.test(prev) ? FULL[p] : p;
    });
    // pangu-lite: single space between CJK and Latin/digits
    s = s.replace(/([\u4e00-\u9fff])([A-Za-z0-9])/g, "$1 $2")
         .replace(/([A-Za-z0-9])([\u4e00-\u9fff])/g, "$1 $2");
    return s;
  }

  function autoFormat() {
    var ed = editor();
    if (!ed) { alert("未找到编辑器"); return; }

    // 1) empty-block cleanup: collapse runs, strip leading/trailing
    var kids = Array.prototype.slice.call(ed.children);
    var prevEmpty = false;
    kids.forEach(function (el) {
      if (isEmptyBlock(el)) {
        if (prevEmpty) el.remove();
        else prevEmpty = true;
      } else {
        prevEmpty = false;
      }
    });
    while (isEmptyBlock(ed.lastElementChild)) ed.lastElementChild.remove();
    while (isEmptyBlock(ed.firstElementChild)) ed.firstElementChild.remove();

    // 2) wrap stray top-level text nodes into <p>
    Array.prototype.slice.call(ed.childNodes).forEach(function (n) {
      if (n.nodeType === 3 && n.nodeValue.trim()) {
        var p = document.createElement("p");
        ed.insertBefore(p, n);
        p.appendChild(n);
      }
    });

    // 3) text-node level: punctuation + spacing (skip code/pre/script/style)
    var walker = document.createTreeWalker(ed, 4 /* SHOW_TEXT */, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return 2;
        var p = n.parentElement;
        if (!p || p.closest("code,pre,script,style,svg,textarea")) return 2;
        return 1;
      }
    });
    var touched = [];
    var n;
    while ((n = walker.nextNode())) touched.push(n);
    touched.forEach(function (node) {
      var v = fmtText(node.nodeValue);
      if (v !== node.nodeValue) node.nodeValue = v;
    });

    syncEditor(ed);
    toast(ed, "已排版 ✓");
  }

  // ── translate ───────────────────────────────────────────────────────
  function detectTarget(text) {
    var cjk = (text.match(/[\u4e00-\u9fff]/g) || []).length;
    var latin = (text.match(/[A-Za-z]/g) || []).length;
    return cjk > 0 && cjk >= latin * 0.3 ? "en" : "zh-CN";
  }

  function chunkNodes(ed) {
    var units = Array.prototype.slice.call(ed.children);
    // No block children (bare text nodes only, e.g. first line before any
    // Enter) → signal the single-shot path: translate ed.innerHTML and write
    // it back via innerHTML. NEVER hand the editor root itself to
    // replaceChunk — that would remove the React island's DOM node and
    // permanently break the editor.
    if (!units.length) return null;
    var chunks = [], cur = "", buf = [];
    units.forEach(function (u) {
      var h = u.outerHTML;
      if (cur.length && cur.length + h.length > CHUNK) {
        chunks.push(buf);
        cur = ""; buf = [];
      }
      cur += h;
      buf.push(u);
    });
    if (buf.length) chunks.push(buf);
    return chunks;
  }

  function replaceChunk(nodes, htmlFragment) {
    var tmp = document.createElement("div");
    tmp.innerHTML = htmlFragment; // ap-audit-ok: AI 翻译结果进入编辑器可信面
    var first = nodes[0];
    if (!first || first === editor() || !first.parentNode) return; // never replace the editor root
    var frag = document.createDocumentFragment();
    Array.prototype.slice.call(tmp.childNodes).forEach(function (c) { frag.appendChild(c); });
    first.parentNode.insertBefore(frag, first);
    nodes.forEach(function (n) { if (n.parentNode && n !== editor()) n.remove(); });
  }

  function translate(btn) {
    var ed = editor();
    if (!ed) { alert("未找到编辑器"); return; }
    var text = ed.textContent || "";
    if (!text.trim()) { toast(ed, "编辑器内容为空"); return; }

    var target = detectTarget(text);
    var dirName = target === "en" ? "英文" : "中文";
    if (!window.confirm("检测到内容为" + (target === "en" ? "中文" : "英文") + "，将整篇翻译为" + dirName + "。\n编辑器当前内容会被替换（未保存的修改将丢失），确定继续？")) return;

    btn.disabled = true;
    var chunks = chunkNodes(ed);
    var done = 0;

    if (!chunks) {
      // Single-shot: bare-text content — swap innerHTML, keep the editor node.
      btn.textContent = "互译";
      fetch("/api/ap-etools/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ html: ed.innerHTML, target: target })
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (res) {
        if (!res.ok || !res.d.html) throw new Error(res.d.error || "翻译失败");
        ed.innerHTML = res.d.html; // ap-audit-ok: AI 翻译结果进入编辑器可信面
        btn.disabled = false;
        btn.textContent = "互译";
        syncEditor(ed);
        toast(ed, "翻译完成 ✓");
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = "互译";
        alert("翻译失败：" + e.message);
      });
      return;
    }

    function step(i) {
      if (i >= chunks.length) {
        btn.disabled = false;
        btn.textContent = "互译";
        syncEditor(ed);
        toast(ed, "翻译完成 ✓（共 " + chunks.length + " 段）");
        return;
      }
      btn.textContent = "互译 " + (i + 1) + "/" + chunks.length;
      fetch("/api/ap-etools/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ html: chunks[i].map(function (n) { return n.outerHTML; }).join(""), target: target })
      }).then(function (r) {
        return r.json().then(function (d) { return { ok: r.ok, d: d }; });
      }).then(function (res) {
        if (!res.ok || !res.d.html) throw new Error(res.d.error || "翻译失败");
        replaceChunk(chunks[i], res.d.html);
        done++;
        step(i + 1);
      }).catch(function (e) {
        btn.disabled = false;
        btn.textContent = "互译";
        alert("翻译中止（已完成 " + done + "/" + chunks.length + " 段）：" + e.message);
      });
    }
    step(0);
  }

  // ── toolbar mounting (DOM-position anchor + retry) ──────────────────
  function makeBtn(label, title, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.title = title;
    b.setAttribute("data-ap-etools", "1");
    b.style.cssText = "font-size:12px;padding:3px 8px;margin-left:4px;background:#fff;color:#1d2327;" +
      "border:1px solid #dcdcde;border-radius:3px;cursor:pointer;line-height:1.4;vertical-align:middle";
    b.addEventListener("click", onClick);
    return b;
  }

  function tryMount() {
    var ed = editor();
    if (!ed) return false;
    var bar = ed.previousElementSibling;
    if (!bar || bar.contains(ed)) return false;
    if (bar.querySelector("[data-ap-etools]")) return true;
    bar.appendChild(makeBtn("排版", "一键自动排版：清理空行、中英文间距、标点规范（可 Ctrl+Z 之外用刷新撤销未保存改动）", autoFormat));
    bar.appendChild(makeBtn("互译", "中英互译：自动识别方向，保留排版标签（使用 设置→AI 的站点 AI 配置）", translate));
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (tryMount() || ++tries > 30) clearInterval(timer);
  }, 600);
})();
