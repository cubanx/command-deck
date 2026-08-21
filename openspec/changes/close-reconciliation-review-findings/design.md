## Context

See proposal.md. Only scheduled reconciliation currently records safe failure evidence; direct repair and OAuth bootstrap bypass that persistence. The new reconciliation catch also logs the raw thrown object.

## Goals / Non-Goals

**Goals:**

- Give every failed bootstrap entry point the same generic stale state and bounded evidence record.
- Keep provider-controlled text out of stored evidence, responses, and logs.

**Non-Goals:**

- New diagnostics APIs, raw provider logging, retry-policy changes, or broader error-handling cleanup.

## Decisions

- Extract the existing per-owner failure mutation into one helper in `src/github.ts`; direct bootstrap routes call it for returned errors and normalized caught exceptions.
- Reuse `ReadResult` operation, summary, repository, and status metadata for evidence; normalize thrown exceptions to fixed classifications.
- Log only a fixed `Error` or `unknown` classification plus installation and operation context. Do not log provider messages, names, stacks, or objects.
- Extend the existing reconciliation, repair, and failed OAuth bootstrap tests rather than creating a new harness.

## Risks / Trade-offs

- [A new bootstrap caller omits persistence] → Keep the mutation helper adjacent to `bootstrapInstallation` and cover all current entry points.
- [Less raw log detail slows incident triage] → Retain safe operation, status, and bounded evidence that survive restart.
