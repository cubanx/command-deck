## Why

Installation bootstrap authenticates `GET /installation` with an installation token. GitHub requires the App JWT at `GET /app/installations/{installationId}`, so bootstrap fails before repository projection can begin.

## What Changes

- Authenticate installation identity only at `GET /app/installations/{installationId}` with the GitHub App JWT; do not use `GET /installation`.
- Keep installation tokens scoped to repository and repository-owned reads.
- Add a regression test that verifies the credential boundary.

## Capabilities

### New Capabilities

- `installation-identity`: Authenticate installation identity lookup with the credential GitHub requires while retaining repository-read token scoping.

### Modified Capabilities

None.

## Impact

- `src/github.ts` and `test/github-client.test.ts`
- The MongoDB cutover operational change prerequisite contract
