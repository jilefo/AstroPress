/**
 * WP Editor — injected at /api/ap-wp-editor/wp-editor.js on admin pages.
 * 在核心编辑器（.ap-wysiwyg-editor）上方插入一条 WordPress 风格工具条：
 *   段落样式下拉（正文/H1-H3/引用/代码）｜B I U S｜有序/无序列表｜引用
 *   代码块｜左中右对齐｜链接｜图片(URL)｜分隔线｜清除格式｜全屏专注｜字数统计
 * 全部基于 contentEditable + document.execCommand（Chrome/Edge 兼容最好），
 * 不移动/不改写编辑器 DOM 节点本身，禁用插件后完全还原。
 */
(function () {
  "use strict";
  if (window.__apWpEditor) return;
  window.__apWpEditor = true;

  var CSS =
    ".apwp-bar{display:flex;align-items:center;flex-wrap:wrap;gap:2px;padding:4px 8px;margin:8px 0 0;" +
    "background:linear-gradient(#ffffff,#f6f7f7);border:1px solid #c3c4c7;border-bottom:0;border-radius:4px 4px 0 0;" +
    "font:13px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif}" +
    ".apwp-bar select{font-size:12px;padding:3px 4px;border:1px solid #8c8f94;border-radius:3px;background:#fff;margin-right:4px;max-width:130px}" +
    ".apwp-btn{width:28px;height:28px;padding:0;border:1px solid transparent;border-radius:3px;background:transparent;cursor:pointer;" +
    "display:inline-flex;align-items:center;justify-content:center;color:#1d2327}" +
    ".apwp-btn:hover{background:#2271b1;border-color:#135e96;color:#fff}" +
    ".apwp-btn svg{width:16px;height:16px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}" +
    ".apwp-btn.apwp-wide{width:auto;padding:0 8px;font-size:12px}" +
    ".apwp-sep{width:1px;height:18px;background:#c3c4c7;margin:0 5px}" +
    ".apwp-count{margin-left:auto;font-size:12px;color:#646970;padding-right:6px;white-space:nowrap}" +
    ".apwp-bar.apwp-fs{position:fixed;top:0;left:0;right:0;z-index:99991;border-radius:0;margin:0;height:40px;justify-content:center}" +
    ".ap-wysiwyg-editor.apwp-fs{position:fixed;top:40px;left:50%;transform:translateX(-50%);width:100%;max-width:880px;bottom:0;" +
    "z-index:99990;overflow:auto;background:#fff;margin:0;padding:30px 40px;border:1px solid #c3c4c7;box-sizing:border-box}" +
    ".apwp-backdrop{position:fixed;inset:0;background:#1d2327;z-index:99989}" +
    ".ap-wysiwyg-editor{line-height:1.8;padding:16px 20px;font-size:15px}" +
    ".ap-wysiwyg-editor p{margin:0 0 1em}" +
    ".ap-wysiwyg-editor h1,.ap-wysiwyg-editor h2,.ap-wysiwyg-editor h3,.ap-wysiwyg-editor h4{margin:1.5em 0 0.8em;line-height:1.4}" +
    ".ap-wysiwyg-editor h1{font-size:1.8em;border-bottom:2px solid #e2e4e7;padding-bottom:0.3em}" +
    ".ap-wysiwyg-editor h2{font-size:1.5em;border-bottom:1px solid #e2e4e7;padding-bottom:0.2em}" +
    ".ap-wysiwyg-editor h3{font-size:1.25em}" +
    ".ap-wysiwyg-editor h4{font-size:1.1em}" +
    ".ap-wysiwyg-editor blockquote{border-left:4px solid #2271b1;margin:1em 0;padding:12px 20px;background:#f6f7f7;color:#50575e;font-style:italic}" +
    ".ap-wysiwyg-editor pre{background:#1e1e1e;color:#d4d4d4;padding:16px;border-radius:6px;overflow-x:auto;margin:1em 0;font:13px/1.5 'Cascadia Code','JetBrains Mono',Consolas,monospace}" +
    ".ap-wysiwyg-editor code{background:#f0f0f1;padding:2px 6px;border-radius:3px;font:13px/1.5 'Cascadia Code','JetBrains Mono',Consolas,monospace;color:#d63384}" +
    ".ap-wysiwyg-editor pre code{background:none;padding:0;color:inherit}" +
    ".ap-wysiwyg-editor ul,.ap-wysiwyg-editor ol{margin:1em 0;padding-left:2em}" +
    ".ap-wysiwyg-editor li{margin:0.4em 0}" +
    ".ap-wysiwyg-editor img{max-width:100%;height:auto;border-radius:4px;margin:1em 0}" +
    ".ap-wysiwyg-editor a{color:#2271b1;text-decoration:underline}" +
    ".ap-wysiwyg-editor a:hover{color:#135e96}" +
    ".ap-wysiwyg-editor table{border-collapse:collapse;width:100%;margin:1em 0}" +
    ".ap-wysiwyg-editor th,.ap-wysiwyg-editor td{border:1px solid #dcdcde;padding:8px 12px;text-align:left}" +
    ".ap-wysiwyg-editor th{background:#f6f7f7;font-weight:600}" +
    ".ap-wysiwyg-editor hr{border:0;border-top:2px solid #dcdcde;margin:2em 0}";

  // stroke 风格图标（静态、无外部数据）
  var I = {
    bold: '<svg viewBox="0 0 24 24"><path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z"/></svg>',
    italic: '<svg viewBox="0 0 24 24"><path d="M19 5h-6M11 19H5M15 5L9 19"/></svg>',
    underline: '<svg viewBox="0 0 24 24"><path d="M7 4v7a5 5 0 0 0 10 0V4M5 21h14"/></svg>',
    strike: '<svg viewBox="0 0 24 24"><path d="M4 12h16M8 7a4 3 0 0 1 4-2c3 0 4 1.5 4 3M16 17a4 3 0 0 1-4 2c-3 0-4-1.5-4-3"/></svg>',
    ul: '<svg viewBox="0 0 24 24"><path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/></svg>',
    ol: '<svg viewBox="0 0 24 24"><path d="M10 6h11M10 12h11M10 18h11M4 6h1v4M4 10h2M6 16H4l2-2v4"/></svg>',
    quote: '<svg viewBox="0 0 24 24"><path d="M7 7H4v6h4v4M17 7h-3v6h4v4"/></svg>',
    code: '<svg viewBox="0 0 24 24"><path d="M9 8l-5 4 5 4M15 8l5 4-5 4"/></svg>',
    left: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h16M4 12h0"/></svg>',
    center: '<svg viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M4 18h16"/></svg>',
    right: '<svg viewBox="0 0 24 24"><path d="M4 6h16M10 12h10M4 18h16"/></svg>',
    link: '<svg viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 0 7 .5l2-2a5 5 0 0 0-7-7l-1 1M14 11a5 5 0 0 0-7-.5l-2 2a5 5 0 0 0 7 7l1-1"/></svg>',
    image: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="8.5" cy="9.5" r="1.5"/><path d="M21 16l-5-5L5 20"/></svg>',
    hr: '<svg viewBox="0 0 24 24"><path d="M3 12h18"/></svg>',
    clear: '<svg viewBox="0 0 24 24"><path d="M5 18L19 6M8 6h11M5 12h6M5 18h6"/></svg>',
    fs: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
    md: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M7 9v6M7 9l2 2 2-2M13 15V9M13 9l2 2M17 15V9M17 9l2 2"/></svg>',
    deai: '<svg viewBox="0 0 24 24"><path d="M12 2l2.5 5 5.5.8-4 4 .9 5.5-5-2.6-5 2.6.9-5.5-4-4L9.5 7z"/><path d="M12 12v6M12 18h.01" stroke-dasharray="1 2"/></svg>',
  };

  /**
   * HTML → Markdown 转换（从编辑器 contentEditable 提取）
   * 支持：标题、段落、粗体/斜体、列表、引用、代码块、图片、链接、水平线
   */
  function htmlToMd(html) {
    var div = document.createElement("div");
    div.innerHTML = html;
    var out = [];

    function walk(node, depth) {
      if (node.nodeType === Node.TEXT_NODE) {
        var t = node.textContent.replace(/\s+/g, " ").trim();
        if (t) out.push(t);
        return;
      }
      if (node.nodeType !== Node.ELEMENT_NODE) return;

      var tag = node.tagName.toLowerCase();
      var i, child;

      switch (tag) {
        case "h1": case "h2": case "h3": case "h4": case "h5": case "h6":
          out.push("\n\n" + "#".repeat(parseInt(tag[1])) + " " + getText(node) + "\n\n");
          return;
        case "p":
          var txt = getText(node);
          if (txt) out.push(txt + "\n\n");
          return;
        case "br":
          out.push("\n");
          return;
        case "hr":
          out.push("\n\n---\n\n");
          return;
        case "strong": case "b":
          out.push("**" + getText(node) + "**");
          return;
        case "em": case "i":
          out.push("*" + getText(node) + "*");
          return;
        case "code":
          out.push("`" + getText(node) + "`");
          return;
        case "pre":
          var code = node.querySelector("code");
          var codeText = code ? code.textContent : node.textContent;
          out.push("\n\n```\n" + codeText.replace(/\n$/, "") + "\n```\n\n");
          return;
        case "blockquote":
          out.push("\n\n> " + getText(node).replace(/\n/g, "\n> ") + "\n\n");
          return;
        case "ul":
          out.push("\n");
          for (i = 0; i < node.children.length; i++) {
            if (node.children[i].tagName === "LI") out.push("- " + getText(node.children[i]) + "\n");
          }
          out.push("\n");
          return;
        case "ol":
          out.push("\n");
          for (i = 0; i < node.children.length; i++) {
            if (node.children[i].tagName === "LI") out.push((i + 1) + ". " + getText(node.children[i]) + "\n");
          }
          out.push("\n");
          return;
        case "li":
          out.push(getText(node));
          return;
        case "img":
          var src = node.getAttribute("src") || "";
          var alt = node.getAttribute("alt") || "image";
          if (src) out.push("![" + alt + "](" + src + ")");
          return;
        case "a":
          var href = node.getAttribute("href") || "";
          var linkText = getText(node);
          if (href) out.push("[" + linkText + "](" + href + ")");
          else out.push(linkText);
          return;
        default:
          for (i = 0; i < node.childNodes.length; i++) walk(node.childNodes[i], depth + 1);
          if (tag === "div" || tag === "section" || tag === "article") out.push("\n");
      }
    }

    function getText(node) {
      var t = "";
      for (var i = 0; i < node.childNodes.length; i++) {
        var c = node.childNodes[i];
        if (c.nodeType === Node.TEXT_NODE) t += c.textContent;
        else if (c.nodeType === Node.ELEMENT_NODE) {
          var tg = c.tagName.toLowerCase();
          if (tg === "strong" || tg === "b") t += "**" + getText(c) + "**";
          else if (tg === "em" || tg === "i") t += "*" + getText(c) + "*";
          else if (tg === "code") t += "`" + getText(c) + "`";
          else if (tg === "br") t += "\n";
          else t += getText(c);
        }
      }
      return t;
    }

    for (var i = 0; i < div.childNodes.length; i++) walk(div.childNodes[i], 0);
    var result = out.join("").replace(/\n{3,}/g, "\n\n").trim();
    return result;
  }

  function editor() {
    return document.querySelector(".ap-wysiwyg-editor");
  }

  var savedRange = null;
  function saveSelection(ed) {
    var sel = window.getSelection();
    if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
      savedRange = sel.getRangeAt(0).cloneRange();
    }
  }
  function restoreSelection(ed) {
    ed.focus();
    if (savedRange) {
      try {
        var sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(savedRange);
      } catch { savedRange = null; }
    }
  }
  function sync(ed) {
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }
  function cmd(ed, command, value) {
    restoreSelection(ed);
    try { document.execCommand(command, false, value || null); } catch (e) { /* 老旧命令失败时静默 */ }
    saveSelection(ed);
    sync(ed);
    updateCount(ed);
  }

  function safeUrl(raw, allowed) {
    var u = String(raw || "").trim();
    if (!u) return null;
    try {
      var parsed = new URL(u, window.location.origin);
      if (allowed.indexOf(parsed.protocol) < 0) return null;
      return parsed.toString();
    } catch { return null; }
  }

  // ── 字数统计（拉丁词 + 中文按字）────────────────────────────────
  function countText(ed) {
    var txt = ed.textContent || "";
    var words = (txt.match(/[A-Za-z0-9]+(?:[-'][A-Za-z0-9]+)*/g) || []).length;
    var cjk = (txt.match(/[\u3400-\u9fff\uf900-\ufaff]/g) || []).length;
    return words + cjk;
  }
  var countEl = null;
  function updateCount(ed) {
    if (countEl) countEl.textContent = "字数：" + countText(ed);
  }

  // ── 全屏专注模式（只加定位样式，不移动 DOM 节点）──────────────────
  var backdrop = null;
  function toggleFs(bar, ed, btn) {
    var on = !bar.classList.contains("apwp-fs");
    if (on) {
      bar.classList.add("apwp-fs");
      ed.classList.add("apwp-fs");
      if (!backdrop) {
        backdrop = document.createElement("div");
        backdrop.className = "apwp-backdrop";
        document.body.appendChild(backdrop);
      }
      btn.setAttribute("aria-pressed", "true");
      setTimeout(function () { ed.focus(); }, 0);
    } else {
      bar.classList.remove("apwp-fs");
      ed.classList.remove("apwp-fs");
      if (backdrop) { backdrop.parentNode.removeChild(backdrop); backdrop = null; }
      btn.setAttribute("aria-pressed", "false");
    }
  }

  function makeBtn(ed, bar, icon, title, wideText, onClick) {
    var b = document.createElement("button");
    b.type = "button";
    b.className = "apwp-btn" + (wideText ? " apwp-wide" : "");
    b.title = title;
    b.setAttribute("aria-label", title);
    b.innerHTML = wideText || I[icon]; // ap-audit-ok: 仅注入静态 SVG 图标或固定文案
    b.addEventListener("mousedown", function (e) { e.preventDefault(); }); // 防止按钮抢焦点丢选区
    b.addEventListener("click", function () { onClick(b); });
    return b;
  }

  function makeSep() {
    var s = document.createElement("span");
    s.className = "apwp-sep";
    return s;
  }

  function buildBar(ed) {
    var bar = document.createElement("div");
    bar.className = "apwp-bar";
    bar.id = "apwp-bar";
    bar.addEventListener("mousedown", function () { saveSelection(ed); });

    // 段落样式下拉
    var sel = document.createElement("select");
    sel.title = "段落样式";
    [["p", "正文"], ["h1", "标题 1"], ["h2", "标题 2"], ["h3", "标题 3"], ["blockquote", "引用块"], ["pre", "代码块"]].forEach(function (o) {
      var op = document.createElement("option");
      op.value = o[0];
      op.textContent = o[1];
      sel.appendChild(op);
    });
    sel.addEventListener("mousedown", function () { saveSelection(ed); });
    sel.addEventListener("change", function () {
      cmd(ed, "formatBlock", sel.value === "p" ? "p" : sel.value);
      sel.value = "p";
    });
    bar.appendChild(sel);
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn(ed, bar, "bold", "加粗 (Ctrl+B)", null, function () { cmd(ed, "bold"); }));
    bar.appendChild(makeBtn(ed, bar, "italic", "斜体 (Ctrl+I)", null, function () { cmd(ed, "italic"); }));
    bar.appendChild(makeBtn(ed, bar, "underline", "下划线", null, function () { cmd(ed, "underline"); }));
    bar.appendChild(makeBtn(ed, bar, "strike", "删除线", null, function () { cmd(ed, "strikeThrough"); }));
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn(ed, bar, "ul", "无序列表", null, function () { cmd(ed, "insertUnorderedList"); }));
    bar.appendChild(makeBtn(ed, bar, "ol", "有序列表", null, function () { cmd(ed, "insertOrderedList"); }));
    bar.appendChild(makeBtn(ed, bar, "quote", "引用块", null, function () { cmd(ed, "formatBlock", "blockquote"); }));
    bar.appendChild(makeBtn(ed, bar, "code", "代码块", null, function () { cmd(ed, "formatBlock", "pre"); }));
    bar.appendChild(makeSep());

    bar.appendChild(makeBtn(ed, bar, "left", "左对齐", null, function () { cmd(ed, "justifyLeft"); }));
    bar.appendChild(makeBtn(ed, bar, "center", "居中", null, function () { cmd(ed, "justifyCenter"); }));
    bar.appendChild(makeBtn(ed, bar, "right", "右对齐", null, function () { cmd(ed, "justifyRight"); }));
    bar.appendChild(makeSep());

    // 链接：弹原生 prompt，仅允许 http/https/mailto
    bar.appendChild(makeBtn(ed, bar, "link", "插入/编辑链接", null, function () {
      restoreSelection(ed);
      var raw = window.prompt("请输入链接地址（http / https / mailto）", "https://");
      if (raw === null) return;
      var url = safeUrl(raw, ["http:", "https:", "mailto:"]);
      if (!url) { window.alert("链接地址不合法"); return; }
      cmd(ed, "createLink", url);
    }));
    // 图片：仅 URL 直链插入（本地上传请用媒体库/音视频按钮）
    bar.appendChild(makeBtn(ed, bar, "image", "插入图片（URL 直链）", null, function () {
      var raw = window.prompt("请输入图片直链地址（http / https）", "https://");
      if (raw === null) return;
      var url = safeUrl(raw, ["http:", "https:"]);
      if (!url) { window.alert("图片地址不合法"); return; }
      var img = document.createElement("img");
      img.src = url;
      img.alt = "";
      img.style.maxWidth = "100%";
      restoreSelection(ed);
      var holder = document.createElement("div");
      holder.appendChild(img);
      var ok = false;
      try { ok = document.execCommand("insertHTML", false, holder.innerHTML); } catch (e) { ok = false; }
      if (!ok) ed.appendChild(img);
      sync(ed);
    }));
    bar.appendChild(makeBtn(ed, bar, "hr", "水平分隔线", null, function () { cmd(ed, "insertHorizontalRule"); }));
    bar.appendChild(makeBtn(ed, bar, "clear", "清除格式", null, function () { cmd(ed, "removeFormat"); }));
    bar.appendChild(makeSep());

    var fsBtn = makeBtn(ed, bar, "fs", "全屏专注模式（Esc 退出）", null, function () { toggleFs(bar, ed, fsBtn); });
    bar.appendChild(fsBtn);

    bar.appendChild(makeSep());

    // 一键转 Markdown：把编辑器内容转为 Markdown 并复制到剪贴板
    bar.appendChild(makeBtn(ed, bar, "md", "一键转 Markdown（复制到剪贴板）", null, function () {
      var html = ed.innerHTML;
      var md = htmlToMd(html);
      navigator.clipboard.writeText(md).then(function () {
        var tip = document.createElement("div");
        tip.style.cssText = "position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:#1d2327;color:#fff;padding:12px 24px;border-radius:6px;font-size:13px;z-index:99999;box-shadow:0 4px 20px rgba(0,0,0,.3)";
        tip.textContent = "已复制 " + md.length + " 字符 Markdown";
        document.body.appendChild(tip);
        setTimeout(function () { tip.remove(); }, 2000);
      }).catch(function () {
        window.prompt("复制失败，请手动复制：", md);
      });
    }));

    // 去 AI 味：把编辑器内容发给 AI 润色
    bar.appendChild(makeBtn(ed, bar, "deai", "去 AI 味（发送给 AI 润色）", null, function () {
      var html = ed.innerHTML;
      var md = htmlToMd(html);
      if (md.length < 50) {
        window.alert("内容太短（不足 50 字），无需去 AI 味");
        return;
      }
      var panel = document.getElementById("apaiPanel");
      if (panel) {
        panel.classList.add("apai-open");
        var input = document.getElementById("apaiInput");
        if (input) {
          input.value = "请对以下内容进行深度去 AI 味改写，严格执行禁令清单：【禁用词】此外/然而/因此/总而言之/事实上/值得注意/换句话说/划重点/敲黑板/拆解/梳理/剖析/解构/赋能/闭环/抓手/落地/至关重要/不可或缺/深远影响/标志着/行业报告显示/专家认为/研究表明/未来可期/综上所述；【句式禁令】禁「不是A而是B」「看似…实则…」二分壳，禁三项式排比，「一旦…就/只有…才/无论…都」全文最多1次，默认不用「你」；【标点禁令】揭晓式破折号删，「核心是：」类提示语冒号直写内容；【手法】然而→可/但/其实，抽象→具象（紧张→手在抖，提升效率→省了几个人），长短句交错制造呼吸感。保留全部事实与数据，输出完整 Markdown 格式。\n\n内容如下：\n\n" + md;
          input.focus();
        }
      } else {
        window.alert("请先打开 AI 助手面板（右侧悬浮按钮）");
      }
    }));

    countEl = document.createElement("span");
    countEl.className = "apwp-count";
    bar.appendChild(countEl);
    updateCount(ed);

    return bar;
  }

  // ── 爆款标题生成器 ──────────────────────────────────────────────
  // 公式库移植自 WorkBuddy 爆款标题技能（基于语料统计：66% 爆款用实体锚定）
  // 每个公式 = 结构 + 真实范例，本地按关键词/标题拼装
  var TITLE_FORMULAS = [
    { name: "实体锚定", tpl: function(t, k){ return k ? "独家：" + k + "全面解析，看完这篇就够了" : "深度拆解：" + (t||"这件事") + "背后的逻辑"; } },
    { name: "数字反差", tpl: function(t, k){ return "花 3 天时间，我把" + (k||"这件事") + "彻底搞明白了"; } },
    { name: "数字清单", tpl: function(t, k){ return "关于" + (k||"这个话题") + "，这 " + (3+Math.floor(Math.random()*5)) + " 个真相你必须知道"; } },
    { name: "悬念钩子", tpl: function(t, k){ return "原来" + (k||"这件事") + "的真相，和你想的完全不一样"; } },
    { name: "反差对比", tpl: function(t, k){ return "同样做" + (k||"这件事") + "，为什么有人成功有人失败？差别在这 3 点"; } },
    { name: "痛点戳心", tpl: function(t, k){ return "踩过" + (k||"这个领域") + "的 5 个坑，个个都是血泪教训"; } },
    { name: "利益承诺", tpl: function(t, k){ return "这套" + (k||"方法") + "直接抄，效率提升看得见"; } },
    { name: "共鸣共情", tpl: function(t, k){ return "是不是每次面对" + (k||"这个问题") + "，你都在假装淡定？"; } },
    { name: "反常识颠覆", tpl: function(t, k){ return "越努力越低效？" + (k||"这件事") + "的问题根本不在勤奋"; } },
    { name: "阴谋揭秘", tpl: function(t, k){ return "没人告诉你：" + (k||"这个行业") + "里藏着的隐形规则"; } },
    { name: "亲测转变", tpl: function(t, k){ return "实测" + (k||"这个方法") + "一个月，我承认之前的偏见错了"; } },
    { name: "身份场景", tpl: function(t, k){ return "写给所有正在被" + (k||"这个问题") + "困扰的人"; } },
    { name: "收益损失", tpl: function(t, k){ return "错过" + (k||"这波趋势") + "，你可能要多走 3 年弯路"; } },
    { name: "问题悬念", tpl: function(t, k){ return (k||"这件事") + "到底值不值得做？答案可能出乎你意料"; } },
    { name: "隐藏机制", tpl: function(t, k){ return "看懂" + (k||"这件事") + "的底层逻辑，才算真正入门"; } },
    { name: "具体场景", tpl: function(t, k){ return "从熬夜硬扛到 10 分钟搞定：" + (k||"这件事") + "的正确打开方式"; } },
  ];

  // 7 个通用「加辣」增强器（可叠加，只改表达不加事实）
  var TITLE_ENHANCERS = [
    function(t){ return t; }, // 原始
    function(t){ return "刚刚，" + t; }, // 时间前置
    function(t){ return t.replace(/。?$/, "…"); }, // 省略号留白
    function(t){ return t + "（建议收藏）"; }, // 行动指令
    function(t){ return "别问了，" + t; }, // 口语加语气
  ];

  var PLATFORM_LIMITS = { "小红书": 20, "抖音": 30, "公众号": 30, "通用": 30 };
  // 违规词表移植自 viral-title-generator avoid-list（六大类）
  var BANNED_WORDS = [
    // 绝对化
    "最好", "第一", "唯一", "顶级", "绝无仅有", "100%", "保证", "必中",
    // 夸大承诺
    "月入10万", "一键暴富", "白捡", "稳赚不赔", "躺赚",
    // 诱导逼迫
    "不看后悔", "不转不是", "最后一天", "手慢无",
    // 医疗/金融/法律高危
    "治愈", "根治", "包治", "特效", "无副作用", "保本", "无风险", "内幕", "翻倍", "必赢", "包过",
    // 标题党高频
    "震惊", "惊呆", "吓尿", "吐血整理", "紧急扩散", "刚刚发生",
  ];

  function filterBanned(title) {
    var t = title;
    for (var i = 0; i < BANNED_WORDS.length; i++) {
      t = t.split(BANNED_WORDS[i]).join("");
    }
    return t;
  }

  function truncateFor(title, platform) {
    var max = PLATFORM_LIMITS[platform] || 30;
    if (title.length <= max) return title;
    return title.slice(0, max - 1) + "…";
  }

  function extractKeywords(text) {
    if (!text) return "";
    // 简单提取：取前 20 个非停用词汉字
    var stop = ["的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "个", "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好", "自己", "这", "那", "它", "他", "她", "们", "什么", "怎么", "如何", "为什么", "因为", "所以", "但是", "如果", "虽然", "可以", "应该", "需要", "可能", "我们", "你们", "他们", "这个", "那个", "这些", "那些", "还是", "或者", "而且", "然后", "现在", "已经", "正在", "只是", "就是", "不是", "没有", "不能", "不要", "不会", "一样", "一些", "什么", "怎么", "多少", "几个", "一种", "一样", "一直", "一定", "一般", "一起", "一边", "一方面"];
    var words = text.replace(/[^\u4e00-\u9fa5a-zA-Z0-9]/g, " ").split(/\s+/).filter(function(w) {
      return w.length >= 2 && stop.indexOf(w) === -1 && !/^\d+$/.test(w);
    });
    return words.slice(0, 3).join(" ") || text.slice(0, 10);
  }

  function generateTitles(content, currentTitle, count, platform) {
    var kw = extractKeywords(content || currentTitle);
    var titles = [];
    var seen = {};
    var formulas = TITLE_FORMULAS.slice();
    // 打乱顺序
    for (var i = formulas.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = formulas[i]; formulas[i] = formulas[j]; formulas[j] = tmp;
    }
    for (var k = 0; k < formulas.length && titles.length < count; k++) {
      var f = formulas[k];
      var t = f.tpl(currentTitle, kw);
      // 随机叠加一个「加辣」增强器（30% 概率跳过保持原味）
      var enh = TITLE_ENHANCERS[Math.floor(Math.random() * TITLE_ENHANCERS.length)];
      if (Math.random() < 0.7) t = enh(t);
      t = filterBanned(t);
      t = truncateFor(t, platform);
      if (!seen[t]) {
        seen[t] = true;
        titles.push({ text: t, formula: f.name });
      }
    }
    return titles;
  }

  function mountTitleGenerator() {
    var titleInput = document.getElementById("post-title");
    if (!titleInput || document.getElementById("ap-title-gen")) return;

    var wrap = document.createElement("div");
    wrap.id = "ap-title-gen";
    wrap.style.cssText = "margin:4px 0 12px;padding:10px 12px;background:#f8f9fa;border:1px solid #e2e4e7;border-radius:4px;font-size:13px";

    var btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = "🎯 爆款标题生成";
    btn.style.cssText = "padding:5px 12px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff;border:0;border-radius:3px;font-size:12px;cursor:pointer;margin-right:8px";

    var platSel = document.createElement("select");
    platSel.innerHTML = '<option value="通用">通用</option><option value="小红书">小红书 (≤20字)</option><option value="抖音">抖音 (≤30字)</option><option value="公众号">公众号 (≤30字)</option>';
    platSel.style.cssText = "padding:4px 6px;border:1px solid #c3c4c7;border-radius:3px;font-size:12px;margin-right:8px";

    var numSel = document.createElement("select");
    numSel.innerHTML = '<option value="5">5 个候选</option><option value="10">10 个候选</option>';
    numSel.style.cssText = "padding:4px 6px;border:1px solid #c3c4c7;border-radius:3px;font-size:12px;margin-right:8px";

    var resultDiv = document.createElement("div");
    resultDiv.style.cssText = "margin-top:10px;display:none";

    btn.addEventListener("click", function () {
      var ed = document.querySelector(".ap-wysiwyg-editor");
      var content = ed ? (ed.innerText || ed.textContent || "") : "";
      var current = titleInput.value || "";
      var count = parseInt(numSel.value, 10);
      var platform = platSel.value;

      if (!content && !current) {
        resultDiv.innerHTML = '<div style="color:#d63638;font-size:12px">请先输入标题或正文内容</div>';
        resultDiv.style.display = "block";
        return;
      }

      var titles = generateTitles(content, current, count, platform);
      var html = '<div style="font-size:12px;color:#50575e;margin-bottom:6px">点击任意标题填入：</div>';
      for (var i = 0; i < titles.length; i++) {
        html += '<div class="ap-title-item" data-t="' + titles[i].text.replace(/"/g, "&quot;") + '" style="padding:6px 8px;margin:4px 0;background:#fff;border:1px solid #dcdcde;border-radius:3px;cursor:pointer;font-size:13px;display:flex;justify-content:space-between;align-items:center">';
        html += '<span>' + titles[i].text + '</span>';
        html += '<span style="font-size:11px;color:#8c8f94;background:#f0f0f1;padding:1px 6px;border-radius:2px">' + titles[i].formula + '</span>';
        html += '</div>';
      }
      resultDiv.innerHTML = html;
      resultDiv.style.display = "block";

      resultDiv.querySelectorAll(".ap-title-item").forEach(function (item) {
        item.addEventListener("click", function () {
          titleInput.value = item.dataset.t;
          titleInput.dispatchEvent(new Event("input", { bubbles: true }));
          item.style.background = "#e7f5e9";
          setTimeout(function () { item.style.background = "#fff"; }, 500);
        });
        item.addEventListener("mouseenter", function () { item.style.borderColor = "#667eea"; });
        item.addEventListener("mouseleave", function () { item.style.borderColor = "#dcdcde"; });
      });
    });

    wrap.appendChild(btn);
    wrap.appendChild(platSel);
    wrap.appendChild(numSel);
    wrap.appendChild(resultDiv);

    titleInput.parentNode.insertBefore(wrap, titleInput.nextSibling);
  }

  // 标题生成器挂载（标题输入框在编辑器上方，需等待 DOM 就绪）
  var titleTimer = setInterval(function () {
    if (document.getElementById("post-title")) {
      mountTitleGenerator();
      clearInterval(titleTimer);
    }
  }, 500);
  setTimeout(function () { clearInterval(titleTimer); }, 15000);

  function tryMount() {
    var ed = editor();
    if (!ed || !ed.previousElementSibling) return false;
    if (document.getElementById("apwp-bar")) return true;
    var anchor = ed.previousElementSibling; // 核心工具条（无稳定 class，按 DOM 位置锚定）
    var bar = buildBar(ed);
    anchor.parentNode.insertBefore(bar, ed);
    ed.addEventListener("input", function () { updateCount(ed); });
    ed.addEventListener("keyup", function () { saveSelection(ed); });
    ed.addEventListener("mouseup", function () { saveSelection(ed); });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && document.getElementById("apwp-bar") && bar.classList.contains("apwp-fs")) {
        bar.classList.remove("apwp-fs");
        ed.classList.remove("apwp-fs");
        if (backdrop) { backdrop.parentNode.removeChild(backdrop); backdrop = null; }
      }
    });
    return true;
  }

  var styleEl = document.createElement("style");
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  var tries = 0;
  var timer = setInterval(function () {
    if (tryMount() || ++tries > 30) clearInterval(timer);
  }, 600);
})();
