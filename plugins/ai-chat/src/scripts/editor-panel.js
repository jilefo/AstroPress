/**
 * AI 助手编辑器侧边面板 — 注入于 /admin/posts/* 编辑页。
 * 固定在右侧的可折叠抽屉（360px，折叠时仅显示悬浮「AI」按钮），
 * 调用 /admin-ext/api/ai-chat/* 既有接口与网页版 AI 对话，
 * 支持把 AI 回复插入 .ap-wysiwyg-editor（contentEditable）。
 * 所有样式类名以 .apai- 前缀隔离，避免污染主题。
 */
(function () {
  "use strict";
  if (window.__apAiEditorPanel) return;
  window.__apAiEditorPanel = true;

  var STATUS_URL = "/admin-ext/api/ai-chat/status";
  var SEND_URL = "/admin-ext/api/ai-chat/send";
  var LOGIN_URL = "/admin-ext/ai-chat";

  // ── 样式（全部以 #apaiPanel / #apaiFab + .apai- 前缀隔离）─────────
  var STYLE =
    "#apaiFab{position:fixed;right:18px;top:40%;z-index:99980;width:46px;height:46px;border-radius:50%;background:#0f6bdf;color:#fff;border:0;font-size:15px;font-weight:700;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.25)}" +
    "#apaiFab:hover{background:#0a54ad}" +
    "#apaiPanel{position:fixed;top:0;right:0;bottom:0;width:360px;max-width:94vw;z-index:99981;background:#fff;border-left:1px solid #dcdcde;box-shadow:-4px 0 18px rgba(0,0,0,.12);display:none;flex-direction:column;font:13px/1.6 -apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'PingFang SC','Microsoft YaHei',sans-serif;color:#1d2327}" +
    "#apaiPanel.apai-open{display:flex}" +
    "#apaiPanel .apai-head{display:flex;align-items:center;gap:8px;padding:10px 12px;border-bottom:1px solid #e2e4e7;background:#f6f7f7}" +
    "#apaiPanel .apai-title{font-weight:600;flex:0 0 auto}" +
    "#apaiPanel .apai-provider{flex:1;min-width:0;padding:4px 6px;border:1px solid #8c8f94;border-radius:3px;font-size:13px;background:#fff}" +
    "#apaiPanel .apai-x{flex:0 0 auto;border:0;background:none;font-size:16px;cursor:pointer;color:#787c82;padding:0 4px}" +
    "#apaiPanel .apai-status{padding:6px 12px;font-size:12px;color:#646970;border-bottom:1px solid #f0f0f1;min-height:18px}" +
    "#apaiPanel .apai-status a{color:#0f6bdf}" +
    "#apaiPanel .apai-msgs{flex:1;overflow-y:auto;padding:10px 12px;display:flex;flex-direction:column;gap:10px}" +
    "#apaiPanel .apai-msg{max-width:100%;word-break:break-word;white-space:pre-wrap}" +
    "#apaiPanel .apai-msg-body{padding:8px 10px;border-radius:6px}" +
    "#apaiPanel .apai-user .apai-msg-body{background:#0f6bdf;color:#fff}" +
    "#apaiPanel .apai-ai .apai-msg-body{background:#f0f0f1;color:#1d2327}" +
    "#apaiPanel .apai-err .apai-msg-body{background:#fcf0f1;color:#b32d2e}" +
    "#apaiPanel .apai-err a{color:#0f6bdf;word-break:break-all}" +
    "#apaiPanel .apai-ai .apai-msg-body a{color:#0f6bdf;word-break:break-all}" +
    "#apaiPanel .apai-img{max-width:100%;display:block;margin:6px 0;border-radius:4px;border:1px solid #e2e4e7}" +
    "#apaiPanel .apai-thinking .apai-msg-body{color:#787c82;font-style:italic}" +
    "#apaiPanel .apai-insert{margin-top:4px;background:#fff;color:#0f6bdf;border:1px solid #0f6bdf;border-radius:3px;padding:3px 10px;font-size:12px;cursor:pointer}" +
    "#apaiPanel .apai-insert:hover{background:#0f6bdf;color:#fff}" +
    "#apaiPanel .apai-foot{border-top:1px solid #e2e4e7;padding:10px 12px;display:flex;flex-direction:column;gap:8px}" +
    "#apaiPanel .apai-quick{align-self:flex-start;background:#f6f7f7;color:#1d2327;border:1px solid #c3c4c7;border-radius:3px;padding:4px 10px;font-size:12px;cursor:pointer}" +
    "#apaiPanel .apai-input{width:100%;box-sizing:border-box;resize:vertical;min-height:56px;padding:7px 9px;border:1px solid #8c8f94;border-radius:3px;font-size:13px;font-family:inherit}" +
    "#apaiPanel .apai-send{align-self:flex-end;background:#0f6bdf;color:#fff;border:0;border-radius:3px;padding:7px 20px;font-size:13px;cursor:pointer}" +
    "#apaiPanel .apai-send:disabled{opacity:.5;cursor:not-allowed}" +
    "#apaiPanel .apai-presets{display:flex;flex-wrap:wrap;gap:4px;padding:4px 0}" +
    "#apaiPanel .apai-preset{background:#f6f7f7;color:#1d2327;border:1px solid #c3c4c7;border-radius:3px;padding:3px 8px;font-size:11px;cursor:pointer;white-space:nowrap}" +
    "#apaiPanel .apai-preset:hover{background:#0f6bdf;color:#fff;border-color:#0f6bdf}" +
    "#apaiPanel .apai-preset-select{width:100%;padding:5px 8px;border:1px solid #c3c4c7;border-radius:3px;font-size:12px;background:#fff;margin-bottom:4px}" +
    "#apaiPanel .apai-code{background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:10px 12px;margin:8px 0;overflow-x:auto;font:12px/1.5 'Cascadia Code','JetBrains Mono',Consolas,monospace;color:#1d2327}" +
    "#apaiPanel .apai-msg pre{margin:8px 0;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:10px 12px;overflow-x:auto}" +
    "#apaiPanel .apai-msg code{font:12px/1.5 'Cascadia Code','JetBrains Mono',Consolas,monospace;color:#1d2327}" +
    "#apaiPanel .apai-msg pre code{background:none;border:none;padding:0}" +
    "#apaiPanel .apai-msg strong{font-weight:600}" +
    "#apaiPanel .apai-msg em{font-style:italic}" +
    "#apaiPanel .apai-msg blockquote{border-left:3px solid #d0d7de;margin:8px 0;padding:4px 12px;color:#57606a}" +
    "#apaiPanel .apai-msg ul,#apaiPanel .apai-msg ol{margin:8px 0;padding-left:20px}" +
    "#apaiPanel .apai-msg li{margin:2px 0}";

  // ── 面板骨架（固定结构，无动态数据拼接）──────────────────────────
  var PROMPT_PRESETS = [
    { label: "📝 深度长文", prompt: "你是资深内容创作者，请围绕当前主题撰写一篇 5000 字深度长文。要求：1. 一级标题吸睛 2. 至少 6 个小节标题，层层递进 3. 每个小节含案例或数据支撑 4. 配图建议（每节至少 1 张）5. 结尾升华主题。输出完整 Markdown 格式，风格专业有深度。" },
    { label: "📰 公众号爆款", prompt: "你是公众号写作大师，请生成一篇爆款文章。要求：1. 标题制造悬念或情绪共鸣 2. 开头 3 秒抓人（提问/冲突/反常识）3. 正文节奏明快，每段不超过 4 行 4. 金句频出，适合截图传播 5. 结尾引导互动（点赞/在看/留言）。输出完整 Markdown 格式，5000 字以上。" },
    { label: "🔍 SEO 优化文", prompt: "你是 SEO 内容专家，请生成一篇 SEO 优化文章。要求：1. 标题含核心关键词 2. 正文关键词密度 2-3% 3. 结构符合 H1>H2>H3 层级 4. 含 FAQ 问答小节（3-5 个常见问题）5. 内链建议（相关文章推荐）。输出完整 Markdown 格式。" },
    { label: "✨ 去 AI 味润色", prompt: "你是资深文字润色专家，请对当前内容进行深度去 AI 味改写。严格执行以下禁令清单：\n【禁用词】此外/然而/因此/总而言之/事实上/值得注意/换句话说/拆一拆/盘一盘/划重点/敲黑板/说白了/本质上/拆解/梳理/剖析/解构/赋能/助力/闭环/抓手/落地/引爆/重塑/至关重要/不可或缺/深远影响/标志着/彰显了/行业报告显示/专家认为/研究表明/未来可期/前景广阔/综上所述。\n【句式禁令】禁「不是A而是B」「不在于A而在于B」「看似…实则…」二分壳；禁三项式排比（改两项或四项）；「一旦…就/只有…才/无论…都/随着…的发展」全文最多用1次；默认不用「你」。\n【标点禁令】揭晓式破折号一律删（「答案很简单——专注」改「答案是专注」）；「核心是：」等提示语冒号删提示语直写内容；英文双引号改「」。\n【替换手法】然而→可/但/其实；因此→所以/就；紧张→手在抖等具象化；「提升效率」→快了多少、省了几个人；长短句交错制造呼吸感；句首允许口语化承接。\n保留全部事实与数据，输出完整 Markdown 格式。" },
    { label: "🔥 小红书种草", prompt: "你是小红书爆款博主，请生成一篇种草笔记。要求：1. 标题 ≤20 字，带 emoji，用「数字+痛点」或「身份+结果」结构 2. 正文口语化、多换行、每段 1-2 句 3. 善用「姐妹们」「谁懂啊」「真的绝了」等社区语气 4. 结尾 3-5 个相关话题标签 5. 适度 emoji 但不堆砌。输出完整 Markdown 格式。" },
    { label: "🎵 抖音口播稿", prompt: "你是抖音短视频编导，请生成一篇口播文案。要求：1. 标题 ≤30 字，前 3 秒必须有钩子（提问/反常识/利益承诺）2. 全文口语化，适合朗读，段落即气口 3. 结构：钩子→痛点放大→解决方案→行动指令 4. 标注节奏提示（停顿/重读/手势）。输出完整 Markdown 格式。" },
    { label: "📰 头条深度文", prompt: "你是今日头条签约作者，请生成一篇深度图文。要求：1. 标题 ≤30 字，信息增量明确 2. 开头交代新闻由头或数据 3. 正文用小标题切割，每节一个观点 4. 引用具体案例/数据增强可信度 5. 结尾留讨论话题引导评论。输出完整 Markdown 格式。" },
    { label: "📖 教程指南", prompt: "你是技术文档工程师，请撰写一篇实操教程。要求：1. 问题场景描述 2. 前置准备清单 3. 分步骤详细操作（含代码/命令示例）4. 常见问题排查 5. 进阶优化建议。输出完整 Markdown 格式，适合新手跟随操作。" },
    { label: "📊 测评对比", prompt: "你是产品测评师，请撰写一篇横向测评文章。要求：1. 测评对象介绍 2. 多维度对比（功能/价格/易用性/生态）3. 实测数据或体验 4. 优缺点总结 5. 适用人群推荐。输出完整 Markdown 格式，含对比表格。" },
    { label: "🎯 观点评论", prompt: "你是行业观察员，请就当前热点撰写一篇观点评论。要求：1. 事件背景简述 2. 多方观点呈现 3. 你的独到分析 4. 趋势预判 5. 引发读者思考。输出完整 Markdown 格式，风格犀利有态度。" },
    { label: "📋 清单盘点", prompt: "你是内容编辑，请生成一篇清单盘点文章。要求：1. 吸引人的标题（数字+关键词）2. 前言说明盘点标准 3. 每个条目：名称+简介+亮点+适用场景 4. 总结推荐。输出完整 Markdown 格式，条目不少于 8 个。" },
    { label: "🔧 问题解答", prompt: "你是领域专家，请针对当前问题撰写一篇解答文。要求：1. 问题现象描述 2. 可能原因分析 3. 解决方案步骤 4. 预防措施建议 5. 相关资源推荐。输出完整 Markdown 格式，逻辑清晰可操作。" },
    { label: "📈 趋势分析", prompt: "你是行业分析师，请撰写一篇趋势分析文章。要求：1. 行业现状概述 2. 关键数据支撑 3. 驱动因素分析 4. 未来趋势预判 5. 对个人/企业的建议。输出完整 Markdown 格式，数据详实有说服力。" },
  ];

  var PANEL_HTML =
    '<div class="apai-head">' +
      '<span class="apai-title">AI 助手</span>' +
      '<select class="apai-provider" id="apaiProvider"></select>' +
      '<button type="button" class="apai-x" id="apaiCollapse" title="收起" aria-label="收起">»</button>' +
    "</div>" +
    '<div class="apai-status" id="apaiStatus"></div>' +
    '<div class="apai-msgs" id="apaiMsgs"></div>' +
    '<div class="apai-foot">' +
      '<div class="apai-presets" id="apaiPresets">' +
        '<select class="apai-preset-select" id="apaiPresetSelect">' +
          '<option value="">选择写作模板…</option>' +
          PROMPT_PRESETS.map(function (p, i) {
            return '<option value="' + i + '" title="' + p.prompt.slice(0, 80) + '…">' + p.label + "</option>";
          }).join("") +
        "</select>" +
      "</div>" +
      '<button type="button" class="apai-quick" id="apaiSummary">总结当前文章</button>' +
      '<textarea class="apai-input" id="apaiInput" rows="3" placeholder="向 AI 提问，Enter 发送，Shift+Enter 换行"></textarea>' +
      '<button type="button" class="apai-send" id="apaiSend">发送</button>' +
    "</div>";

  var fab = null;
  var panel = null;
  var providerSel = null;
  var statusEl = null;
  var msgsEl = null;
  var inputEl = null;
  var sendBtn = null;
  var sending = false;
  var statusLoaded = false;
  var loginMap = {};

  function editor() {
    return document.querySelector(".ap-wysiwyg-editor");
  }

  function syncEditor(ed) {
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ── AI 写作助手规则 ──────────────────────────────────────────────
  // a. 新文章：提问即生成图文 Markdown 文章
  // b. 已有文章：基于现有内容扩充/优化
  // c. 内容为空或少于 50 字视为新内容，否则在已有内容上加工
  // d. 无论 AI 返回什么，一律归一化为 Markdown

  var NEW_CONTENT_MIN = 50;
  var MAX_CONTEXT = 8000;

  function getEditorText() {
    var ed = editor();
    if (!ed) return "";
    return String(ed.innerText || ed.textContent || "").trim();
  }

  function buildPrompt(userText) {
    var t = String(userText || "").trim();
    if (!t) return "";
    var content = getEditorText();
    var outputRule =
      "\n\n【输出要求·必须全部遵守】\n" +
      "1. 使用 Markdown 格式输出一篇完整、可直接发布的文章；\n" +
      "2. 结构完整：一个一级标题 + 至少 5 个二级/三级小节标题 + 正文段落 + 要点列表 + 结语；\n" +
      "3. 图文并茂：在合适的小节插入 Markdown 图片（![图片描述](https://… 的公网图片直链)），图片仅作配图，任何情况下都不允许用图片或链接代替正文；\n" +
      "4. 严禁只回复一个图片链接、网址或一句解释——那将被视为失败回复；如果无法提供配图，就输出纯文字文章，同样必须完整；\n" +
      "5. 除文章本身外不要输出任何解释性文字、开场白或结束语说明。";
    if (!content || content.length < NEW_CONTENT_MIN) {
      // 情形一：新内容（为空 / 少于 50 字）→ 直接按提问生成
      return t + outputRule;
    }
    // 情形二：已有内容 → 附带原文，在原文基础上扩充优化
    return (
      "【已有文章内容】\n<<<ARTICLE\n" +
      content.slice(0, MAX_CONTEXT) +
      "\nARTICLE>>>\n\n【任务】" +
      t +
      "\n【要求】请基于上面的已有文章内容进行扩充和优化，务必紧扣原有主题、保留并润色原有要点，不要丢弃原文中的关键信息。" +
      outputRule
    );
  }

  /**
   * 劣质回复检测：AI 网页版偶发只返回一个图片链接/网址或极短文本。
   * 对「生成整篇文章」类请求（含纠正重试轮），这类回复视为失败。
   */
  function looksDegenerate(text) {
    var s = String(text == null ? "" : text).trim();
    if (!s) return true;
    // 剥离 markdown 图片与裸 URL 后剩余的"正文"字符
    var stripped = s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/https?:\/\/\S+/g, "")
      .replace(/[\s#!\[\]()「」【】.,，。：:；;_''"'"’“—-]/g, "");
    // 1) 纯链接/图片（正文剩不足 20 字符）
    if (/https?:\/\//.test(s) && stripped.length < 20) return true;
    // 2) 过短且没有段落/标题结构（正文型回复至少要有换行分段或 300 字）
    if (s.length < 300 && s.indexOf("\n") === -1) return true;
    // 3) URL 密度过高（正文被链接淹没，如图片链接列表）
    var urls = s.match(/https?:\/\/\S+/g) || [];
    var total = s.replace(/\s/g, "").length || 1;
    if (urls.length && urls.join(" ").length / total > 0.3) return true;
    // 4) 剥离链接后几乎没有正文（覆盖「一个标题 + 一张图」等形态）
    if (stripped.length < 80) return true;
    return false;
  }

  /** 从用户提问中提取文章主题（去掉指令修饰词），用于兜底骨架标题 */
  function topicFromPrompt(t) {
    var s = String(t || "").split(/\n/)[0] || "";
    s = s
      .replace(/^(请|麻烦)*(帮我)*(给我)*(写|生成|创作|扩充|优化|完善)(一篇|一个)?/g, "")
      .replace(/\d+\s*字(左右|以上)?/g, "")
      .replace(/(图文|markdown|md)(格式|模式)?/gi, "")
      .replace(/[「」『』"'"'"？?！!，,。]/g, "")
      .trim();
    return s.slice(0, 40) || "未命名文章";
  }

  /** 兜底：多次纠正失败时，把 AI 返回内容转换为合规 Markdown 图文骨架，绝不插入裸链接 */
  function buildFallbackMd(userText, md) {
    var topic = topicFromPrompt(userText);
    var imgs = [];
    var re = /!\[[^\]]*\]\((https?:\/\/[^)\s]+)\)/g, m;
    while ((m = re.exec(md))) imgs.push(m[1]);
    if (!imgs.length) {
      var bare = /https?:\/\/[^\s)]+\.(?:jpg|jpeg|png|webp|gif)(?:\?\S*)?/gi, b;
      while ((b = bare.exec(md))) imgs.push(b[0]);
    }
    if (!imgs.length) {
      // 无扩展名图片直链（如 unsplash photo id）：劣质回复本身就是链接形态时，取首个 URL 作配图
      var any = /https?:\/\/[^\s)"']+/i.exec(md);
      if (any) imgs.push(any[0]);
    }
    var out = "# " + topic + "\n\n";
    out += "> 说明：AI 平台多次未能输出完整正文（只返回了图片链接）。";
    out += "已把可用内容自动转换为 Markdown 图文格式，请重新发送提问或更换 AI 平台以生成完整文章。\n\n";
    if (imgs.length) {
      imgs.slice(0, 3).forEach(function (u) { out += "![配图](" + u + ")\n\n"; });
    }
    return out;
  }

  /** 递进式纠正指令：第 1 轮要求重写完整文章；第 2 轮禁止一切 URL、纯文字输出 */
  function correctiveFor(topicText, round) {
    if (round <= 0) {
      return (
        "你上一次的回复不是完整文章（只有图片/链接或过短），已被判定为失败。请重新输出一篇完整的 Markdown 文章，主题：" +
        topicText +
        "。硬性要求：一个一级标题 + 至少 5 个小节标题 + 正文段落 + 要点列表 + 结语，总字数不少于 1500 字；" +
        "可以在合适位置用 Markdown 图片语法配图，但绝不允许只回复链接或图片；除文章本身外不要输出任何解释。"
      );
    }
    return (
      "你连续两次都只回复了图片/链接，这是完全错误的。现在最后重试一次，主题：" +
      topicText +
      "。\n【绝对禁止】输出任何 URL、任何图片链接、任何 markdown 图片语法——出现任何链接即视为再次失败。\n" +
      "【唯一任务】直接输出纯文字的完整 Markdown 文章：一个一级标题 + 至少 5 个小节标题 + 正文段落 + 列表 + 结语，" +
      "总字数不少于 1500 字。不需要任何配图。不要任何解释。"
    );
  }

  /** 图片直链识别（含 unsplash/picsum 等带 query 的无扩展名图床） */
  function isImgUrl(u) {
    if (/\.(jpe?g|png|webp|gif|svg)(\?\S*)?$/i.test(u)) return true;
    return /(^|\.|\b)((images\.)?unsplash\.com|picsum\.photos|i\.imgur\.com|images\.pexels\.com|cdn\.jsdelivr\.net)\//i.test(u);
  }

  /**
   * 结构修复（规则 d 最后一环）：AI 网页版常返回丢失 Markdown 标记的"准文本"
   * （裸图片 URL、• 符号列表、中文序号标题）。统一规范化为 GFM：
   *  1) 单独成行的图片直链 → ![配图](url)
   *  2) •/·/▪ 列表符号 → - 列表
   *  3) 回复完全无 # 标记时：首行（≤60 字、非句子）提升为 #；「一、二、…」→ ##；「（一）…」→ ###
   */
  function normalizeMarkdown(md) {
    var src = String(md == null ? "" : md);
    if (!src.trim()) return src;
    var hasHead = /^#{1,6}\s/m.test(src);
    var lines = src.split(/\r?\n/);
    var out = [];
    for (var i = 0; i < lines.length; i++) {
      var raw = lines[i];
      var t = raw.trim();
      if (!t) { out.push(raw); continue; }
      // 1) 裸图片直链（单独成行）
      if (/^https?:\/\/\S+$/.test(t) && isImgUrl(t)) {
        out.push("![配图](" + t + ")");
        continue;
      }
      // 2) • 符号列表 → - 列表（已是 "- " 的不动）
      if (/^[•·▪●○*]\s+\S/.test(t) && !/^[-*]\s+/.test(t)) {
        out.push(raw.replace(/^(\s*)[•·▪●○]\s+/, "$1- "));
        continue;
      }
      // 2b) 符号独占一行（AI 网页版常见形态：• 与内容分行）→ 与下一个非空行合并
      if (/^[•·▪●○]$/.test(t)) {
        var j = i + 1;
        while (j < lines.length && !lines[j].trim()) j++;
        if (j < lines.length) {
          out.push("- " + lines[j].trim());
          i = j;
          continue;
        }
        out.push(raw);
        continue;
      }
      if (!hasHead) {
        // 3a) 首行非句子 → 一级标题
        if (out.length === 0 && t.length <= 60 && !/[。；;，,!！?？]$/.test(t) && !/^[•·▪●○*]|^https?:/.test(t)) {
          out.push("# " + t);
          continue;
        }
        // 3b) 「一、xxx」→ 二级标题
        if (/^[一二三四五六七八九十]+、\s*\S/.test(t) && t.length <= 60) {
          out.push("## " + t);
          continue;
        }
        // 3c) 「（一）xxx」→ 三级标题
        if (/^[（(][一二三四五六七八九十]+[)）]\s*\S/.test(t) && t.length <= 60) {
          out.push("### " + t);
          continue;
        }
      }
      out.push(raw);
    }
    return out.join("\n");
  }

  function decodeEntities(s) {
    return String(s)
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&");
  }

  /** HTML → Markdown 基础转换（AI 网页版可能返回 HTML） */
  function htmlToMd(html) {
    var h = String(html);
    h = h.replace(/<pre[^>]*>([\s\S]*?)<\/pre>/gi, function (_, c) {
      return "\n```\n" + decodeEntities(c.replace(/<[^>]+>/g, "")) + "\n```\n";
    });
    h = h.replace(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi, function (_, lv, c) {
      var hashes = "";
      for (var i = 0; i < +lv; i++) hashes += "#";
      return "\n" + hashes + " " + decodeEntities(c.replace(/<[^>]+>/g, "")).trim() + "\n\n";
    });
    h = h.replace(/<img[^>]*>/gi, function (tag) {
      var src = /\ssrc=["']([^"']+)["']/i.exec(tag);
      var alt = /\salt=["']([^"']*)["']/i.exec(tag);
      return "![" + (alt ? decodeEntities(alt[1]) : "image") + "](" + (src ? src[1] : "") + ")";
    });
    h = h.replace(/<a[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, function (_, href, c) {
      return "[" + decodeEntities(c.replace(/<[^>]+>/g, "")).trim() + "](" + href + ")";
    });
    h = h.replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, "**$2**");
    h = h.replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, "*$2*");
    h = h.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
    h = h.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, "> $1\n");
    h = h.replace(/<br\s*\/?>/gi, "\n");
    h = h.replace(/<\/(p|div)>/gi, "\n\n");
    h = h.replace(/<[^>]+>/g, "");
    return decodeEntities(h).replace(/\n{3,}/g, "\n\n").trim();
  }

  /** 规则 d：AI 回复一律归一化为 Markdown */
  function toMarkdown(text) {
    var s = String(text == null ? "" : text).replace(/\r\n/g, "\n").trim();
    // 整体被 ```markdown 围栏包裹时解包
    var fence = s.match(/^```(?:markdown|md)?\s*\n([\s\S]*?)\n?```$/i);
    if (fence) s = fence[1].trim();
    // 含 HTML 标签时转换为 Markdown
    if (/<(?:p|div|h[1-6]|ul|ol|li|img|a|strong|b|em|i|br|blockquote|pre)\b/i.test(s)) {
      s = htmlToMd(s);
    }
    return s;
  }

  /** HTML 转义（AI 回复只允许转义后进入编辑器/页面） */
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  /** markdown 图片/链接 + 裸 URL（仅放行 http/https） */
  var RE_RICH = /(!?)\[([^\]\n]*)\]\((https?:\/\/[^\s)]+)\)|(https?:\/\/[^\s<>()"']+)/g;
  var RE_IMG_EXT = /\.(png|jpe?g|gif|webp|svg|avif|bmp)(\?[^\s]*)?$/i;
  var RE_TAIL_PUNCT = /[.,;:!?)\]}>'"。，；：！？）》】」]+$/g;

  /** 裸 URL 尾部误捕获的中英文标点剥离 */
  function stripTail(u) {
    RE_TAIL_PUNCT.lastIndex = 0;
    return u.replace(RE_TAIL_PUNCT, "");
  }

  /**
   * 把 AI 回复渲染进容器：默认纯文本节点；
   * markdown 图片/链接与裸图片 URL 转真实 <img>/<a> 元素（DOM 构建，无注入面）。
   */
  function renderRich(container, text) {
    var last = 0;
    var m;
    RE_RICH.lastIndex = 0;
    while ((m = RE_RICH.exec(text))) {
      if (m.index > last) container.appendChild(document.createTextNode(text.slice(last, m.index)));
      var isMd = !!m[3];
      var url = isMd ? m[3] : stripTail(m[4]);
      var isImg = isMd ? m[1] === "!" : RE_IMG_EXT.test(url);
      if (isImg) {
        var img = document.createElement("img");
        img.src = url;
        img.alt = isMd && m[2] ? m[2] : "image";
        img.className = "apai-img";
        img.loading = "lazy";
        container.appendChild(img);
      } else {
        var a = document.createElement("a");
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        a.textContent = isMd ? m[2] || url : url;
        container.appendChild(a);
      }
      if (!isMd && url.length < m[4].length) {
        container.appendChild(document.createTextNode(m[4].slice(url.length)));
      }
      last = RE_RICH.lastIndex;
    }
    if (last < text.length) container.appendChild(document.createTextNode(text.slice(last)));
  }

  /**
   * AI 回复 markdown → 编辑器 HTML：
   * 先按行解析代码块/标题/引用/列表等结构，再对内联元素（粗体/斜体/图片/链接）处理。
   * 代码块语法（```...```）转 <pre><code>，标题转 <h1>-<h6>，引用转 <blockquote>。
   */
  function mdToHtml(text) {
    var lines = String(text).split(/\r?\n/);
    var out = "";
    var inCode = false;
    var codeLang = "";
    var codeBuf = "";
    var i;

    function inline(s) {
      var last = 0;
      var m;
      var html = "";
      RE_RICH.lastIndex = 0;
      while ((m = RE_RICH.exec(s))) {
        if (m.index > last) html += esc(s.slice(last, m.index));
        var isMd = !!m[3];
        var url = isMd ? m[3] : stripTail(m[4]);
        var isImg = isMd ? m[1] === "!" : RE_IMG_EXT.test(url);
        if (isImg) {
          html += '<img src="' + esc(url) + '" alt="' + esc(isMd && m[2] ? m[2] : "image") + '">';
        } else {
          html += '<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">' +
            esc(isMd ? m[2] || url : url) + "</a>";
        }
        if (!isMd && url.length < m[4].length) {
          html += esc(m[4].slice(url.length));
        }
        last = RE_RICH.lastIndex;
      }
      if (last < s.length) html += esc(s.slice(last));
      // 粗体 **text** / __text__
      html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
      html = html.replace(/__(.+?)__/g, "<strong>$1</strong>");
      // 斜体 *text* / _text_（避免在代码块/粗体内误匹配）
      html = html.replace(/(?<![<>\w*])\*([^*<>\n]+)\*(?!\*)/g, "<em>$1</em>");
      return html;
    }

    function closeCode() {
      if (inCode) {
        out += "<pre><code" + (codeLang ? ' class="language-' + esc(codeLang) + '"' : "") + ">" +
          esc(codeBuf.replace(/\n$/, "")) + "</code></pre>\n";
        inCode = false;
        codeLang = "";
        codeBuf = "";
      }
    }

    for (i = 0; i < lines.length; i++) {
      var line = lines[i];
      var t = line.trim();

      // 代码块围栏
      var fenceM = t.match(/^```(\w*)/);
      if (fenceM) {
        if (inCode) {
          closeCode();
        } else {
          inCode = true;
          codeLang = fenceM[1] || "";
        }
        continue;
      }
      if (inCode) {
        codeBuf += line + "\n";
        continue;
      }

      if (!t) {
        out += "\n";
        continue;
      }

      // 标题
      var hM = t.match(/^(#{1,6})\s+(.+)/);
      if (hM) {
        out += "<h" + hM[1].length + ">" + inline(hM[2].trim()) + "</h" + hM[1].length + ">\n";
        continue;
      }

      // 引用
      if (/^>\s?/.test(t)) {
        var quoteBuf = [];
        while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
          quoteBuf.push(lines[i].trim().replace(/^>\s?/, ""));
          i++;
        }
        i--;
        out += "<blockquote>" + inline(quoteBuf.join("\n")) + "</blockquote>\n";
        continue;
      }

      // 无序列表（收集连续行）
      if (/^[-*•·▪●○]\s+/.test(t) || /^[-*•·▪●○]$/.test(t)) {
        var listBuf = [];
        while (i < lines.length) {
          var lt = lines[i].trim();
          if (/^[-*•·▪●○]\s+/.test(lt)) { listBuf.push(lt.replace(/^[-*•·▪●○]\s+/, "")); i++; }
          else if (/^[-*•·▪●○]$/.test(lt)) { i++; } // 跳过独行符号
          else break;
        }
        i--;
        if (listBuf.length) {
          out += "<ul>";
          for (var j = 0; j < listBuf.length; j++) out += "<li>" + inline(listBuf[j]) + "</li>";
          out += "</ul>\n";
        }
        continue;
      }

      // 有序列表
      if (/^\d+[.、)]\s+/.test(t)) {
        var olistBuf = [];
        while (i < lines.length && /^\d+[.、)]\s+/.test(lines[i].trim())) {
          olistBuf.push(lines[i].trim().replace(/^\d+[.、)]\s+/, ""));
          i++;
        }
        i--;
        if (olistBuf.length) {
          out += "<ol>";
          for (var k = 0; k < olistBuf.length; k++) out += "<li>" + inline(olistBuf[k]) + "</li>";
          out += "</ol>\n";
        }
        continue;
      }

      // 水平线
      if (/^(-{3,}|_{3,}|\*{3,})$/.test(t)) {
        out += "<hr>\n";
        continue;
      }

      // 普通段落
      out += "<p>" + inline(line) + "</p>\n";
    }
    closeCode();
    return out;
  }

  function ensureStyle() {
    if (document.getElementById("apai-style")) return;
    var st = document.createElement("style");
    st.id = "apai-style";
    st.textContent = STYLE;
    document.head.appendChild(st);
  }

  function setStatus(text) {
    statusEl.textContent = text || "";
  }

  function scrollBottom() {
    msgsEl.scrollTop = msgsEl.scrollHeight;
  }

  function addMsg(role, text) {
    var wrap = document.createElement("div");
    wrap.className = "apai-msg apai-" + role;
    var body = document.createElement("div");
    body.className = "apai-msg-body";
    if (role === "ai") {
      renderRich(body, text);
    } else {
      body.textContent = text;
    }
    wrap.appendChild(body);
    if (role === "ai") {
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "apai-insert";
      btn.textContent = "插入到编辑器";
      btn.addEventListener("click", function () {
        insertToEditor(text);
      });
      wrap.appendChild(btn);
    }
    msgsEl.appendChild(wrap);
    scrollBottom();
    return wrap;
  }

  function addLoginHint() {
    var wrap = document.createElement("div");
    wrap.className = "apai-msg apai-err";
    var body = document.createElement("div");
    body.className = "apai-msg-body";
    var span = document.createElement("span");
    span.textContent = "当前 AI 会话未登录，请先到「插件 → AI 助手」完成登录：";
    var a = document.createElement("a");
    a.href = LOGIN_URL;
    a.textContent = LOGIN_URL;
    body.appendChild(span);
    body.appendChild(a);
    wrap.appendChild(body);
    msgsEl.appendChild(wrap);
    scrollBottom();
  }

  /** 把回复文本插入编辑器光标处（markdown 图片/链接转真实标签，其余转义） */
  function insertToEditor(text) {
    var ed = editor();
    if (!ed) {
      setStatus("未找到编辑器，无法插入");
      return;
    }
    var html = mdToHtml(text);
    ed.focus();
    var ok = false;
    try {
      ok = document.execCommand("insertHTML", false, html);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      // 兜底：Range API 插入到当前选区或文末
      var sel = window.getSelection();
      var range = null;
      if (sel && sel.rangeCount && ed.contains(sel.anchorNode)) {
        range = sel.getRangeAt(0);
      } else {
        range = document.createRange();
        range.selectNodeContents(ed);
        range.collapse(false);
      }
      range.deleteContents();
      range.insertNode(range.createContextualFragment(html));
    }
    syncEditor(ed);
    setStatus("已插入到编辑器");
  }

  function refreshProviderStatus() {
    var id = providerSel.value;
    if (!id) {
      setStatus("无可用 provider");
      return;
    }
    if (loginMap[id]) {
      setStatus("会话已登录");
    } else {
      statusEl.textContent = "";
      var span = document.createElement("span");
      span.textContent = "会话未登录（如发送失败请到 ";
      var a = document.createElement("a");
      a.href = LOGIN_URL;
      a.textContent = "AI 助手";
      var tail = document.createElement("span");
      tail.textContent = " 登录）";
      statusEl.appendChild(span);
      statusEl.appendChild(a);
      statusEl.appendChild(tail);
    }
  }

  function loadStatus() {
    fetch(STATUS_URL)
      .then(function (r) {
        return r.json().catch(function () {
          return null;
        });
      })
      .then(function (data) {
        if (!data || !data.providers) {
          setStatus((data && data.error) || "状态加载失败");
          return;
        }
        loginMap = {};
        (data.sessions || []).forEach(function (s) {
          if (s && s.loggedIn) loginMap[s.provider] = true;
        });
        providerSel.innerHTML = "";
        data.providers.forEach(function (pv) {
          var o = document.createElement("option");
          o.value = pv.id;
          o.textContent = pv.name + (loginMap[pv.id] ? "（已登录）" : "");
          providerSel.appendChild(o);
        });
        refreshProviderStatus();
      })
      .catch(function () {
        setStatus("状态加载失败：网络错误");
      });
  }

  function send(prompt, opts) {
    if (sending) return;
    var provider = providerSel.value;
    if (!provider) {
      setStatus("无可用 provider");
      return;
    }
    var text = String(prompt || "").trim();
    if (!text) return;
    // raw 模式（如「总结当前文章」）直接发送原提问；否则按写作助手规则组装上下文
    var outgoing = opts && opts.raw ? text : buildPrompt(text);

    sending = true;
    sendBtn.disabled = true;
    addMsg("user", text);
    var thinking = addMsg("ai", "AI 正在思考…");
    thinking.classList.add("apai-thinking");
    var ins = thinking.querySelector(".apai-insert");
    if (ins) ins.remove();

    fetch(SEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: provider, prompt: outgoing }),
    })
      .then(function (r) {
        return r.json().catch(function () {
          return { error: "请求失败（HTTP " + r.status + "）" };
        });
      })
      .then(function (data) {
        thinking.remove();
        if (data && data.ok && data.reply) {
          var md = normalizeMarkdown(toMarkdown(data.reply)); // 规则 d：一律转 Markdown（含结构修复）
          // 劣质检测：生成类原始轮（非 raw）与纠正重试轮（opts.retry）都要检测；
          // 普通 raw 请求（如摘要）不检测。
          var checked = !opts || !opts.raw || opts.retry;
          if (checked && looksDegenerate(md)) {
            var round = (opts && opts.retry) || 0;
            if (round < 2) {
              addMsg("err", "检测到 AI 返回图片链接/过短内容，已自动纠正（第 " + (round + 1) + " 次）…");
              setTimeout(function () {
                send(correctiveFor(text, round), { raw: true, retry: round + 1 });
              }, 150);
              return;
            }
            // 两轮纠正仍失败 → 兜底转换为合规 Markdown 图文骨架，绝不插入裸链接
            addMsg("err", "AI 连续 3 次未能输出完整文章，已转换为 Markdown 图文骨架。建议更换 AI 平台或重新发送。");
            addMsg("ai", buildFallbackMd(text, md));
            setStatus("");
            return;
          }
          addMsg("ai", md);
          setStatus("");
        } else {
          var err = (data && data.error) || "请求失败";
          if (err.indexOf("未登录") !== -1 || err.indexOf("Unauthorized") !== -1) {
            addLoginHint();
          } else {
            addMsg("err", err);
          }
        }
      })
      .catch(function () {
        thinking.remove();
        addMsg("err", "网络错误，发送中断");
      })
      .then(function () {
        sending = false;
        sendBtn.disabled = false;
      });
  }

  function summarize() {
    var ed = editor();
    if (!ed) {
      setStatus("未找到编辑器");
      return;
    }
    var text = String(ed.innerText || ed.textContent || "").slice(0, 2000).trim();
    if (!text) {
      setStatus("编辑器内容为空，无法总结");
      return;
    }
    send("请为以下内容生成摘要：\n\n" + text, { raw: true });
  }

  function openPanel() {
    panel.classList.add("apai-open");
    fab.style.display = "none";
    if (!statusLoaded) {
      statusLoaded = true;
      loadStatus();
    }
  }

  function closePanel() {
    panel.classList.remove("apai-open");
    fab.style.display = "";
  }

  function ensureDom() {
    if (panel) return;
    ensureStyle();

    fab = document.createElement("button");
    fab.type = "button";
    fab.id = "apaiFab";
    fab.textContent = "AI";
    fab.title = "AI 助手";
    fab.addEventListener("click", openPanel);
    document.body.appendChild(fab);

    panel = document.createElement("aside");
    panel.id = "apaiPanel";
    panel.innerHTML = PANEL_HTML; // ap-audit-ok: 固定面板骨架，无任何动态数据
    document.body.appendChild(panel);

    providerSel = panel.querySelector("#apaiProvider");
    statusEl = panel.querySelector("#apaiStatus");
    msgsEl = panel.querySelector("#apaiMsgs");
    inputEl = panel.querySelector("#apaiInput");
    sendBtn = panel.querySelector("#apaiSend");

    panel.querySelector("#apaiCollapse").addEventListener("click", closePanel);
    panel.querySelector("#apaiSummary").addEventListener("click", summarize);
    providerSel.addEventListener("change", refreshProviderStatus);
    sendBtn.addEventListener("click", function () {
      send(inputEl.value);
      inputEl.value = "";
    });
    // 内置提示词模板：下拉选择后自动填充并发送
    var presetSelect = panel.querySelector("#apaiPresetSelect");
    presetSelect.addEventListener("change", function () {
      var idx = parseInt(presetSelect.value, 10);
      if (isNaN(idx) || idx < 0 || idx >= PROMPT_PRESETS.length) return;
      var preset = PROMPT_PRESETS[idx];
      inputEl.value = preset.prompt;
      inputEl.focus();
      // 自动发送
      send(preset.prompt);
      // 重置下拉框，方便再次选择
      presetSelect.value = "";
    });

    inputEl.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        send(inputEl.value);
        inputEl.value = "";
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ensureDom);
  } else {
    ensureDom();
  }

  // 自动化测试钩子：仅暴露纯函数，供测试脚本验证写作助手规则
  window.__apAiTest = {
    buildPrompt: buildPrompt,
    toMarkdown: toMarkdown,
    getEditorText: getEditorText,
    looksDegenerate: looksDegenerate,
    NEW_CONTENT_MIN: NEW_CONTENT_MIN,
  };
})();
