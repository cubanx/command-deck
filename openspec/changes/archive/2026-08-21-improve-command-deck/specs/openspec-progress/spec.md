## MODIFIED Requirements

### Requirement: Explicit local checkout bridge
The PWA SHALL let a developer grant read-only browser access to multiple organization repository roots and exact per-repository checkout overrides, SHALL persist directory handles and mappings browser-locally across reloads, SHALL revalidate handle permissions before reading, SHALL inspect only repository identity, `.git/HEAD`, and `openspec/changes/*/tasks.md` needed for local evidence, and MUST NOT upload directory handles, paths, file contents, branches, or OpenSpec data to the hosted service.

#### Scenario: Developer connects a checkout
- **WHEN** a supported browser grants a directory handle from a developer action
- **THEN** the client resolves every known repository for that configured GitHub organization by stable repository identity and exact repository directory name and shows explicit resolved or unresolved state for each

#### Scenario: Automatic repository resolution is ambiguous or absent
- **WHEN** the client cannot prove one exact checkout beneath the organization root
- **THEN** it leaves the repository unresolved and does not associate any folder silently

#### Scenario: Developer supplies an exact override
- **WHEN** a developer grants a directory handle for one unresolved repository
- **THEN** the client validates that checkout's stable repository identity before storing the repository-specific override

#### Scenario: Browser reloads configured handles
- **WHEN** persisted directory handles exist after reload
- **THEN** the client revalidates each permission and exposes a permission action or error rather than reading an unauthorized handle

#### Scenario: Browser lacks directory access
- **WHEN** the native directory picker or durable handle storage is unavailable
- **THEN** committed projections remain usable and the configuration screen explains that local checkout access is unsupported

### Requirement: Pull-request-owned OpenSpec evidence
The system SHALL attach local or committed OpenSpec progress to a pull request in the same installation and stable repository identity only by exact head/source commit or one unique head/source branch match, and MUST NOT guess when repository identity or evidence is absent or ambiguous.

#### Scenario: OpenSpec commit matches a pull request head
- **WHEN** an OpenSpec source commit equals one open pull request head commit in the same repository identity
- **THEN** that pull request owns the OpenSpec status and full current unfinished group

#### Scenario: OpenSpec branch has one matching pull request
- **WHEN** no commit matches and exactly one open pull request in the same repository identity has a head branch equal to the OpenSpec source branch
- **THEN** that pull request owns the OpenSpec evidence

#### Scenario: Same branch name exists in multiple repositories
- **WHEN** more than one repository has a pull request or local checkout using the same branch name
- **THEN** each branch match remains scoped to its stable repository identity

#### Scenario: OpenSpec correlation is ambiguous
- **WHEN** repository identity is unverified, more than one pull request in that repository could match, or neither commit nor branch evidence matches
- **THEN** the dashboard does not attach the OpenSpec to any pull request
