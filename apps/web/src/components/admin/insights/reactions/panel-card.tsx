"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { AlertTriangle, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface PanelCardProps {
	title: string;
	subtitle?: string;
	icon?: LucideIcon;
	actions?: ReactNode;
	className?: string;
	bodyClassName?: string;
	isLoading?: boolean;
	isError?: boolean;
	errorMessage?: string;
	onRetry?: () => void;
	isEmpty?: boolean;
	emptyMessage?: string;
	skeletonHeight?: number;
	children: ReactNode;
}

export function PanelCard({
	title,
	subtitle,
	icon: Icon,
	actions,
	className,
	bodyClassName,
	isLoading,
	isError,
	errorMessage,
	onRetry,
	isEmpty,
	emptyMessage,
	skeletonHeight = 240,
	children,
}: PanelCardProps) {
	const t = useT();
	const headingStyle = { color: "var(--field-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<Card className={cn("flex h-full flex-col", className)}>
			<header className="flex flex-col gap-2 border-b px-5 pb-3 pt-5 sm:flex-row sm:items-start sm:justify-between"
				style={{ borderColor: "var(--surface-muted-border)" }}
			>
				<div className="min-w-0 space-y-0.5">
					<h2
						className="flex items-center gap-2 text-sm font-semibold tracking-tight"
						style={headingStyle}
					>
						{Icon ? (
							<Icon
								aria-hidden="true"
								className="h-4 w-4"
								style={{ color: "var(--color-primary-500)" }}
							/>
						) : null}
						<span className="truncate">{title}</span>
					</h2>
					{subtitle ? (
						<p className="text-xs leading-snug" style={mutedStyle}>
							{subtitle}
						</p>
					) : null}
				</div>
				{actions ? (
					<div className="flex shrink-0 items-center gap-1.5">{actions}</div>
				) : null}
			</header>

			<CardContent className={cn("flex-1 px-5 pb-5 pt-4", bodyClassName)}>
				{isLoading ? (
					<div className="space-y-3">
						<Skeleton variant="rectangular" height={skeletonHeight} />
					</div>
				) : isError ? (
					<div
						className="flex h-full flex-col items-center justify-center gap-2 rounded-lg border border-dashed py-8 text-center text-sm"
						style={{
							borderColor:
								"color-mix(in srgb, var(--color-error) 35%, transparent)",
							color: "var(--color-error)",
						}}
					>
						<AlertTriangle aria-hidden="true" className="h-5 w-5" />
						<p>{errorMessage ?? t("Failed to load")}</p>
						{onRetry ? (
							<button
								type="button"
								onClick={onRetry}
								className="rounded-md border px-3 py-1 text-xs font-medium"
								style={{
									borderColor:
										"color-mix(in srgb, var(--color-error) 45%, transparent)",
								}}
							>
								{t("Retry")}
							</button>
						) : null}
					</div>
				) : isEmpty ? (
					<div
						className="flex h-full min-h-[140px] flex-col items-center justify-center rounded-lg border border-dashed py-6 text-center text-xs"
						style={{
							borderColor: "var(--surface-muted-border)",
							color: "var(--surface-muted-text)",
						}}
					>
						{emptyMessage ?? t("No data")}
					</div>
				) : (
					children
				)}
			</CardContent>
		</Card>
	);
}

interface PanelSelectProps<T extends string> {
	value: T;
	onChange: (value: T) => void;
	options: ReadonlyArray<{ value: T; label: string }>;
	ariaLabel: string;
}

export function PanelSelect<T extends string>({
	value,
	onChange,
	options,
	ariaLabel,
}: PanelSelectProps<T>) {
	return (
		<select
			value={value}
			onChange={(event) => onChange(event.currentTarget.value as T)}
			aria-label={ariaLabel}
			className="rounded-md border px-2 py-1 text-xs font-medium"
			style={{
				backgroundColor: "var(--surface-elevated-bg)",
				borderColor: "var(--surface-muted-border)",
				color: "var(--field-foreground)",
			}}
		>
			{options.map((opt) => (
				<option key={opt.value} value={opt.value}>
					{opt.label}
				</option>
			))}
		</select>
	);
}
