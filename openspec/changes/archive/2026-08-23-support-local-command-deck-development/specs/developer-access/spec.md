## MODIFIED Requirements

### Requirement: GitHub-authenticated developer sessions
The system SHALL authenticate developers through a state-bound GitHub OAuth callback, SHALL persist only a hash of each opaque session token, and SHALL deliver the token in a HTTP-only same-site cookie. The cookie MUST include `Secure` except for an explicit non-production loopback HTTP development origin.

#### Scenario: Successful sign-in
- **WHEN** GitHub returns a valid authorization code and matching state
- **THEN** the system upserts the developer identity, creates a hashed session, and redirects to the command center without persisting the GitHub user access token

#### Scenario: Invalid callback state
- **WHEN** a callback omits or changes the state value
- **THEN** the system rejects the callback without creating a user or session

#### Scenario: Local non-demo sign-in uses a loopback callback
- **WHEN** non-production development configures an explicit loopback HTTP public origin and GitHub returns a valid authorization code and matching state
- **THEN** the authorization request and callback use that origin, and the session cookie is HTTP-only and same-site without `Secure`

#### Scenario: Hosted and unsafe origins reject non-secure sessions
- **WHEN** production configures its public origin or non-production configures a malformed or non-loopback HTTP public origin
- **THEN** startup rejects the configuration and the system does not issue a non-secure session cookie
