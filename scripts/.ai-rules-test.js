(function () {
  var T = window.__apAiTest;
  var ed = document.querySelector(".ap-wysiwyg-editor");
  var out = {};
  // 规则 a：新文章（空内容）→ 直接按提问生成
  ed.textContent = "";
  var p1 = T.buildPrompt("请帮我生成一篇3000字的关于Linux运维与AI结合，是降低运维门槛还是多此一举？");
  out.ruleA_emptyIsNew =
    p1.indexOf("【已有文章内容】") === -1 &&
    p1.indexOf("Markdown") !== -1 &&
    p1.indexOf("3000字") !== -1 &&
    p1.indexOf("图文并茂") !== -1;
  // 规则 c1：内容少于 50 字 → 视为新内容
  ed.textContent = "短内容测试，不足五十字。短内容测试，不足五十字。短内容测试，不足五十字。";
  out.ruleC_len = T.getEditorText().length;
  var p2 = T.buildPrompt("扩充");
  out.ruleC_below50_isNew = p2.indexOf("【已有文章内容】") === -1;
  // 规则 c2：内容 ≥ 50 字 → 在已有内容上加工
  ed.textContent =
    "这是一篇已有的关于容器编排与自动化运维的技术文章，包含多个实践要点，" +
    "例如 Kubernetes 集群的滚动更新、监控告警体系的搭建以及故障自愈脚本的编写经验。";
  out.ruleC2_len = T.getEditorText().length;
  var p3 = T.buildPrompt("请根据我提供的内容进行扩充和优化至5000字，有图排版精美，务必紧扣主题");
  out.ruleC2_hasExistingBlock =
    p3.indexOf("【已有文章内容】") !== -1 && p3.indexOf("<<<ARTICLE") !== -1;
  // 规则 b：已有内容被完整附带 + 任务指令
  out.ruleB_includesContent =
    p3.indexOf("容器编排") !== -1 &&
    p3.indexOf("滚动更新") !== -1 &&
    p3.indexOf("【任务】") !== -1 &&
    p3.indexOf("扩充和优化") !== -1;
  // 规则 d：HTML → Markdown
  out.ruleD_htmlToMd = T.toMarkdown(
    '<h2>标题</h2><p>第一段</p><img src="https://img.example.com/a.png" alt="示意图">'
  );
  // 规则 d：围栏解包
  out.ruleD_fenceUnwrap = T.toMarkdown("```markdown\n# 标题\n正文内容\n```");
  // 规则 d：纯 Markdown 原样保持
  out.ruleD_plainKept = T.toMarkdown("# 已是markdown\n\n正文保持不变");
  // 规则 d：HTML 实体解码
  out.ruleD_entity = T.toMarkdown("<h2>Linux &amp; AI</h2>");
  return JSON.stringify(out, null, 1);
})();
