#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const repo = path.resolve(process.cwd());
const zhPath = path.join(repo, "apps/web/src/messages/zh.json");
const enPath = path.join(repo, "apps/web/src/messages/en.json");

const zhAdds = {
	"Theme mode": "主题模式",
	"Choose a light, dark, or system-following theme":
		"选择浅色、深色或跟随系统的主题",
	"Follow system": "跟随系统",
	"Switch the UI between simplified Chinese and English":
		"在简体中文和英文之间切换界面语言",
	"Reduce spacing and font sizes to show more content per screen":
		"减小间距和字号，让屏幕显示更多内容",
	"Enable compact mode": "启用紧凑模式",
	"App version": "应用版本",
	"API version": "API 版本",
	"Account role": "账户角色",
	"System information": "系统信息",
	"Build metadata for support. For service health, see the admin dashboard.":
		"用于支持的构建元数据。查看服务健康请前往管理控制台。",
	"Theme mode, interface language, and compact density preferences.":
		"主题模式、界面语言与紧凑布局偏好。",
	"Build metadata, API version, and account role information.":
		"构建元数据、API 版本与账户角色信息。",
};

const enAdds = {
	"Theme mode": "Theme mode",
	"Choose a light, dark, or system-following theme":
		"Choose a light, dark, or system-following theme",
	"Follow system": "Follow system",
	"Switch the UI between simplified Chinese and English":
		"Switch the UI between simplified Chinese and English",
	"Reduce spacing and font sizes to show more content per screen":
		"Reduce spacing and font sizes to show more content per screen",
	"Enable compact mode": "Enable compact mode",
	"App version": "App version",
	"API version": "API version",
	"Account role": "Account role",
	"System information": "System information",
	"Build metadata for support. For service health, see the admin dashboard.":
		"Build metadata for support. For service health, see the admin dashboard.",
	"Theme mode, interface language, and compact density preferences.":
		"Theme mode, interface language, and compact density preferences.",
	"Build metadata, API version, and account role information.":
		"Build metadata, API version, and account role information.",
};

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
