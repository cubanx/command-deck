## MODIFIED Requirements

### Requirement: Personal operational summary
The system SHALL present the signed-in developer's attention-required open pull requests with title, PR number, draft state, Actions/check/formal-review/automated-review/mergeability evidence, and branch/SHA-linked OpenSpec status, plus recent GitHub deployment projections, from local installation-scoped projections.

#### Scenario: Developer opens the command center
- **WHEN** a signed-in developer has projected state
- **THEN** the dashboard renders only data belonging to that developer's bound GitHub installations without first polling provider list endpoints

#### Scenario: Pull request needs attention
- **WHEN** an authored open pull request is a draft, has requested changes, failed checks or Actions workflow, a conflicting or unmergeable state, or a linked incomplete OpenSpec
- **THEN** the dashboard shows its linked title and PR number, draft/ready state, Actions status, all other known status fields, and nested OpenSpec evidence

#### Scenario: Automated reviewer progress is known
- **WHEN** a configured bot-review signal has been projected for the pull request
- **THEN** the PR card shows the reviewer identity and whether its review is in progress or complete separately from the formal review decision

#### Scenario: Pull request is healthy
- **WHEN** an authored open pull request has no projected attention condition
- **THEN** it is omitted from the exception dashboard

#### Scenario: Pull request has a linked unfinished OpenSpec group
- **WHEN** an OpenSpec is correlated to the pull request by commit or unique branch
- **THEN** the PR card shows its progress, complete current unfinished group as disabled checked and unchecked source-state checkboxes, and source action rather than a separate OpenSpec dashboard card

#### Scenario: Recent deployments have mixed outcomes
- **WHEN** GitHub deployment projections were updated within the last 48 hours
- **THEN** the dashboard shows repository, environment, ref or SHA, state, and target link newest first and omits older deployments

#### Scenario: No Railway runtime access
- **WHEN** the dashboard renders deployment state
- **THEN** it does not require Railway connection mappings, Railway API credentials, or Railway webhook verification state
