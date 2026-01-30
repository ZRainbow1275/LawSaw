import { spawn } from "node:child_process";
import process from "node:process";
import { fileURLToPath } from "node:url";

const port = process.env.WEB_PORT ?? process.env.PORT ?? "8849";
const extraArgs = process.argv.slice(2);

const cwd = fileURLToPath(new URL("..", import.meta.url));
const child = spawn(
	process.execPath,
	["./node_modules/next/dist/bin/next", "dev", "-p", port, ...extraArgs],
	{
		cwd,
		env: process.env,
		stdio: "inherit",
	},
);

child.on("exit", (code) => {
	process.exit(code ?? 1);
});
