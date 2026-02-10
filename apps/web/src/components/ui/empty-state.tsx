"use client";

/**
 * Empty state component.
 * Used for no-data / empty search results, etc.
 */

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { AlertCircle, FileX, type LucideIcon, Search } from "lucide-react";
import { Button } from "./button";

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
}: EmptyStateProps) {
	const config = variantConfig[variant];
	const Icon = icon || config.icon;

	return (
		<div
			className={cn(
				"flex flex-col items-center justify-center py-16 px-4 text-center",
				className,
			)}
		>
			{/* Icon */}
			<div
				className={cn(
					"flex h-16 w-16 items-center justify-center rounded-full mb-4",
					config.iconBg,
				)}
			>
				<Icon aria-hidden="true" className={cn("h-8 w-8", config.iconColor)} />
			</div>

			{/* Title */}
			<h3 className="text-lg font-semibold text-neutral-900 mb-2">{title}</h3>

			{/* Description */}
			{description && (
				<p className="text-sm text-neutral-500 max-w-sm mb-6">{description}</p>
			)}

			{/* Action */}
			{action && (
				<Button variant="outline" onClick={action.onClick}>
					{action.label}
				</Button>
			)}
		</div>
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
