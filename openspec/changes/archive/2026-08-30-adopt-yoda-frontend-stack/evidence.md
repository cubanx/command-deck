## Group 6 final validation

- Baseline `HEAD`: `fba6a637d1e3710707f2426603f0f2be7ba505a6`; validation covered the uncommitted Group 6 diff.
- `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run validate:all` exited 0: 28 files, 194 tests in 38.16s; CRAP checked 207 functions with 0 above 30.
- `MONGODB_URI_BASE=mongodb://127.0.0.1:27018 bun run test` exited 0: 28 files, 194 tests in 34.56s.
- Playwright fixture journey passed 1/1 in 3.0s.
- Local Docker image build succeeded; runtime server import and prebuilt hashed-asset loader smoke both succeeded.
- Typecheck, browser build, Biome, strict OpenSpec validation, and `git diff --check` passed. Legacy renderer files are removed; no parallel renderer remains.

Docker image and local Mongo were fixture-only. No deploy, production, provider, or external operation occurred.

Remaining operational gates: merge, release, deploy, and production observation are outside this change.

## Group 6.5 development asset refresh

- On the unchanged Bun server at port 3101, the shell initially served `assets/client-BroC_Tp-.js`. A temporary comment edit in `src/web/client.tsx` triggered the Vite watcher and produced `assets/client-1qpxcD9U.js`; the same server then served the new hash. Restoring the source rebuilt the original hash.
- This is rebuild plus browser reload, not HMR. Typecheck, Biome, strict OpenSpec validation, and `git diff --check` passed.
- Local Mongo was a fixture: its container required `nofile=64000` after a low-limit container exited 133. This is fixture configuration, not product code.
