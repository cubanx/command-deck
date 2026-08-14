## Context

This is a post-merge operational change. PR #8 will contain the disabled-by-default Merge control and guarded code path, but the current GitHub App installations have read-only permissions. GitHub's GraphQL mutation supports exact-head and explicit merge-method inputs, while GitHub instructs App authors to test GraphQL operations to determine required permissions. No operation here is authorized by the presence of this artifact.

## Goals / Non-Goals

**Goals:**

- Prove and roll out only the permission the PR #8 implementation actually requires.
- Preserve the installation allowlist, signed-in user authority, exact-head safety, repository rules, and a recoverable disabled state.
- Capture a redacted, strictly validated evidence packet for one explicitly authorized safe proof.

**Non-Goals:**

- Any code change or second pull request.
- Contents write, new installation accounts, broad user tokens, policy bypass, auto-merge, or merge-queue behavior.
- Treating proposal approval as provider, deployment, production, or merge authorization.

## Decisions

### Gate on exact PR #8 provenance and deployment

Record the PR number, exact merge SHA, current `main` ancestry, deployed revision, and health evidence before any provider mutation. A green generic health endpoint without revision evidence is insufficient.

### Prove Pull requests write before requesting it

Use the implemented GraphQL operation and a non-mutating permission preflight or explicitly authorized controlled proof to show that Pull requests write is sufficient. Do not request Contents write. If GitHub reports a different permission requirement, stop for a revised design and user decision.

### Separate every external authorization boundary

The GitHub App permission edit, each intended installation approval, deployment/configuration change, and the named safe merge proof are distinct mutations and require fresh task-scoped authorization. Approval does not transfer between steps or accounts.

### Keep rollback primarily application-controlled

The fastest rollback is disabling the Merge capability while retaining read behavior. If permission removal or installation repair is required, perform it only with separate authorization and verify the control returns to an explicit unavailable state.

## Risks / Trade-offs

- [GitHub permission mapping differs from the expected narrow path] → Stop before editing App permissions; never substitute Contents write automatically.
- [Some installation owners delay approval] → Leave those installations read-only and visibly disabled.
- [A safe proof target changes head or policy] → Abort on exact-head or policy drift and require a newly reviewed target.
- [Rollback permission removal disrupts approved installations] → Disable the application action first, then plan authorized provider rollback with account-by-account evidence.

## Migration Plan

1. Verify PR #8 exact merge SHA on current `main`, deployed revision, health, and disabled control behavior.
2. Prove the minimum permission and obtain approval for the GitHub App change.
3. Obtain updated-permission approval for each intended allowlisted installation.
4. Verify production configuration and guarded availability without merging.
5. Capture fresh target/user/head/policy/OpenSpec evidence and request separate authorization for one safe merge proof.
6. Validate redacted evidence and rollback/repair instructions. Disable the action and perform separately authorized repair if any gate fails.
