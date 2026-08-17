## 1. Installation identity fix

- [x] 1.1 Add a focused regression test that distinguishes App-JWT installation identity lookup from installation-token repository reads.
- [x] 1.2 Route installation identity lookup through the existing App JWT while retaining installation-token repository reads.
- [x] 1.3 Run the focused test, typecheck, strict OpenSpec validation, and `git diff --check`.
- [x] 1.4 Stop for review before commit, push, pull request, deployment, provider access, or production operations.
