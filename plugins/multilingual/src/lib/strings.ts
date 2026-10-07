import { getOption, updateOption } from "@astropress/core/query";

const keyFor = (code: string) => `astropress_ml_strings_${code}`;

/** Merge string bundles along the fallback chain: [code, ..., defaultLang, "en"]. */
export async function loadStrings(db: any, code: string, defaultLang: string): Promise<Record<string, string>> {
  const chain = [code, defaultLang, "en"].filter((c, i, arr) => c && arr.indexOf(c) === i);
  const merged: Record<string, string> = {};
  for (const c of chain) {
    const raw = await getOption(db, keyFor(c), "");
    if (!raw) continue;
    try {
      Object.assign(merged, JSON.parse(raw) as Record<string, string>);
    } catch {
      /* skip corrupt bundle */
    }
  }
  return merged;
}

export async function saveStrings(db: any, code: string, strings: Record<string, string>): Promise<void> {
  await updateOption(db, keyFor(code), JSON.stringify(strings));
}

export function formatString(template: string, ...args: string[]): string {
  return template.replace(/%s/g, () => args.shift() ?? "");
}