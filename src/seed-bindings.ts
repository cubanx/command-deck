import { mongoConfig, openDatabase } from "./db";
import { seedBindings } from "./access";

const [userId, ...bindings] = Bun.argv.slice(2);
if (!userId || !bindings.length) throw new Error("usage: bun src/seed-bindings.ts <github-user-id> <installation-id:account-login> [...]");
const parsed = bindings.map((value) => { const [installationId, accountLogin, extra] = value.split(":"); if (!installationId || !accountLogin || extra) throw new Error("bindings must use installation-id:account-login"); return { installationId, accountLogin }; });
const db = await openDatabase(mongoConfig());
try { await seedBindings(db, { userId, bindings: parsed }); console.log(`confirmed ${parsed.length} binding(s) for GitHub user ${userId}`); }
finally { await db.client.close(); }
