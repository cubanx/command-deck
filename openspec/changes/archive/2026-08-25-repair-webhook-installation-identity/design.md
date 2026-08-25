## Context

Webhook intake currently derives approval only from `installation.account.login` in the event body. GitHub's PR #186 close delivery supplied a stable installation ID but omitted that nested account object, so intake returned success to GitHub while skipping persistence. Existing user projections already bind installation IDs to approved accounts, and downstream projection retains installation/account consistency checks.

## Goals / Non-Goals

**Goals:**

- Resolve a missing payload account through an existing approved installation binding.
- Preserve fail-closed behavior for unknown, ambiguous, and inconsistent installation identity.
- Keep retry, projection, and SSE behavior unchanged after persistence.

**Non-Goals:**

- Changing GitHub response semantics, retry timing, reconciliation cadence, or browser refresh behavior.
- Adding a new identity store, dependency, or configuration surface.

## Decisions

### Resolve the existing binding at the shared intake boundary

When a payload contains `installation.account.login`, intake continues validating it against the allowlist. When it does not, intake looks up user projections containing the installation ID, normalizes the approved bound account logins, and accepts only when they resolve to one account identity. Multiple users may share that identity and continue receiving the existing projection fan-out.

This uses the durable identity already maintained by reconciliation and fixes every webhook family routed through the shared intake function. Trusting the installation ID without a binding would weaken the boundary; special-casing pull requests would leave sibling events broken.

### Preserve downstream consistency validation

The resolved account is stored with the inbox delivery so the existing projection checks remain authoritative. No new projection branch or fallback is introduced.

## Risks / Trade-offs

- [Conflicting bindings could misidentify an installation] → Require exactly one normalized approved account identity and reject distinct approved accounts.
- [The lookup adds one intake read] → Use the existing installation-ID field and keep the query scoped to a single matching binding; webhook volume does not justify caching.

## Migration Plan

Deploy the backward-compatible intake change normally. Roll back the code if acceptance errors appear; reconciliation remains the repair backstop for missed deliveries.
