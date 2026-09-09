import { expect, test } from "vitest";
import { type Db, MAX_USER_BSON_BYTES, mutateUser, type UserAggregate } from "#/db";

const aggregate = (_id: string): UserAggregate => ({
	_id,
	schemaVersion: 1,
	revision: 0,
	github: {},
	installations: [],
	createdAt: new Date(0),
	updatedAt: new Date(0),
});

// Deterministic revision checks exercise the real mutation helper without database timing.
const collection = (...ids: string[]) => {
	const rows = new Map(ids.map((id) => [id, aggregate(id)]));
	const users = {
		findOne: async ({ _id }: { _id: string }) => structuredClone(rows.get(_id) ?? null),
		replaceOne: async ({ _id, revision }: { _id: string; revision: number }, next: UserAggregate) => {
			if (rows.get(_id)?.revision !== revision) return { modifiedCount: 0 };
			rows.set(_id, structuredClone(next));
			return { modifiedCount: 1 };
		},
	};
	return { rows, users, db: { users } as unknown as Db };
};

test("four overlapping same-user writes preserve every independent change", async () => {
	const { db, rows } = collection("sisko");
	const outcomes = await Promise.allSettled(
		["defiant", "rio-grande", "ganges", "mekong"].map((installationId) =>
			mutateUser(db, "sisko", (user) => {
				user.installations.push({ installationId, boundAt: new Date(0), repositories: [] });
			}),
		),
	);
	expect(outcomes.map((result) => result.status)).toEqual(Array(4).fill("fulfilled"));
	expect(rows.get("sisko")?.installations.map((item) => item.installationId)).toEqual([
		"defiant",
		"rio-grande",
		"ganges",
		"mekong",
	]);
	expect(rows.get("sisko")?.revision).toBe(4);
});

test("a pending user does not block a different user or database", async () => {
	const { db, users } = collection("sisko", "kira");
	const other = collection("sisko");
	let release!: () => void;
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	const replace = users.replaceOne;
	users.replaceOne = async (filter, next) => {
		if (filter._id === "sisko") await held;
		return replace(filter, next);
	};
	const pending = mutateUser(db, "sisko", (user) => {
		user.github.login = "sisko";
	});
	try {
		await Promise.all([
			mutateUser(db, "kira", (user) => {
				user.github.login = "kira";
			}),
			mutateUser(other.db, "sisko", (user) => {
				user.github.login = "mirror-sisko";
			}),
		]);
	} finally {
		release();
	}
	await pending;
});

test("rejected callbacks and persistence do not poison queued successors", async () => {
	const { db, users, rows } = collection("sisko");
	const replace = users.replaceOne;
	let fail = true;
	users.replaceOne = async (filter, next) => {
		if (fail) {
			fail = false;
			throw new Error("simulated local write failure");
		}
		return replace(filter, next);
	};
	const outcomes = await Promise.allSettled([
		mutateUser(db, "sisko", () => {
			throw new Error("simulated invalid mutation");
		}),
		mutateUser(db, "sisko", (user) => {
			user.github.login = "failed-write";
		}),
		mutateUser(db, "sisko", (user) => {
			user.github.login = "sisko";
		}),
	]);
	expect(outcomes.map((result) => result.status)).toEqual(["rejected", "rejected", "fulfilled"]);
	expect(rows.get("sisko")?.github.login).toBe("sisko");
	await mutateUser(db, "sisko", (user) => {
		user.github.login = "captain-sisko";
	});
	expect(rows.get("sisko")?.revision).toBe(2);
});

test("external revision changes preserve fresh state and the three-attempt bound", async () => {
	const { db, users, rows } = collection("sisko");
	const replace = users.replaceOne;
	let calls = 0;
	users.replaceOne = async (filter, next) => {
		if (++calls === 1) {
			rows.get("sisko")!.revision++;
			rows.get("sisko")!.github.avatarUrl = "https://example.test/defiant.png";
		}
		return replace(filter, next);
	};
	await mutateUser(db, "sisko", (user) => {
		user.github.login = "sisko";
	});
	expect(calls).toBe(2);
	expect(rows.get("sisko")?.github).toEqual({ login: "sisko", avatarUrl: "https://example.test/defiant.png" });
	calls = 0;
	users.replaceOne = async () => {
		calls++;
		return { modifiedCount: 0 };
	};
	await expect(
		mutateUser(db, "sisko", (user) => {
			user.github.login = "uncommitted";
		}),
	).rejects.toThrow("changed concurrently");
	expect(calls).toBe(3);
	expect(rows.get("sisko")?.github.login).toBe("sisko");
});

test("missing-user and size guards reject without blocking subsequent writes", async () => {
	const { db, rows } = collection("sisko");
	await expect(mutateUser(db, "quark", () => {})).rejects.toThrow("aggregate not found");
	await expect(
		mutateUser(db, "sisko", (user) => {
			user.github.login = "x".repeat(MAX_USER_BSON_BYTES);
		}),
	).rejects.toMatchObject({ name: "UserAggregateSizeError" });
	await mutateUser(db, "sisko", (user) => {
		user.github.login = "sisko";
	});
	expect(rows.get("sisko")?.revision).toBe(1);
});
