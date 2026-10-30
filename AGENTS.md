# Command Deck.ai

A Bun and TypeScript service that projects signed GitHub activity into a developer dashboard.

## Repository guidance

- Use the repository's CodeGraph workflow first for structural code lookup.
- Read `.mex/ROUTER.md` for curated architecture, conventions, decisions, setup, and recurring task knowledge.
- Keep provider credentials, production operations, and deployment mutations outside ordinary repository work.

## Commands

- Dev: `bun run dev`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Pre-push validation: `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`

## Commit Messages

Use [Standard Commits](https://github.com/standard-commits/standard-commits)
for future commits. The upstream specification is authoritative for verbs,
importance, reasons, syntax, summaries, bodies, and footers. This repository
defines only the scope vocabulary below.

Before composing a message, read the upstream specification, including its
compliance details. Choose the verb by its expectation semantics and the scope
by the logical area changed. Follow upstream rules for omitted fields and any
required body or footer metadata; review the complete message against upstream
before committing.

| Scope | Meaning |
| --- | --- |
| `github` | GitHub ingestion, reconciliation, and activity projections. |
| `dashboard` | Dashboard views, interactions, and live updates. |
| `auth` | Sign-in, identity bindings, and access control. |
| `docs` | Contributor guidance, runbooks, and design documentation. |
| `test` | Test suites and fixtures. |
| `ci` | Continuous integration checks and workflows. |
| `cd` | Service delivery and release automation. |

Examples:

```text
fix(github)[rel]: ignore duplicate webhook deliveries
ref(dashboard)[mnt]: consolidate lifecycle stage labels
add(test)[rel]: stale projection regression coverage
```
