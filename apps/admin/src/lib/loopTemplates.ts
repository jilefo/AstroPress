import type { LoopTemplate } from "@astropress/core/types/theme";
import type { Block } from "@astropress/core/types/theme";

export interface LoopTemplateWithBlocks extends LoopTemplate {
  blocks: Block[];
}

export const DEFAULT_LOOP_TEMPLATES: LoopTemplateWithBlocks[] = [
  {
    id: "default-with-image",
    name: "Card with Image",
    isDefault: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    blocks: [
      { id: "d1a", type: "loop-image" as any, props: { height: 220, objectFit: "cover", borderRadius: "0" } },
      { id: "d1b", type: "loop-category" as any, props: { size: "10px", badge: false } },
      { id: "d1c", type: "loop-title" as any, props: { tag: "h3", size: "1.05rem", weight: "700", linked: true } },
      { id: "d1d", type: "loop-date" as any, props: { format: "long", size: "11px" } },
      { id: "d1e", type: "loop-excerpt" as any, props: { length: 120, size: "0.9rem" } },
      { id: "d1f", type: "loop-read-more" as any, props: { text: "Read More →", buttonStyle: "link" } },
    ],
  },
  {
    id: "default-no-image",
    name: "Card without Image",
    isDefault: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    blocks: [
      { id: "d2a", type: "loop-category" as any, props: { size: "10px", badge: true } },
      { id: "d2b", type: "loop-title" as any, props: { tag: "h3", size: "1.1rem", weight: "700", linked: true } },
      { id: "d2c", type: "loop-date" as any, props: { format: "long", size: "11px" } },
      { id: "d2d", type: "loop-author" as any, props: { prefix: "By ", size: "12px" } },
      { id: "d2e", type: "loop-excerpt" as any, props: { length: 160, size: "0.9rem" } },
      { id: "d2f", type: "loop-read-more" as any, props: { text: "Read More →", buttonStyle: "link" } },
    ],
  },
  {
    id: "default-horizontal",
    name: "Horizontal Card",
    isDefault: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    blocks: [
      { id: "d3a", type: "loop-image" as any, props: { height: 160, objectFit: "cover", layout: "horizontal", width: "180px" } },
      { id: "d3b", type: "loop-category" as any, props: { size: "10px", badge: false } },
      { id: "d3c", type: "loop-title" as any, props: { tag: "h3", size: "1rem", weight: "700", linked: true } },
      { id: "d3d", type: "loop-date" as any, props: { format: "short", size: "11px" } },
      { id: "d3e", type: "loop-excerpt" as any, props: { length: 80, size: "0.88rem" } },
      { id: "d3f", type: "loop-read-more" as any, props: { text: "Read More →", buttonStyle: "link" } },
    ],
  },
  {
    id: "default-magazine",
    name: "Magazine Style",
    isDefault: true,
    createdAt: "2025-01-01T00:00:00.000Z",
    updatedAt: "2025-01-01T00:00:00.000Z",
    blocks: [
      { id: "d4a", type: "loop-image" as any, props: { height: 280, objectFit: "cover", overlay: true } },
      { id: "d4b", type: "loop-category" as any, props: { size: "10px", badge: true } },
      { id: "d4c", type: "loop-title" as any, props: { tag: "h3", size: "1.15rem", weight: "700", linked: true } },
      { id: "d4d", type: "loop-date" as any, props: { format: "short", size: "11px" } },
      { id: "d4e", type: "loop-read-more" as any, props: { text: "Read More →", buttonStyle: "link" } },
    ],
  },
];

export async function loadLoopTemplates(db: any): Promise<LoopTemplateWithBlocks[]> {
  const { eq } = await import("drizzle-orm");
  const { wpOptions } = await import("@astropress/core/schema");

  const [row] = await db.select({ value: wpOptions.optionValue })
    .from(wpOptions).where(eq(wpOptions.optionName, "astropress_loop_templates")).limit(1);

  const userTemplates: LoopTemplate[] = row?.value ? JSON.parse(row.value) : [];

  const result: LoopTemplateWithBlocks[] = [...DEFAULT_LOOP_TEMPLATES];

  for (const tmpl of userTemplates) {
    const schemaKey = `astropress_page_schema___loop-item_${tmpl.id}__`;
    const [schemaRow] = await db.select({ value: wpOptions.optionValue })
      .from(wpOptions).where(eq(wpOptions.optionName, schemaKey)).limit(1);
    const schema = schemaRow?.value ? JSON.parse(schemaRow.value) : { blocks: [] };
    result.push({ ...tmpl, blocks: schema.blocks ?? [] });
  }

  return result;
}
