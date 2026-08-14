import { expect, test } from "bun:test";
import { bindInstallation, upsertIdentity } from "../src/access";
import { changedTaskPaths, parseTasks, projectOpenSpec } from "../src/openspec";
import { withDatabase } from "./mongo-support";

test("projects installation-scoped OpenSpec progress", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "1", "cubanx");
  const user = await db.users.findOne({ _id: "u" }); user!.installations[0]!.repositories.push({ repositoryId: "r", full_name: "ds9/ops", pullRequests: [], openSpecs: [], deployments: [] }); await db.users.replaceOne({ _id: "u" }, user!);
  expect(changedTaskPaths(["openspec/changes/defiant/tasks.md", "README.md"])).toEqual(["openspec/changes/defiant/tasks.md"]);
  expect(parseTasks("## Tasks\n- [x] Ready\n- [ ] Fly")).toMatchObject({ completed: 1, total: 2 });
  expect(await projectOpenSpec(db, { installationId: "1", repositoryId: "r", path: "openspec/changes/defiant/tasks.md", content: "- [x] Ready", sha: "a".repeat(40) })).toBeTrue();
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.openSpecs).toHaveLength(1);
  expect(await projectOpenSpec(db, { installationId: "1", repositoryId: "r", path: "openspec/changes/defiant/tasks.md", content: "- [x] Ready", sha: "a".repeat(40), sourceRef: "main" })).toBeFalse();
  await projectOpenSpec(db, { installationId: "1", repositoryId: "r", path: "openspec/changes/defiant/tasks.md", deleted: true, sha: "b".repeat(40) });
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.openSpecs).toHaveLength(0);
}));
