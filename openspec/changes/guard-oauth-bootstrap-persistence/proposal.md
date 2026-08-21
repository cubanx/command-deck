## Why

A failed detached OAuth bootstrap can itself reject while persisting its safe evidence, losing its failure log and creating an unhandled rejection.

## What Changes

- Contain persistence failures in the detached OAuth bootstrap.
- Retain the existing safe bootstrap log and emit a fixed classified persistence-failure log.
- Add a focused regression test for the persistence-failure boundary.

## Capabilities

No specification change. This is a reliability repair to existing failure handling, so `skip_specs: true` is set.

## Impact

- Affected code: OAuth bootstrap handling and its focused server test.
- No API, provider, schema, or CI configuration change.
