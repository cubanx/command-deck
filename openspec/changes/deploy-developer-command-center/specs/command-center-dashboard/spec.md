## MODIFIED Requirements

### Requirement: Personal operational summary
The system SHALL present the signed-in developer's attention-required open pull requests with title, PR number, draft state, Actions/check/formal-review/automated-review/mergeability evidence, and branch/SHA-linked OpenSpec status, plus recent GitHub deployment projections, from local installation-scoped projections.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state
- **THEN** the dashboard renders only data belonging to that developer's bound GitHub installations without first polling provider list endpoints

#### Scenario: Recent deployments have mixed outcomes
- **WHEN** GitHub deployment projections were updated within the last 48 hours
- **THEN** the dashboard shows repository, environment, ref or SHA, state, and target link newest first and omits older deployments

#### Scenario: No Railway runtime access
- **WHEN** the dashboard renders deployment state
- **THEN** it does not require Railway connection mappings, Railway API credentials, or Railway webhook verification state
