# Clean-start runbook

Status: procedure for post-merge execution; no reset or deployment has occurred. Use only after the isolated rehearsal and pre-merge validation pass.

## Target and prerequisites

Previously identified target (verify fresh before execution):

- Application: Command Deck, https://command-deck.up.railway.app.
- Railway project: b2fa6e37-274e-46e7-aef5-ef23bfd1b892.
- Railway service: 180978ea-99f3-4e70-831a-6bc1d72612b3.
- Railway environment: a2aa23da-4455-49b4-8014-6866271aee54.
- Atlas organization: Ricksy Business, Inc.; project command-deck, 6a80e314c184ca88f1e6d525.
- Atlas cluster: command-center-ai. Application database: command-center-ai-production.

Record the merged commit, immutable deployment artifact and revision before any reset. Verify project/service/environment and cluster/database through their reviewed routes; names alone are insufficient. Preserve the canonical hosted database guard. Never apply this procedure to Yoda, internal-apps-production, another database, or every database in the cluster.

Read the current mongo-operations.md and railway-operations.md operational references before any provider action. Their identity and authorization gates control execution. A general Mongo shell or read-only connection targeting another application does not grant access here. If an exact scoped reset route is unavailable, stop before resetting; prepare the bounded operation for the authorized operator. Do not obtain ambient credentials or use alternate provider clients.

## Before the cutover

1. Obtain the required bounded authorization for the exact service quiescence/deploy and application data reset. Disclose loss of sessions, preferences, receipts, run history and projections; nothing will be imported.
2. Confirm the new revision passed empty-database initialization, reconnect/reconciliation, authorization, preference and live-update tests. Record test results and the immutable revision.
3. Inventory collection names and aggregate counts only. Establish the exact application collection reset scope and the expected new indexes from the tested revision. Do not inspect or log credentials, webhook bodies, tokens or user documents.
4. Confirm operational ability to quiesce every old service replica and worker. Prevent intake acknowledgement during the gap; unavailable requests must not be acknowledged as durably stored.

## Cutover sequence

1. Enter maintenance and stop old writers/intake. Verify no old replica is processing or acknowledging deliveries; record gap start.
2. Execute the approved reset only against the named application database/collections. Remove old application indexes with the old collections so the revised TTL options cannot conflict. Verify empty application state using counts.
3. Deploy the verified new revision and initialize the new collections/indexes. Keep traffic unavailable if initialization/readiness fails. Confirm the running artifact provenance, readiness and canonical database identity.
4. Resume intake and record gap end. Sign in again and reconnect approved installations through the normal verified GitHub flow; do not seed bindings manually.
5. Run canonical reconciliation. Confirm success per installation and retain sanitized run IDs/timings. Run a follow-up reconciliation to cover the intake gap and concurrent source changes. Do not assume GitHub automatically retries failed deliveries.

## Acceptance evidence

- Check representative open PR identities, title/head state and current check/review evidence against GitHub.
- Verify at least one older merged PR with unfinished OpenSpec obligations is reconstructed, its original merge evidence is retained, and current progress has an exact default-branch source commit.
- Verify no unassociated OpenSpecs or notification controls are displayed.
- Verify shared repository data is stored once and bindings restrict each authenticated read. Exercise removal/revocation only through a separately approved test identity/scope if production permission changes would be required.
- Save repository selection and sorting; reload and verify another authenticated session restores them.
- With an authorized PR title edit, record GitHub event time, received/start/completion times, live refresh arrival and visible card change. Verify browser reload is unnecessary. Report queue versus processing delay separately.
- Measure snapshot stages and response size; compare like-for-like requests. Do not present local loopback timings as the production baseline.
- Verify completed-only receipt TTL is 259200 seconds and completed-run retention is 259200 seconds. Observe eligible cleanup and protected incomplete/rejected records using metadata/counts only; TTL expiry is asynchronous.
- Record exact SHA, deployment, timestamps, run outcomes and unresolved limitations in implementation-evidence.md. Only then complete group 8.

## Failure handling

Before reset, stop if identity, authorization, writer quiescence or artifact proof fails. After reset, keep maintenance/readiness failure visible and roll forward with an authorized fix. No data migration or dual writer is permitted. Restoring an old runtime requires an explicitly approved empty rebuild with the old schema; never point it at the new model. Deleted application history and preferences are not recoverable by code rollback.
