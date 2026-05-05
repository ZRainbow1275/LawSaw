#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const srcDir = path.join(root, "src");
const messagesDir = path.join(srcDir, "messages");

const zh = JSON.parse(
	fs.readFileSync(path.join(messagesDir, "zh.json"), "utf8"),
);
const en = JSON.parse(
	fs.readFileSync(path.join(messagesDir, "en.json"), "utf8"),
);

// Match `t(<quoted>)` for translator helpers — supports double quotes,
// single quotes, and template literals without interpolation. The leading
// `\b` plus a negative lookbehind for `.` avoids matching unrelated `.t(...)`
// method calls.
const callRegexes = [
	/(?<![.\w])t\(\s*"((?:[^"\\]|\\.)+)"/g,
	/(?<![.\w])t\(\s*'((?:[^'\\]|\\.)+)'/g,
	/(?<![.\w])t\(\s*`([^`$\\]+)`/g,
];

const callKeys = new Set();

const SKIP_FILE_RE = /\.(test|spec|stories)\.(ts|tsx|js|jsx|mjs|mts)$/;

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === "node_modules") continue;
		const p = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(p);
			continue;
		}
		if (!/\.(tsx?|jsx?|mjs|mts)$/.test(entry.name)) continue;
		if (SKIP_FILE_RE.test(entry.name)) continue;
		const content = fs.readFileSync(p, "utf8");
		for (const re of callRegexes) {
			re.lastIndex = 0;
			let m;
			while ((m = re.exec(content))) callKeys.add(m[1]);
		}
	}
}
walk(srcDir);

const missingZh = [...callKeys].filter((k) => !(k in zh));
const missingEn = [...callKeys].filter((k) => !(k in en));

if (missingZh.length || missingEn.length) {
	console.error(
		`[check-i18n-coverage] missing zh: ${missingZh.length}, missing en: ${missingEn.length}`,
	);
	const limit = Number.parseInt(process.env.I18N_REPORT_LIMIT ?? "10", 10);
	if (missingZh.length)
		console.error("Missing zh:", missingZh.slice(0, limit));
	if (missingEn.length)
		console.error("Missing en:", missingEn.slice(0, limit));
	process.exit(1);
}

console.log(
	`[check-i18n-coverage] ok (${callKeys.size} unique keys checked)`,
);
