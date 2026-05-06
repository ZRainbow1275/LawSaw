"use client";

/**
 * OverviewStatCards — 4 stat cards mirroring `prototype/app.html:1260-1265`.
 *
 * Layout: grid-template-columns: repeat(4,1fr) with gap 16px.
 * Each card: stat-header (label + colored icon chip) + stat-value (32px bold).
 *
 * Real data comes from useArticleAnalyticsSummary + useSourceStats +
 * useCategories (passed in via props from the page-level OverviewPanel).
 */

import { AlertTriangle, FileText, LayoutGrid, Rss } from "lucide-react";
import type { CSSProperties } from "react";

interface OverviewStatCardsProps {
	totalArticles: number | null;
	activeSources: number | null;
	categoriesCount: number | null;
	errorSources: number | null;
}

const gridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(4, 1fr)",
	gap: 16,
	marginBottom: 24,
};

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--color-neutral-200)",
	borderRadius: 12,
	padding: 20,
	boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
};

const headerStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	marginBottom: 12,
};

const labelStyle: CSSProperties = {
	fontSize: 13,
	color: "var(--color-neutral-500)",
	fontWeight: 500,
};

const iconStyle = (bg: string, color: string): CSSProperties => ({
	width: 36,
	height: 36,
	borderRadius: 8,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	background: bg,
	color,
});

const valueStyle: CSSProperties = {
	fontSize: 32,
	fontWeight: 700,
	color: "var(--color-neutral-900)",
	lineHeight: 1.1,
};

const dash = "—";

export function OverviewStatCards({
	totalArticles,
	activeSources,
	categoriesCount,
	errorSources,
}: OverviewStatCardsProps) {
	const cards = [
		{
			label: "全部文章",
			value: totalArticles,
			Icon: FileText,
			iconBg: "var(--color-primary-50)",
			iconColor: "var(--color-primary-500)",
		},
		{
			label: "活跃信息源",
			value: activeSources,
			Icon: Rss,
			iconBg: "#ede9fe",
			iconColor: "#8b5cf6",
		},
		{
			label: "分类板块",
			value: categoriesCount,
			Icon: LayoutGrid,
			iconBg: "#ecfdf5",
			iconColor: "#10b981",
		},
		{
			label: "异常信息源",
			value: errorSources,
			Icon: AlertTriangle,
			iconBg: "#fee2e2",
			iconColor: "#ef4444",
		},
	];

	return (
		<div style={gridStyle}>
			{cards.map((c) => (
				<div key={c.label} style={cardStyle}>
					<div style={headerStyle}>
						<span style={labelStyle}>{c.label}</span>
						<div style={iconStyle(c.iconBg, c.iconColor)}>
							<c.Icon aria-hidden="true" size={18} />
						</div>
					</div>
					<div style={valueStyle}>{c.value ?? dash}</div>
				</div>
			))}
		</div>
	);
}
