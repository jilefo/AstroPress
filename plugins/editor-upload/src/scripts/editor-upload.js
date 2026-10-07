/**
 * Editor Media Upload — injected on every admin page via Astro injectScript.
 * Activates only around `.ap-wysiwyg-editor`:
 *   1. Capture-phase paste/drop handlers upload files before the editor's own
 *      plain-HTML paste logic runs (standard DOM semantics, no monkey patching).
 *   2. Appends toolbar buttons to `.ap-wysiwyg-toolbar` (same class family).
 *   3. Self-contained media modal over the official GET /api/media API and
 *      the hardened /api/ap-media/upload endpoint.
 * Deactivating the plugin removes the script entirely — zero residue.
 */
(function () {
  if (window.__apEditorUpload) return;
  window.__apEditorUpload = true;

  var EDITOR = ".ap-wysiwyg-editor";
  var CONCURRENCY = Number(window.__AP_UPLOAD_CONCURRENCY || 3);
  var MAX_MB = Number(window.__AP_UPLOAD_MAX_MB || 25);

  /**
   * Toolbar anchor: the core BlockEditor renders its toolbar as an inline-styled
   * div WITHOUT any class (only buttons carry .ap-wysiwyg-toolbar-btn), so
   * ".ap-wysiwyg-toolbar" never matches. Resolve by DOM position instead:
   * toolbar is the editor's previousElementSibling inside the same wrapper.
   */
  function getToolbar() {
    var byClass = document.querySelector(".ap-wysiwyg-toolbar");
    if (byClass) return byClass;
    var editor = document.querySelector(EDITOR);
    var prev = editor && editor.previousElementSibling;
    if (prev && prev.tagName === "DIV") return prev;
    return null;
  }

  function isEditorEl(el) {
    return el && el.closest && el.closest(EDITOR);
  }
  function hasFiles(e) {
    if (!e.clipboardData && !e.dataTransfer) return false;
    var dt = e.dataTransfer || e.clipboardData;
    return dt && dt.files && dt.files.length > 0;
  }

  /* ---------- toast progress ---------- */
  var toastBox = null;
  function toastHost() {
    if (!toastBox) {
      toastBox = document.createElement("div");
      toastBox.style.cssText = "position:fixed;right:16px;bottom:16px;z-index:99999;display:flex;flex-direction:column;gap:8px;";
      document.body.appendChild(toastBox);
    }
    return toastBox;
  }
  function toast(name) {
    var el = document.createElement("div");
    el.style.cssText = "background:#1d2327;color:#fff;font-size:12px;padding:8px 12px;border-radius:6px;min-width:220px;";
    el.innerHTML = '<div style="margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' +
      escapeHtml(name) + '</div><div class="ap-up-bar" style="height:4px;background:#3c434a;border-radius:2px;overflow:hidden;">' +
      '<div style="height:100%;width:0;background:#2271b1;"></div></div>';
    toastHost().appendChild(el);
    var fill = el.querySelector("div > div");
    return {
      progress: function (p) { fill.style.width = Math.round(p * 100) + "%"; },
      done: function (ok, message) {
        fill.style.background = ok ? "#00a32a" : "#b32d2e";
        if (message) el.querySelector("div").textContent = message;
        setTimeout(function () { el.remove(); }, ok ? 2500 : 6000);
      }
    };
  }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  /* ---------- upload queue (XHR for progress) ---------- */
  function uploadOne(file, kind, onProgress) {
    return new Promise(function (resolve, reject) {
      var form = new FormData();
      form.append("file", file);
      form.append("kind", kind);
      var xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/ap-media/upload");
      xhr.upload.addEventListener("progress", function (e) {
        if (e.lengthComputable) onProgress(e.loaded / e.total);
      });
      xhr.addEventListener("load", function () {
        try {
          var res = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(res);
          else reject(new Error(res.error || ("HTTP " + xhr.status)));
        } catch (err) { reject(err); }
      });
      xhr.addEventListener("error", function () { reject(new Error("网络异常，上传失败")); });
      xhr.send(form);
    });
  }

  function runQueue(files, kind, onEachDone) {
    var list = Array.prototype.slice.call(files).filter(function (f) {
      if (f.size <= MAX_MB * 1024 * 1024) return true;
      toast(f.name).done(false, "文件过大（上限 " + MAX_MB + "MB）");
      return false;
    });
    var index = 0;
    function next() {
      if (index >= list.length) return Promise.resolve();
      var file = list[index++];
      var t = toast(file.name);
      return uploadOne(file, kind, function (p) { t.progress(p); })
        .then(function (res) { t.done(true); onEachDone(file, res); })
        .catch(function (err) { t.done(false, "Failed: " + err.message); })
        .then(next);
    }
    return Promise.all(Array.from({ length: Math.max(1, CONCURRENCY) }, next));
  }

  /* ---------- insert helpers ---------- */
  function insertHtml(editor, html) {
    editor.focus();
    document.execCommand("insertHTML", false, html);
  }
  function imgHtml(res, file) {
    return '<img src="' + escapeHtml(res.url) + '" alt="' + escapeHtml(file.name.replace(/\.[^.]+$/, "")) +
      '" loading="lazy" decoding="async" />';
  }
  function fileHtml(res, file) {
    return '<a href="' + escapeHtml(res.url) + '" download="' + escapeHtml(file.name) + '">' + escapeHtml(file.name) + "</a>";
  }

  /* ---------- capture-phase paste & drop ---------- */
  document.addEventListener("paste", function (e) {
    if (!isEditorEl(e.target) || !hasFiles(e)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var editor = e.target.closest(EDITOR);
    runQueue(e.clipboardData.files, "image", function (file, res) {
      insertHtml(editor, file.type.indexOf("image/") === 0 ? imgHtml(res, file) : fileHtml(res, file));
    });
  }, true);

  document.addEventListener("dragover", function (e) {
    if (isEditorEl(e.target) && e.dataTransfer && Array.prototype.indexOf.call(e.dataTransfer.types || [], "Files") !== -1) {
      e.preventDefault();
    }
  }, true);

  document.addEventListener("drop", function (e) {
    if (!isEditorEl(e.target)) return;
    if (!e.dataTransfer || !e.dataTransfer.files || !e.dataTransfer.files.length) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    var editor = e.target.closest(EDITOR);
    var files = Array.prototype.slice.call(e.dataTransfer.files);
    var images = files.filter(function (f) { return f.type.indexOf("image/") === 0; });
    var others = files.filter(function (f) { return f.type.indexOf("image/") !== 0; });
    runQueue(images, "image", function (file, res) { insertHtml(editor, imgHtml(res, file)); });
    runQueue(others, "attachment", function (file, res) { insertHtml(editor, fileHtml(res, file)); });
  }, true);

  /* ---------- toolbar button + media modal ---------- */
  function openModal() {
    if (document.getElementById("ap-media-modal")) return;
    var root = document.createElement("div");
    root.id = "ap-media-modal";
    root.style.cssText = "position:fixed;inset:0;z-index:99998;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;";
    root.innerHTML = // ap-audit-ok: 纯静态结构
      '<div style="background:#fff;border-radius:8px;max-width:860px;width:92%;max-height:86vh;display:flex;flex-direction:column;overflow:hidden;">' +
      '<div style="display:flex;gap:8px;align-items:center;padding:12px 16px;border-bottom:1px solid #dcdcde;">' +
      '<strong style="flex:1;">Insert media</strong>' +
      '<input id="ap-mm-search" placeholder="Search…" style="font-size:13px;padding:6px 8px;border:1px solid #8c8f94;border-radius:3px;">' +
      '<button type="button" id="ap-mm-upload" style="padding:6px 12px;">Upload</button>' +
      '<input id="ap-mm-file" type="file" multiple accept="image/*,video/*,application/pdf" style="display:none">' +
      '<button type="button" id="ap-mm-close" style="padding:6px 12px;">✕</button></div>' +
      '<div id="ap-mm-grid" style="flex:1;overflow:auto;display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:10px;padding:16px;"></div>' +
      '<div style="display:flex;gap:8px;align-items:center;padding:10px 16px;border-top:1px solid #dcdcde;">' +
      '<span id="ap-mm-info" style="flex:1;font-size:12px;color:#646970;"></span>' +
      '<button type="button" id="ap-mm-prev" style="padding:6px 12px;">‹</button>' +
      '<button type="button" id="ap-mm-next" style="padding:6px 12px;">›</button></div></div>';
    document.body.appendChild(root);

    var grid = root.querySelector("#ap-mm-grid");
    var info = root.querySelector("#ap-mm-info");
    var page = 1, search = "", selected = null;

    function load() {
      fetch("/api/media?page=" + page + "&search=" + encodeURIComponent(search))
        .then(function (r) { return r.json(); })
        .then(function (data) {
          grid.innerHTML = "";
          (data.items || []).forEach(function (item) {
            var cell = document.createElement("div");
            cell.style.cssText = "border:2px solid transparent;border-radius:6px;padding:6px;cursor:pointer;text-align:center;";
            var isImg = (item.mimeType || "").indexOf("image/") === 0;
            cell.innerHTML = (isImg
              ? '<img src="' + escapeHtml(item.url) + '" style="width:100%;height:80px;object-fit:cover;border-radius:4px;" loading="lazy">'
              : '<div style="height:80px;display:flex;align-items:center;justify-content:center;background:#f0f0f1;border-radius:4px;font-size:24px;">📄</div>') +
              '<div style="font-size:11px;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + escapeHtml(item.title || item.filename) + "</div>";
            cell.addEventListener("click", function () {
              grid.querySelectorAll("div[style*='border: 2px solid']").forEach(function (c) { c.style.borderColor = "transparent"; });
              cell.style.borderColor = "#2271b1";
              selected = item;
              info.textContent = item.url;
            });
            grid.appendChild(cell);
          });
          info.textContent = selected ? selected.url : (data.total || 0) + " items";
        });
    }

    root.querySelector("#ap-mm-close").addEventListener("click", function () { root.remove(); });
    root.querySelector("#ap-mm-prev").addEventListener("click", function () { if (page > 1) { page--; load(); } });
    root.querySelector("#ap-mm-next").addEventListener("click", function () { page++; load(); });
    root.querySelector("#ap-mm-search").addEventListener("input", function (e) {
      search = e.target.value; page = 1;
      clearTimeout(root.__t); root.__t = setTimeout(load, 300);
    });
    root.querySelector("#ap-mm-upload").addEventListener("click", function () { root.querySelector("#ap-mm-file").click(); });
    root.querySelector("#ap-mm-file").addEventListener("change", function (e) {
      runQueue(e.target.files, "image", function () { /* refreshed below */ }).then(load);
    });

    root.addEventListener("dblclick", insert);
    var insertBtn = document.createElement("button");
    insertBtn.type = "button";
    insertBtn.textContent = "Insert into editor";
    insertBtn.style.cssText = "padding:6px 14px;";
    insertBtn.addEventListener("click", insert);
    root.querySelector("#ap-mm-close").parentElement.appendChild(insertBtn);

    function insert() {
      if (!selected) return;
      var editor = document.querySelector(EDITOR);
      if (editor) {
        var isImg = (selected.mimeType || "").indexOf("image/") === 0;
        insertHtml(editor, isImg
          ? '<img src="' + escapeHtml(selected.url) + '" alt="' + escapeHtml(selected.title || "") + '" loading="lazy" decoding="async" />'
          : '<a href="' + escapeHtml(selected.url) + '" download>' + escapeHtml(selected.title || selected.filename) + "</a>");
      }
      root.remove();
    }

    load();
  }

  /* ---------- toolbar enhancement (media + font size + source view) ---------- */

  var sepCss = "width:1px;height:20px;background:#dcdcde;margin:0 4px;flex-shrink:0;";
  var selectCss = "height:28px;font-size:12px;border:1px solid transparent;background:none;color:#1d2327;cursor:pointer;border-radius:2px;padding:0 2px;";

  // Save/restore the editor selection around toolbar interactions so the
  // font-size select (which steals focus) still applies to the right text.
  var savedRange = null;
  function saveSel() {
    var sel = window.getSelection();
    savedRange = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null;
  }
  function restoreSel(editor) {
    if (!savedRange) return;
    var sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(savedRange);
    editor.focus();
  }

  function makeBtn(html, title, onClick) {
    var btn = document.createElement("button");
    btn.type = "button";
    btn.title = title;
    btn.className = "ap-wysiwyg-toolbar-btn";
    btn.setAttribute("data-ap-btn", "1");
    btn.style.cssText = "display:inline-flex;align-items:center;justify-content:center;width:30px;height:28px;font-size:13px;color:#1d2327;background:none;border:1px solid transparent;border-radius:2px;cursor:pointer;padding:0;line-height:1;";
    btn.innerHTML = html; // ap-audit-ok: 调用方传入静态图标字符串
    btn.addEventListener("mousedown", function (e) { e.preventDefault(); });
    btn.addEventListener("click", onClick);
    return btn;
  }

  function applyFontSize(px) {
    var editor = document.querySelector(EDITOR);
    if (!editor || !px) return;
    restoreSel(editor);
    var sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) return;
    var range = sel.getRangeAt(0);
    var frag = range.extractContents();
    var span = document.createElement("span");
    span.style.fontSize = px;
    span.appendChild(frag);
    range.insertNode(span);
    sel.removeAllRanges();
    savedRange = null;
    editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
  }

  /* ---------- HTML beautifier for source view ---------- */

  var VOID_TAGS = { area:1, base:1, br:1, col:1, embed:1, hr:1, img:1, input:1, link:1, meta:1, source:1, track:1, wbr:1 };
  var RAW_TAGS = { pre:1, script:1, style:1, textarea:1, code:1 };
  var INLINE_TAGS = { a:1, abbr:1, b:1, bdi:1, bdo:1, br:1, cite:1, code:1, data:1, del:1, dfn:1, em:1, i:1, ins:1, kbd:1, mark:1, q:1, s:1, samp:1, small:1, span:1, strong:1, sub:1, sup:1, time:1, u:1, var:1, wbr:1, img:1 };

  /** 序列化单个元素（递归，带缩进）；pre/script/style 内容原样输出 */
  function serializeNode(node, depth) {
    var pad = new Array(depth + 1).join("  ");
    if (node.nodeType === 3) {
      var t = (node.nodeValue || "").replace(/\s+/g, " ").trim();
      return t ? pad + escapeText(t) + "\n" : "";
    }
    if (node.nodeType !== 1) return "";
    var tag = node.tagName.toLowerCase();
    var attrs = "";
    for (var i = 0; i < node.attributes.length; i++) {
      var a = node.attributes[i];
      attrs += " " + a.name + '="' + String(a.value).replace(/&/g, "&amp;").replace(/"/g, "&quot;") + '"';
    }
    if (VOID_TAGS[tag]) return pad + "<" + tag + attrs + " />\n";
    var inner = "";
    if (RAW_TAGS[tag]) {
      // 原样内容（pre 代码块不能被重排；innerHTML 保留实体，切回所见即所得时重新解析结果一致）
      return pad + "<" + tag + attrs + ">" + node.innerHTML + "</" + tag + ">\n";
    }
    var kids = Array.prototype.slice.call(node.childNodes);
    var allInline = kids.length > 0 && kids.every(function (k) {
      return k.nodeType === 3 || INLINE_TAGS[(k.tagName || "").toLowerCase()];
    });
    if (allInline) {
      // 纯内联内容（段落文本/链接/粗体等）：单行输出，避免拆散语句
      var text = kids.map(function (k) {
        if (k.nodeType === 3) return escapeText((k.nodeValue || "").replace(/\s+/g, " ").trim());
        return serializeNode(k, 0).trim();
      }).filter(Boolean).join("");
      return pad + "<" + tag + attrs + ">" + text + "</" + tag + ">\n";
    }
    for (var j = 0; j < kids.length; j++) inner += serializeNode(kids[j], depth + 1);
    if (!inner) return pad + "<" + tag + attrs + "></" + tag + ">\n";
    return pad + "<" + tag + attrs + ">\n" + inner + pad + "</" + tag + ">\n";
  }

  function escapeText(s) {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  /** 把压缩的单行 HTML 格式化为带缩进的多行源码；解析失败时返回原文 */
  function beautifyHtml(html) {
    try {
      var doc = new DOMParser().parseFromString("<div id=__root>" + html + "</div>", "text/html");
      var rootEl = doc.getElementById("__root");
      if (!rootEl) return html;
      var out = "";
      var kids = Array.prototype.slice.call(rootEl.childNodes);
      for (var i = 0; i < kids.length; i++) out += serializeNode(kids[i], 0);
      return out.trim() || html;
    } catch (e) {
      return html;
    }
  }

  function toggleSource() {
    var editor = document.querySelector(EDITOR);
    if (!editor) return;
    var wrapper = editor.parentElement;
    var existing = wrapper.querySelector(".ap-src-view");
    if (existing) {
      editor.innerHTML = existing.value; // ap-audit-ok: 回填自身保存的源码，可信内容
      existing.remove();
      editor.style.display = "";
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
      return;
    }
    var ta = document.createElement("textarea");
    ta.className = "ap-src-view";
    ta.spellcheck = false;
    ta.value = beautifyHtml(editor.innerHTML);
    ta.style.cssText = "flex:1;min-height:440px;padding:16px 20px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:13px;line-height:1.6;border:none;outline:none;resize:vertical;background:#1d2327;color:#d4d4d4;white-space:pre;overflow:auto;";
    editor.style.display = "none";
    editor.insertAdjacentElement("afterend", ta);
    ta.addEventListener("input", function () {
      // Mirror live so saving while in source mode persists the edited HTML.
      editor.innerHTML = ta.value; // ap-audit-ok: 编辑器可信内容镜像
      editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
    });
    ta.focus();
  }

  function addToolbarButton() {
    var bar = getToolbar();
    if (!bar || bar.querySelector("[data-ap-btn='media']")) return;

    // Font size select (applies to current selection as inline span)
    var font = document.createElement("select");
    font.title = "Font size (Editor Upload plugin)";
    font.setAttribute("data-ap-btn", "font");
    font.style.cssText = selectCss;
    font.innerHTML = '<option value="">Size</option>' + // ap-audit-ok: 纯静态选项
      '<option value="12px">12</option><option value="14px">14</option>' +
      '<option value="16px">16</option><option value="18px">18</option>' +
      '<option value="20px">20</option><option value="24px">24</option>' +
      '<option value="28px">28</option><option value="32px">32</option>';
    font.addEventListener("mousedown", function () { saveSel(); });
    font.addEventListener("focus", function () { saveSel(); });
    font.addEventListener("change", function (e) {
      applyFontSize(e.target.value);
      e.target.value = "";
      e.target.blur();
    });
    bar.appendChild(font);

    var sep1 = document.createElement("span");
    sep1.style.cssText = sepCss;
    bar.appendChild(sep1);

    // Source code view toggle
    bar.appendChild(makeBtn("❮❯", "Toggle HTML source (Editor Upload plugin)", toggleSource));

    // Media library modal (upload + insert)
    var btn = makeBtn("▣", "Insert media (Editor Upload plugin)", openModal);
    btn.setAttribute("data-ap-btn", "media");
    bar.appendChild(btn);
  }

  function boot() {
    addToolbarButton();
    // React islands mount asynchronously and navigation swaps the DOM — keep
    // watching until the toolbar shows our buttons, then stop.
    var tries = 0;
    var timer = setInterval(function () {
      if (document.querySelector("[data-ap-btn='media']") || ++tries > 20) clearInterval(timer);
      else addToolbarButton();
    }, 600);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();