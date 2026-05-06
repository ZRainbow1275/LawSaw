"use client";

import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";
import * as React from "react";

/**
 * mp4 真值 KPI 卡片 (design-system.md §4.3).
 *
 * - 默认 4px 语义色 accent (左侧撑满高度，对齐 mp4 dashboard frame)
 * - accentSide 可切换 "left" (默认) | "top" | "none"
 * - 4 个 tone: info / success / warning / error
 * - 不带装饰性 hover gradient (与 ui/card.tsx 默认 ::before 不同)
 * - 网格通过 <KpiCardGrid columns={2|3|4|5}> 包裹，响应式 1 → 2 → 3 → 4|5
 * - 数字使用 tabular-nums + variant-bold，趋势使用 success/error 语义
 *
 * 使用：
 *   <KpiCardGrid columns={4}>
 *     <KpiCard tone="info" label="Articles" value={1240} icon={FileText} trend="+12%" />
 *     ...
 *   </KpiCardGrid>
 */

export type KpiTone = "info" | "success" | "warning" | "error";

const TONE_VARS: Record<
	KpiTone,
	{ accent: string; iconBg: string; iconColor: string }
> = {
	info: {
		accent: "var(--cat-legislation)",
		iconBg: "color-mix(in srgb, var(--cat-legislation) 12%, transparent)",
		iconColor: "var(--cat-legislation)",
	},
	success: {
		accent: "var(--color-success)",
		iconBg: "color-mix(in srgb, var(--color-success) 12%, transparent)",
		iconColor: "var(--color-success)",
	},
	warning: {
		accent: "var(--cat-industry)",
		iconBg: "color-mix(in srgb, var(--cat-industry) 12%, transparent)",
		iconColor: "var(--cat-industry)",
	},
	error: {
		accent: "var(--color-error)",
		iconBg: "color-mix(in srgb, var(--color-error) 12%, transparent)",
		iconColor: "var(--color-error)",
	},
};

export type KpiAccentSide = "left" | "top" | "none";

export interface KpiCardProps extends React.HTMLAttributes<HTMLDivElement> {
	label: string;
	value: string | number;
	trend?: string;
	trendUp?: boolean;
	icon?: LucideIcon;
	tone?: KpiTone;
	subtitle?: string;
	accentSide?: KpiAccentSide;
}

export const KpiCard = React.forwardRef<HTMLDivElement, KpiCardProps>(
	function KpiCard(
		{
			label,
			value,
			trend,
			trendUp,
			icon: Icon,
			tone = "info",
			subtitle,
			accentSide = "left",
			className,
			...rest
		},
		ref,
	) {
		const palette = TONE_VARS[tone];
		const trendColor =
			trendUp === undefined
				? "var(--surface-muted-text)"
				: trendUp
					? "var(--color-success)"
					: "var(--color-error)";

		const accentClass =
			accentSide === "top"
				? "absolute inset-x-0 top-0 h-1"
				: "absolute inset-y-0 left-0 w-1";

		return (
			<div
				ref={ref}
				data-slot="kpi-card"
				data-tone={tone}
				data-accent-side={accentSide}
				className={cn(
					"group relative flex flex-col gap-3 overflow-hidden rounded-2xl border p-5 transition-shadow",
					"hover:shadow-card-hover",
					className,
				)}
				style={{
					backgroundColor: "var(--color-card)",
					borderColor: "var(--surface-muted-border)",
					boxShadow: "var(--shadow-card)",
				}}
				{...rest}
			>
				{accentSide === "none" ? null : (
					<span
						aria-hidden
						className={accentClass}
						style={{ backgroundColor: palette.accent }}
					/>
				)}

				<div className="flex items-center justify-between">
					<span
						className="text-xs font-medium uppercase tracking-wide"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{label}
					</span>
					{Icon ? (
						<span
							className="flex h-9 w-9 items-center justify-center rounded-lg"
							style={{ backgroundColor: palette.iconBg, color: palette.iconColor }}
						>
							<Icon aria-hidden className="h-4 w-4" />
						</span>
					) : null}
				</div>

				<div className="flex items-baseline gap-2">
					<span
						className="text-3xl font-bold tabular-nums leading-none"
						style={{ color: "var(--field-foreground)" }}
					>
						{value}
					</span>
					{trend ? (
						<span
							className="text-sm font-medium"
							style={{ color: trendColor }}
						>
							{trend}
						</span>
					) : null}
				</div>

				{subtitle ? (
					<span
						className="text-xs"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{subtitle}
					</span>
				) : null}
			</div>
		);
	},
);

export interface KpiCardGridProps
	extends React.HTMLAttributes<HTMLDivElement> {
	columns?: 2 | 3 | 4 | 5;
}

export const KpiCardGrid = React.forwardRef<HTMLDivElement, KpiCardGridProps>(
	function KpiCardGrid({ columns = 4, className, children, ...rest }, ref) {
		const colsClass =
			columns === 2
				? "grid-cols-1 sm:grid-cols-2"
				: columns === 3
					? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3"
					: columns === 5
						? "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5"
						: "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4";
		return (
			<div
				ref={ref}
				data-slot="kpi-card-grid"
				className={cn("grid gap-4", colsClass, className)}
				{...rest}
			>
				{children}
			</div>
		);
	},
);
