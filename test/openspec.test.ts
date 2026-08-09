import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { changedTaskPaths, parseTasks, projectOpenSpec } from "../src/openspec";

test("selects only committed OpenSpec task paths and parses checkbox progress", () => {
  expect(changedTaskPaths(["README.md", "openspec/changes/warp-core/tasks.md", "openspec/changes/x/spec.md"])).toEqual(["openspec/changes/warp-core/tasks.md"]);
  expect(parseTasks("- [x] Fix the deflector\n- [ ] Calibrate sensors")).toEqual({ completed: 1, total: 2 });
});

test("projects installation-scoped progress, deletion, and completion transitions", () => {
  const db = openDatabase();
  db.query("INSERT INTO installations (id) VALUES ('i1')").run();
  expect(projectOpenSpec(db, { installationId: "i1", repositoryId: "r", path: "openspec/changes/warp-core/tasks.md", content: "- [ ] Align", sha: "one" })).toBeFalse();
  expect(projectOpenSpec(db, { installationId: "i1", repositoryId: "r", path: "openspec/changes/warp-core/tasks.md", content: "- [x] Align", sha: "two" })).toBeTrue();
  expect(db.query("SELECT completed FROM openspec_progress").get()!.completed).toBe(1);
  projectOpenSpec(db, { installationId: "i1", repositoryId: "r", path: "openspec/changes/warp-core/tasks.md", deleted: true, sha: "three" });
  expect(db.query("SELECT count(*) AS count FROM openspec_progress").get()!.count).toBe(0);
});
