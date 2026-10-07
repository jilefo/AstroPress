/**
 * Built-in AI Actions
 *
 * Import this file once (in the execute API route and chat route) to register
 * all built-in actions. Plugins call registerAIAction() to add their own.
 */

import { eq } from "drizzle-orm";
import { wpOptions } from "@astropress/core/schema";
import { registerPostType, registerTaxonomy } from "@astropress/core/registry";
import { registerAIAction } from "./ai-registry";
import { createPost, updatePost, deletePost } from "./posts";
import { slugify } from "./slugify";

// ─── Posts ────────────────────────────────────────────────────────────────────

registerAIAction({
  type: "createPost",
  description: "Create a new post, page, or custom post type entry with full content",
  example: '{"type":"createPost","postType":"post","title":"My Title","content":"<p>HTML content</p>","excerpt":"Short description","status":"draft"}',
  serverSide: true,
  handler: async (params, db, userId) => {
    const postType = params.postType ?? "post";
    const id = await createPost(db, {
      title: params.title ?? "无标题",
      content: params.content ?? "",
      excerpt: params.excerpt ?? "",
      status: params.status ?? "draft",
      type: postType,
      authorId: userId,
    });

    const section =
      postType === "page" ? "pages"
      : postType === "post" ? "posts"
      : `cpt/${postType}`;

    return {
      success: true,
      message: `已创建${postType === "page" ? "页面" : "文章"}「${params.title}」（${params.status ?? "draft"}）`,
      navigate: `/admin/${section}/${id}`,
      data: { id },
    };
  },
});

registerAIAction({
  type: "updatePost",
  description: "Update an existing post's title, content, excerpt, or status by ID",
  example: '{"type":"updatePost","id":42,"title":"New Title","content":"<p>New content</p>","status":"publish"}',
  serverSide: true,
  handler: async (params, db) => {
    if (!params.id) return { success: false, message: "缺少文章 ID" };
    await updatePost(db, Number(params.id), {
      title: params.title,
      content: params.content,
      excerpt: params.excerpt,
      status: params.status,
    });
    return { success: true, message: `已更新文章 #${params.id}` };
  },
});

registerAIAction({
  type: "trashPost",
  description: "Move a post to trash by ID",
  example: '{"type":"trashPost","id":42}',
  serverSide: true,
  handler: async (params, db) => {
    if (!params.id) return { success: false, message: "缺少文章 ID" };
    await deletePost(db, Number(params.id));
    return { success: true, message: `已将文章 #${params.id} 移入回收站` };
  },
});

// ─── Settings ─────────────────────────────────────────────────────────────────

const WRITABLE_SETTINGS = new Set([
  "blogname",
  "blogdescription",
  "siteurl",
  "admin_email",
  "posts_per_page",
]);

registerAIAction({
  type: "updateSettings",
  description: "Update site settings. Writable keys: blogname, blogdescription, siteurl, admin_email, posts_per_page",
  example: '{"type":"updateSettings","settings":{"blogname":"My Site","blogdescription":"A great site"}}',
  serverSide: true,
  handler: async (params, db) => {
    const settings: Record<string, string> = params.settings ?? {};
    const updated: string[] = [];

    for (const [key, value] of Object.entries(settings)) {
      if (!WRITABLE_SETTINGS.has(key)) continue;
      await db
        .insert(wpOptions)
        .values({ optionName: key, optionValue: String(value) })
        .onConflictDoUpdate({
          target: wpOptions.optionName,
          set: { optionValue: String(value) },
        });
      updated.push(key);
    }

    if (!updated.length) return { success: false, message: "没有可更新的有效设置项" };
    return {
      success: true,
      message: `已更新设置：${updated.join("、")}`,
      navigate: "/admin/settings",
    };
  },
});

// ─── Forms ────────────────────────────────────────────────────────────────────

