# repository-identity-transition Specification

## Purpose

Defines the durable identity boundary for Command Deck.ai, allowing a controlled `command-deck` repository and infrastructure transition without changing protected Mongo or historical identities.

## Requirements

### Requirement: Local canonical identity is classification-first
The local repository SHALL use `command-deck` for repository-derived fixtures, scaffold, package, container, and CI identity. User-facing product text SHALL retain `Command Deck.ai`; only stale documentation titles using `Command Center.ai` SHALL be corrected.

#### Scenario: Local canonicalization
- **WHEN** the local identity tasks are applied
- **THEN** repository-derived references use `command-deck` and protected Mongo identifiers remain unchanged

### Requirement: Protected identities and evidence remain intact
The change SHALL NOT rename `command-center-ai-production`, `command-center-ai-test-*`, Mongo users, Mongo credentials, provider IDs, archived OpenSpec evidence, or existing worktree paths.

#### Scenario: Exact-name review
- **WHEN** local canonicalization is reviewed
- **THEN** every remaining legacy name is classified as protected, historical, operational evidence, or an active reference requiring follow-up

### Requirement: External continuity is explicitly gated
GitHub, Railway, Atlas, 1Password metadata, and Codex continuity tasks SHALL remain in the overall change but SHALL NOT execute without their recorded review, current-state or exact-SHA evidence, and task-scoped authorization. User-reported external actions SHALL remain unchecked until independently evidenced.

#### Scenario: Authorization is absent
- **WHEN** local preparation completes without external authorization
- **THEN** no GitHub, Railway, Atlas, 1Password, Codex, credential, deployment, or provider mutation is performed

### Requirement: Railway source changes preserve recovery
Before an authorized Railway source relink, the change SHALL record current source, service, domain, public URL, and GitHub App configuration evidence. The authorized change SHALL verify exact-SHA deployment, readiness, webhook continuity, and rollback to the prior source binding.

#### Scenario: Railway continuity fails
- **WHEN** an authorized Railway verification fails
- **THEN** the prior source binding is restored and the rollback result is recorded before final acceptance
