## Purpose

Makes source changes mechanically consistent, complexity-visible, locally reproducible, and reviewable before they can pass repository CI.

## ADDED Requirements

### Requirement: Verified portable quality baseline
The repository SHALL adopt the current portable Quality CI checks from the authoritative Internal Apps repository, including Biome and CrapTS, SHALL pin the selected tool versions, and SHALL document the verified source revision plus every intentional omission or deviation. It MUST NOT copy product-specific, generated-code, deployment, or provider checks that do not apply to this repository.

#### Scenario: Quality baseline is selected
- **WHEN** the quality configuration is introduced or materially revised
- **THEN** the repository records the verified Internal Apps source revision, portable checks, pinned versions, applicable exclusions, and reason for each deviation

### Requirement: One reproducible quality gate
The repository SHALL expose one documented canonical `validate:all` command backed by a shared ordered command list that covers formatting verification, linting, CrapTS quality analysis, TypeScript typechecking, and the repository test suite. Local validation SHALL run that list sequentially, CI SHALL run the exact same constituents in parallel from a clean checkout, and one stable final job named `Validate All` SHALL aggregate their results without rerunning the sequential bundle.

#### Scenario: Contributor validates a change locally
- **WHEN** a contributor runs the documented quality command with repository-declared prerequisites available
- **THEN** the same source-quality, type, and behavioral checks required by CI execute without relying on editor state or undeclared global tools

#### Scenario: CI validates a change
- **WHEN** Quality CI runs from a clean checkout
- **THEN** it executes every shared validation command in parallel where independent and reports their combined result through the `Validate All` job

#### Scenario: Local and CI validation drift
- **WHEN** the CI command set differs from the shared validation command list or invokes the sequential `validate:all` bundle
- **THEN** a focused contract test fails with actionable diagnostics

#### Scenario: A quality check fails
- **WHEN** formatting, linting, CrapTS, typechecking, or tests fail
- **THEN** the quality command and CI fail visibly with actionable diagnostics

### Requirement: Quality rules cannot be bypassed silently
Generated, vendored, binary, and license-governed assets SHALL use explicit narrow exclusions, while authored source MUST NOT use blanket ignores, broad suppressions, or lowered thresholds merely to make the initial gate pass.

#### Scenario: Existing source violates the adopted baseline
- **WHEN** an authored file fails an applicable quality rule
- **THEN** the implementation reformats or simplifies the source, or records one narrow justified exception with a removal condition

### Requirement: Browser shell source is reviewable
Authored browser HTML, CSS, JavaScript, manifest, and service-worker source SHALL live in dedicated source files rather than executable string literals inside the HTTP server module, while preserving the existing public routes, cache boundaries, installability, and authentication isolation.

#### Scenario: Reviewer inspects browser behavior
- **WHEN** a reviewer opens the browser-shell source
- **THEN** markup, styles, client behavior, manifest, and service-worker behavior are readable in their dedicated files without decoding server string literals

#### Scenario: Extracted shell is served
- **WHEN** the application serves the separated browser assets
- **THEN** existing public asset paths and cache headers remain compatible and authenticated API, SSE, OAuth, and webhook responses remain outside service-worker caching

### Requirement: Refactoring preserves behavior
Mechanical formatting, file extraction, and complexity reduction SHALL preserve GitHub authorization, installation scoping, webhook verification, projection ordering, OpenSpec semantics, browser-local privacy, and existing HTTP behavior, with focused regression tests covering every moved boundary.

#### Scenario: Quality refactor completes
- **WHEN** source is formatted, extracted, or split to satisfy the quality gate
- **THEN** existing and focused behavioral tests pass without weakening security or product requirements
