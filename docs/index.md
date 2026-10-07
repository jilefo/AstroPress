# AstroPress Documentation

## Getting started

- [Getting Started](./getting-started.md) — Install, set up the DB, run dev servers
- [Architecture](./architecture.md) — Monorepo structure, tech stack, request lifecycle, database schema

## Content

- [Custom Post Types](./custom-post-types.md) — Create via UI or plugin, query with `queryPosts`
- [Custom Fields](./custom-fields.md) — ACF-style field groups, all field types, reading with `getField`
- [Forms](./forms.md) — Form builder, embedding in posts, entries management, submission API
- [Menus](./menus.md) — Navigation menus, drag-and-drop editor, rendering in themes

## Developer APIs

- [Query API](./query-api.md) — Complete reference for `@astropress/core/query` (queryPosts, getField, getTerms …)
- [REST API](./rest-api.md) — All HTTP endpoints for posts, forms, menus, media, etc.
- [Plugin API](./plugin-api.md) — Building and loading plugins, registering post types / panels
- [Theme API](./theme-api.md) — Creating themes, CSS variables, built-in classes
- [Icons](./icons.md) — SVG icon pack reference, usage, adding new icons

## Operations

- [Deployment](./deployment.md) — Cloudflare D1 + Pages + R2, CI/CD with GitHub Actions
