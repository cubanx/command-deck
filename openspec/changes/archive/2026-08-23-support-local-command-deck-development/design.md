## Context

See `proposal.md` for motivation. The current production-only public-origin validation leaves real local OAuth without a callback origin and sends a `Secure` cookie over loopback HTTP. GitHub reads are spread across OAuth, merge, webhook, repair, and reconciliation paths, while Bun's default idle timeout is shorter than a legitimate serial reconciliation. Local configuration currently documents `.env` rather than loading the approved 1Password Environment through its runtime schema.

## Goals / Non-Goals

**Goals:**

- Make real local OAuth work only at an explicit loopback HTTP origin without weakening the hosted HTTPS/Railway boundary.
- Bound all server-side GitHub reads, retain reconciliation recovery, and let legitimate serial work outlive Bun's default idle timeout.
- Make the local configuration contract machine-checkable while preserving the existing 1Password Environment and canonical items as the only secret authority.
- Restore a green canonical validation path and make the existing configuration-menu caret easy to see.

**Non-Goals:**

- Creating or rotating GitHub, Railway, MongoDB, or 1Password credentials.
- Supporting arbitrary HTTP origins, tunnels, a local `.env` secret workflow, desktop/human 1Password authentication, duplicate credential values in the Environment, or additional individual secret references.
- Replacing the existing native configuration menu, changing active merge-permission OpenSpec behavior, or changing provider retry policy.

## Decisions

### Loopback OAuth is explicit and fail-closed

Non-production accepts an explicit `PUBLIC_URL` only when it is a pathless, credential-free loopback HTTP origin. That origin supplies both the GitHub callback and post-callback redirect, and it is the sole condition that omits `Secure` from the HTTP-only, `SameSite=Lax` session cookie. Production continues to require the validated HTTPS Railway origin. This makes local behavior observable and avoids permitting an arbitrary cleartext callback; accepting all development HTTP origins would be simpler but unsafe.

### One native request boundary bounds GitHub work

A shared GitHub fetch wrapper combines any caller cancellation signal with native `AbortSignal.timeout` and emits a fixed, sanitized timeout error containing only the request method and URL. Every OAuth, merge, installation-token, webhook, repair, bootstrap, and reconciliation call uses that boundary. Existing response-based retry and stale-projection behavior remains unchanged; a timeout follows the existing failure path and clears the in-process reconciliation promise. A wrapper per caller would drift and miss paths.

Bun receives its maximum 255-second idle window so serial reconciliation can complete, while each provider request remains independently bounded. Disabling the idle timeout would conceal hung application work; relying only on the server default terminates otherwise healthy serial work.

### Closest ordering uses the oldest available PR number

Closest-to-merge ordering compares blocker count ascending, valid OpenSpec progress descending, pull-request number ascending, then repository identity as the final deterministic fallback. A cross-repository pull-request number is an accepted approximation of age: the dashboard does not add or persist `created_at` solely for this tie-break. That is the smallest deterministic ordering available from current projections; a true cross-repository creation-time order can be added only if it becomes a demonstrated product need.

### Varlock is the unattended 1Password Environment loader

Replace `.env.example` with `.env.schema` as the checked-in declaration of required and optional variables. The schema installs `@varlock/1password-plugin`, marks ambient `OP_SERVICE_ACCOUNT_TOKEN` as `opServiceAccountToken`, sensitive, and internal, then bulk-loads only non-credential values through `@setValuesBulk(opLoadEnvironment(axpdch34cfdzlzyaziox2dvopy), omit=[GITHUB_CLIENT_ID,GITHUB_CLIENT_SECRET,GITHUB_APP_ID,GITHUB_APP_PRIVATE_KEY])` for `dev-command-center-local-development`. It resolves those four omitted values from exactly their canonical Automation item references. Varlock becomes the runtime loader and runs child commands with `varlock run` under the existing Local Automation service-account environment.

No `.env` file is created, raw values are never emitted, and the schema permits only those four individual `op://` references, with no desktop/human authentication or alternate loader. The 1Password Environment remains authority for non-credential configuration and its canonical items remain authority for credentials; the plugin is only their runtime projection. Direct `op run` wrapping would duplicate the loader and retain two environment-loading paths.

### Preserve the native configuration menu and repair quality debt precisely

Increase the existing `details`/`summary` avatar-menu caret to `1rem` in CSS rather than replacing native menu behavior. Add a focused source/UI assertion for the caret. Repair Biome's explicit-`any` findings with the existing precise data types instead of broad suppressions, and align stale logging tests with the current visible sanitized diagnostic representation. This keeps the quality gate meaningful rather than masking it.

## Risks / Trade-offs

- [A local callback origin is rejected unexpectedly] → Accept only documented loopback forms and test the accepted callback and cookie behavior.
- [A provider timeout makes a transient failure visible] → Preserve projections, retain existing retries, and allow the next reconciliation to acquire the released lock.
- [Schema tooling could become a second secret path] → Bulk-load only non-credential configuration, use exactly four canonical credential references, mark the ambient service-account token internal, and prohibit desktop authentication.
- [Cross-repository PR numbers are only an age approximation] → Use number ascending as the accepted closest available proxy and repository identity as a deterministic final fallback without persisting creation timestamps.
- [Biome repairs widen scope] → Replace only identified `any` sites with existing types and add no suppressions or unrelated formatting churn.

## Migration Plan

1. Add the loopback origin contract, bounded request path, idle window, schema, scan, caret, and quality repairs with focused tests.
2. Update local development documentation to use `varlock run` with ambient Local Automation authentication and validate with Varlock.
3. Deploy hosted code without changing hosted variable values; production validation remains HTTPS/Railway-only.
4. Roll back by reverting the change. Hosted cookies and origins revert together; no credentials, provider settings, persisted data, or local secret files require migration.
