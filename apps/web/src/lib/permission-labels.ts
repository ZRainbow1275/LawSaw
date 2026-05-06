/**
 * RBAC permission and group label dictionaries.
 *
 * Permission ids and group ids are backend RBAC engine enums, not user-facing
 * UI copy — they are kept out of the i18n dictionary (`messages/zh.json`) to
 * avoid bloating it with strings the backend ultimately owns. This module is
 * the canonical client-side bilingual lookup table.
 *
 * Keep keys identical to the English label returned by the engine (a.k.a.
 * `permission.labelKey` / `group.key`). When a key is missing from the table
 * the lookup falls back to the English label.
 */

export type PermissionLabel = { zh: string; en: string };

export const PERMISSION_LABELS: Record<string, PermissionLabel> = {
	"Read articles": { zh: "阅读资讯", en: "Read articles" },
	"Write articles": { zh: "编辑资讯", en: "Write articles" },
	"Pin articles": { zh: "置顶资讯", en: "Pin articles" },
	"Export articles": { zh: "导出资讯", en: "Export articles" },
	"Read sources": { zh: "查看信息源", en: "Read sources" },
	"Write sources": { zh: "管理信息源", en: "Write sources" },
	"Read knowledge graph": { zh: "查看知识图谱", en: "Read knowledge graph" },
	"Mutate knowledge graph": {
		zh: "编辑知识图谱",
		en: "Mutate knowledge graph",
	},
	"Knowledge canvas": { zh: "知识画布", en: "Knowledge canvas" },
	"Read reports": { zh: "查看报告", en: "Read reports" },
	"Generate reports": { zh: "生成报告", en: "Generate reports" },
	"Analytics overview": { zh: "统计总览", en: "Analytics overview" },
	"Regional analytics": { zh: "地域分析", en: "Regional analytics" },
	"Industry analytics": { zh: "行业分析", en: "Industry analytics" },
	"Cross-dimensional analytics": {
		zh: "交叉分析",
		en: "Cross-dimensional analytics",
	},
	"Read users": { zh: "查看用户", en: "Read users" },
	"Manage users": { zh: "管理用户", en: "Manage users" },
	"Read tenants": { zh: "查看租户", en: "Read tenants" },
	"Manage tenants": { zh: "管理租户", en: "Manage tenants" },
	"Read audit log": { zh: "查看审计日志", en: "Read audit log" },
	"Resolve feedback": { zh: "处理反馈", en: "Resolve feedback" },
	"Manage banners": { zh: "管理横幅", en: "Manage banners" },
	"Read API keys": { zh: "查看 API 密钥", en: "Read API keys" },
	"Issue API keys": { zh: "签发 API 密钥", en: "Issue API keys" },
	"Invoke AI gateway": { zh: "调用 AI 网关", en: "Invoke AI gateway" },
};

export const PERMISSION_GROUP_LABELS: Record<string, PermissionLabel> = {
	Articles: { zh: "资讯", en: "Articles" },
	Sources: { zh: "信息源", en: "Sources" },
	Knowledge: { zh: "知识图谱", en: "Knowledge" },
	Reports: { zh: "报告", en: "Reports" },
	Analytics: { zh: "统计分析", en: "Analytics" },
	Admin: { zh: "管理", en: "Admin" },
	API: { zh: "API", en: "API" },
	AI: { zh: "AI", en: "AI" },
};

export function pickPermissionLabel(locale: string, key: string): string {
	const entry = PERMISSION_LABELS[key];
	if (!entry) return key;
	return locale === "zh" ? entry.zh : entry.en;
}

export function pickPermissionGroupLabel(locale: string, key: string): string {
	const entry = PERMISSION_GROUP_LABELS[key];
	if (!entry) return key;
	return locale === "zh" ? entry.zh : entry.en;
}
