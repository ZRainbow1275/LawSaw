"use client";

/**
 * StatusBadgeGrid — 5 status badges for article status panel
 * (prototype/app.html:1325-1342). 待处理/处理中/已发布/已归档/已拒绝.
 *
 * Colors: 黄/蓝/绿/灰/红.
 */

import { useT } from "@/lib/i18n-client";
import type { ArticleStatusCounts } from "@/lib/api/types";
import { Archive, CheckCircle2, Clock, Loader2, XCircle } from "lucide-react";
import type { CSSProperties } from "react";

interface StatusBadgeGridProps {
	data: ArticleStatusCounts;
}

const gridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(2, 1fr)",
	gap: 10,
};

const itemStyle = (bg: string, color: string): CSSProperties => ({
	display: "flex",
	alignItems: "center",
	gap: 8,
	padding: "10px 14px",
	borderRadius: 8,
	background: bg,
	color,
	fontSize: 13,
	fontWeight: 600,
});

const valueStyle: CSSProperties = {
	marginLeft: "auto",
	fontWeight: 700,
};

export function StatusBadgeGrid({ data }: StatusBadgeGridProps) {
	const t = useT();
	const items = [
		{
			label: t("Pending"),
			value: data.pending ?? 0,
			Icon: Clock,
			bg: "#fff8e1",
			color: "#f57f17",
		},
		{
			label: t("Processing"),
			value: data.processing ?? 0,
			Icon: Loader2,
			bg: "#e3f2fd",
			color: "#1565c0",
		},
		{
			label: t("Published"),
			value: data.published ?? 0,
			Icon: CheckCircle2,
			bg: "#e8f5e9",
			color: "#2e7d32",
		},
		{
			label: t("Archived"),
			value: data.archived ?? 0,
			Icon: Archive,
			bg: "var(--color-neutral-100)",
			color: "var(--color-neutral-600)",
		},
		{
			label: t("Rejected"),
			value: data.rejected ?? 0,
			Icon: XCircle,
			bg: "#ffebee",
			color: "#c62828",
		},
	];

	return (
		<div style={gridStyle}>
			{items.map((it) => (
				<div key={it.label} style={itemStyle(it.bg, it.color)}>
					<it.Icon aria-hidden="true" size={16} />
					<span>{it.label}</span>
					<span style={valueStyle}>{it.value}</span>
				</div>
			))}
		</div>
	);
}
