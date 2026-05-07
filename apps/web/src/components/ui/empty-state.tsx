"use client";

/**
 * Empty state component.
 * Used for no-data / empty search results, etc.
 */

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { motion, useReducedMotion } from "framer-motion";
import { AlertCircle, FileX, type LucideIcon, Search } from "lucide-react";
import type { ReactNode } from "react";
import { Button } from "./button";
import {
	NoArticlesIllustration,
	NoBookmarksIllustration,
	NoFeedIllustration,
	NoReportsIllustration,
	NotFoundIllustration,
	UnauthorizedIllustration,
} from "./empty-state-illustrations";

// ============================================
// Type definitions
// ============================================

export type EmptyStateVariant = "default" | "search" | "error";

interface EmptyStateProps {
	/** Custom icon */
	icon?: LucideIcon;
	/** Title */
	title: string;
	/** Description */
	description?: string;
	/** Action button */
	action?: {
		label: string;
		onClick: () => void;
	};
	/** Variant */
	variant?: EmptyStateVariant;
	/** Custom class name */
	className?: string;
	/**
	 * Optional bespoke illustration. When provided, the icon-circle is replaced
	 * with the supplied node (typically an SVG illustration from
	 * `empty-state-illustrations.tsx`).
	 */
	illustration?: ReactNode;
}

// ============================================
// Variants
// ============================================

const variantConfig: Record<
	EmptyStateVariant,
	{ icon: LucideIcon; iconBg: string; iconColor: string }
> = {
	default: {
		icon: FileX,
		iconBg: "bg-neutral-100",
		iconColor: "text-neutral-400",
	},
	search: {
		icon: Search,
		iconBg: "bg-primary-50",
		iconColor: "text-primary-400",
	},
	error: {
		icon: AlertCircle,
		iconBg: "bg-red-50",
		iconColor: "text-red-400",
	},
};

// ============================================
// Component
// ============================================

export function EmptyState({
	icon,
	title,
	description,
	action,
	variant = "default",
	className,
	illustration,
}: EmptyStateProps) {
	const config = variantConfig[variant];
	const Icon = icon || config.icon;
	const reducedMotion = useReducedMotion() ?? false;

	return (
		<motion.div
			initial={reducedMotion ? false : { opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{
				duration: reducedMotion ? 0.12 : 0.32,
				ease: [0.4, 0, 0.2, 1],
			}}
			className={cn(
				"flex flex-col items-center justify-center py-16 px-4 text-center",
				className,
			)}
		>
			{illustration ? (
				<motion.div
					aria-hidden="true"
					initial={reducedMotion ? false : { opacity: 0, scale: 0.96 }}
					animate={{ opacity: 1, scale: 1 }}
					transition={{ duration: 0.4, delay: 0.05 }}
					className="mb-4 h-32 w-44"
				>
					{illustration}
				</motion.div>
			) : (
				<div
					className={cn(
						"flex h-16 w-16 items-center justify-center rounded-full mb-4",
						config.iconBg,
					)}
				>
					<Icon aria-hidden="true" className={cn("h-8 w-8", config.iconColor)} />
				</div>
			)}

			<h3 className="text-lg font-semibold text-neutral-900 mb-2 dark:text-neutral-100">
				{title}
			</h3>

			{description && (
				<p className="text-sm text-neutral-500 max-w-sm mb-6 dark:text-neutral-400">
					{description}
				</p>
			)}

			{action && (
				<Button variant="outline" onClick={action.onClick}>
					{action.label}
				</Button>
			)}
		</motion.div>
	);
}

// ============================================
// Presets
// ============================================

interface PresetEmptyStateProps {
	/** Custom title */
	title?: string;
	/** Custom description */
	description?: string;
	/** Action label (shortcut) */
	actionLabel?: string;
	/** Action callback (shortcut) */
	onAction?: () => void;
	/** Action (full) */
	action?: {
		label: string;
		onClick: () => void;
	};
	className?: string;
}

/** No data preset. */
export function NoDataState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();

	const resolvedTitle = title ?? t("No data");
	const resolvedDescription = description ?? t("There is nothing to show yet.");

	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			title={resolvedTitle}
			description={resolvedDescription}
			action={finalAction}
			className={className}
		/>
	);
}

/** Empty search preset. */
export function NoSearchResultState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();

	const resolvedTitle = title ?? t("No results found");
	const resolvedDescription =
		description ?? t("Try adjusting your keywords or filters.");

	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="search"
			title={resolvedTitle}
			description={resolvedDescription}
			action={finalAction}
			className={className}
		/>
	);
}

/** Load error preset. */
export function ErrorState({ action, className }: PresetEmptyStateProps) {
	const t = useT();

	return (
		<EmptyState
			variant="error"
			title={t("Load failed")}
			description={t(
				"An error occurred while loading. Please try again later.",
			)}
			action={
				action || { label: t("Retry"), onClick: () => window.location.reload() }
			}
			className={className}
		/>
	);
}

/** No articles — bespoke variant with hand-drawn illustration. */
export function NoArticlesState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			illustration={<NoArticlesIllustration className="h-full w-full" />}
			title={title ?? t("No articles yet")}
			description={
				description ??
				t(
					"Looks like there's nothing here right now — adjust filters or wait for the next harvest.",
				)
			}
			action={finalAction}
			className={className}
		/>
	);
}

export function NoFeedState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			illustration={<NoFeedIllustration className="h-full w-full" />}
			title={title ?? t("Your feed is quiet")}
			description={
				description ??
				t("Subscribe to more sources or follow categories to start receiving updates.")
			}
			action={finalAction}
			className={className}
		/>
	);
}

export function NoReportsState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			illustration={<NoReportsIllustration className="h-full w-full" />}
			title={title ?? t("No reports yet")}
			description={
				description ??
				t("Generate your first report or schedule a recurring digest from the toolbar above.")
			}
			action={finalAction}
			className={className}
		/>
	);
}

export function NoBookmarksState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			illustration={<NoBookmarksIllustration className="h-full w-full" />}
			title={title ?? t("Nothing bookmarked yet")}
			description={
				description ??
				t("Tap the bookmark icon on any article to save it for later reading.")
			}
			action={finalAction}
			className={className}
		/>
	);
}

export function UnauthorizedState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="error"
			illustration={<UnauthorizedIllustration className="h-full w-full" />}
			title={title ?? t("Access denied")}
			description={
				description ??
				t("You do not have permission to view this resource. Sign in or contact your admin.")
			}
			action={finalAction}
			className={className}
		/>
	);
}

export function NotFoundState({
	title,
	description,
	action,
	actionLabel,
	onAction,
	className,
}: PresetEmptyStateProps) {
	const t = useT();
	const finalAction =
		action ||
		(actionLabel && onAction
			? { label: actionLabel, onClick: onAction }
			: undefined);
	return (
		<EmptyState
			variant="default"
			illustration={<NotFoundIllustration className="h-full w-full" />}
			title={title ?? t("We can not find that page")}
			description={
				description ??
				t("The link may be outdated or the resource was moved. Try going home.")
			}
			action={finalAction}
			className={className}
		/>
	);
}
