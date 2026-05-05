"use client";

/**
 * Right-slide drawer surfacing the full record of an ingestion source.
 *
 * Four tabs:
 *   - 概览 (Overview)        — full record + manual "test fetch" trigger
 *   - 抓取历史 (Run history) — placeholder; backend `/sources/:id/runs` is
 *                              not yet exposed
 *   - 文章预览 (Articles)    — placeholder; backend `/articles?source_id=`
 *                              is not yet exposed
 *   - 操作 (Actions)         — pause (DELETE soft-delete) / resume (restore)
 *                              / trigger fetch / reset error (re-trigger
 *                              after consecutive failures)
 *
 * The PATCH update endpoint does not exist yet, so health resets are mapped
 * onto a fresh fetch trigger which forces the worker to revisit the source
 * and clear `last_error` on the next successful poll.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	useDeleteSource,
	useRestoreSource,
	useSourceArticles,
	useSourceRuns,
	useTriggerFetch,
} from "@/hooks/use-sources";
import type { Source } from "@/lib/api/types";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	Activity,
	AlertCircle,
	ClipboardList,
	FileText,
	Globe,
	Loader2,
	PauseCircle,
	PlayCircle,
	RefreshCw,
	Rss,
	Settings,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";

const PANEL_VARIANTS = {
	hidden: { x: "100%", opacity: 0.6 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 },
	},
	exit: {
		x: "100%",
		opacity: 0.6,
		transition: { duration: 0.2 },
	},
} as const;

type DrawerTab = "overview" | "runs" | "articles" | "actions";

interface SourceDetailDrawerProps {
	open: boolean;
	source: Source | null;
	onClose: () => void;
}

function healthVariant(
	status: Source["health_status"],
): "outline" | "secondary" | "success" | "destructive" | "warning" {
	switch (status) {
		case "healthy":
			return "success";
		case "degraded":
			return "warning";
		case "unhealthy":
			return "destructive";
		default:
			return "outline";
	}
}

function healthLabelKey(status: Source["health_status"]): string {
	switch (status) {
		case "healthy":
			return "Healthy";
		case "degraded":
			return "Degraded";
		case "unhealthy":
			return "Unhealthy";
		default:
			return "Unknown";
	}
}

export function SourceDetailDrawer({
	open,
	source,
	onClose,
}: SourceDetailDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();

	const [activeTab, setActiveTab] = useState<DrawerTab>("overview");

	const triggerFetch = useTriggerFetch();
	const deleteSource = useDeleteSource();
	const restoreSource = useRestoreSource();
	const runsQuery = useSourceRuns(source?.id ?? null);
	const articlesQuery = useSourceArticles(source?.id ?? null);

	useEffect(() => {
		if (open && source) {
			setActiveTab("overview");
		}
	}, [open, source]);

	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	const handleTriggerFetch = () => {
		if (!source) return;
		triggerFetch.mutate(source.id, {
			onSuccess: () => {
				success(
					t("Fetch triggered"),
					t("The worker has queued a fresh ingest run."),
				);
			},
			onError: (cause) => {
				error(
					t("Fetch failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	const handleTogglePaused = () => {
		if (!source) return;
		if (source.is_active) {
			deleteSource.mutate(source.id, {
				onSuccess: () => {
					success(
						t("Source paused"),
						t("The worker will skip this source until you resume it."),
					);
				},
				onError: (cause) => {
					error(
						t("Pause failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			});
			return;
		}
		restoreSource.mutate(source.id, {
			onSuccess: () => {
				success(
					t("Source resumed"),
					t("The source will be polled on the next worker tick."),
				);
			},
			onError: (cause) => {
				error(
					t("Resume failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
			},
		});
	};

	if (!source) {
		return null;
	}

	return (
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-50 flex">
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.dialog
						open
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="m-0 ml-auto flex h-full w-full max-h-none max-w-2xl flex-col overflow-hidden border-0 border-l p-0 shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						aria-label={t("Source detail")}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="min-w-0">
								<p
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{t("Ingestion source")}
								</p>
								<h2
									className="mt-1 truncate text-lg font-semibold"
									style={headingStyle}
								>
									{source.name}
								</h2>
								<div className="mt-2 flex flex-wrap gap-2">
									<Badge variant="outline" className="gap-1">
										{source.source_type === "rss" ? (
											<Rss aria-hidden="true" className="h-3 w-3" />
										) : (
											<Globe aria-hidden="true" className="h-3 w-3" />
										)}
										{source.source_type}
									</Badge>
									<Badge variant={source.is_active ? "success" : "secondary"}>
										{source.is_active ? t("Active") : t("Paused")}
									</Badge>
									<Badge variant={healthVariant(source.health_status)}>
										{t(healthLabelKey(source.health_status))}
									</Badge>
								</div>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="flex h-9 w-9 items-center justify-center rounded-full border"
								style={fieldStyle}
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</header>

						<nav
							className="flex gap-1 border-b px-2 py-1"
							style={{ borderColor: "var(--surface-muted-border)" }}
							aria-label={t("Source tabs")}
						>
							<TabButton
								active={activeTab === "overview"}
								onClick={() => setActiveTab("overview")}
								label={t("Overview")}
								icon={<Settings aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "runs"}
								onClick={() => setActiveTab("runs")}
								label={t("Run history")}
								icon={<Activity aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "articles"}
								onClick={() => setActiveTab("articles")}
								label={t("Article preview")}
								icon={<FileText aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "actions"}
								onClick={() => setActiveTab("actions")}
								label={t("Actions")}
								icon={<ClipboardList aria-hidden="true" className="h-4 w-4" />}
							/>
						</nav>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							{activeTab === "overview" ? (
								<OverviewTab
									source={source}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
									pending={triggerFetch.isPending}
									onTriggerFetch={handleTriggerFetch}
								/>
							) : null}
							{activeTab === "runs" ? (
								<RunsTab
									errorMessage={
										runsQuery.error instanceof Error
											? runsQuery.error.message
											: null
									}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}
							{activeTab === "articles" ? (
								<ArticlesTab
									errorMessage={
										articlesQuery.error instanceof Error
											? articlesQuery.error.message
											: null
									}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}
							{activeTab === "actions" ? (
								<ActionsTab
									source={source}
									pendingPause={
										deleteSource.isPending || restoreSource.isPending
									}
									pendingFetch={triggerFetch.isPending}
									onTogglePaused={handleTogglePaused}
									onTriggerFetch={handleTriggerFetch}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}
						</div>
					</motion.dialog>
				</div>
			) : null}
		</AnimatePresence>
	);
}

function TabButton({
	active,
	onClick,
	label,
	icon,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
			style={
				active
					? {
							backgroundColor: "var(--surface-accent-strong)",
							color: "var(--color-foreground)",
						}
					: { color: "var(--surface-muted-text)" }
			}
			aria-pressed={active}
		>
			{icon}
			{label}
		</button>
	);
}

interface OverviewTabProps {
	source: Source;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
	pending: boolean;
	onTriggerFetch: () => void;
}

function OverviewTab({
	source,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
	pending,
	onTriggerFetch,
}: OverviewTabProps) {
	const configEntries = Object.entries(source.config ?? {});
	return (
		<div className="space-y-5">
			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="source-overview-profile"
			>
				<h3 className="text-xs uppercase tracking-wide" style={mutedStyle}>
					{t("Profile")}
				</h3>
				<dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
					<OverviewField
						label="URL"
						value={source.url}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Schedule")}
						value={source.schedule ?? t("Worker default")}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Render mode")}
						value={source.render_mode}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Encoding")}
						value={source.encoding ?? "auto"}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Articles fetched")}
						value={String(source.total_articles_fetched)}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Consecutive failures")}
						value={String(source.consecutive_failures)}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Avg fetch duration")}
						value={
							source.avg_fetch_duration_ms != null
								? `${Math.round(source.avg_fetch_duration_ms)}ms`
								: "—"
						}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Last fetch")}
						value={
							source.last_fetch
								? formatDateTime(locale, source.last_fetch, {
										year: "numeric",
										month: "2-digit",
										day: "2-digit",
										hour: "2-digit",
										minute: "2-digit",
									})
								: t("Never")
						}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
				</dl>
			</section>

			{source.last_error ? (
				<section
					className="rounded-2xl border p-4"
					style={{
						borderColor: "var(--surface-muted-border)",
						backgroundColor: "color-mix(in srgb, #fee2e2 35%, transparent)",
					}}
					data-testid="source-overview-error"
				>
					<div className="flex items-start gap-3">
						<AlertCircle
							aria-hidden="true"
							className="mt-0.5 h-4 w-4"
							style={{ color: "var(--color-destructive, #b91c1c)" }}
						/>
						<div>
							<h3 className="text-sm font-semibold" style={headingStyle}>
								{t("Last error")}
							</h3>
							<p className="mt-1 text-xs" style={mutedStyle}>
								{source.last_error}
							</p>
						</div>
					</div>
				</section>
			) : null}

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="source-overview-config"
			>
				<h3 className="text-xs uppercase tracking-wide" style={mutedStyle}>
					{t("Config")}
				</h3>
				{configEntries.length === 0 ? (
					<p className="mt-2 text-sm" style={mutedStyle}>
						{t("No structured config recorded.")}
					</p>
				) : (
					<dl className="mt-3 space-y-2 text-sm">
						{configEntries.map(([key, value]) => (
							<div key={key} className="flex items-start gap-3">
								<dt
									className="min-w-32 text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{key}
								</dt>
								<dd className="break-all" style={headingStyle}>
									{typeof value === "string" ? value : JSON.stringify(value)}
								</dd>
							</div>
						))}
					</dl>
				)}
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="source-overview-test-fetch"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{t("Test fetch")}
						</h3>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{t(
								"Triggers a one-off ingest run on the worker. Use this to validate selectors after editing config.",
							)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						onClick={onTriggerFetch}
						disabled={pending}
					>
						{pending ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<RefreshCw aria-hidden="true" className="h-4 w-4" />
						)}
						{t("Trigger fetch")}
					</Button>
				</div>
			</section>
		</div>
	);
}

function OverviewField({
	label,
	value,
	headingStyle,
	mutedStyle,
}: {
	label: string;
	value: string;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
}) {
	return (
		<div className="min-w-0">
			<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
				{label}
			</p>
			<p className="mt-1 truncate text-sm" style={headingStyle}>
				{value}
			</p>
		</div>
	);
}

interface RunsTabProps {
	errorMessage: string | null;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function RunsTab({
	errorMessage,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: RunsTabProps) {
	return (
		<section
			className="rounded-2xl border p-5"
			style={surfaceStyle}
			data-testid="source-runs-placeholder"
		>
			<div className="flex items-start gap-3">
				<Activity
					aria-hidden="true"
					className="h-5 w-5"
					style={{ color: "var(--surface-muted-text)" }}
				/>
				<div>
					<h3 className="text-sm font-semibold" style={headingStyle}>
						{t("Run history")}
					</h3>
					<p className="mt-1 text-sm" style={mutedStyle}>
						{t(
							"Per-source fetch run history is not yet exposed by the backend. Once the /sources/:id/runs endpoint ships, this tab will surface success/fail/skipped statistics here.",
						)}
					</p>
					{errorMessage ? (
						<p className="mt-2 text-xs" style={mutedStyle}>
							{errorMessage}
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}

interface ArticlesTabProps {
	errorMessage: string | null;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function ArticlesTab({
	errorMessage,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: ArticlesTabProps) {
	return (
		<section
			className="rounded-2xl border p-5"
			style={surfaceStyle}
			data-testid="source-articles-placeholder"
		>
			<div className="flex items-start gap-3">
				<FileText
					aria-hidden="true"
					className="h-5 w-5"
					style={{ color: "var(--surface-muted-text)" }}
				/>
				<div>
					<h3 className="text-sm font-semibold" style={headingStyle}>
						{t("Article preview")}
					</h3>
					<p className="mt-1 text-sm" style={mutedStyle}>
						{t(
							"The articles list endpoint does not yet accept a source_id filter. Once exposed, the latest 20 articles ingested from this source will be linked here.",
						)}
					</p>
					{errorMessage ? (
						<p className="mt-2 text-xs" style={mutedStyle}>
							{errorMessage}
						</p>
					) : null}
				</div>
			</div>
		</section>
	);
}

interface ActionsTabProps {
	source: Source;
	pendingPause: boolean;
	pendingFetch: boolean;
	onTogglePaused: () => void;
	onTriggerFetch: () => void;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function ActionsTab({
	source,
	pendingPause,
	pendingFetch,
	onTogglePaused,
	onTriggerFetch,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: ActionsTabProps) {
	return (
		<div className="space-y-4">
			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="source-action-pause"
			>
				<div className="flex items-start gap-3">
					{source.is_active ? (
						<PauseCircle
							aria-hidden="true"
							className="h-5 w-5"
							style={{ color: "var(--surface-muted-text)" }}
						/>
					) : (
						<PlayCircle
							aria-hidden="true"
							className="h-5 w-5"
							style={{ color: "var(--surface-muted-text)" }}
						/>
					)}
					<div className="flex-1">
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{source.is_active ? t("Pause source") : t("Resume source")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{source.is_active
								? t(
										"Stops the worker from polling this source. The record is soft-deleted and can be resumed at any time.",
									)
								: t(
										"Restores polling. The next worker tick will pick this source up.",
									)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onTogglePaused}
						disabled={pendingPause}
					>
						{pendingPause ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : source.is_active ? (
							<PauseCircle aria-hidden="true" className="h-4 w-4" />
						) : (
							<PlayCircle aria-hidden="true" className="h-4 w-4" />
						)}
						{source.is_active ? t("Pause") : t("Resume")}
					</Button>
				</div>
			</section>

			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="source-action-trigger"
			>
				<div className="flex items-start gap-3">
					<RefreshCw
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div className="flex-1">
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{source.last_error
								? t("Reset error and re-fetch")
								: t("Manual fetch")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{source.last_error
								? t(
										"Re-runs the worker fetch. A successful run clears last_error and resets consecutive failure count.",
									)
								: t("Forces a one-off ingest run outside the normal schedule.")}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onTriggerFetch}
						disabled={pendingFetch || !source.is_active}
					>
						{pendingFetch ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<RefreshCw aria-hidden="true" className="h-4 w-4" />
						)}
						{t("Trigger fetch")}
					</Button>
				</div>
			</section>
		</div>
	);
}
