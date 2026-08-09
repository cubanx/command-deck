import { expect, test } from "bun:test";
import { loadConfig } from "../src/config";

test("validates runtime ports and reconciliation interval", () => {
  expect(() => loadConfig({ PORT: "0" })).toThrow("valid TCP port");
  expect(() => loadConfig({ RECONCILE_INTERVAL_MS: "1" })).toThrow("at least 60000");
  expect(loadConfig({}).port).toBe(3000);
});
