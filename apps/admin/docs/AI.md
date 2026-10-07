# AstroPress AI — Developer Reference

The AstroPress AI system is a first-class feature of the admin. A floating assistant panel (AIWidget) is available on every page and can autonomously perform any CMS operation by emitting structured action blocks.

---

## Architecture

```
User types prompt
        ↓
AIWidget → POST /api/ai/chat (with page context)
        ↓
chat.ts builds system prompt from AI Action Registry
        ↓
Provider API (Anthropic / OpenAI / Gemini / Mistral / Groq)
        ↓
AI responds with text + ```action blocks
        ↓
AIWidget parses action blocks
  ├── Server-side actions → POST /api/ai/execute → ActionHandler(db, userId)
  └── Client-side actions → Direct DOM manipulation
        ↓
Result chips shown in chat, auto-navigate if action provides a URL
```

---

## Built-in Actions

### Server-Side Actions
These work from any admin page — no need to be on a specific editor page.

| Action | Description |
|--------|-------------|
| `createPost` | Create a post, page, or custom post type entry |
| `updatePost` | Update an existing post by ID |
| `trashPost` | Move a post to trash by ID |
| `updateSettings` | Update site settings (blogname, blogdescription, siteurl, admin_email, posts_per_page) |
| `createForm` | Create a form with specified fields |
| `createPostType` | Register a custom post type |

### Client-Side Actions
These manipulate the current editor page DOM directly.

| Action | Description |
|--------|-------------|
| `setTitle` | Set the post title input |
| `setContent` | Set the block editor content (dispatches `ap:setContent` event) |
| `setExcerpt` | Set the excerpt textarea |
| `setStatus` | Change the publish status select |
| `savePost` | Trigger the save post function |
| `navigate` | Navigate the browser to a URL |

---

## Action Block Format

The AI emits one JSON object per fenced `action` block at the end of its response:

````
```action
{"type":"createPost","postType":"page","title":"About Us","content":"<p>We are...</p>","status":"draft"}
```
````

Multiple blocks are allowed in one response:

````
```action
{"type":"setTitle","value":"New Title"}
```
```action
{"type":"setContent","html":"<h2>Intro</h2><p>Content...</p>"}
```
````

---

## Adding AI Actions from a Plugin

Any plugin can register custom AI actions. The action will appear automatically in the AI system prompt and can be triggered from the chat widget.

### 1. Register the action

```ts
// your-plugin/src/index.ts
import { registerAIAction } from "@astropress/admin/lib/ai-registry";

registerAIAction({
  type: "myPlugin:sendNewsletter",
  description: "Send a newsletter to all subscribers with the given subject and body",
  example: '{"type":"myPlugin:sendNewsletter","subject":"Weekly Update","body":"<p>Hello...</p>"}',
  serverSide: true,
  handler: async (params, db, userId) => {
    // params = the parsed JSON from the action block
    // db = Drizzle database instance
    // userId = current user's ID

    await sendNewsletter(params.subject, params.body);

    return {
      success: true,
      message: `Newsletter "${params.subject}" sent`,
      // Optional: navigate to a page after the action
      navigate: "/admin/newsletter",
      // Optional: extra data (not shown to user)
      data: { recipientCount: 42 },
    };
  },
});
```

### 2. Import in plugins.ts

```ts
// apps/admin/src/plugins.ts
import "./path/to/your-plugin/ai-actions";
```

### 3. Import in execute.ts

The execute endpoint must import your action file so the handler is registered before it's called:

```ts
// apps/admin/src/pages/api/ai/execute.ts (already imports ai-actions.ts)
// If your plugin registers actions separately, also import here:
import "../../../path/to/your-plugin/ai-actions";
```

---

## ActionResult Interface

```ts
interface ActionResult {
  success: boolean;    // Whether the action succeeded
  message: string;     // Human-readable result (shown as chip in chat)
  navigate?: string;   // URL to navigate to after this action (optional)
  data?: Record<string, any>; // Extra data (e.g. { id: 42 }) — not shown to user
}
```

---

## Extending the System Prompt

The system prompt is built dynamically from the registry. Each registered action contributes:

- Its `description` — tells the AI when to use this action
- Its `example` — shows the AI the exact JSON format

The AI sees all registered actions in its system prompt and chooses the right ones based on the user's request.

---

## Context

The widget sends page context with every request:

```ts
{
  currentPage: "/admin/posts/42",
  postId: 42,           // if on a post editor
  postType: "post",     // current post type
  postStatus: "draft",  // current post status
  postTitle: "...",     // current title (from DOM)
  postExcerpt: "...",   // current excerpt (from DOM)
}
```

Add more context by extending `buildContext()` in `AIWidget.tsx`.

---

## ap:setContent Event

When `setContent` is executed client-side, it dispatches a custom DOM event:

```ts
window.dispatchEvent(new CustomEvent("ap:setContent", { detail: { html: "<p>...</p>" } }));
```

`BlockEditor.tsx` listens to this event and calls `parse(html)` to replace the block content. If you build a custom editor island, listen to `ap:setContent` and `ap:editorReady` (dispatch the latter when your editor mounts).

---

## Session Persistence

The AI widget state (messages + open/closed) persists across page navigations via `sessionStorage` under key `ap_ai_widget`. Pending client-side actions (for the next page) are also saved there and executed after the editor signals `ap:editorReady`.

Clear the session by clicking **Clear** in the widget header.

---

## Provider Configuration

Providers are configured at **Settings → AI**. The active provider is stored in `wp_options` as `astropress_ai_settings`. The chat endpoint reads this on every request — no restart needed when switching providers.

Supported providers: Anthropic Claude, OpenAI, Google Gemini, Mistral AI, Groq.
