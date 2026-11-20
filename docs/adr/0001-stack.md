# ADR 0001: Stack

Status: accepted, 2026-11-20

## Decision

- TypeScript (strict) everywhere, pnpm workspaces.
- `apps/web`: Next.js (App Router). `apps/worker`: Node process running pg-boss jobs.
- Postgres 16 with Drizzle ORM and migrations.
- Hosting on Railway (web, worker, Postgres in one project).
- Anthropic API: Claude Haiku 5.5 for triage, Claude Opus 5.5 for extraction and task trees.
- Brief email through Resend, never through Gmail.
- Vitest for tests; GitHub Actions for CI.

## Why

One language for web, worker and shared domain code; one database that also holds the job queue;
one hosting bill that fits the $50 a month budget. See the technical design doc for detail.
