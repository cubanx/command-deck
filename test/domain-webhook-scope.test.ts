import { expect, test, vi } from "vitest";
import { bindInstallation, upsertIdentity } from "#/access";
import { acceptGitHubDelivery, drainInbox } from "#/events";
import { withDatabase } from "./mongo-support";

test("a title edit reads only its PR and no deployment history", () =>
	withDatabase(async (db) => {
		await upsertIdentity(db, "1701", "sisko");
		await bindInstallation(db, "1701", "42", "cubanx");
		await db.repositories.insertOne({
			_id: "301",
			repositoryId: "301",
			full_name: "ds9/ops",
			installationIds: ["42"],
			updatedAt: new Date(),
		});
		await db.pullRequests.insertMany(
			Array.from({ length: 100 }, (_, number) => ({
				_id: `301:${number}`,
				repositoryId: "301",
				number,
				title: "Inspect Defiant",
				state: "open",
				author_login: "sisko",
				updatedAt: new Date(),
			})),
		);
		await db.deployments.insertMany(
			Array.from({ length: 100 }, (_, number) => ({
				_id: `301:${number}`,
				repositoryId: "301",
				deploymentId: String(number),
				updatedAt: new Date(),
			})),
		);
		const readIds: string[] = [];
		const find = db.pullRequests.find.bind(db.pullRequests);
		const reads = vi.spyOn(db.pullRequests, "find").mockImplementation((...args) => {
			const cursor = find(...args);
			const toArray = cursor.toArray.bind(cursor);
			cursor.toArray = async () => {
				const rows = await toArray();
				readIds.push(...rows.map((row) => row._id));
				return rows;
			};
			return cursor;
		});
		const deployments = vi.spyOn(db.deployments, "find");
		try {
			await acceptGitHubDelivery(
				db,
				"scoped-title",
				"pull_request",
				JSON.stringify({
					action: "edited",
					installation: { id: 42, account: { login: "cubanx" } },
					repository: { id: 301, full_name: "ds9/ops" },
					pull_request: {
						number: 7,
						title: "Shields restored",
						state: "open",
						user: { login: "sisko" },
						updated_at: "2030-01-01T00:00:00Z",
					},
				}),
			);
			await drainInbox(db);
			expect((await db.pullRequests.findOne({ _id: "301:7" }))?.title).toBe("Shields restored");
			expect([...new Set(readIds)]).toEqual(["301:7"]);
			expect(deployments).not.toHaveBeenCalled();
		} finally {
			reads.mockRestore();
			deployments.mockRestore();
		}
	}));
