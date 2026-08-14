import type { Db } from "./db";
import { mutateUser } from "./db";

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
export async function projectOpenSpec(db: Db, input: { installationId: string; repositoryId: string; path: string; content?: string; deleted?: boolean; sha: string; sourceRef?: string }) {
  const changeName = input.path.split("/")[2];
  if (!changeName) throw new Error("invalid OpenSpec tasks path");
  if (input.deleted) { const users = await db.users.find({ "installations.installationId": input.installationId }, { projection: { _id: 1 } }).toArray(); await Promise.all(users.map((user) => mutateUser(db, user._id, (aggregate) => { const repository = aggregate.installations.find((item) => item.installationId === input.installationId)?.repositories.find((item) => item.repositoryId === input.repositoryId); if (repository) repository.openSpecs = repository.openSpecs.filter((item) => item.change_name !== changeName); }))); return false; }
  const progress = parseTasks(input.content ?? "");
  const users = await db.users.find({ "installations.installationId": input.installationId }, { projection: { _id: 1 } }).toArray(); let completed = false;
  await Promise.all(users.map((user) => mutateUser(db, user._id, (aggregate) => { const repository = aggregate.installations.find((item) => item.installationId === input.installationId)?.repositories.find((item) => item.repositoryId === input.repositoryId); if (!repository) return; const index = repository.openSpecs.findIndex((item) => item.change_name === changeName), previous = index >= 0 ? repository.openSpecs[index] : undefined; completed ||= progress.total > 0 && progress.completed === progress.total && (!previous || Number(previous.completed) < Number(previous.total)); const next = { change_name: changeName, completed: progress.completed, total: progress.total, source_commit: input.sha, ...(input.sourceRef ? { source_ref: input.sourceRef } : {}), active_group: progress.activeGroup ? JSON.stringify(progress.activeGroup) : null, updated_at: new Date().toISOString() }; if (index >= 0) repository.openSpecs[index] = next; else repository.openSpecs.push(next); })));
  return completed;
}