registerAIAction({
  type: "createForm",
  description: "Create a contact/inquiry form with specified fields",
  example: '{"type":"createForm","name":"Contact Us","fields":[{"label":"Name","type":"text","required":true},{"label":"Email","type":"email","required":true},{"label":"Message","type":"textarea","required":true}]}',
  serverSide: true,
  handler: async (params, db) => {
    const row = await db
      .select()
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_forms"))
      .get();

    const forms: any[] = row?.optionValue ? JSON.parse(row.optionValue) : [];
    const id = `form_${Date.now()}`;
    const now = new Date().toISOString();

    const fields = (params.fields ?? []).map((f: any, i: number) => ({
      id: `field_${Date.now()}_${i}`,
      type: f.type ?? "text",
      label: f.label ?? `字段 ${i + 1}`,
      required: f.required ?? false,
      placeholder: f.placeholder ?? "",
      options: f.options ?? [],
      size: "large",
      description: "",
      cssClass: "",
      defaultValue: "",
    }));

    const newForm = {
      id,
      title: params.name ?? "未命名表单",
      fields,
      settings: {
        submitText: "提交",
        submitProcessingText: "提交中…",
        submitAlign: "left",
        formClass: "",
        labelAlignment: "top",
        ajax: true,
        honeypot: true,
        requireLogin: false,
        requireLoginMessage: "请先登录后再填写本表单。",
        scheduleForm: false,
        scheduleStart: "",
        scheduleEnd: "",
        scheduleClosedMessage: "本表单当前已停止提交。",
        limitEntries: false,
        limitEntriesCount: 100,
        limitEntriesMessage: "抱歉，本表单已达到提交数量上限。",
        storeEntries: true,
      },
      notifications: [{
        id: `notif_${Date.now()}`,
        name: "管理员通知",
        active: true,
        toAddress: "{admin_email}",
        fromName: "{site_name}",
        fromEmail: "{admin_email}",
        replyTo: "{field:email}",
        subject: `新的提交：${params.name ?? "未命名表单"}`,
        message: "{all_fields}",
        conditionalLogic: false,
      }],
      confirmations: [{
        id: `conf_${Date.now()}`,
        name: "默认确认",
        active: true,
        type: "message",
        message: "<p>提交成功，我们会尽快与您联系！</p>",
        redirectUrl: "",
        page: "",
        autoScroll: true,
        conditionalLogic: false,
      }],
      createdAt: now,
      updatedAt: now,
    };
    forms.push(newForm);

    await db
      .insert(wpOptions)
      .values({ optionName: "astropress_forms", optionValue: JSON.stringify(forms) })
      .onConflictDoUpdate({
        target: wpOptions.optionName,
        set: { optionValue: JSON.stringify(forms) },
      });

    return {
      success: true,
      message: `已创建表单「${newForm.title}」`,
      navigate: `/admin/forms/${id}`,
      data: { id },
    };
  },
});

// ─── Post Types ───────────────────────────────────────────────────────────────

registerAIAction({
  type: "createPostType",
  description: "Register a custom post type (e.g. products, events, testimonials). Does NOT navigate — let the final action in the chain handle navigation.",
  example: '{"type":"createPostType","name":"Products","key":"product","singular":"Product","icon":"tag","description":"Store product listings"}',
  serverSide: true,
  handler: async (params, db) => {
    if (!params.key || !/^[a-z0-9_]+$/.test(params.key)) {
      return { success: false, message: "key must be lowercase alphanumeric with underscores" };
    }

    const row = await db
      .select()
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_custom_post_types"))
      .get();

    const existing: any[] = row?.optionValue ? JSON.parse(row.optionValue) : [];

    if (existing.find((pt: any) => pt.key === params.key)) {
      return { success: false, message: `文章类型 "${params.key}" 已存在` };
    }

    const pluralName = params.name ?? params.key;
    const singularName = params.singular ?? (pluralName.replace(/s$/i, "") || pluralName);

    const newType = {
      key: params.key,
      label: singularName,
      pluralLabel: pluralName,
      description: params.description ?? "",
      icon: params.icon ?? "folder",
      public: true,
      showInMenu: true,
      custom: true,
      supports: ["title", "editor", "excerpt"],
    };
    existing.push(newType);

    await db
      .insert(wpOptions)
      .values({ optionName: "astropress_custom_post_types", optionValue: JSON.stringify(existing) })
      .onConflictDoUpdate({
        target: wpOptions.optionName,
        set: { optionValue: JSON.stringify(existing) },
      });

    try {
      const { key: _k, ...cfg } = newType;
      registerPostType(newType.key, cfg as any);
    } catch {}

    return {
      success: true,
      message: `已创建文章类型「${newType.pluralLabel}」`,
      data: { key: params.key },
    };
  },
});

