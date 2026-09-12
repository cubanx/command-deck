## Why

The webhook inbox drain can exceed MongoDB's 32 MiB blocking-sort limit. User-supplied production evidence shows that an ascending received-time index lets the unchanged query avoid that sort.

## What Changes

- Initialize the inbox received-time index idempotently, preserving the retry index.
- Add a MongoDB integration regression against the real drain query.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mongodb-storage`: Require index-supported chronological inbox selection.

## Impact

Database initialization and the existing MongoDB integration suite. No dependency or drain behavior changes. Production recovery acceptance remains with parent task `01a08738-769a-7471-9b54-d158ced9e715`.
