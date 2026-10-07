import { pgTable, text, integer, serial, index } from "drizzle-orm/pg-core";

export const wpTerms = pgTable(
  "wp_terms",
  {
    termId: serial("term_id").primaryKey(),
    name: text("name").notNull().default(""),
    slug: text("slug").notNull().default(""),
    termGroup: integer("term_group").notNull().default(0),
  },
  (table) => ({
    slugIdx: index("terms_slug_idx").on(table.slug),
    nameIdx: index("terms_name_idx").on(table.name),
  })
);

export const wpTermTaxonomy = pgTable(
  "wp_term_taxonomy",
  {
    termTaxonomyId: serial("term_taxonomy_id").primaryKey(),
    termId: integer("term_id").notNull().default(0),
    taxonomy: text("taxonomy").notNull().default(""),
    description: text("description").notNull().default(""),
    parent: integer("parent").notNull().default(0),
    count: integer("count").notNull().default(0),
  },
  (table) => ({
    taxonomyIdx: index("term_taxonomy_taxonomy_idx").on(table.taxonomy),
    termIdTaxonomyIdx: index("term_id_taxonomy_idx").on(table.termId, table.taxonomy),
  })
);

export const wpTermRelationships = pgTable(
  "wp_term_relationships",
  {
    objectId: integer("object_id").notNull(),
    termTaxonomyId: integer("term_taxonomy_id").notNull(),
    termOrder: integer("term_order").notNull().default(0),
  },
  (table) => ({
    termTaxonomyIdIdx: index("term_relationships_taxonomy_id_idx").on(table.termTaxonomyId),
  })
);
