import { expect, test } from "bun:test";
import { bindInstallation, dashboardForUser, upsertIdentity } from "../src/access";
import { acceptGitHubDelivery, drainInbox } from "../src/events";
import { withDatabase } from "./mongo-support";

test("deployment events remain installation-scoped", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "1", "cubanx");
  const body = JSON.stringify({ installation: { id: 1, account: { login: "cubanx" } }, repository: { id: 2, full_name: "ds9/ops" }, deployment: { id: 7, environment: "production", ref: "main", sha: "a".repeat(40), created_at: new Date().toISOString() }, deployment_status: { state: "success", created_at: new Date().toISOString() } });
  await acceptGitHubDelivery(db, "deployment", "deployment_status", body); await drainInbox(db);
  expect((await dashboardForUser(db, "u")).deployments).toHaveLength(1);
}));

test("deployment status is monotonic, bounded, and retains safe links", () => withDatabase(async (db) => {
  await upsertIdentity(db, "u", "sisko"); await bindInstallation(db, "u", "1", "cubanx");
  const delivery = (deliveryId: string, id: number, updated: string, state = "success") => acceptGitHubDelivery(db, deliveryId, "deployment_status", JSON.stringify({ installation: { id: 1, account: { login: "cubanx" } }, repository: { id: 2, full_name: "ds9/ops" }, deployment: { id, created_at: updated }, deployment_status: { state, created_at: updated, target_url: "https://example.test/deploy", log_url: "https://example.test/log" } }));
  await delivery("new", 7, "2030-01-02T00:00:00Z"); await delivery("old", 7, "2030-01-01T00:00:00Z", "failure");
  for (let id = 8; id < 29; id++) await delivery(String(id), id, `2030-01-03T00:00:${String(id).padStart(2, "0")}Z`); await drainInbox(db);
  const deployments = (await db.users.findOne({ _id: "u" }))?.installations[0]?.repositories[0]?.deployments ?? [];
  expect(deployments).toHaveLength(20); expect(deployments.find((item) => item.id === "7")).toBeUndefined();
  expect((await dashboardForUser(db, "u", new Date("2030-01-04"))).deployments[0]).toMatchObject({ target_url: "https://example.test/deploy", log_url: "https://example.test/log" });
}));
