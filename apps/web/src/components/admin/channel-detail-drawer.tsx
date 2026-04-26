"use client";

/**
 * Right-slide drawer surfacing the full record of a feed channel.
 *
 * Four tabs:
 *   - 概览 (Overview)        — name/slug/description/visibility/linked_category
 *                              + metadata + create/update timestamps
 *   - 访问策略 (Policies)    — `GET /admin/channels/:id/policies` matrix
 *                              (subject_type × subject_key →
 *                              read / source_meta / report flags)
 *   - 关联 banners (Banners) — `GET /admin/banners` filtered client-side by
 *                              targets[].target_channel_id === channel.id
 *   - 操作 (Actions)         — archive (is_active=false) / restore
 *                              (is_active=true). The backend has no DELETE
 *                              endpoint, so archival is soft via the
 *                              `is_active` flag.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAdminBanners } from "@/hooks/use-banners";
import { useCategories } from "@/hooks/use-categories";
import {
	type ChannelRecord,
	useChannelPolicies,
	useUpdateChannel,
} from "@/hooks/use-channels";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	Archive,
	ClipboardList,
	Flag,
	Layers3,
	Loader2,
	RotateCcw,
	ShieldCheck,
	X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

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

type DrawerTab = "overview" | "policies" | "banners" | "actions";

interface ChannelDetailDrawerProps {
	open: boolean;
	channel: ChannelRecord | null;
	onClose: () => void;
}

function visibilityVariant(
	visibility: ChannelRecord["visibility"],
): "outline" | "secondary" | "success" | "warning" {
	switch (visibility) {
		case "public":
			return "success";
		case "verified":
			return "secondary";
		case "premium":
			return "warning";
		case "restricted":
		default:
			return "outline";
	}
}

function visibilityLabelKey(visibility: ChannelRecord["visibility"]): string {
	switch (visibility) {
		case "public":
			return "Public";
		case "restricted":
			return "Restricted";
		case "verified":
			return "Verified";
		case "premium":
			return "Premium";
	}
}

export function ChannelDetailDrawer({
	open,
	channel,
	onClose,
}: ChannelDetailDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();

	const [activeTab, setActiveTab] = useState<DrawerTab>("overview");

	const policiesQuery = useChannelPolicies(channel?.id ?? null);
	const bannersQuery = useAdminBanners(true);
	const categoriesQuery = useCategories();
	const updateChannel = useUpdateChannel();

	useEffect(() => {
		if (open && channel) {
			setActiveTab("overview");
		}
	}, [open, channel]);

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

	const linkedCategoryName = useMemo(() => {
		if (!channel?.linked_category_id) return null;
		return (
			categoriesQuery.data?.find(
				(category) => category.id === channel.linked_category_id,
			)?.name ?? null
		);
	}, [categoriesQuery.data, channel?.linked_category_id]);

	const linkedBanners = useMemo(() => {
		if (!channel) return [];
		const list = bannersQuery.data ?? [];
		return list.filter((banner) =>
			banner.targets.some(
				(target) =>
					target.target_type === "channel" &&
					target.target_channel_id === channel.id,
			),
		);
	}, [bannersQuery.data, channel]);

	const handleArchive = (nextArchive: boolean) => {
		if (!channel) return;
		updateChannel.mutate(
			{
				id: channel.id,
				is_active: !nextArchive,
			},
			{
				onSuccess: () => {
					success(
						nextArchive ? t("Channel archived") : t("Channel restored"),
						nextArchive
							? t("Channel is hidden from active visibility scopes.")
							: t("Channel is again visible to its target audience."),
					);
				},
				onError: (cause) => {
					error(
						t("Save failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	return (
		<AnimatePresence>
			{open && channel ? (
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
					<motion.aside
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-l shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						role="dialog"
						aria-label={t("Channel detail")}
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
									{t("Feed channel")}
								</p>
								<h2
									className="mt-1 truncate text-lg font-semibold"
									style={headingStyle}
								>
									{channel.name}
								</h2>
								<div className="mt-2 flex flex-wrap gap-2">
									<Badge variant="outline">/{channel.slug}</Badge>
									<Badge
										variant={visibilityVariant(channel.visibility)}
									>
										{t(visibilityLabelKey(channel.visibility))}
									</Badge>
									<Badge
										variant={channel.is_active ? "success" : "secondary"}
									>
										{channel.is_active ? t("Active") : t("Archived")}
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
							aria-label={t("Channel tabs")}
						>
							<TabButton
								active={activeTab === "overview"}
								onClick={() => setActiveTab("overview")}
								label={t("Overview")}
								icon={<Layers3 aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "policies"}
								onClick={() => setActiveTab("policies")}
								label={t("Access policies")}
								icon={
									<ShieldCheck aria-hidden="true" className="h-4 w-4" />
								}
							/>
							<TabButton
								active={activeTab === "banners"}
								onClick={() => setActiveTab("banners")}
								label={t("Linked banners")}
								icon={<Flag aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "actions"}
								onClick={() => setActiveTab("actions")}
								label={t("Actions")}
								icon={
									<ClipboardList aria-hidden="true" className="h-4 w-4" />
								}
							/>
						</nav>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							{activeTab === "overview" ? (
								<OverviewTab
									channel={channel}
									linkedCategoryName={linkedCategoryName}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}
							{activeTab === "policies" ? (
								<PoliciesTab
									entries={policiesQuery.data ?? []}
									loading={policiesQuery.isLoading}
									errorMessage={
										policiesQuery.error instanceof Error
											? policiesQuery.error.message
											: null
									}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}
							{activeTab === "banners" ? (
								<BannersTab
									banners={linkedBanners}
									loading={bannersQuery.isLoading}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}
							{activeTab === "actions" ? (
								<ActionsTab
									channel={channel}
									pending={updateChannel.isPending}
									onArchive={() => handleArchive(true)}
									onRestore={() => handleArchive(false)}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}
						</div>
					</motion.aside>
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
	channel: ChannelRecord;
	linkedCategoryName: string | null;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function OverviewTab({
	channel,
	linkedCategoryName,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: OverviewTabProps) {
	const metadataEntries = Object.entries(channel.metadata ?? {});
	return (
		<div className="space-y-5">
			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="channel-overview-profile"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Profile")}
				</h3>
				<dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
					<OverviewField
						label={t("Slug")}
						value={`/${channel.slug}`}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Name")}
						value={channel.name}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Visibility")}
						value={t(visibilityLabelKey(channel.visibility))}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Linked category")}
						value={linkedCategoryName ?? t("None")}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Created")}
						value={formatDateTime(locale, channel.created_at, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
						})}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Updated")}
						value={formatDateTime(locale, channel.updated_at, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
						})}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
				</dl>
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="channel-overview-description"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Description")}
				</h3>
				<p className="mt-2 text-sm" style={headingStyle}>
					{channel.description ?? t("No channel description yet.")}
				</p>
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="channel-overview-metadata"
			>
				<h3
					className="text-xs uppercase tracking-wide"
					style={mutedStyle}
				>
					{t("Metadata")}
				</h3>
				{metadataEntries.length === 0 ? (
					<p className="mt-2 text-sm" style={mutedStyle}>
						{t("No metadata stored on this channel.")}
					</p>
				) : (
					<dl className="mt-3 space-y-2 text-sm">
						{metadataEntries.map(([key, value]) => (
							<div key={key} className="flex items-center gap-3">
								<dt
									className="min-w-32 text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{key}
								</dt>
								<dd className="truncate" style={headingStyle}>
									{typeof value === "string"
										? value
										: JSON.stringify(value)}
								</dd>
							</div>
						))}
					</dl>
				)}
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
		<div>
			<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
				{label}
			</p>
			<p className="mt-1 truncate text-sm" style={headingStyle}>
				{value}
			</p>
		</div>
	);
}

interface PoliciesTabProps {
	entries: Array<{
		id: string;
		subject_type: string;
		subject_key: string;
		can_read: boolean;
		can_read_source_meta: boolean;
		can_access_reports: boolean;
		priority: number;
	}>;
	loading: boolean;
	errorMessage: string | null;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function PoliciesTab({
	entries,
	loading,
	errorMessage,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: PoliciesTabProps) {
	if (loading) {
		return (
			<p className="text-sm" style={mutedStyle}>
				{t("Loading policies")}
			</p>
		);
	}
	if (errorMessage) {
		return <p className="text-sm text-error">{errorMessage}</p>;
	}
	if (entries.length === 0) {
		return (
			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="channel-policies-empty"
			>
				<h3 className="text-sm font-semibold" style={headingStyle}>
					{t("No explicit policies")}
				</h3>
				<p className="mt-1 text-sm" style={mutedStyle}>
					{t(
						"This channel falls back to its visibility tier. Configure subject-level overrides on the backend to surface them here.",
					)}
				</p>
			</section>
		);
	}

	return (
		<div className="space-y-3" data-testid="channel-policies-list">
			<header
				className="grid grid-cols-12 gap-2 px-2 text-xs uppercase tracking-wide"
				style={mutedStyle}
			>
				<span className="col-span-4">{t("Subject")}</span>
				<span className="col-span-2 text-center">{t("Priority")}</span>
				<span className="col-span-2 text-center">{t("Read")}</span>
				<span className="col-span-2 text-center">
					{t("Source meta")}
				</span>
				<span className="col-span-2 text-center">{t("Reports")}</span>
			</header>
			{entries.map((entry) => (
				<div
					key={entry.id}
					className="grid grid-cols-12 items-center gap-2 rounded-2xl border px-3 py-2 text-sm"
					style={surfaceStyle}
				>
					<div className="col-span-4 min-w-0">
						<p className="truncate font-medium" style={headingStyle}>
							{entry.subject_type}: {entry.subject_key}
						</p>
					</div>
					<div className="col-span-2 text-center" style={headingStyle}>
						{entry.priority}
					</div>
					<div className="col-span-2 text-center">
						<PolicyFlag value={entry.can_read} t={t} />
					</div>
					<div className="col-span-2 text-center">
						<PolicyFlag value={entry.can_read_source_meta} t={t} />
					</div>
					<div className="col-span-2 text-center">
						<PolicyFlag value={entry.can_access_reports} t={t} />
					</div>
				</div>
			))}
		</div>
	);
}

function PolicyFlag({
	value,
	t,
}: {
	value: boolean;
	t: ReturnType<typeof useT>;
}) {
	return (
		<Badge variant={value ? "success" : "outline"}>
			{value ? t("Allowed") : t("Denied")}
		</Badge>
	);
}

interface BannersTabProps {
	banners: Array<{
		id: string;
		title: string;
		status: string;
		priority: number;
		starts_at: string | null;
		ends_at: string | null;
	}>;
	loading: boolean;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function BannersTab({
	banners,
	loading,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: BannersTabProps) {
	if (loading) {
		return (
			<p className="text-sm" style={mutedStyle}>
				{t("Loading banners")}
			</p>
		);
	}
	if (banners.length === 0) {
		return (
			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="channel-banners-empty"
			>
				<h3 className="text-sm font-semibold" style={headingStyle}>
					{t("No banners target this channel")}
				</h3>
				<p className="mt-1 text-sm" style={mutedStyle}>
					{t(
						"Operational banners scoped to this channel will appear here once configured.",
					)}
				</p>
			</section>
		);
	}
	return (
		<ul className="space-y-2" data-testid="channel-banners-list">
			{banners.map((banner) => (
				<li
					key={banner.id}
					className="rounded-2xl border px-3 py-2"
					style={surfaceStyle}
				>
					<div className="flex items-center justify-between gap-3">
						<p className="text-sm font-medium" style={headingStyle}>
							{banner.title}
						</p>
						<Badge variant="outline">{banner.status}</Badge>
					</div>
					<p className="mt-1 text-xs" style={mutedStyle}>
						{t("Priority")}: {banner.priority}
						{banner.starts_at
							? ` · ${t("From")} ${formatDateTime(locale, banner.starts_at, {
									year: "numeric",
									month: "2-digit",
									day: "2-digit",
								})}`
							: ""}
						{banner.ends_at
							? ` · ${t("Until")} ${formatDateTime(locale, banner.ends_at, {
									year: "numeric",
									month: "2-digit",
									day: "2-digit",
								})}`
							: ""}
					</p>
				</li>
			))}
		</ul>
	);
}

interface ActionsTabProps {
	channel: ChannelRecord;
	pending: boolean;
	onArchive: () => void;
	onRestore: () => void;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function ActionsTab({
	channel,
	pending,
	onArchive,
	onRestore,
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
				data-testid="channel-actions"
			>
				<div className="flex items-start gap-3">
					<Archive
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div>
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{channel.is_active ? t("Archive channel") : t("Restore channel")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{channel.is_active
								? t(
										"Hides the channel from active feed visibility scopes. Existing references stay intact and the channel can be restored later.",
									)
								: t(
										"Restores the channel so its target audience can see content again.",
									)}
						</p>
					</div>
				</div>
				<div className="mt-3 flex justify-end">
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={channel.is_active ? onArchive : onRestore}
						disabled={pending}
					>
						{pending ? (
							<Loader2
								aria-hidden="true"
								className="h-4 w-4 animate-spin"
							/>
						) : channel.is_active ? (
							<Archive aria-hidden="true" className="h-4 w-4" />
						) : (
							<RotateCcw aria-hidden="true" className="h-4 w-4" />
						)}
						{channel.is_active ? t("Archive") : t("Restore")}
					</Button>
				</div>
			</section>
		</div>
	);
}
