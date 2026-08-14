import { expect, test } from "bun:test";
import { bindInstallation, upsertIdentity } from "../src/access";
import { acceptGitHubDelivery, drainInbox } from "../src/events";
import { withDatabase } from "./mongo-support";

test("provider identity mutations are idempotent", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "kira"); await bindInstallation(db, "u", "1", "cubanx");
  const body = JSON.stringify({ installation: { id: 1, account: { login: "cubanx" } }, repository: { id: 2, full_name: "ds9/ops" }, pull_request: { number: 7, title: "Defend", user: { login: "kira" }, state: "open" } });
  await acceptGitHubDelivery(db, "a", "pull_request", body); await acceptGitHubDelivery(db, "b", "pull_request", body); await drainInbox(db);
  expect((await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.pullRequests).toHaveLength(1);
}));
