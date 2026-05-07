"use client";

/**
 * CategoryStatsRow — 10 cat-stat-card grid (5x2) mirroring
 * `prototype/app.html:1370-1381`. Each card: colored icon chip + name + count.
 *
 * Maps backend categories (or fallback to fixed 10-item prototype list when
 * counts API hasn't returned yet).
 */

import type { ArticleCategoryCount, Category } from "@/lib/api/types";
import {
	BarChart3,
	Briefcase,
	Building2,
	Flame,
	Globe2,
	GraduationCap,
	Lock,
	type LucideIcon,
	Scale,
	Scroll,
	ShieldCheck,
} from "lucide-react";
import type { CSSProperties } from "react";

interface CategoryStatsRowProps {
	categories?: Category[];
	counts?: ArticleCategoryCount[];
}

interface ProtoCat {
	slug: string;
	name: string;
	icon: LucideIcon;
	bg: string;
	color: string;
}

const PROTOTYPE_CATS: ProtoCat[] = [
	{
		slug: "legislation",
		name: "立法前沿",
		icon: Scroll,
		bg: "#3498db1F",
		color: "#3498db",
	},
	{
		slug: "regulation",
		name: "监管动向",
		icon: Building2,
		bg: "#9b59b61F",
		color: "#9b59b6",
	},
	{
		slug: "enforcement",
		name: "执法案例",
		icon: Scale,
		bg: "#e74c3c1F",
		color: "#e74c3c",
	},
	{
		slug: "industry",
		name: "业界资讯",
		icon: Briefcase,
		bg: "#f39c121F",
		color: "#f39c12",
	},
	{
		slug: "compliance",
		name: "合规前沿",
		icon: ShieldCheck,
		bg: "#27ae601F",
		color: "#27ae60",
	},
	{
		slug: "data",
		name: "数据动态",
		icon: BarChart3,
		bg: "#1abc9c1F",
		color: "#1abc9c",
	},
	{
		slug: "security",
		name: "安全资讯",
		icon: Lock,
		bg: "#e91e631F",
		color: "#e91e63",
	},
	{
		slug: "academic",
		name: "学术研究",
		icon: GraduationCap,
		bg: "#7955481F",
		color: "#795548",
	},
	{
		slug: "events",
		name: "行业活动",
		icon: Flame,
		bg: "#ff57221F",
		color: "#ff5722",
	},
	{
		slug: "international",
		name: "国际动态",
		icon: Globe2,
		bg: "#2196f31F",
		color: "#2196f3",
	},
];

const gridStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "repeat(5, 1fr)",
	gap: 12,
};

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 10,
	padding: "12px 14px",
	display: "flex",
	alignItems: "center",
	gap: 12,
};

const iconStyle = (bg: string, color: string): CSSProperties => ({
	width: 36,
	height: 36,
	borderRadius: 8,
	background: bg,
	color,
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
});

const nameStyle: CSSProperties = {
	fontSize: 13,
	fontWeight: 600,
	color: "var(--surface-card-foreground)",
};

const countStyle: CSSProperties = {
	fontSize: 12,
	color: "var(--surface-card-faint-fg)",
	marginTop: 2,
};

export function CategoryStatsRow({
	categories,
	counts,
}: CategoryStatsRowProps) {
	const countMap = new Map<string, number>();
	for (const row of counts ?? []) {
		if (row.category_id) countMap.set(row.category_id, row.count);
	}
	const slugCount = new Map<string, number>();
	for (const cat of categories ?? []) {
		const c = countMap.get(cat.id);
		if (c == null) continue;
		const slug =
			(cat.slug || cat.name || "").toString().toLowerCase().trim() || cat.id;
		slugCount.set(slug, (slugCount.get(slug) ?? 0) + c);
	}

	return (
		<div style={gridStyle}>
			{PROTOTYPE_CATS.map((c) => {
				// Best-effort match by slug. If no match, fall back to category list
				// position; if still none, show a real-but-sparse "0 篇" indicator.
				let count = slugCount.get(c.slug);
				if (count == null && categories?.length) {
					// Try exact name match
					const cat = categories.find(
						(x) => x.name === c.name || x.slug === c.slug,
					);
					if (cat) count = countMap.get(cat.id);
				}
				return (
					<div key={c.slug} style={cardStyle}>
						<div style={iconStyle(c.bg, c.color)}>
							<c.icon aria-hidden="true" size={18} />
						</div>
						<div>
							<div style={nameStyle}>{c.name}</div>
							<div style={countStyle}>{count ?? 0} 篇</div>
						</div>
					</div>
				);
			})}
		</div>
	);
}
