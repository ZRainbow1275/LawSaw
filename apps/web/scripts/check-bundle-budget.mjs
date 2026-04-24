#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webRoot = path.resolve(__dirname, "..");
const chunksDir = path.join(webRoot, ".next", "static", "chunks");

const BUDGET_MAIN_KB = Number.parseInt(process.env.BUDGET_MAIN_KB ?? "500", 10);
const BUDGET_ROUTE_KB = Number.parseInt(process.env.BUDGET_ROUTE_KB ?? "300", 10);

if (!Number.isFinite(BUDGET_MAIN_KB) || BUDGET_MAIN_KB <= 0) {
	console.error(`Invalid BUDGET_MAIN_KB: ${process.env.BUDGET_MAIN_KB}`);
	process.exit(2);
}
if (!Number.isFinite(BUDGET_ROUTE_KB) || BUDGET_ROUTE_KB <= 0) {
	console.error(`Invalid BUDGET_ROUTE_KB: ${process.env.BUDGET_ROUTE_KB}`);
	process.exit(2);
}

if (!fs.existsSync(chunksDir)) {
	console.error(`Build output not found at ${chunksDir}. Run \`pnpm build\` first.`);
	process.exit(2);
}

function walk(dir) {
	const out = [];
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) out.push(...walk(p));
		else if (entry.name.endsWith(".js")) out.push(p);
	}
	return out;
}

function classify(relativePath) {
	const normalized = relativePath.replace(/\\/g, "/");
	if (normalized.startsWith("pages/")) return "route";
	if (normalized.startsWith("app/")) return "route";
	return "main";
}

const files = walk(chunksDir);
if (files.length === 0) {
	console.error(`No JS chunks found under ${chunksDir}.`);
	process.exit(2);
}

const sizes = files
	.map((absPath) => {
		const rel = path.relative(chunksDir, absPath);
		const buf = fs.readFileSync(absPath);
		const gzBytes = zlib.gzipSync(buf).length;
		return {
			rel: rel.replace(/\\/g, "/"),
			rawBytes: buf.length,
			gzBytes,
			kind: classify(rel),
		};
	})
	.sort((a, b) => b.gzBytes - a.gzBytes);

const KB = 1024;
const mainBudget = BUDGET_MAIN_KB * KB;
const routeBudget = BUDGET_ROUTE_KB * KB;

const failures = [];
for (const entry of sizes) {
	const budget = entry.kind === "main" ? mainBudget : routeBudget;
	if (entry.gzBytes > budget) {
		failures.push({ entry, budget });
	}
}

const totalRawKb = sizes.reduce((acc, s) => acc + s.rawBytes, 0) / KB;
const totalGzKb = sizes.reduce((acc, s) => acc + s.gzBytes, 0) / KB;

console.log(
	`Bundle budget check: chunks=${sizes.length} total_raw=${totalRawKb.toFixed(1)}KB total_gz=${totalGzKb.toFixed(1)}KB main<=${BUDGET_MAIN_KB}KB route<=${BUDGET_ROUTE_KB}KB`,
);

console.log("Top 10 chunks by gzipped size:");
for (const s of sizes.slice(0, 10)) {
	console.log(
		`  ${(s.gzBytes / KB).toFixed(1).padStart(8)}KB gz  ${(s.rawBytes / KB).toFixed(1).padStart(8)}KB raw  [${s.kind}] ${s.rel}`,
	);
}

if (failures.length > 0) {
	console.error("");
	console.error(`Bundle budget exceeded by ${failures.length} chunk(s):`);
	for (const { entry, budget } of failures) {
		console.error(
			`  OVER: ${(entry.gzBytes / KB).toFixed(1)}KB gz > ${budget / KB}KB [${entry.kind}] ${entry.rel}`,
		);
	}
	process.exit(1);
}

console.log("Bundle budget OK.");
process.exit(0);
