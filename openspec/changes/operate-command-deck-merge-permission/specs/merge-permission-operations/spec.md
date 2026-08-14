## Purpose

Controls the separately authorized post-merge rollout and proof of the GitHub App permission required by Command Deck's guarded Merge control.

## ADDED Requirements

### Requirement: Exact prerequisite gate
Execution SHALL remain blocked until intended PR #8 is merged, its exact merge SHA is verified as an ancestor of current `main`, and that exact code is deployed and healthy.

#### Scenario: Prerequisite is absent
- **WHEN** PR #8 is unmerged, its merge SHA is unknown or absent from current `main`, or deployed health does not prove that code revision
- **THEN** no provider, permission, installation, production, or merge operation proceeds

### Requirement: Minimum permission rollout
The operation SHALL prove the minimum GitHub App permission required by the implemented merge API path, SHALL prefer Pull requests write, SHALL not request Contents write when Pull requests write is sufficient, and SHALL apply the approved change only to the intended allowlisted installation accounts.

#### Scenario: Narrow permission is proven
- **WHEN** redacted preflight evidence shows the implemented exact-head merge path requires only Pull requests write
- **THEN** the reviewed permission request excludes Contents write

#### Scenario: Permission evidence is ambiguous
- **WHEN** the required permission cannot be proven or differs from the reviewed plan
- **THEN** execution stops for a new user decision without broadening access

### Requirement: Separately authorized installation approvals
Each GitHub App permission change and each intended installation-account approval SHALL require explicit task-scoped authorization and SHALL preserve the existing installation account allowlist and user isolation.

#### Scenario: Installation approval is missing
- **WHEN** an intended installation has not approved the updated permission
- **THEN** its Merge controls remain unavailable and no alternate credential is used

### Requirement: Production verification and safe proof
After authorized deployment and configuration verification, the operation SHALL perform at most one explicitly authorized safe merge proof whose repository, pull request, exact head SHA, merge method, user authority, protections, checks, reviews, and completed OpenSpec evidence were captured immediately before action.

#### Scenario: Safe proof passes
- **WHEN** every gate is current and the user separately authorizes the named merge
- **THEN** one exact-head merge-commit request is executed and redacted success plus refreshed state is captured

#### Scenario: Any proof gate fails
- **WHEN** any identity, authorization, repository, head, policy, deployment, or health gate is absent or stale
- **THEN** no merge is attempted and the failed gate is recorded without secrets

### Requirement: Rollback, repair, and redacted validation
The operation SHALL capture rollback or repair steps for permission, installation approval, deployment/configuration, and application failure, and SHALL strictly validate a redacted evidence packet without credential values or sensitive provider payloads.

#### Scenario: Rollback is required
- **WHEN** the rollout or proof exposes a security, authorization, or functional failure
- **THEN** the operator disables the Merge capability or reverts the permission/configuration as authorized and records restored safe behavior
