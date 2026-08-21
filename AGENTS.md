# Command Center.ai

A Bun and TypeScript service that projects signed GitHub activity and committed OpenSpec progress into a developer dashboard.

## Repository guidance

- Use the repository's CodeGraph workflow first for structural code lookup.
- Read `.mex/ROUTER.md` for curated architecture, conventions, decisions, setup, and recurring task knowledge.
- Keep provider credentials, production operations, and deployment mutations outside ordinary repository work.

## Commands

- Dev: `bun run dev`
- Typecheck: `bun run typecheck`
- Test: `bun test`
- Pre-push validation: `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all`
- OpenSpec: `openspec validate <change> --strict`
