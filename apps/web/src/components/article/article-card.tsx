"use client";

import { ReactionToggle } from "@/components/reactions/reaction-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useLongPress } from "@/hooks/use-long-press";
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
import { useToast } from "@/stores/toast-store";
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
import { type ReactNode, forwardRef, useCallback } from "react";

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
	/** Long-press handler (mobile/touch friendly). */
	onLongPress?: (article: Article) => void;
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
		color: "text-neutral-700 dark:text-neutral-300",
		bgColor: "bg-neutral-100 dark:bg-white/10",
		borderColor: "border-neutral-200 dark:border-white/15",
		icon: <HelpCircle aria-hidden="true" className="h-3.5 w-3.5" />,
	},
	low: {
		label: "Low risk",
		color: "text-green-700 dark:text-green-300",
		bgColor: "bg-green-50 dark:bg-green-500/15",
		borderColor: "border-green-200 dark:border-green-500/30",
		icon: <ShieldCheck aria-hidden="true" className="h-3.5 w-3.5" />,
	},
	medium: {
		label: "Medium risk",
		color: "text-amber-700 dark:text-amber-300",
		bgColor: "bg-amber-50 dark:bg-amber-500/15",
		borderColor: "border-amber-200 dark:border-amber-500/30",
		icon: <Shield aria-hidden="true" className="h-3.5 w-3.5" />,
	},
	high: {
		label: "High risk",
		color: "text-orange-700 dark:text-orange-300",
		bgColor: "bg-orange-50 dark:bg-orange-500/15",
		borderColor: "border-orange-200 dark:border-orange-500/30",
		icon: <ShieldAlert aria-hidden="true" className="h-3.5 w-3.5" />,
	},
	critical: {
		label: "Critical",
		color: "text-red-700 dark:text-red-300",
		bgColor: "bg-red-50 dark:bg-red-500/15",
		borderColor: "border-red-200 dark:border-red-500/30",
		icon: <AlertTriangle aria-hidden="true" className="h-3.5 w-3.5" />,
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
			onLongPress,
			className,
			showSummary = true,
			variant = "default",
			animationDelay = 0,
		},
		ref,
	) => {
		const locale = useLocale();
		const t = useT();
		const { success: toastSuccess } = useToast();

		const riskLevel = getArticleRiskLevel(article.risk_score);
		const risk = riskConfig[riskLevel];
		const relativeTime = formatRelativeTime(locale, article.published_at);

		const handleBookmarkClick = (e: React.MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			onBookmark?.(article.id);
		};

		const handleLongPress = useCallback(async () => {
			if (onLongPress) {
				onLongPress(article);
				return;
			}

			if (!article.link || !navigator?.clipboard) {
				return;
			}

			try {
				await navigator.clipboard.writeText(article.link);
				toastSuccess(t("Article link copied"));
			} catch {
				// Ignore clipboard failures to avoid breaking card interactions.
			}
		}, [article, onLongPress, t, toastSuccess]);

		const longPressHandlers = useLongPress({
			enabled: Boolean(onLongPress || article.link),
			onLongPress: () => {
				void handleLongPress();
			},
		});

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
					"group relative rounded-xl border bg-white transition-all duration-200 dark:bg-neutral-900 dark:border-white/10",
					"hover:shadow-lg hover:border-primary-200 dark:hover:border-primary-400/40",
					// Left risk indicator
					"before:absolute before:left-0 before:top-3 before:bottom-3 before:w-1 before:rounded-full before:transition-all",
					riskLevel === "unknown" && "before:bg-neutral-300 dark:before:bg-white/20",
					riskLevel === "low" && "before:bg-green-400 dark:before:bg-green-500",
					riskLevel === "medium" && "before:bg-amber-400 dark:before:bg-amber-500",
					riskLevel === "high" && "before:bg-orange-400 dark:before:bg-orange-500",
					riskLevel === "critical" && "before:bg-red-400 dark:before:bg-red-500",
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
								<BookmarkCheck
									aria-hidden="true"
									className="h-4 w-4 text-primary-500"
								/>
							) : (
								<Bookmark aria-hidden="true" className="h-4 w-4" />
							)}
						</Button>
					)}
				</div>

				{/* Title */}
				<h3
					className={cn(
						"font-semibold text-neutral-900 group-hover:text-primary-600 transition-colors line-clamp-2 dark:text-neutral-50 dark:group-hover:text-primary-300",
						variant === "default" && "text-base",
						variant === "compact" && "text-sm",
					)}
				>
					{article.title}
				</h3>

				{/* Summary */}
				{showSummary && article.summary && variant === "default" && (
					<p className="mt-2 text-sm text-neutral-500 line-clamp-2 dark:text-neutral-400">
						{article.summary}
					</p>
				)}

				{/* Meta */}
				<div className="mt-3 flex items-center justify-between text-xs text-neutral-400 dark:text-neutral-500">
					<div className="flex items-center gap-3">
						{/* Author */}
						{article.author && (
							<span className="text-neutral-500 dark:text-neutral-400">{article.author}</span>
						)}
						{/* Time */}
						{relativeTime && (
							<span className="flex items-center gap-1">
								<Clock aria-hidden="true" className="h-3 w-3" />
								{relativeTime}
							</span>
						)}
					</div>

					{/* External */}
					{article.link && (
						<ExternalLink
							aria-hidden="true"
							className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity"
						/>
					)}
				</div>

				{/* Reactions footer — interactive, must sit above the card-wide link/button overlay. */}
				<div
					className={cn(
						"relative z-20 mt-3 flex items-center justify-end",
						variant === "compact" && "mt-2",
					)}
					onClick={(e) => e.stopPropagation()}
					onMouseDown={(e) => e.stopPropagation()}
					onPointerDown={(e) => e.stopPropagation()}
					onKeyDown={(e) => e.stopPropagation()}
				>
					<ReactionToggle
						targetType="article"
						targetId={article.id}
						initialSummary={article.reaction_summary ?? null}
						variant="inline"
						lazy
					/>
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
						{...longPressHandlers}
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
				{...longPressHandlers}
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
				"rounded-xl border border-neutral-100 bg-white animate-pulse dark:border-white/10 dark:bg-neutral-900",
				variant === "default" && "p-4 pl-5",
				variant === "compact" && "p-3 pl-4",
			)}
		>
			{/* Badges */}
			<div className="flex gap-2 mb-3">
				<div className="h-5 w-14 rounded-full bg-neutral-100 dark:bg-white/10" />
				<div className="h-5 w-16 rounded-full bg-neutral-100 dark:bg-white/10" />
			</div>
			{/* Title */}
			<div className="h-5 w-full rounded bg-neutral-100 mb-2 dark:bg-white/10" />
			<div className="h-5 w-3/4 rounded bg-neutral-100 dark:bg-white/10" />
			{/* Summary */}
			{variant === "default" && (
				<div className="mt-3 space-y-1.5">
					<div className="h-4 w-full rounded bg-neutral-50 dark:bg-white/5" />
					<div className="h-4 w-2/3 rounded bg-neutral-50 dark:bg-white/5" />
				</div>
			)}
			{/* Meta */}
			<div className="mt-3 flex gap-4">
				<div className="h-3 w-16 rounded bg-neutral-50 dark:bg-white/5" />
				<div className="h-3 w-12 rounded bg-neutral-50 dark:bg-white/5" />
			</div>
		</div>
	);
}

// ============================================
// Export
// ============================================

export default ArticleCard;
