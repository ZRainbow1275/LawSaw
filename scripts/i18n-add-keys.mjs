#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(process.cwd());
const zhPath = path.join(repo, "apps/web/src/messages/zh.json");
const enPath = path.join(repo, "apps/web/src/messages/en.json");

const zhAdds = {
	"Sans serif": "无衬线",
	Serif: "衬线",
	Small: "小",
	Large: "大",
	"Extra large": "特大",
	Normal: "常规",
	Wide: "宽",
	Narrow: "窄",
	Relaxed: "宽松",
	Default: "默认",
};

const enAdds = Object.fromEntries(
	Object.keys(zhAdds).map((k) => [k, k]),
);

function insertKeys(filePath, additions) {
	const original = JSON.parse(fs.readFileSync(filePath, "utf8"));
	const existingKeys = Object.keys(original);
	const merged = { ...original };
	let added = 0;
	let skipped = 0;
	for (const [k, v] of Object.entries(additions)) {
		if (k in merged) {
			skipped++;
			continue;
		}
		merged[k] = v;
		added++;
	}
	// Preserve existing order, append new keys at sorted insertion points.
	const finalKeys = [];
	const newKeys = Object.keys(additions).filter(
		(k) => !existingKeys.includes(k) && k in merged,
	);
	const newSet = new Set(newKeys);
	const remaining = new Set(newKeys);
	for (const ek of existingKeys) {
		// Insert any pending new keys that compare <= ek
		for (const nk of [...remaining]) {
			if (nk.localeCompare(ek) < 0) {
				finalKeys.push(nk);
				remaining.delete(nk);
			}
		}
		finalKeys.push(ek);
	}
	for (const nk of remaining) finalKeys.push(nk);

	const out = {};
	for (const k of finalKeys) out[k] = merged[k];
	const pretty = `${JSON.stringify(out, null, "\t")}\n`;
	// Match existing indent style — detect from original file.
	const rawOriginal = fs.readFileSync(filePath, "utf8");
	const indent = rawOriginal.startsWith("{\n\t") ? "\t" : "  ";
	const pretty2 = `${JSON.stringify(out, null, indent)}\n`;
	fs.writeFileSync(filePath, pretty2, "utf8");
	console.log(`[${path.basename(filePath)}] added=${added}, skipped=${skipped}, total=${finalKeys.length}`);
}

insertKeys(zhPath, zhAdds);
insertKeys(enPath, enAdds);
