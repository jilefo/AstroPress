/**
 * footer 白名单消毒器安全回归（F 轮 任务8 / F-T8-01）。
 * 运行: pnpm exec tsx scripts/verify-sanitize.ts
 */
import { sanitizeHtml, safeUrl } from "../plugins/footer/src/lib/sanitize-html";

let pass = 0;
let fail = 0;
const failures: string[] = [];

function must(cond: boolean, name: string, got: string) {
  if (cond) {
    pass++;
  } else {
    fail++;
    failures.push(`${name} => ${got}`);
  }
}

/** 断言输出中不得出现的危险特征 */
function clean(name: string, payload: string) {
  const out = sanitizeHtml(payload);
  const danger =
    /<script/i.test(out) ||
    /<iframe/i.test(out) ||
    /<svg/i.test(out) ||
    /\son\w+\s*=/i.test(out) ||
    /javascript:/i.test(out.replace(/&(#x?[0-9a-f]+|colon);/gi, "")) ||
    /vbscript:/i.test(out) ||
    /<(object|embed|link|meta|base|form|style)\b/i.test(out);
  must(!danger, name, out);
}

// 1) 旧用例（兼容原测试脚本断言）
let o = sanitizeHtml('<b>ok</b><script>alert(1)</script><img src=x onerror=alert(1)>');
must(o.includes("<b>ok</b>") && !o.includes("<script") && !o.includes("onerror"), "旧用例：剥 script/onerror 留 b", o);

// 2) 斜杠分隔的事件属性（旧正则可绕过）
clean("svg/onload 斜杠事件", "<svg/onload=alert(1)>x</svg>");
clean("b/onclick 斜杠事件", '<b/onclick=alert(1)>x</b>');
clean("无引号 onmouseover", "<img src=x onmouseover=alert(1)>");
clean("大写混合 ONERROR", '<img SRC=x OnErRoR="alert(1)">');
clean("换行/制表符混淆事件", '<img\nsrc=x\tonerror="alert(1)">');
clean("事件无等号值裸写", "<details open ontoggle=alert(1)>x</details>");

// 3) 伪协议
clean("a javascript:href", '<a href="javascript:alert(1)">x</a>');
clean("a javascript 大写+空白", '<a href="  jaVA\tscript:alert(1)">x</a>');
clean("a javascript 实体编码", '<a href="&#106;avascript:alert(1)">x</a>');
clean("a javascript 十六进制实体", '<a href="&#x6A;avascript:alert(1)">x</a>');
clean("a vbscript", '<a href="vbscript:msgbox(1)">x</a>');
clean("a data:text/html", '<a href="data:text/html,<script>alert(1)</script>">x</a>');
clean("iframe javascript src", "<iframe src=javascript:alert(1)></iframe>");

// 4) 危险标签连同内容
o = sanitizeHtml("<SCRIPT SRC=https://x/x.js></SCRIPT>");
must(!/script/i.test(o), "大写 SCRIPT 标签与内容全剥", o);
o = sanitizeHtml("<p>a</p><style>body{color:red}</style><p>b</p>");
must(o.includes("<p>a</p>") && o.includes("<p>b</p>") && !o.includes("color:red"), "style 标签内容丢弃，正文保留", o);
clean("noscript/template 容器", "<noscript><img src=x onerror=1></noscript><template><script>x</script></template>");
clean("未闭合 script 吞到结尾", "<p>keep</p><script>alert(1)");
clean("畸形注释", "<script>var x='<!--';</script>");

// 5) 白名单正常内容必须保留
o = sanitizeHtml('<a href="https://example.com/a?b=1" target="_blank">外链</a>');
must(o.includes('href="https://example.com/a?b=1"') && o.includes('rel="noopener noreferrer"'), "安全外链保留并补 rel", o);
o = sanitizeHtml('<img src="/media/a.png" alt="图" width="100">');
must(o.includes('src="/media/a.png"') && o.includes('alt="图"'), "站内图片保留", o);
o = sanitizeHtml('<img src="data:image/png;base64,AAAA" alt="x">');
must(o.includes("data:image/png;base64,AAAA"), "data:image 保留", o);
o = sanitizeHtml("<p>文本 a &lt; 3 &gt; 2</p><ul><li>x</li></ul>");
must(o.includes("<p>文本 a &lt; 3 &gt; 2</p>") && o.includes("<li>x</li>"), "实体文本与列表保留", o);
o = sanitizeHtml('<span class="hl" style="color:#333">x</span>');
must(o.includes('class="hl"') && o.includes('style="color:#333"'), "安全 class/style 保留", o);

// 6) style 危险值丢弃
o = sanitizeHtml('<div style="background:url(javascript:alert(1))">x</div>');
must(o.includes("<div>x</div>"), "style 中 javascript:url 整体丢弃", o);
o = sanitizeHtml('<div style="width:expression(alert(1))">x</div>');
must(!/expression/i.test(o), "style expression 丢弃", o);

// 7) 非标签的尖括号按文本处理
o = sanitizeHtml("if a < 3 and b > 2 then");
must(o.includes("a &lt; 3") && o.includes("b &gt; 2"), "比较运算符尖括号转义", o);

// 8) safeUrl 单元
must(safeUrl("https://a.co") === "https://a.co", "safeUrl https", "");
must(safeUrl("/blog/x#c") === "/blog/x#c", "safeUrl 相对+锚点", "");
must(safeUrl("javascript:alert(1)") === null, "safeUrl 拒 javascript", "");
must(safeUrl("&#106;avascript:x") === null, "safeUrl 拒实体混淆", "");
must(safeUrl("//evil.com/x") === null, "safeUrl 拒协议相对 URL", "");
must(safeUrl("data:image/png;base64,AAAA") !== null, "safeUrl 放行 data:image", "");

console.log(`sanitize 回归: PASS ${pass}  FAIL ${fail}`);
if (fail) {
  for (const f of failures) console.log("  FAIL:", f);
  process.exit(1);
}
