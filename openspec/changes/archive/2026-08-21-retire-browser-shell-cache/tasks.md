## 1. Browser-shell retirement

- [x] 1.1 Remove normal service-worker registration and versioned shell asset URLs while retaining only the cleanup worker for previously installed clients.
- [x] 1.2 Deliver the cleanup worker and HTML, JavaScript, and CSS shell with revalidation-required cache directives.

## 2. Verification

- [x] 2.1 Add focused server and runtime coverage for retirement cleanup, no request interception, fresh shell directives, and unchanged non-shell routes.
- [x] 2.2 Run the focused tests, typecheck, web build, strict OpenSpec validation, and diff check.
