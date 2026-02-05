"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	type Article,
	type ArticleRiskLevel,
	getArticleRiskLevel,
} from "@/lib/api/types";
import {
	type Locale,
	formatDateTime,
	formatTimeAgo,
	withLocalePath,
} from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { buttonTapEffect, cardHoverEffect, fadeVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	Bookmark,
	BookmarkCheck,
	Clock,
	ExternalLink,
	HelpCircle,
	Shield,
	ShieldAlert,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, forwardRef } from "react";

// ============================================
// Types
// ============================================

interface ArticleCardProps {
	article: Article;
	/** Category name */
	categoryName?: string;
	/** Category icon */
	categoryIcon?: string;
	/** Whether the article is bookmarked */
	isBookmarked?: boolean;
	/** Bookmark callback */
	onBookmark?: (id: string) => void;
	/** Click handler (if you don't want to use a Link) */
	onClick?: (article: Article) => void;
	/** Custom class name */
	className?: string;
	/** Whether to show summary */
	showSummary?: boolean;
	/** Variant: default/compact */
	variant?: "default" | "compact";
	/** Animation delay (for stagger) */
	animationDelay?: number;
}

// ============================================
// Risk level
// ============================================

const riskConfig: Record<
	ArticleRiskLevel,
	{
		label: string;
		color: string;
		bgColor: string;
		borderColor: string;
		icon: ReactNode;
	}
> = {
	unknown: {
		label: "Unrated",
		color: "text-neutral-700",
		bgColor: "bg-neutral-100",
		borderColor: "border-neutral-200",
		icon: <HelpCircle className="h-3.5 w-3.5" />,
	},
	low: {
		label: "Low risk",
		color: "text-green-700",
		bgColor: "bg-green-50",
		borderColor: "border-green-200",
		icon: <ShieldCheck className="h-3.5 w-3.5" />,
	},
	medium: {
		label: "Medium risk",
		color: "text-amber-700",
		bgColor: "bg-amber-50",
		borderColor: "border-amber-200",
		icon: <Shield className="h-3.5 w-3.5" />,
	},
	high: {
		label: "High risk",
		color: "text-orange-700",
		bgColor: "bg-orange-50",
		borderColor: "border-orange-200",
		icon: <ShieldAlert className="h-3.5 w-3.5" />,
	},
	critical: {
		label: "Critical",
		color: "text-red-700",
		bgColor: "bg-red-50",
		borderColor: "border-red-200",
		icon: <AlertTriangle className="h-3.5 w-3.5" />,
	},
};

function formatRelativeTime(
	locale: Locale,
	date: string | null | undefined,
): string {
	if (!date) return "";

	const then = new Date(date);
	const now = new Date();
	const diffMs = now.getTime() - then.getTime();
	if (!Number.isFinite(diffMs)) return "";

	const diffDays = Math.floor(diffMs / 86400000);
	if (diffDays >= 7) {
		return formatDateTime(locale, then, { month: "short", day: "numeric" });
	}
	return formatTimeAgo(locale, then);
}

// ============================================
// ArticleCard
// ============================================

