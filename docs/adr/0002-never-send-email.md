# ADR 0002: Ahead never sends email

Status: accepted, 2026-11-20

## Context

Tariq asked that Ahead draft communications and never send them. Google has no Gmail scope that
allows creating drafts without also allowing sending: `gmail.compose` permits both.

## Decision

The rule is enforced in code, not only by policy:

1. Only `packages/google` talks to the Gmail API, through a wrapper that exposes reading and
   `drafts.create` / `drafts.update`, nothing else.
2. An ESLint rule (`eslint.config.js`) rejects any `messages.send` or `drafts.send` call anywhere.
3. `tests/never-send.test.ts` proves the lint rule still catches those calls; CI fails if it stops.

The Daily Brief is sent to Tariq through Resend, so Gmail never needs to send anything.
