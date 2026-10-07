import type {
  PostTypeConfig,
  TaxonomyConfig,
  RegisteredPostType,
  RegisteredTaxonomy,
  SidebarPanelConfig,
  RegisteredSidebarPanel,
  FieldGroup,
  ACFField,
  FlexLayout,
  FieldGroupLocation,
  ACFFieldType,
  ConditionalLogicRule,
} from "./types";

export type {
  PostTypeConfig,
  TaxonomyConfig,
  RegisteredPostType,
  RegisteredTaxonomy,
  SidebarPanelConfig,
  RegisteredSidebarPanel,
  FieldGroup,
  ACFField,
  FlexLayout,
  FieldGroupLocation,
  ACFFieldType,
  ConditionalLogicRule,
};

const postTypes = new Map<string, PostTypeConfig>();
const taxonomies = new Map<string, TaxonomyConfig>();
const sidebarPanels = new Map<string, SidebarPanelConfig>();
const fieldGroups = new Map<string, FieldGroup>();

export function registerPostType(slug: string, config: PostTypeConfig): void {
  postTypes.set(slug, config);
}

export function registerTaxonomy(slug: string, config: TaxonomyConfig): void {
  taxonomies.set(slug, config);
}

export function registerSidebarPanel(id: string, config: SidebarPanelConfig): void {
  sidebarPanels.set(id, config);
}

export function getPostTypes(): RegisteredPostType[] {
  return Array.from(postTypes.entries()).map(([slug, config]) => ({ slug, config }));
}

export function getTaxonomies(): RegisteredTaxonomy[] {
  return Array.from(taxonomies.entries()).map(([slug, config]) => ({ slug, config }));
}

export function getPostType(slug: string): PostTypeConfig | undefined {
  return postTypes.get(slug);
}

export function getTaxonomy(slug: string): TaxonomyConfig | undefined {
  return taxonomies.get(slug);
}

export function unregisterPostType(slug: string): void {
  postTypes.delete(slug);
}

export function unregisterTaxonomy(slug: string): void {
  taxonomies.delete(slug);
}

export function getCustomPostTypes(): RegisteredPostType[] {
  return Array.from(postTypes.entries())
    .filter(([, c]) => c.custom)
    .map(([slug, config]) => ({ slug, config }));
}

export function getCustomTaxonomies(): RegisteredTaxonomy[] {
  return Array.from(taxonomies.entries())
    .filter(([, c]) => c.custom)
    .map(([slug, config]) => ({ slug, config }));
}

export function getSidebarPanels(postType?: string): RegisteredSidebarPanel[] {
  return Array.from(sidebarPanels.values())
    .filter((p) => !postType || p.postTypes.length === 0 || p.postTypes.includes(postType))
    .map((config) => ({ config }));
}

// ─── Field Group Registry ───────────────────────────────────────────────────

export function registerFieldGroup(group: FieldGroup): void {
  fieldGroups.set(group.id, group);
}

export function unregisterFieldGroup(id: string): void {
  fieldGroups.delete(id);
}

export function getFieldGroups(): FieldGroup[] {
  return Array.from(fieldGroups.values());
}

export function getFieldGroup(id: string): FieldGroup | undefined {
  return fieldGroups.get(id);
}

export function getFieldGroupsForPost(postType: string): FieldGroup[] {
  return Array.from(fieldGroups.values()).filter((g) => {
    if (!g.active) return false;
    if (!g.location || g.location.length === 0) return false;
    return g.location.some((andGroup) =>
      andGroup.every((rule) => {
        if (rule.param === "post_type") {
          return rule.operator === "==" ? rule.value === postType : rule.value !== postType;
        }
        return rule.operator === "!="; // unknown param — treat as non-blocking
      })
    );
  });
}

// ────────────────────────────────────────────────────────────────────────────

// Built-in WordPress post types (post is managed via Post Types UI, not shown by default)
registerPostType("post", {
  label: "Post",
  pluralLabel: "Posts",
  icon: "📝",
  public: true,
  showInMenu: false,
  supports: ["title", "editor", "thumbnail", "excerpt", "custom-fields"],
});

registerPostType("page", {
  label: "Page",
  pluralLabel: "Pages",
  icon: "📄",
  public: true,
  showInMenu: true,
  supports: ["title", "editor", "thumbnail", "custom-fields"],
});

registerPostType("attachment", {
  label: "Media",
  pluralLabel: "Media",
  icon: "🖼️",
  public: true,
  showInMenu: true,
  supports: ["title"],
});

registerPostType("nav_menu_item", {
  label: "Menu Item",
  pluralLabel: "Menu Items",
  icon: "🔗",
  public: false,
  showInMenu: false,
  supports: ["title"],
});

// Built-in taxonomies
registerTaxonomy("category", {
  label: "Category",
  pluralLabel: "Categories",
  hierarchical: true,
  postTypes: ["post"],
});

registerTaxonomy("post_tag", {
  label: "Tag",
  pluralLabel: "Tags",
  hierarchical: false,
  postTypes: ["post"],
});
