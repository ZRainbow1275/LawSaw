/** Shared label constants for statistics components. */

export const DOMAIN_LABELS: Record<string, string> = {
	legislation: "立法前沿",
	regulation: "监管动向",
	enforcement: "执法案例",
	industry: "业界资讯",
	compliance: "合规前沿",
	technology: "数据/技术",
	academic: "学术文章",
	international: "国际视野",
};

export const IMPORTANCE_LABELS = [
	"一般资讯",
	"地方性",
	"行业性",
	"部委级",
	"国家级",
];

export const IMPORTANCE_COLORS = [
	"#94a3b8",
	"#60a5fa",
	"#34d399",
	"#f59e0b",
	"#ef4444",
];

export const AUTHORITY_LABELS: Record<number, string> = {
	1: "宪法",
	2: "法律",
	3: "行政法规",
	4: "部门规章",
	5: "地方性法规",
	6: "地方政府规章",
	7: "司法解释",
	8: "规范性文件",
	9: "行业标准",
	10: "非正式",
};

export const RISK_COLORS: Record<string, string> = {
	unknown: "#a3a3a3",
	low: "#22c55e",
	medium: "#f59e0b",
	high: "#f97316",
	critical: "#ef4444",
};

export const SENTIMENT_COLORS: Record<string, string> = {
	unknown: "#d4d4d4",
	positive: "#22c55e",
	neutral: "#a3a3a3",
	negative: "#ef4444",
	mixed: "#f59e0b",
};

export const DIMENSION_COLORS = [
	"#3b82f6",
	"#ef4444",
	"#22c55e",
	"#f59e0b",
	"#8b5cf6",
	"#ec4899",
	"#14b8a6",
	"#f97316",
];

export const DOMAIN_COLORS: Record<string, string> = {
	legislation: "#3b82f6",
	regulation: "#8b5cf6",
	enforcement: "#f43f5e",
	industry: "#f59e0b",
	compliance: "#10b981",
	technology: "#06b6d4",
	academic: "#6366f1",
	international: "#14b8a6",
};