export const ArticleCard = forwardRef<HTMLDivElement, ArticleCardProps>(
	(
		{
			article,
			categoryName,
			categoryIcon,
			isBookmarked = false,
			onBookmark,
			onClick,
			className,
			showSummary = true,
			variant = "default",
			animationDelay = 0,
		},
		ref,
	) => {
		const locale = useLocale();
		const t = useT();

		const riskLevel = getArticleRiskLevel(article.risk_score);
		const risk = riskConfig[riskLevel];
		const relativeTime = formatRelativeTime(locale, article.published_at);

		const handleBookmarkClick = (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onBookmark?.(article.id);
		};

		const CardContent = (
			<motion.div
				ref={ref}
				variants={fadeVariants}
				initial="hidden"
				animate="visible"
				whileHover={cardHoverEffect}
				whileTap={buttonTapEffect}
				transition={{ delay: animationDelay }}
				className={cn(
					// Base styles
					"group relative rounded-xl border bg-white transition-all duration-200",
					"hover:shadow-lg hover:border-primary-200",
					// Left risk indicator
					"before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-full before:transition-all",
					riskLevel === "unknown" && "before:bg-neutral-300",
					riskLevel === "low" && "before:bg-green-400",
					riskLevel === "medium" && "before:bg-amber-400",
					riskLevel === "high" && "before:bg-orange-400",
					riskLevel === "critical" && "before:bg-red-400",
					// Variant styles
					variant === "default" && "p-4 pl-5",
					variant === "compact" && "p-3 pl-4",
					className,
				)}
			>
				{/* Header */}
				<div className="flex items-center justify-between mb-2">
					<div className="flex items-center gap-2 flex-wrap">
						{/* Risk */}
						<span
							className={cn(
								"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
								risk.bgColor,
								risk.color,
							)}
						>
							{risk.icon}
							{t(risk.label)}
						</span>

						{/* Category */}
						{categoryName && (
							<Badge variant="outline" className="text-xs">
								{categoryIcon} {categoryName}
							</Badge>
						)}

						{/* Status */}
						{article.status && article.status !== "published" && (
							<Badge variant="secondary" className="text-xs">
								{article.status}
							</Badge>
						)}
					</div>

					{/* Bookmark */}
					{onBookmark && (
						<Button
							variant="ghost"
							size="icon"
							className="relative z-20 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
							onClick={handleBookmarkClick}
						>
							{isBookmarked ? (
								<BookmarkCheck className="h-4 w-4 text-primary-500" />
							) : (
								<Bookmark className="h-4 w-4" />
							)}
						</Button>
					)}
				</div>

				{/* Title */}
				<h3
					className={cn(
						"font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors line-clamp-2",
						variant === "default" && "text-base",
						variant === "compact" && "text-sm",
					)}
				>
					{article.title}
				</h3>

				{/* Summary */}
				{showSummary && article.summary && variant === "default" && (
					<p className="mt-2 text-sm text-neutral-500 line-clamp-2">
						{article.summary}
					</p>
				)}

				{/* Meta */}
				<div className="mt-3 flex items-center justify-between text-xs text-neutral-400">
					<div className="flex items-center gap-3">
						{/* Author */}
						{article.author && (
							<span className="text-neutral-500">{article.author}</span>
						)}
						{/* Time */}
						{relativeTime && (
							<span className="flex items-center gap-1">
								<Clock className="h-3 w-3" />
								{relativeTime}
							</span>
						)}
					</div>

					{/* External */}
					{article.link && (
						<ExternalLink className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" />
					)}
				</div>
			</motion.div>
		);

		// Custom click handler.
		if (onClick) {
			return (
				<div className="relative">
					<button
						type="button"
						className="absolute inset-0 z-10 cursor-pointer rounded-xl bg-transparent p-0 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
						onClick={() => onClick(article)}
						aria-label={article.title}
					/>
					{CardContent}
				</div>
			);
		}

		// Default: Link
		return (
			<Link
				href={withLocalePath(locale, `/articles/${article.id}`)}
				className="block"
			>
				{CardContent}
			</Link>
		);
	},
);

ArticleCard.displayName = "ArticleCard";

// ============================================
// ArticleCardSkeleton
// ============================================

export function ArticleCardSkeleton({
	variant = "default",
}: {
	variant?: "default" | "compact";
}) {
	return (
		<div
			className={cn(
				"rounded-xl border border-neutral-100 bg-white animate-pulse",
				variant === "default" && "p-4 pl-5",
				variant === "compact" && "p-3 pl-4",
			)}
		>
			{/* Badges */}
			<div className="flex gap-2 mb-3">
				<div className="h-5 w-14 rounded-full bg-neutral-100" />
				<div className="h-5 w-16 rounded-full bg-neutral-100" />
			</div>
			{/* Title */}
			<div className="h-5 w-full rounded bg-neutral-100 mb-2" />
			<div className="h-5 w-3/4 rounded bg-neutral-100" />
			{/* Summary */}
			{variant === "default" && (
				<div className="mt-3 space-y-1.5">
					<div className="h-4 w-full rounded bg-neutral-50" />
					<div className="h-4 w-2/3 rounded bg-neutral-50" />
				</div>
			)}
			{/* Meta */}
			<div className="mt-3 flex gap-4">
				<div className="h-3 w-16 rounded bg-neutral-50" />
				<div className="h-3 w-12 rounded bg-neutral-50" />
			</div>
		</div>
	);
}

// ============================================
// Export
// ============================================

export default ArticleCard;
