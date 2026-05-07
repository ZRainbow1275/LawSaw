"use client";

/**
 * Security indicator component.
 * Displays encryption and integrity status.
 */

import { type Locale, formatDateTime, formatTimeAgo } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	CheckCircle2,
	Clock,
	type Shield,
	ShieldAlert,
	ShieldCheck,
	ShieldX,
} from "lucide-react";

// ============================================
// Type definitions
// ============================================

export type EncryptionStatus = "active" | "inactive" | "unknown";
export type DataIntegrity = "verified" | "pending" | "failed";

interface SecurityIndicatorProps {
	/** Encryption status */
	encryptionStatus: EncryptionStatus;
	/** Last sync time */
	lastSyncTime?: Date;
	/** Data integrity status */
	dataIntegrity?: DataIntegrity;
	/** Click handler */
	onClick?: () => void;
	/** Compact mode */
	compact?: boolean;
	/** Custom class name */
	className?: string;
}

// ============================================
// Config
// ============================================

const statusConfig: Record<
	EncryptionStatus,
	{
		icon: typeof Shield;
		label: string;
		description: string;
		bgColor: string;
		borderColor: string;
		iconColor: string;
		pulseColor: string;
	}
> = {
	active: {
		icon: ShieldCheck,
		label: "Encryption enabled",
		description: "All data is transmitted securely",
		bgColor: "bg-green-50 dark:bg-green-500/10",
		borderColor: "border-green-200 dark:border-green-500/30",
		iconColor: "text-green-600 dark:text-green-300",
		pulseColor: "bg-green-500",
	},
	inactive: {
		icon: ShieldAlert,
		label: "Encryption disabled",
		description: "Enable encryption for better security",
		bgColor: "bg-amber-50 dark:bg-amber-500/10",
		borderColor: "border-amber-200 dark:border-amber-500/30",
		iconColor: "text-amber-600 dark:text-amber-300",
		pulseColor: "bg-amber-500",
	},
	unknown: {
		icon: ShieldX,
		label: "Unknown status",
		description: "Unable to retrieve security status",
		bgColor: "bg-neutral-50 dark:bg-white/5",
		borderColor: "border-neutral-200 dark:border-white/10",
		iconColor: "text-neutral-400 dark:text-neutral-500",
		pulseColor: "bg-neutral-400",
	},
};

const integrityConfig: Record<
	DataIntegrity,
	{ icon: typeof CheckCircle2; label: string; color: string }
> = {
	verified: {
		icon: CheckCircle2,
		label: "Integrity verified",
		color: "text-green-600 dark:text-green-300",
	},
	pending: {
		icon: Clock,
		label: "Verifying",
		color: "text-amber-600 dark:text-amber-300",
	},
	failed: {
		icon: ShieldX,
		label: "Verification failed",
		color: "text-red-600 dark:text-red-300",
	},
};

// ============================================
// Time formatting
// ============================================

function formatSyncTime(locale: Locale, date?: Date): string {
	if (!date) return "";
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();
	if (!Number.isFinite(diffMs)) return "";
	if (diffMs < 0) return formatDateTime(locale, date);

	const diffDays = Math.floor(diffMs / 86400000);
	if (diffDays >= 7) {
		return formatDateTime(locale, date, {
			year: "numeric",
			month: "short",
			day: "numeric",
		});
	}

	return formatTimeAgo(locale, date);
}

// ============================================
// Component
// ============================================

export function SecurityIndicator({
	encryptionStatus,
	lastSyncTime,
	dataIntegrity = "verified",
	onClick,
	compact = false,
	className,
}: SecurityIndicatorProps) {
	const locale = useLocale();
	const t = useT();
	const config = statusConfig[encryptionStatus];
	const integrity = integrityConfig[dataIntegrity];
	const Icon = config.icon;
	const IntegrityIcon = integrity.icon;

	if (compact) {
		return (
			<button
				type="button"
				onClick={onClick}
				className={cn(
					"flex items-center gap-2 rounded-lg px-3 py-2 transition-all",
					config.bgColor,
					config.borderColor,
					"border hover:shadow-sm",
					onClick && "cursor-pointer",
					className,
				)}
			>
				<div className="relative">
					<Icon
						aria-hidden="true"
						className={cn("h-4 w-4", config.iconColor)}
					/>
					{encryptionStatus === "active" && (
						<motion.span
							className={cn(
								"absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full",
								config.pulseColor,
							)}
							animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
							transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
						/>
					)}
				</div>
				<span className="text-xs font-medium text-neutral-700 dark:text-neutral-200">
					{t(config.label)}
				</span>
			</button>
		);
	}

	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				"flex items-center gap-3 rounded-xl p-4 transition-all",
				config.bgColor,
				config.borderColor,
				"border hover:shadow-md",
				onClick && "cursor-pointer",
				className,
			)}
		>
			{/* Icon */}
			<div className="relative shrink-0">
				<Icon aria-hidden="true" className={cn("h-6 w-6", config.iconColor)} />
				{encryptionStatus === "active" && (
					<motion.span
						className={cn(
							"absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full",
							config.pulseColor,
						)}
						animate={{ scale: [1, 1.3, 1], opacity: [1, 0.6, 1] }}
						transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
					/>
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0 text-left">
				<p className="text-sm font-semibold text-neutral-900 dark:text-neutral-50">
					{t(config.label)}
				</p>
				<p className="text-xs text-neutral-500 truncate dark:text-neutral-400">
					{t(config.description)}
				</p>
				{lastSyncTime && (
					<p className="text-xs text-neutral-400 mt-1 dark:text-neutral-500">
						{t("Last sync: ")}
						{formatSyncTime(locale, lastSyncTime)}
					</p>
				)}
			</div>

			{/* Integrity */}
			<div className="shrink-0 flex items-center gap-1">
				<IntegrityIcon
					aria-hidden="true"
					className={cn("h-4 w-4", integrity.color)}
				/>
				<span className="sr-only">{t(integrity.label)}</span>
			</div>
		</button>
	);
}

// ============================================
// Compact badge (Dashboard)
// ============================================

export function SecurityBadge({
	status = "active",
	className,
}: {
	status?: EncryptionStatus;
	className?: string;
}) {
	const t = useT();
	const config = statusConfig[status];
	const Icon = config.icon;

	return (
		<div
			className={cn(
				"inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
				config.bgColor,
				config.borderColor,
				"border",
				className,
			)}
		>
			<Icon
				aria-hidden="true"
				className={cn("h-3.5 w-3.5", config.iconColor)}
			/>
			<span className="text-neutral-700">{t(config.label)}</span>
		</div>
	);
}
