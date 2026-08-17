## Context

Bootstrap already obtains both credential types but sends the installation token to `GET /installation`. GitHub requires an App JWT at `GET /app/installations/{installationId}`; repository discovery and repository-scoped reads correctly require the installation token.

## Goals / Non-Goals

**Goals:**
- Use the required credential at each endpoint without widening token scope.
- Preserve existing cache, error sanitization, and approved-account checks.

**Non-Goals:**
- Change token issuance, repository projection, or any provider configuration.

## Decisions

- Pass the existing App JWT into bootstrap and use it only for `GET /app/installations/{installationId}`. This changes the shared root cause without adding another credential wrapper. Passing the installation token remains necessary for repository reads, and `GET /installation` is not used for identity lookup.
- Assert the authorization boundary in the existing GitHub client test. A URL-only mock cannot detect a token regression.

## Risks / Trade-offs

- Incorrect token selection can cause bootstrap failure or broaden authentication scope → test both the identity and repository request authorization headers.

## Migration Plan

Deploy with the normal application release. Roll back by reverting this isolated credential selection change.
