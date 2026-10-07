export interface PostTypeConfig {
  label: string;
  pluralLabel: string;
  description?: string;
  icon?: string;
  public?: boolean;
  showInMenu?: boolean;
  hierarchical?: boolean;
  hasArchive?: boolean;
  showInRest?: boolean;
  excludeFromSearch?: boolean;
  menuPosition?: number;
  supports?: Array<"title" | "editor" | "thumbnail" | "excerpt" | "custom-fields" | "author" | "comments" | "revisions">;
  custom?: boolean;
}

export interface TaxonomyConfig {
  label: string;
  pluralLabel: string;
  description?: string;
  hierarchical?: boolean;
  postTypes: string[];
  public?: boolean;
  showInRest?: boolean;
  custom?: boolean;
}

export interface RegisteredPostType {
  slug: string;
  config: PostTypeConfig;
}

export interface RegisteredTaxonomy {
  slug: string;
  config: TaxonomyConfig;
}

// ─── ACF-style Custom Fields ────────────────────────────────────────────────

export type ACFFieldType =
  | "text" | "textarea" | "number" | "range" | "email" | "url" | "password"
  | "image" | "file" | "wysiwyg" | "oembed" | "gallery"
  | "select" | "checkbox" | "radio" | "button_group" | "true_false"
  | "link" | "post_object" | "page_link" | "relationship" | "taxonomy" | "user"
  | "google_map" | "date_picker" | "date_time_picker" | "time_picker" | "color_picker"
  | "message" | "accordion" | "tab"
  | "group" | "repeater" | "flexible_content" | "clone";

export interface ConditionalLogicRule {
  field: string;
  operator: "==" | "!=" | ">" | "<" | ">=" | "<=" | "=empty" | "!=empty";
  value: string;
}

export interface ACFField {
  id: string;
  key: string;          // field_xxxxxxxx
  label: string;
  name: string;         // used as wp_postmeta meta_key
  type: ACFFieldType;
  instructions: string;
  required: boolean;
  conditionalLogic: ConditionalLogicRule[][] | false;
  wrapper: { width: string; class: string; id: string };
  subFields?: ACFField[];               // group / repeater
  layouts?: FlexLayout[];               // flexible_content
  [key: string]: any;
}

export interface FlexLayout {
  id: string;
  key: string;
  label: string;
  name: string;
  display: "block" | "table" | "row";
  min: string;
  max: string;
  subFields: ACFField[];
}

export interface FieldGroupLocation {
  param: string;
  operator: "==" | "!=";
  value: string;
}

export interface FieldGroup {
  id: string;
  key: string;          // group_xxxxxxxx
  title: string;
  fields: ACFField[];
  location: FieldGroupLocation[][];   // OR of AND rules
  menuOrder: number;
  position: "normal" | "side" | "acf_after_title";
  labelPlacement: "top" | "left";
  instructionPlacement: "label" | "field";
  hideOnScreen: string[];
  active: boolean;
}

// ────────────────────────────────────────────────────────────────────────────

export interface SidebarPanelConfig {
  id: string;
  title: string;
  /** Post types this panel appears on. Empty = all supported types. */
  postTypes: string[];
  /** Island component identifier — used to look up the React island to render */
  componentId: string;
}

export interface RegisteredSidebarPanel {
  config: SidebarPanelConfig;
}
