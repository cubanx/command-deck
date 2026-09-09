## Context

See proposal.md. Base is PR23 merge 97c1d055b76a69c7201644e43c92450e4f24289a. Existing stage wrappers discard exception details before the shared logger.

## Goals / Non-Goals

Goals: retain safe diagnostic identity across persistence and stage boundaries, and remove raw drain messages.
Non-goals: prove the production cause, change retries or serialization, or change provider state outside reviewed authorization.

## Decisions

Reuse the existing JSON logger. Map recognized driver names and exact locally authored aggregate errors to a finite classification; omit raw names/messages. Unknown or unreadable exceptions become unknown. Validate codes as nonnegative 32-bit integers, status as integer HTTP status, and PR targets as numeric repository/PR identifiers. Preserve only sanitized details in stage wrappers. Keep separate error owners and unchanged result semantics. Broad installation diagnostics remain under their existing ownership.

## Risks / Trade-offs

Unrecognized driver classes remain unknown; safe numeric codes still help investigation. Classification describes an observed error shape, not proof of production root cause. No runtime remediation is attempted.

## Migration Plan

Publish through a reviewed PR. After merge, inspect existing successful deployment provenance and bounded natural logs via reviewed safe reads. Any actual deployment action requires its applicable authorization route. Retain the change as incomplete until hosted receipt is evidenced.
