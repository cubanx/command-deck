## Purpose

Ensures installation bootstrap authenticates each GitHub endpoint with the identity type required by GitHub.

## ADDED Requirements

### Requirement: Installation identity authentication
The system SHALL authenticate installation identity lookup only with a GitHub App JWT at `GET /app/installations/{installationId}` and SHALL NOT use `GET /installation` for identity lookup. It SHALL use the resulting installation token only for repository and repository-owned reads.

#### Scenario: Bootstrap an approved installation
- **WHEN** bootstrap looks up an approved installation identity
- **THEN** it sends the App JWT to `GET /app/installations/{installationId}`, does not call `GET /installation`, and uses the installation token for its repository reads
