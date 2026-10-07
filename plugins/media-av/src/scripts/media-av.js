/**
 * Media AV — injected at /api/ap-media-av/media-av.js on admin pages.
 * 在核心编辑器工具栏（.ap-wysiwyg-editor 的 previousElementSibling，无稳定
 * class，按 DOM 位置锚定）追加「音频」「视频」两个按钮：
 *   · 本地上传（XHR 带进度条，最大 100MB，服务端二次 MIME 嗅探）
 *   · 从 URL 插入（仅 http/https）
 * 插入 <audio controls> / <video controls preload="metadata"> 到光标处。
 */
(function () {
  "use strict";
  if (window.__apMediaAv) return;
  window.__apMediaAv = true;

  var UPLOAD_URL = "/api/ap-media-av/upload";
  var ACCEPT = {
    audio: ".mp3,.wav,.m4a,.aac,.ogg,.oga,.flac,audio/*",
    video: ".mp4,.webm,.mov,.m4v,.ogv,video/*",
  };
  var LABEL = { audio: "音频", video: "视频" };

  function editor() {
    return document.querySelector(".ap-wysiwyg-editor");
  }

  function syncEditor(ed) {
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ── 样式（一次性注入，全部以 #ap-av-modal 前缀隔离）──────────────
  var STYLE =
    "#ap-av-modal{position:fixed;inset:0;z-index:99990;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.45)}" +
    "#ap-av-modal .apav-box{background:#fff;width:480px;max-width:92vw;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.25);overflow:hidden;font:13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#1d2327}" +
    "#ap-av-modal .apav-head{padding:12px 16px;font-weight:600;border-bottom:1px solid #e2e4e7;display:flex;justify-content:space-between;align-items:center}" +
    "#ap-av-modal .apav-x{cursor:pointer;border:0;background:none;font-size:18px;color:#787c82;padding:0 4px}" +
    "#ap-av-modal .apav-tabs{display:flex;gap:4px;padding:10px 16px 0}" +
    "#ap-av-modal .apav-tab{padding:6px 14px;border:1px solid #c3c4c7;border-bottom:0;border-radius:4px 4px 0 0;background:#f6f7f7;cursor:pointer}" +
    "#ap-av-modal .apav-tab.on{background:#fff;font-weight:600}" +
    "#ap-av-modal .apav-body{padding:14px 16px;border:1px solid #c3c4c7;margin:0 10px}" +
    "#ap-av-modal .apav-pane{display:none}" +
    "#ap-av-modal .apav-pane.on{display:block}" +
    "#ap-av-modal input[type=text],#ap-av-modal input[type=url]{width:100%;padding:7px 9px;border:1px solid #8c8f94;border-radius:3px;font-size:13px;margin:6px 0}" +
    "#ap-av-modal .apav-row{display:flex;gap:8px;align-items:center;margin-top:10px}" +
    "#ap-av-modal button.apav-btn{background:#2271b1;color:#fff;border:0;border-radius:3px;padding:7px 16px;font-size:13px;cursor:pointer}" +
    "#ap-av-modal button.apav-btn:disabled{opacity:.5;cursor:not-allowed}" +
    "#ap-av-modal button.apav-ghost{background:#f6f7f7;color:#1d2327;border:1px solid #c3c4c7}" +
    "#ap-av-modal .apav-prog{height:8px;background:#f0f0f1;border-radius:4px;overflow:hidden;margin-top:10px;display:none}" +
    "#ap-av-modal .apav-prog i{display:block;height:100%;width:0;background:#2271b1;transition:width .15s}" +
    "#ap-av-modal .apav-msg{font-size:12px;color:#b32d2e;margin-top:8px;min-height:16px;word-break:break-all}" +
    "#ap-av-modal .apav-hint{font-size:12px;color:#646970;margin-top:6px}" +
    "button.apav-tb{margin-left:6px}";

  function ensureStyle() {
    if (document.getElementById("apav-style")) return;
    var st = document.createElement("style");
    st.id = "apav-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  // ── 弹窗骨架（固定文案与结构，无动态数据拼接）────────────────────
  var MODAL_HTML =
    '<div class="apav-box" role="dialog" aria-modal="true">' +
      '<div class="apav-head"><span id="apavTitle">插入媒体</span><button class="apav-x" id="apavClose" aria-label="关闭">×</button></div>' +
      '<div class="apav-tabs">' +
        '<button type="button" class="apav-tab on" data-pane="upload">本地上传</button>' +
        '<button type="button" class="apav-tab" data-pane="url">从 URL 插入</button>' +
      "</div>" +
      '<div class="apav-body">' +
        '<div class="apav-pane on" data-pane="upload">' +
          '<input type="file" id="apavFile" />' +
          '<div class="apav-prog" id="apavProg"><i></i></div>' +
          '<div class="apav-row"><button type="button" class="apav-btn" id="apavUploadBtn">上传并插入</button><span class="apav-hint" id="apavLimit"></span></div>' +
          '<div class="apav-msg" id="apavMsg"></div>' +
        "</div>" +
        '<div class="apav-pane" data-pane="url">' +
          '<input type="url" id="apavUrl" placeholder="https://example.com/media.mp4" />' +
          '<div class="apav-row"><button type="button" class="apav-btn" id="apavInsertUrl">插入</button><span class="apav-hint">仅支持 http/https 直链</span></div>' +
          '<div class="apav-msg" id="apavUrlMsg"></div>' +
        "</div>" +
      "</div>" +
    "</div>";

  var modal = null;
  var curKind = "video";
  var savedRange = null;

  function ensureModal() {
    if (modal) return modal;
    ensureStyle();
    modal = document.createElement("div");
    modal.id = "ap-av-modal";
    modal.innerHTML = MODAL_HTML; // ap-audit-ok: 固定弹窗骨架，无任何动态数据
    document.body.appendChild(modal);

    modal.addEventListener("click", function (e) {
      if (e.target === modal) closeModal();
    });
    modal.querySelector("#apavClose").addEventListener("click", closeModal);
    modal.querySelectorAll(".apav-tab").forEach(function (t) {
      t.addEventListener("click", function () {
        modal.querySelectorAll(".apav-tab").forEach(function (x) { x.classList.remove("on"); });
        modal.querySelectorAll(".apav-pane").forEach(function (x) { x.classList.remove("on"); });
        t.classList.add("on");
          modal.querySelector('.apav-pane[data-pane="' + t.dataset.pane + '"]').classList.add("on");
      });
    });
    modal.querySelector("#apavUploadBtn").addEventListener("click", doUpload);
    modal.querySelector("#apavInsertUrl").addEventListener("click", insertFromUrl);
    modal.querySelector("#apavUrl").addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); insertFromUrl(); }
    });
    return modal;
  }

  function openModal(kind) {
    curKind = kind;
    ensureModal();
    // 记录编辑器当前光标（点击工具栏按钮后选区对象仍可用）
    var ed = editor();
    var sel = window.getSelection();
    if (ed && sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    } else {
      savedRange = null;
    }
    modal.querySelector("#apavTitle").textContent = "插入" + LABEL[kind];
    var file = modal.querySelector("#apavFile");
    file.value = "";
    file.accept = ACCEPT[kind];
    modal.querySelector("#apavMsg").textContent = "";
    modal.querySelector("#apavUrlMsg").textContent = "";
    modal.querySelector("#apavUrl").value = "";
    modal.querySelector("#apavProg").style.display = "none";
    modal.querySelector("#apavProg i").style.width = "0";
    modal.querySelector("#apavLimit").textContent =
      kind === "video" ? "mp4/webm/mov/m4v/ogv，≤100MB" : "mp3/wav/m4a/aac/ogg/flac，≤100MB";
    modal.style.display = "flex";
  }

  function closeModal() {
    if (modal) modal.style.display = "none";
  }

  // ── 插入到编辑器光标处（用 DOM API 构造，避免字符串拼接 URL）──────
  function insertMedia(url, kind) {
    var ed = editor();
    if (!ed) return;
    var node = document.createElement(kind);
    node.src = url;
    node.setAttribute("controls", "controls");
    node.setAttribute("preload", "metadata");
    if (kind === "video") {
      node.setAttribute("playsinline", "playsinline");
      node.style.maxWidth = "100%";
    }
    var holder = document.createElement("div");
    holder.appendChild(node);

    ed.focus();
    var ok = false;
    if (savedRange) {
      var sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(savedRange);
      ok = document.execCommand("insertHTML", false, holder.innerHTML);
    }
    if (!ok) {
      // 兜底：追加到文末
      ed.appendChild(document.createElement("p")).appendChild(node);
    }
    syncEditor(ed);
  }

  function safeMediaUrl(raw) {
    var u = String(raw || "").trim();
    if (!u) return null;
    try {
      var parsed = new URL(u, window.location.origin);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
      return parsed.toString();
    } catch {
      return null;
    }
  }

  function insertFromUrl() {
    var url = safeMediaUrl(modal.querySelector("#apavUrl").value);
    var msg = modal.querySelector("#apavUrlMsg");
    if (!url) { msg.textContent = "请输入合法的 http/https 直链"; return; }
    insertMedia(url, curKind);
    closeModal();
  }

  // ── 本地上传（XHR 进度）────────────────────────────────────────
  function doUpload() {
    var fileInput = modal.querySelector("#apavFile");
    var msg = modal.querySelector("#apavMsg");
    var file = fileInput.files && fileInput.files[0];
    if (!file) { msg.textContent = "请先选择文件"; return; }

    var btn = modal.querySelector("#apavUploadBtn");
    var prog = modal.querySelector("#apavProg");
    var bar = prog.querySelector("i");
    msg.textContent = "";
    prog.style.display = "block";
    btn.disabled = true;

    var fd = new FormData();
    fd.append("file", file);
    fd.append("kind", curKind);
    var xhr = new XMLHttpRequest();
    xhr.open("POST", UPLOAD_URL);
    xhr.upload.onprogress = function (e) {
      if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 100) + "%";
    };
    xhr.onload = function () {
      btn.disabled = false;
      var data = null;
      try { data = JSON.parse(xhr.responseText); } catch { /* */ }
      if (xhr.status >= 200 && xhr.status < 300 && data && data.url) {
        bar.style.width = "100%";
        insertMedia(data.url, curKind);
        closeModal();
      } else {
        msg.textContent = (data && data.error) || "上传失败（HTTP " + xhr.status + "）";
      }
    };
    xhr.onerror = function () {
      btn.disabled = false;
      msg.textContent = "网络错误，上传中断";
    };
    xhr.send(fd);
  }

  // ── 挂载工具栏按钮（锚定编辑器的 previousElementSibling + 重试）──
  function makeBtn(kind) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "apav-tb";
    b.textContent = LABEL[kind]; // ap-audit-ok: 固定中文文案
    b.title = "插入" + LABEL[kind] + "：本地上传或从 URL 插入";
    b.addEventListener("click", function () { openModal(kind); });
    return b;
  }

  function tryMount() {
    var ed = editor();
    if (!ed) return false;
    var bar = ed.previousElementSibling;
    if (!bar || bar.contains(ed)) return false;
    if (!bar.querySelector("[data-apav]")) {
      var ba = makeBtn("audio");
      ba.setAttribute("data-apav", "audio");
      var bv = makeBtn("video");
      bv.setAttribute("data-apav", "video");
      bar.appendChild(ba);
      bar.appendChild(bv);
    }
    return true;
  }

  var tries = 0;
  var timer = setInterval(function () {
    if (tryMount() || ++tries > 30) clearInterval(timer);
  }, 600);
})();
