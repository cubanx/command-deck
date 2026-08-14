## Merge-safety evidence

- Observed at: `2026-08-13T15:12:31Z`
- Railway workspace: `Crisp-Inc`
- Project: `Command Deck.ai` (`b2fa6e37-274e-46e7-aef5-ef23bfd1b892`)
- Environment: `production` (`a2aa23da-4455-49b4-8014-6866271aee54`)
- Service: `developer-command-center` (`180978ea-99f3-4e70-831a-6bc1d72612b3`)
- Source: `cubanx/dev-command-center`, branch `main`

Read-only inspection showed that automatic GitHub deploys were enabled and that recent merges had triggered production deployments. Merging this change was therefore blocked.

After explicit user authorization, automatic deploys were disabled in Railway. A fresh settings read showed `Auto deploy is disabled` with `Enable` as the rollback control. A fresh deployment-history read showed no deployment caused by the settings change; deployment `f0e1689b-4b36-465b-96da-1efdbd857a04` from PR #4 remained active and production remained online.

PR #6 can now merge without Railway automatically deploying the MongoDB runtime. Deployment remains owned by `operate-developer-command-center-mongodb-cutover` after exact merge-SHA verification.