// ─── Taxonomies ───────────────────────────────────────────────────────────────

registerAIAction({
  type: "createTaxonomy",
  description: "Create a custom taxonomy and attach it to one or more post types. Always create the post type first if it doesn't exist yet.",
  example: '{"type":"createTaxonomy","name":"Job Types","key":"job_type","singular":"Job Type","postTypes":["job_application"],"hierarchical":true}',
  serverSide: true,
  handler: async (params, db) => {
    if (!params.key || !/^[a-z0-9_]+$/.test(params.key)) {
      return { success: false, message: "key must be lowercase alphanumeric with underscores" };
    }

    const row = await db
      .select()
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_custom_taxonomies"))
      .get();

    const existing: any[] = row?.optionValue ? JSON.parse(row.optionValue) : [];

    const pluralName = params.name ?? params.key;
    const singularName = params.singular ?? (pluralName.replace(/s$/i, "") || pluralName);

    const entry = {
      key: params.key,
      label: singularName,
      pluralLabel: pluralName,
      description: params.description ?? "",
      postTypes: Array.isArray(params.postTypes) ? params.postTypes : [],
      hierarchical: params.hierarchical ?? false,
      public: params.public ?? true,
      showInRest: params.showInRest ?? true,
      custom: true,
    };

    const idx = existing.findIndex((t: any) => t.key === params.key);
    if (idx >= 0) existing[idx] = entry;
    else existing.push(entry);

    await db
      .insert(wpOptions)
      .values({ optionName: "astropress_custom_taxonomies", optionValue: JSON.stringify(existing) })
      .onConflictDoUpdate({
        target: wpOptions.optionName,
        set: { optionValue: JSON.stringify(existing) },
      });

    try {
      registerTaxonomy(entry.key, entry as any);
    } catch {}

    return {
      success: true,
      message: `已创建分类法「${entry.pluralLabel}」`,
      data: { key: params.key },
    };
  },
});

// ─── Custom Fields ────────────────────────────────────────────────────────────

