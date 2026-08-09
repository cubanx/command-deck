import type { Db } from "./db";

export const changedTaskPaths = (paths: string[]) => paths.filter((path) => /^openspec\/changes\/[^/]+\/tasks\.md$/.test(path));
export function parseTasks(content: string) {
  const groups: Array<{ title: string; tasks: Array<{ completed: boolean; text: string }> }> = [];
  let title = "Tasks";
  for (const line of content.split(/\r?\n/)) {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading) { title = heading[1]; continue; }
    const task = line.match(/^\s*- \[([ xX])\]\s+(.+?)\s*$/);
    if (!task) continue;
    let group = groups.at(-1);
    if (!group || group.title !== title) { group = { title, tasks: [] }; groups.push(group); }
    group.tasks.push({ completed: task[1].toLowerCase() === "x", text: task[2] });
  }
  const tasks = groups.flatMap((group) => group.tasks);
  return { completed: tasks.filter((task) => task.completed).length, total: tasks.length, activeGroup: groups.find((group) => group.tasks.some((task) => !task.completed)) ?? null };
}
export function projectOpenSpec(db: Db, input: { installationId: string; repositoryId: string; path: string; content?: string; deleted?: boolean; sha: string; sourceRef?: string }) {
  const changeName = input.path.split("/")[2];
  if (!changeName) throw new Error("invalid OpenSpec tasks path");
  if (input.deleted) { db.query("DELETE FROM openspec_progress WHERE installation_id=? AND repository_id=? AND change_name=?").run(input.installationId, input.repositoryId, changeName); return false; }
  const progress = parseTasks(input.content ?? "");
  const previous = db.query("SELECT completed, total FROM openspec_progress WHERE installation_id=? AND repository_id=? AND change_name=?").get(input.installationId, input.repositoryId, changeName) as { completed: number; total: number } | null;
  db.query("INSERT INTO openspec_progress (installation_id,repository_id,change_name,completed,total,source_commit,source_ref,active_group) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(installation_id,repository_id,change_name) DO UPDATE SET completed=excluded.completed,total=excluded.total,source_commit=excluded.source_commit,source_ref=excluded.source_ref,active_group=excluded.active_group,updated_at=CURRENT_TIMESTAMP").run(input.installationId, input.repositoryId, changeName, progress.completed, progress.total, input.sha, input.sourceRef ?? null, progress.activeGroup ? JSON.stringify(progress.activeGroup) : null);
  return progress.total > 0 && progress.completed === progress.total && (!previous || previous.completed < previous.total);
}
