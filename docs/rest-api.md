# REST API

All API routes are served from `apps/admin` at port 4321. Most routes require an authenticated session cookie. Public routes are noted explicitly.

Base URL (local dev): `http://localhost:4321/api`

---

## Authentication

All requests must include the session cookie set at login. There is no token-based API auth yet.

To log in programmatically:

```
POST /api/auth/login
Content-Type: application/json

{ "username": "admin", "password": "secret" }
```

Response sets a `Set-Cookie` header with the session cookie.

---

## Auth

### `POST /api/auth/login`

**Public.** Authenticate and create a session.

**Body:** `{ username: string, password: string }`

**Response:** `200` with session cookie, or `401` on bad credentials.

---

### `POST /api/auth/logout`

Destroy the current session and clear the session cookie.

---

## Posts

### `GET /api/posts`

List posts with optional filters.

**Query params:**

| Param | Default | Description |
|-------|---------|-------------|
| `type` | `post` | Post type |
| `status` | — | Filter by status (`publish`, `draft`, etc.) |
| `page` | `1` | Page number |

**Response:** `{ posts: Post[], total: number }`

---

### `POST /api/posts`

Create a new post.

**Body:**
```json
{
  "title": "My Post",
  "content": "",
  "status": "draft",
  "type": "post",
  "excerpt": "",
  "slug": "my-post"
}
```

**Response:** `{ id: number }`

---

### `GET /api/posts/:id`

Get a single post by ID.

**Response:** `Post` object.

---

### `PUT /api/posts/:id`

Update a post. Body is the same shape as POST.

---

### `DELETE /api/posts/:id`

Delete a post permanently.

---

### `GET /api/posts/:id/meta`

Get all post meta as a flat object.

**Response:** `{ [key: string]: string }`

---

### `POST /api/posts/:id/meta`

Upsert one or more meta values.

**Body:** `{ [key: string]: string }`

---

## Post Types

### `GET /api/post-types`

List all custom (DB-stored) post types.

**Response:** `PostTypeConfig[]`

---

### `POST /api/post-types`

Create or update a custom post type.

**Body:**
```json
{
  "key": "book",
  "label": "Book",
  "pluralLabel": "Books",
  "icon": "book",
  "public": true,
  "showInRest": true,
  "hierarchical": false,
  "hasArchive": true,
  "excludeFromSearch": false,
  "supports": ["title", "editor", "thumbnail", "custom-fields"]
}
```

---

### `DELETE /api/post-types/:key`

Delete a custom post type by key.

---

## Taxonomies

### `GET /api/taxonomies`

List all custom (DB-stored) taxonomies.

---

### `POST /api/taxonomies`

Create or update a custom taxonomy.

**Body:**
```json
{
  "key": "genre",
  "label": "Genre",
  "pluralLabel": "Genres",
  "hierarchical": false,
  "postTypes": ["book"],
  "public": true,
  "showInRest": true
}
```

---

### `DELETE /api/taxonomies/:key`

Delete a custom taxonomy.

---

## Custom Fields

### `GET /api/custom-fields`

List all field groups.

**Response:** `FieldGroup[]`

---

### `POST /api/custom-fields`

Create a new field group.

**Body:** `FieldGroup` object (see [custom-fields.md](./custom-fields.md)).

---

### `GET /api/custom-fields/:id`

Get a single field group by ID.

---

### `PUT /api/custom-fields/:id`

Update a field group.

---

### `DELETE /api/custom-fields/:id`

Delete a field group.

---

### `GET /api/custom-fields/values?postId=:id`

Get all custom field values for a post, resolved against registered field groups.

**Response:** `{ [fieldKey: string]: string }`

---

## Forms

### `GET /api/forms`

List all forms.

**Response:** `Form[]`

---

### `POST /api/forms`

Create or update a form.

**Body:** `Form` object (see [forms.md](./forms.md)).

---

### `GET /api/forms/:id`

**Public (GET only).** Get a single form config by ID.

**Response:** `Form` object.

---

### `PUT /api/forms/:id`

Update a form.

---

### `DELETE /api/forms/:id`

Delete a form and all its entries.

---

### `GET /api/forms/:id/entries`

Get all entries for a form.

**Query params:**

| Param | Description |
|-------|-------------|
| `status` | Filter by status: `unread`, `read`, `starred`, `spam`, `trash` |
| `page` | Page number |

**Response:** `{ entries: Entry[], total: number }`

---

### `PATCH /api/forms/:id/entries`

Bulk update entry statuses.

**Body:** `{ ids: string[], status: string }`

---

### `POST /api/forms/submit`

**Public.** Submit a form entry.

**Body:**
```json
{
  "formId": "abc123",
  "fields": { "fieldId": "value", ... },
  "honeypot": ""
}
```

**Response:** `{ ok: true }` or `{ error: string }` with 4xx status.

---

## Menus

### `GET /api/menus`

List all navigation menus.

**Response:** `{ id: number, name: string, slug: string }[]`

---

### `POST /api/menus`

Create a menu.

**Body:** `{ name: string }`

**Response:** `{ id: number }`

---

### `PATCH /api/menus/:id`

Rename a menu.

**Body:** `{ name: string }`

---

### `DELETE /api/menus/:id`

Delete a menu and all its items.

---

### `POST /api/menus/:id/items`

Add an item to a menu.

**Body:** `{ url: string, title: string }`

**Response:** `{ id: number }`

---

### `PATCH /api/menus/:id/items`

Bulk reorder menu items.

**Body:** `[{ id: number, menuOrder: number, postParent: number }]`

---

### `PATCH /api/menus/:id/items/:itemId`

Update a single menu item.

**Body:** `{ title?: string, url?: string, menuOrder?: number, postParent?: number }`

---

### `DELETE /api/menus/:id/items/:itemId`

Delete a single menu item.

---

## Media

### `GET /api/media`

List uploaded media files.

**Response:** `{ id: number, title: string, url: string, mimeType: string, date: string }[]`

---

### `POST /api/media/upload`

Upload a media file.

**Body:** `multipart/form-data` with a `file` field.

**Response:** `{ id: number, url: string }`

---

## Setup

### `POST /api/setup`

**Public.** Complete the initial setup wizard.

**Body:**
```json
{
  "blogname": "My Site",
  "siteurl": "http://localhost:4322",
  "adminUser": "admin",
  "adminEmail": "admin@example.com",
  "adminPassword": "secret"
}
```

**Response:** `{ ok: true }` — sets `astropress_setup_complete=1` in options.

---

## Error responses

All endpoints return standard HTTP status codes:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `201` | Created |
| `400` | Bad request (missing or invalid body) |
| `401` | Unauthorized (not logged in) |
| `404` | Not found |
| `500` | Server error |

Error bodies are plain text strings for simplicity.
