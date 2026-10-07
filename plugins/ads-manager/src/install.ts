import { getOption, updateOption } from "@astropress/core/query";
import type { FieldGroup } from "@astropress/core/registry";

const CPT_KEY = "astropress_custom_post_types";
const FG_KEY = "astropress_field_groups";

function field(p: {
  name: string; label: string; type: FieldGroup["fields"][number]["type"]; instructions?: string; choices?: string;
}): FieldGroup["fields"][number] {
  return {
    id: `ap_${p.name}`,
    key: `field_ap_${p.name}`,
    label: p.label,
    name: p.name,
    type: p.type,
    instructions: p.instructions ?? "",
    required: false,
    conditionalLogic: false,
    wrapper: { width: "", class: "", id: "" },
    ...(p.choices ? { choices: p.choices } : {}),
  };
}

const AD_FIELD_GROUP: FieldGroup = {
  id: "ap-ad-config",
  key: "group_ap_ad_config",
  title: "Ad Configuration",
  fields: [
    field({ name: "ap_ad_kind", label: "Ad Type", type: "select", choices: "html : HTML / JS\niframe : Sandboxed iframe\nimage : Image URL", instructions: "Ad code lives in the editor content. Use iframe for third-party scripts." }),
    field({ name: "ap_ad_slots", label: "Slots", type: "text", instructions: "Comma-separated slot keys, e.g. header-banner, sidebar-1" }),
    field({ name: "ap_ad_weight", label: "Weight (A/B)", type: "number", instructions: "Relative traffic share when several ads share a slot" }),
    field({ name: "ap_ad_schedule_start", label: "Schedule start", type: "text", instructions: "ISO date, empty = immediately" }),
    field({ name: "ap_ad_schedule_end", label: "Schedule end", type: "text", instructions: "ISO date, empty = no end" }),
    field({ name: "ap_ad_target_langs", label: "Language targeting", type: "text", instructions: "Comma-separated lang codes (multilingual plugin). Empty = all" }),
    field({ name: "ap_ad_target_devices", label: "Device targeting", type: "text", instructions: "mobile and/or desktop, comma separated. Empty = all" }),
    field({ name: "ap_ad_target_paths", label: "Path targeting", type: "text", instructions: "Comma-separated substrings, e.g. /blog/,/pricing/. Empty = all" }),
    field({ name: "ap_ad_sandbox", label: "Sandbox iframe", type: "true_false", instructions: "Render iframe ads with sandbox=allow-scripts" }),
    field({ name: "ap_ad_noscript", label: "noscript fallback", type: "textarea" }),
    field({ name: "ap_ad_gdpr", label: "Require GDPR consent", type: "true_false", instructions: "Tracking script stays inactive until consent signal" }),
  ],
  location: [[{ param: "post_type", operator: "==", value: "ap_ad" }]],
  menuOrder: 0,
  position: "normal",
  labelPlacement: "top",
  instructionPlacement: "field",
  hideOnScreen: [],
  active: true,
};

const AD_CPT = {
  key: "ap_ad",
  slug: "ap_ad",
  label: "Ad",
  pluralLabel: "Ads Manager",
  icon: "megaphone",
  public: false,
  showInMenu: true,
  supports: ["title", "editor"],
  config: { plugin: "ads-manager" },
};

/**
 * Idempotent activation: register the ap_ad CPT and its field group through
 * the official data-driven mechanisms (AdminLayout reads
 * astropress_custom_post_types; CustomFieldsPanel reads GET /api/custom-fields
 * which reads astropress_field_groups from wp_options). Called once per
 * process from the middleware — zero core modification.
 */
export async function ensureAdsInstalled(db: any): Promise<void> {
  if (!db) return;

  const cptRaw = await getOption(db, CPT_KEY, "[]");
  try {
    const list = JSON.parse(cptRaw) as any[];
    if (!list.some((c) => (c.key ?? c.slug) === "ap_ad")) {
      list.push(AD_CPT);
      await updateOption(db, CPT_KEY, JSON.stringify(list));
    }
  } catch {
    /* corrupt option — leave untouched */
  }

  const fgRaw = await getOption(db, FG_KEY, "[]");
  try {
    const groups = JSON.parse(fgRaw) as FieldGroup[];
    if (!groups.some((g) => g.id === AD_FIELD_GROUP.id)) {
      groups.push(AD_FIELD_GROUP);
      await updateOption(db, FG_KEY, JSON.stringify(groups));
    }
  } catch {
    /* corrupt option — leave untouched */
  }
}