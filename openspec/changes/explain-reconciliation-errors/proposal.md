## Why

After PR #22, the supplied production evidence still shows `reconciliation failed Error`. Current main confirms that targeted reconciliation can bypass the earlier installation boundary and reach a coordinator that discards installation and operation context; blanket aggregate suppression also hides unexpected broad failures.

## What Changes

- Emit one single-line JSON diagnostic at the owning reconciliation boundary, identifying installation when known, failing operation/category, and safe provider status when available.
- Preserve failure context across targeted execution, persistence, and bookkeeping; suppress only failures already reported by the owning boundary.
- Keep unchanged resources, recovered requests, and existing expected outcomes out of terminal error logs, retaining failed outcomes and queue recovery for genuine errors.
- Verify actual Bun stderr bytes through subprocess tests, with explicit privacy and duplicate-count assertions. Gate Railway acceptance on later authorization, exact deployed SHA, and fresh natural logs.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `provider-reconciliation`: Extend actionable terminal diagnostics to targeted and unexpected broad failures and require a serialized, privacy-safe log transport contract.

## Impact

Reconciliation coordinator, GitHub reconciliation helpers, server orchestration, focused tests, and OpenSpec evidence. No dependencies, data migration, provider configuration, or external mutation. PR #22 is historical evidence, not the implementation branch for this change.
