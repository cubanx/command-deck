import type { Db } from "./db";

export const changedTaskPaths = (paths: string[]) => paths.filter((path) => /^openspec\/changes\/[^/]+\/tasks\.md$/.test(path));
export function parseTasks(content: string) {
  const matches = [...content.matchAll(/^\s*- \[([ xX])\]/gm)];
  return { completed: matches.filter((match) => match[1].toLowerCase() === "x").length, total: matches.length };
}
export function projectOpenSpec(db: Db, input: { installationId: string; repositoryId: string; path: string; content?: string; deleted?: boolean; sha: string }) {
  const changeName = input.path.split("/")[2];
  if (!changeName) throw new Error("invalid OpenSpec tasks path");
  if (input.deleted) { db.query("DELETE FROM openspec_progress WHERE installation_id=? AND repository_id=? AND change_name=?").run(input.installationId, input.repositoryId, changeName); return false; }
  const progress = parseTasks(input.content ?? "");
  const previous = db.query("SELECT completed, total FROM openspec_progress WHERE installation_id=? AND repository_id=? AND change_name=?").get(input.installationId, input.repositoryId, changeName) as { completed: number; total: number } | null;
  db.query("INSERT INTO openspec_progress (installation_id,repository_id,change_name,completed,total,source_commit) VALUES (?,?,?,?,?,?) ON CONFLICT(installation_id,repository_id,change_name) DO UPDATE SET completed=excluded.completed,total=excluded.total,source_commit=excluded.source_commit,updated_at=CURRENT_TIMESTAMP").run(input.installationId, input.repositoryId, changeName, progress.completed, progress.total, input.sha);
  return progress.total > 0 && progress.completed === progress.total && (!previous || previous.completed < previous.total);
}
