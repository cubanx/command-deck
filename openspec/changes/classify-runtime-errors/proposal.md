## Why

Healthy Command Deck deployments currently report expected or recoverable runtime outcomes beside genuine application failures, while broad reconciliation errors omit the provider context needed to act. This obscures real incidents and makes harmless stale push paths and signed-out dashboard loads look equally severe.

## What Changes

- Treat a push task path missing from the webhook's final SHA as an expected stale artifact only when a bounded GitHub read positively proves absence; preserve prior evidence and fail closed on ambiguous 404s or other provider failures.
- Preserve provider retry behavior while reporting terminal reconciliation failures once with the installation, operation, status when available, and sanitized diagnostic.
- Keep unauthenticated `/api/snapshot` responses at 401, keep the client to one request, render the signed-out state, and avoid logging that expected outcome as an application error.
- Add focused regression coverage for expected classifications and genuine failure paths without adding dependencies or changing external systems.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `event-projections`: Distinguish positively proven final-SHA task absence from ambiguous GitHub projection failures without inferring deletion.
- `provider-reconciliation`: Require actionable sanitized context on terminal installation reconciliation failures while preserving bounded provider retries.
- `command-center-dashboard`: Treat a single unauthenticated snapshot response as the signed-out state rather than a client application error.

## Impact

Affected areas are GitHub push projection, GitHub installation reconciliation, dashboard snapshot loading, their logs/evidence, and focused Bun tests. Authentication boundaries, webhook retry durability, provider authorization, dependencies, deployment configuration, and external systems remain unchanged.
