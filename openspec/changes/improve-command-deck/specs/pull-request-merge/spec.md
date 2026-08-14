## Purpose

Provides a least-privilege per-pull-request merge action that preserves user authorization, repository policy, OpenSpec completion, and exact-head safety.

## ADDED Requirements

### Requirement: Merge availability is explicit and fail-closed
Each pull-request card SHALL expose a Merge control and SHALL leave it visibly unavailable with an accessible reason unless the current GitHub App installation permission and projected pull-request state can support a guarded merge.

#### Scenario: Installation remains read-only
- **WHEN** the installation lacks the required pull-request write permission
- **THEN** the Merge control is disabled and explains that installation permission approval is still required

#### Scenario: Projected state is ineligible
- **WHEN** the pull request is closed, draft, stale, incomplete under OpenSpec policy, or visibly blocked by mergeability, checks, reviews, or protection state
- **THEN** the control is unavailable with the applicable non-sensitive reason

### Requirement: Signed-in user authority is verified before installation authority
The system SHALL immediately verify that the signed-in GitHub user has a current repository role permitted to merge the exact repository before obtaining or using installation authority, SHALL preserve installation account allowlisting and user binding, and SHALL fail closed without persisting a broad user token.

#### Scenario: User lacks merge authority
- **WHEN** current GitHub authorization shows that the signed-in user cannot merge the repository
- **THEN** the system refuses before using installation authority and returns a sanitized permission result

#### Scenario: Repository is outside the user's installation binding
- **WHEN** the requested repository is not in an approved installation bound to the signed-in user
- **THEN** the system returns not found and performs no merge request

### Requirement: Action-time merge eligibility is authoritative
Immediately before confirmation and again before mutation, the system SHALL re-fetch and validate repository identity, pull-request number, open state, draft state, exact head SHA, mergeability, allowed merge method, branch protections or rulesets, required checks, required reviews, and the existing OpenSpec completion policy.

#### Scenario: Head changes during confirmation
- **WHEN** the authoritative head SHA differs from the confirmed head SHA
- **THEN** the system refuses the merge as stale and refreshes the card

#### Scenario: Protection requirement is unmet
- **WHEN** any authoritative required check, review, protection, ruleset, or OpenSpec completion gate is unmet or indeterminate
- **THEN** the system refuses the merge and exposes a sanitized blocked reason

### Requirement: Confirmed exact-head merge uses repository convention
The system SHALL require an action-time confirmation naming repository, pull-request number and title, exact head SHA, and merge method, then SHALL request GitHub's `MERGE` method with the confirmed expected head OID only when current repository settings still allow the repository's established merge-commit convention.

#### Scenario: Developer confirms an eligible merge
- **WHEN** the developer confirms the exact eligible pull request and all gates remain satisfied
- **THEN** the system sends one merge mutation with `mergeMethod: MERGE` and `expectedHeadOid` equal to the confirmed head SHA

#### Scenario: Merge method becomes unavailable
- **WHEN** current repository settings no longer allow merge commits
- **THEN** the system refuses and requires a reviewed product decision rather than selecting another method

### Requirement: Merge outcomes are sanitized and refreshed
The system SHALL distinguish success, exact-head conflict, protected-branch refusal, permission absence, and stale projection without exposing credentials or raw provider diagnostics, and SHALL immediately refresh authoritative dashboard state after every outcome.

#### Scenario: Merge succeeds
- **WHEN** GitHub accepts the exact-head merge
- **THEN** the card reports success and refreshes so the merged pull request is no longer shown as open

#### Scenario: GitHub refuses the merge
- **WHEN** GitHub reports a conflict, protection refusal, permission absence, or stale head
- **THEN** the card reports the sanitized category and refreshes its current state
