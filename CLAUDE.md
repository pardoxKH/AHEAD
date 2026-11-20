# Ahead: engineering guide

Ahead is a personal executive assistant for one user (Tariq): it reads his personal Gmail and Google
Calendar, turns asks into task trees, plans them as blocks on its own "Ahead" calendar, and drafts
follow-ups he sends himself. Design: see `docs/README.md`.

## Hard rules

- Never send email. Gmail is read, and drafts are created or updated; nothing else (ADR 0002).
- Never write to a calendar other than the one Ahead created.
- Never store or log email bodies. Keep the extracted item, a snippet of at most 300 characters, and the Gmail link.
- Secrets come from environment variables only. Never commit `.env` files or keys.
- The planner (`packages/core`) is pure: no network, no database, no clock reads (pass `now` in).

## Layout

- `apps/web` Next.js app; `apps/worker` background jobs (pg-boss)
- `packages/core` domain types, task-tree rules, planner
- `packages/db` Drizzle schema and migrations
- `packages/google` Gmail, Calendar, Docs wrappers and OAuth
- `packages/ai` prompts, schemas, Claude client, evals

## Working here

- `pnpm install`, then `pnpm check` runs lint, format, type check and tests. It must pass before a PR.
- Tests live next to the code (`*.test.ts`). Database tests use `DATABASE_URL` (CI provides Postgres 16).
- Imports inside a package use `.js` suffixes (NodeNext). Packages are consumed as TypeScript source.
- Small PRs: one issue, one purpose, ideally under 400 changed lines. Fill in the PR template.
- Times are stored as UTC `timestamptz`; the user's time zone (default Asia/Riyadh, Sunday to Thursday week) is applied only when displaying or planning.
