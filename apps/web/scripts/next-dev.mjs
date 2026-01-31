import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const port = process.env.WEB_PORT ?? process.env.PORT ?? "8849";
const extraArgs = process.argv.slice(2);
const wantsTurbo = extraArgs.includes("--turbo") || extraArgs.includes("--turbopack");
const wantsWebpack = extraArgs.includes("--webpack");

function toSpawnCwd(path) {
	if (process.platform !== "win32") return path;
	const match = path.match(/^\/mnt\/([a-z])\/(.*)$/i);
	if (!match) return path;
	return `${match[1].toUpperCase()}:\\\\${match[2].replaceAll("/", "\\\\")}`;
}

const env = { ...process.env };
const cwd = fileURLToPath(new URL("..", import.meta.url));
if (process.platform !== "win32" && /^\/mnt\/[a-z]\//i.test(cwd)) {
	env.NEXT_TEST_WASM ??= "1";
}

const child = spawn(
	process.execPath,
	[
		"./node_modules/next/dist/bin/next",
		"dev",
		...(wantsTurbo || wantsWebpack ? [] : ["--webpack"]),
		"-p",
		port,
		...extraArgs,
	],
	{
		cwd: toSpawnCwd(cwd),
		env,
		stdio: "inherit",
	},
);

child.on("exit", (code) => {
	process.exit(code ?? 1);
});
