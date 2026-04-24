"use client";

/**
 * Skeleton components.
 * Loading placeholders with shimmer animation.
 */

import { cn } from "@/lib/utils";

// ============================================
// Type definitions
// ============================================

export type SkeletonVariant = "text" | "circular" | "rectangular" | "card";

interface SkeletonProps {
	/** Variant */
	variant?: SkeletonVariant;
	/** Width */
	width?: string | number;
	/** Height */
	height?: string | number;
	/** Repeat count */
	count?: number;
	/** Custom class name */
	className?: string;
}

// ============================================
// Base skeleton
// ============================================

function createStableKeys(count: number, prefix: string): string[] {
	return Array.from({ length: count }, (_, idx) => `${prefix}-${idx}`);
}

export function Skeleton({
	variant = "text",
	width,
	height,
	count = 1,
	className,
}: SkeletonProps) {
	const baseStyles = cn(
		"animate-shimmer bg-gradient-to-r from-neutral-200 via-neutral-100 to-neutral-200 bg-[length:200%_100%]",
		{
			"h-4 rounded": variant === "text",
			"rounded-full": variant === "circular",
			"rounded-lg": variant === "rectangular",
			"rounded-xl": variant === "card",
		},
		className,
	);

	const style: React.CSSProperties = {
		width: typeof width === "number" ? `${width}px` : width,
		height: typeof height === "number" ? `${height}px` : height,
	};

	if (count === 1) {
		return <div className={baseStyles} style={style} />;
	}

	return (
		<div className="space-y-2">
			{createStableKeys(count, `skeleton:${variant}`).map((key) => (
				<div key={key} className={baseStyles} style={style} />
			))}
		</div>
	);
}

// ============================================
// Presets
// ============================================

/** Article card skeleton. */
export function ArticleCardSkeleton() {
	return (
		<div className="rounded-xl border border-neutral-100 bg-white p-4 space-y-3">
			{/* Tags */}
			<div className="flex gap-2">
				<Skeleton variant="rectangular" width={60} height={24} />
				<Skeleton variant="rectangular" width={48} height={24} />
			</div>
			{/* Title */}
			<Skeleton variant="text" width="100%" height={24} />
			<Skeleton variant="text" width="85%" height={20} />
			{/* Metadata */}
			<div className="flex gap-4 pt-2">
				<Skeleton variant="text" width={80} height={16} />
				<Skeleton variant="text" width={60} height={16} />
			</div>
		</div>
	);
}

/** Stats card skeleton. */
export function StatCardSkeleton() {
	return (
		<div className="rounded-xl border border-neutral-100 bg-white p-6">
			<div className="flex items-center justify-between">
				<div className="space-y-2">
					<Skeleton variant="text" width={80} height={16} />
					<Skeleton variant="text" width={120} height={32} />
				</div>
				<Skeleton variant="circular" width={48} height={48} />
			</div>
		</div>
	);
}

/** Article content skeleton. */
export function ArticleContentSkeleton() {
	return (
		<div className="space-y-6 max-w-2xl mx-auto">
			{/* Title */}
			<div className="space-y-3">
				<Skeleton variant="text" width="90%" height={36} />
				<Skeleton variant="text" width="60%" height={36} />
			</div>
			{/* Metadata */}
			<div className="flex gap-4">
				<Skeleton variant="text" width={100} height={20} />
				<Skeleton variant="text" width={80} height={20} />
			</div>
			{/* Body */}
			<div className="space-y-4 pt-8">
				<Skeleton variant="text" count={4} />
				<Skeleton variant="text" width="70%" />
				<div className="py-4">
					<Skeleton variant="rectangular" width="100%" height={200} />
				</div>
				<Skeleton variant="text" count={3} />
				<Skeleton variant="text" width="85%" />
			</div>
		</div>
	);
}

/** Sidebar skeleton. */
export function SidebarSkeleton() {
	return (
		<div className="space-y-4 p-4">
			{/* Logo */}
			<div className="flex items-center gap-3 pb-4 border-b border-neutral-100">
				<Skeleton variant="circular" width={40} height={40} />
				<Skeleton variant="text" width={100} height={24} />
			</div>
			{/* Nav items */}
			<div className="space-y-2">
				{createStableKeys(6, "sidebar-skeleton-item").map((key) => (
					<div key={key} className="flex items-center gap-3 px-3 py-2">
						<Skeleton variant="rectangular" width={20} height={20} />
						<Skeleton variant="text" width={80} height={18} />
					</div>
				))}
			</div>
		</div>
	);
}

interface ChartPanelSkeletonProps {
	/** Height of the chart plotting area in pixels. Defaults to 224. */
	height?: number;
}

/** Chart panel skeleton. */
export function ChartPanelSkeleton({ height = 224 }: ChartPanelSkeletonProps = {}) {
	return (
		<div className="rounded-xl border border-neutral-100 bg-white p-4 space-y-4">
			{/* Toolbar */}
			<div className="flex items-center justify-between">
				<div className="flex gap-2">
					<Skeleton variant="rectangular" width={96} height={28} />
					<Skeleton variant="rectangular" width={72} height={28} />
				</div>
				<Skeleton variant="rectangular" width={120} height={28} />
			</div>
			{/* Chart grid */}
			<div className="relative" style={{ height }}>
				<div className="absolute inset-0 grid grid-rows-4">
					{createStableKeys(4, "chart-panel-grid-row").map((key) => (
						<div
							key={key}
							className="border-b border-dashed border-neutral-100"
						/>
					))}
				</div>
				<div className="absolute inset-0 flex items-end gap-3 px-3 pb-2">
					{createStableKeys(8, "chart-panel-bar").map((key, idx) => (
						<Skeleton
							key={key}
							variant="rectangular"
							width="100%"
							height={`${30 + (idx * 11) % 60}%`}
							className="flex-1"
						/>
					))}
				</div>
			</div>
			{/* Legend */}
			<div className="flex flex-wrap gap-3 pt-2">
				{createStableKeys(4, "chart-panel-legend").map((key) => (
					<div key={key} className="flex items-center gap-2">
						<Skeleton variant="circular" width={12} height={12} />
						<Skeleton variant="text" width={72} height={14} />
					</div>
				))}
			</div>
		</div>
	);
}

/** List skeleton. */
export function ListSkeleton({ count = 5 }: { count?: number }) {
	return (
		<div className="space-y-4">
			{createStableKeys(count, "list-skeleton-item").map((key) => (
				<ArticleCardSkeleton key={key} />
			))}
		</div>
	);
}
