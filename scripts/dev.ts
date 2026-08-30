export {};

const children = [
	Bun.spawn(["bun", "src/web/frontend-build.ts", "--watch"], { stdout: "inherit", stderr: "inherit" }),
	Bun.spawn(["bun", "--watch", "src/server.ts"], { stdout: "inherit", stderr: "inherit" }),
];

let stopping = false;
const stop = () => {
	if (stopping) return;
	stopping = true;
	for (const child of children) child.kill();
};

process.on("SIGINT", stop);
process.on("SIGTERM", stop);
const result = await Promise.race(children.map((child) => child.exited));
stop();
process.exitCode = result;
