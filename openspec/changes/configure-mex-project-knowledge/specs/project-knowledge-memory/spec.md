## Purpose

Provide durable, reviewable repository knowledge for agents without coupling Mex to application runtime behavior or replacing CodeGraph structural lookup.

## ADDED Requirements

### Requirement: Supported repository-local Mex initialization
The repository SHALL initialize Mex from the current default-branch checkout using an official supported `mex-agent` release, record the validated version, and keep the tool outside the application dependency graph.

#### Scenario: Initialize from current repository
- **WHEN** the repository's Mex scaffold is created
- **THEN** the generator uses the current repository as its source and records the validated `mex-agent` version
- **AND** `package.json`, `bun.lock`, application code, and runtime configuration remain unchanged

#### Scenario: Unsupported launcher
- **WHEN** the official Mex launcher cannot execute with its declared dependencies
- **THEN** initialization stops without substituting copied artifacts, an unofficial package, or hand-authored generated output

### Requirement: Reviewed curated knowledge
The repository SHALL retain only verified, durable Mex knowledge covering routing, architecture, stack, conventions, decisions, setup, and reusable patterns.

#### Scenario: Generated scaffold review
- **WHEN** Mex generates repository knowledge
- **THEN** every generated path and factual claim is inventoried against repository sources
- **AND** the implementation stops for human review before significant manual curation

#### Scenario: Durable knowledge is approved
- **WHEN** generated knowledge has passed the review checkpoint
- **THEN** inaccurate or duplicate claims are corrected or removed
- **AND** the retained router points to concise, non-conflicting knowledge files

### Requirement: Explicit artifact disposition
The repository SHALL define whether every Mex-created artifact is committed, ignored, or removed and SHALL exclude secrets, prompts, caches, logs, and machine-local state from tracked knowledge.

#### Scenario: Repository status is inspected
- **WHEN** Mex setup or maintenance changes the worktree
- **THEN** every created or modified path has an explicit disposition
- **AND** secret-pattern and absolute-local-path checks pass before the change is reviewable

### Requirement: Separate Mex and CodeGraph responsibilities
Repository instructions SHALL identify Mex as curated project memory and CodeGraph as the first tool for structural code lookup without changing, copying, or replacing the local CodeGraph index.

#### Scenario: Agent needs repository context
- **WHEN** an agent needs stable project conventions or decisions
- **THEN** the agent follows the Mex router
- **AND** structural code discovery continues to use the existing CodeGraph workflow

#### Scenario: Mex configuration changes
- **WHEN** Mex configuration or knowledge is added or updated
- **THEN** `.codegraph/`, CodeGraph installation, and CodeGraph configuration remain unchanged

### Requirement: Development-only operation
Mex configuration and maintenance SHALL remain repository-development concerns and SHALL NOT require credentials, production access, external-system mutation, deployment behavior, or application runtime support.

#### Scenario: Application validation runs
- **WHEN** the repository typecheck, tests, and strict OpenSpec validation run after Mex configuration
- **THEN** they complete without loading Mex at application runtime
- **AND** the deployment inputs remain unchanged
