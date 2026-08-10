import { expect, test } from "bun:test";
import { openDatabase } from "../src/db";
import { changedTaskPaths, parseTasks, projectOpenSpec } from "../src/openspec";

test("selects only committed OpenSpec task paths and parses checkbox progress", () => {
  expect(changedTaskPaths(["README.md", "openspec/changes/warp-core/tasks.md", "openspec/changes/x/spec.md"])).toEqual(["openspec/changes/warp-core/tasks.md"]);
  expect(parseTasks("## 1. Deflector\n- [x] Fix the deflector\n- [ ] Calibrate sensors\n\n## 2. Launch\n- [ ] Engage")).toEqual({
    completed: 1,
    total: 3,
    activeGroup: {
      title: "1. Deflector",
      tasks: [
        { completed: true, text: "Fix the deflector" },
        { completed: false, text: "Calibrate sensors" }
      ]
    }
  });
});

test("projects installation-scoped progress, deletion, and completion transitions", () => {
  const db = openDatabase();
  db.query("INSERT INTO installations (id) VALUES ('i1')").run();
  expect(projectOpenSpec(db, { installationId: "i1", repositoryId: "r", path: "openspec/changes/warp-core/tasks.md", content: "## 1. Flight\n- [ ] Align", sha: "one", sourceRef: "ops/warp-core" })).toBeFalse();
  expect(JSON.parse(db.query("SELECT active_group FROM openspec_progress").get()!.active_group).tasks[0].text).toBe("Align");
  expect(db.query("SELECT source_ref FROM openspec_progress").get()!.source_ref).toBe("ops/warp-core");
  expect(projectOpenSpec(db, { installationId: "i1", repositoryId: "r", path: "openspec/changes/warp-core/tasks.md", content: "- [x] Align", sha: "two" })).toBeTrue();
  expect(db.query("SELECT completed FROM openspec_progress").get()!.completed).toBe(1);
  projectOpenSpec(db, { installationId: "i1", repositoryId: "r", path: "openspec/changes/warp-core/tasks.md", deleted: true, sha: "three" });
  expect(db.query("SELECT count(*) AS count FROM openspec_progress").get()!.count).toBe(0);
});
