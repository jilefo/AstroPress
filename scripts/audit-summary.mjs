import fs from "node:fs";

const FILE = process.argv[2] ?? "wp-themes/_audit.json";
const results = JSON.parse(fs.readFileSync(FILE, "utf8").replace(/^\uFEFF/, ""));

const codeTotals = new Map();
const themesByCode = new Map();
const levelTotals = { error: 0, warn: 0, info: 0 };

for (const r of results) {
  levelTotals.error += r.counts.error;
  levelTotals.warn += r.counts.warn;
  levelTotals.info += r.counts.info;
  for (const i of r.issues) {
    codeTotals.set(i.code, (codeTotals.get(i.code) || 0) + 1);
    if (!themesByCode.has(i.code)) themesByCode.set(i.code, new Set());
    themesByCode.get(i.code).add(r.name);
  }
}

console.log(`主题: ${results.length}   E:${levelTotals.error} W:${levelTotals.warn} I:${levelTotals.info}`);
console.log("\n问题类型（消息数 / 影响主题数）:");
for (const [code, n] of [...codeTotals.entries()].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(n).padStart(4)} / ${String(themesByCode.get(code).size).padStart(2)}  ${code}`);
}

console.log("\n各主题错误数:");
for (const r of results) {
  console.log(`  E${String(r.counts.error).padStart(2)} W${String(r.counts.warn).padStart(2)} I${String(r.counts.info).padStart(2)}  ${r.name.padEnd(28)} css{classes:${r.meta?.cssStats?.classes ?? "-"},dead:${r.meta?.cssStats?.deadClasses ?? "-"},ap:${r.meta?.cssStats?.apBlockRules ?? "-"},media:${r.meta?.cssStats?.mediaQueries ?? "-"},adapter:${r.meta?.cssStats?.hasAdapter ?? "-"}}`);
}

console.log("\n=== 非 CSS 问题明细 ===");
for (const r of results) {
  for (const i of r.issues) {
    if (i.code.startsWith("css/") || i.code === "template/inert" || i.code === "manifest/dead-inline") continue;
    console.log(`  [${r.name}] ${i.code}: ${i.msg}`);
  }
}

console.log("\n=== loopTemplateId 自定义值 ===");
for (const r of results) {
  for (const i of r.issues) {
    if (i.code === "block/loop-template") console.log(`  [${r.name}] ${i.msg}`);
  }
}

console.log("\n=== 字体未加载 ===");
for (const r of results) {
  for (const i of r.issues) {
    if (i.code === "font/not-loaded") console.log(`  [${r.name}] ${i.msg}`);
  }
}

console.log("\n=== token/CSS :root 真实冲突 ===");
for (const r of results) {
  for (const i of r.issues) {
    if (i.code === "css/token-conflict") console.log(`  [${r.name}] ${i.msg}`);
  }
}

console.log("\n=== 未定义变量 / 必填缺失 / 解析错误 ===");
for (const r of results) {
  for (const i of r.issues) {
    if (["css/var-undefined", "block/prop-required", "block/html-placeholder", "template/parse", "page/parse", "manifest/parse", "blocks/empty"].includes(i.code)) {
      console.log(`  [${r.name}] ${i.code}: ${i.msg}`);
    }
  }
}
