# Contributing to AstroPress

Thanks for your interest! Here's how to get set up.

## Local Setup

```bash
git clone https://github.com/jilefo/AstroPress
cd astropress
pnpm install
cp .env.example .env          # fill in values
npx wrangler d1 create astropress
npx wrangler d1 migrations apply astropress --local
pnpm dev
```

## Branch Strategy

- `main` — stable, deployable
- `develop` — active development, open PRs against this branch

## PR Checklist

- [ ] TypeScript compiles (`pnpm typecheck`)
- [ ] No new `any` escapes in `packages/core`
- [ ] New features include a brief description in the PR body
- [ ] Migrations added for schema changes (`pnpm db:generate`)

## Issue Labels

| Label | Meaning |
|-------|---------|
| `phase/1` – `phase/6` | Which phase this relates to |
| `good first issue` | Small, well-defined, beginner-friendly |
| `plugin` | Plugin system or plugin authoring |
| `theme` | Theme system or default theme |

## Plugin Development

See [docs/plugin-api.md](docs/plugin-api.md).
