## ADDED Requirements

### Requirement: Personal operational summary
The system SHALL present the signed-in developer's open pull requests, review/check/workflow state, verified Railway deployments, and committed OpenSpec progress from local projections.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state
- **THEN** the dashboard renders only that developer's bound data without first polling provider list endpoints

### Requirement: Crisp-sibling visual semantics
The dashboard SHALL use a compact neutral shell, bordered cards, responsive grids or scroll-contained tables, plain operational labels, visible focus styles, and consistent semantic status colors.

#### Scenario: Narrow viewport
- **WHEN** the app is viewed in a narrow installed window
- **THEN** cards stack, tables remain horizontally accessible, and primary status and actions remain readable

### Requirement: Explicit focus states
The dashboard SHALL distinguish loading, signed-out, no-installation, empty, stale, and error states with concise next actions.

#### Scenario: Signed-in developer has no installation
- **WHEN** a developer has authenticated but bound no GitHub App installation
- **THEN** the dashboard explains that no repositories are connected and provides the installation action

#### Scenario: Projection is empty
- **WHEN** a bound developer has no open pull requests or OpenSpecs
- **THEN** the dashboard shows a calm explicit empty state rather than an ambiguous blank region