registerAIAction({
  type: "createFieldGroup",
  description: "Create an ACF-style custom field group and attach it to a post type or page. Supported field types: text, textarea, number, email, url, image, file, select, checkbox, radio, true_false, date_picker, wysiwyg, color_picker, range, password, repeater.",
  example: '{"type":"createFieldGroup","title":"Book Details","postTypes":["book"],"fields":[{"label":"ISBN","name":"isbn","type":"text"},{"label":"Price","name":"price","type":"number"},{"label":"Cover Image","name":"cover_image","type":"image"},{"label":"Genre","name":"genre","type":"select","choices":["Fiction","Non-Fiction","Science","History"]}]}',
  serverSide: true,
  handler: async (params, db) => {
    if (!params.title || !Array.isArray(params.fields)) {
      return { success: false, message: "title and fields are required" };
    }

    const row = await db
      .select()
      .from(wpOptions)
      .where(eq(wpOptions.optionName, "astropress_field_groups"))
      .get();

    const groups: any[] = row?.optionValue ? JSON.parse(row.optionValue) : [];

    const id = `group_${Date.now()}`;
    const key = `group_${Math.random().toString(36).slice(2, 10)}`;

    // Normalise postTypes → location rules (ACF format)
    const postTypes: string[] = Array.isArray(params.postTypes) ? params.postTypes : ["post"];
    const location: any[][] = postTypes.map((pt) => ([{
      param: "post_type",
      operator: "==",
      value: pt,
    }]));

    const fields = (params.fields as any[]).map((f, i) => {
      const fieldKey = `field_${Date.now()}_${i}`;
      const base: any = {
        id: fieldKey,
        key: fieldKey,
        label: f.label ?? `字段 ${i + 1}`,
        name: f.name ?? (f.label ?? `field_${i}`).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        type: f.type ?? "text",
        instructions: f.instructions ?? "",
        required: f.required ?? false,
        conditionalLogic: false,
        wrapper: { width: "", class: "", id: "" },
      };

      // Type-specific extra fields
      if (f.type === "select" || f.type === "checkbox" || f.type === "radio" || f.type === "button_group") {
        const rawChoices: string[] = Array.isArray(f.choices) ? f.choices : [];
        // Store as newline-delimited "key : Label" string (same format as FieldGroupEditor)
        base.choices = rawChoices.map((c: string) => `${c.toLowerCase().replace(/\s+/g, "_")} : ${c}`).join("\n");
        base.allowNull = f.allowNull ?? 0;
        base.multiple = f.multiple ?? 0;
        base.ui = f.ui ?? 0;
        base.returnFormat = f.returnFormat ?? "value";
      }
      if (f.type === "true_false") {
        base.message = f.message ?? "";
        base.defaultValue = f.defaultValue ?? 0;
        base.ui = f.ui ?? 1;
      }
      if (f.type === "number" || f.type === "range") {
        base.min = f.min ?? "";
        base.max = f.max ?? "";
        base.step = f.step ?? "";
      }
      if (f.type === "image" || f.type === "file") {
        base.returnFormat = f.returnFormat ?? "array";
        base.previewSize = "medium";
        base.library = "all";
      }
      if (f.type === "text" || f.type === "textarea") {
        base.placeholder = f.placeholder ?? "";
        base.maxlength = f.maxlength ?? "";
        if (f.type === "textarea") base.rows = f.rows ?? "";
      }
      if (f.type === "repeater") {
        base.subFields = (f.subFields ?? []).map((sf: any, si: number) => ({
          id: `field_${Date.now()}_${i}_${si}`,
          key: `field_${Date.now()}_${i}_${si}`,
          label: sf.label ?? `Sub Field ${si + 1}`,
          name: (sf.label ?? `sub_field_${si}`).toLowerCase().replace(/[^a-z0-9]+/g, "_"),
          type: sf.type ?? "text",
          instructions: "",
          required: sf.required ?? false,
          conditionalLogic: false,
          wrapper: { width: "", class: "", id: "" },
        }));
        base.minRows = f.minRows ?? "";
        base.maxRows = f.maxRows ?? "";
        base.layout = f.layout ?? "table";
        base.buttonLabel = f.buttonLabel ?? "Add Row";
      }

      return base;
    });

    const newGroup: any = {
      id,
      key,
      title: params.title,
      fields,
      location,
      menuOrder: groups.length,
      position: params.position ?? "normal",
      labelPlacement: "top",
      instructionPlacement: "label",
      hideOnScreen: [],
      active: true,
    };

    groups.push(newGroup);

    await db
      .insert(wpOptions)
      .values({ optionName: "astropress_field_groups", optionValue: JSON.stringify(groups) })
      .onConflictDoUpdate({
        target: wpOptions.optionName,
        set: { optionValue: JSON.stringify(groups) },
      });

    try {
      const { registerFieldGroup } = await import("@astropress/core/registry");
      registerFieldGroup(newGroup);
    } catch {}

    return {
      success: true,
      message: `已创建字段组「${params.title}」，包含 ${fields.length} 个字段`,
      navigate: `/admin/custom-fields/${id}`,
      data: { id, key },
    };
  },
});

// ─── Client-side actions (DOM — documented for system prompt only) ─────────────

registerAIAction({
  type: "setTitle",
  description: "Set the post/page title in the current editor",
  example: '{"type":"setTitle","value":"My Post Title"}',
  serverSide: false,
});

registerAIAction({
  type: "setContent",
  description: "Set the block editor content on the current editor page",
  example: '{"type":"setContent","html":"<h2>Heading</h2><p>Paragraph text</p>"}',
  serverSide: false,
});

registerAIAction({
  type: "setExcerpt",
  description: "Set the excerpt/meta description on the current editor page",
  example: '{"type":"setExcerpt","value":"A short description of this post."}',
  serverSide: false,
});

registerAIAction({
  type: "setStatus",
  description: "Change the publish status on the current editor page",
  example: '{"type":"setStatus","value":"publish"}',
  serverSide: false,
});

registerAIAction({
  type: "savePost",
  description: "Save/publish the current post in the editor",
  example: '{"type":"savePost","status":"publish"}',
  serverSide: false,
});

registerAIAction({
  type: "navigate",
  description: "Navigate the browser to any admin URL",
  example: '{"type":"navigate","url":"/admin/posts"}',
  serverSide: false,
});
