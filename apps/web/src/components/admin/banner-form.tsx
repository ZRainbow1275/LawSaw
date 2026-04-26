"use client";

/**
 * BannerForm — right-slide drawer for creating or editing an operational banner.
 *
 * Surfaces the full banner authoring contract:
 *   - Title / Markdown body (`<MarkdownEditor toolbar="full">`)
 *   - Audience role-tier multi-select (basic / verified / premium)
 *   - Channel scope multi-select (drives `targets[]`; empty = global target)
 *   - Schedule range (datetime-local → ISO)
 *   - Priority (numeric 0-100, used for ordering)
 *   - Dismissable toggle (persisted into `metadata`)
 *   - Gradient choice (6 hero gradients, persisted into `metadata` + previewed)
 *   - CTA label + URL
 *
 * Audience tiers, dismissable, and gradient are stored in the banners.metadata
 * JSONB column because the current backend response shape only exposes the
 * canonical columns. The reader hydrates them from `banner.metadata` when
 * present.
 *
 * The drawer is presentational; persistence is delegated to the parent which
 * owns `useCreateBanner` / `useUpdateBanner`. The form validates locally and
 * emits a `CreateBannerInput`-shaped payload (mapped from `UpdateBannerInput`
 * in edit mode by the parent).
 */

import {
	BANNER_GRADIENT_KEYS,
	type BannerGradientKey,
	BannerPreview,
	gradientCssVar,
} from "@/components/admin/banner-preview";
import { MarkdownEditor } from "@/components/editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { BannerRecord, CreateBannerInput } from "@/hooks/use-banners";
import type { ChannelRecord } from "@/hooks/use-channels";
import { useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { cn } from "@/lib/utils";
import { AnimatePresence, motion } from "framer-motion";
import {
	Calendar,
	Eye,
	Loader2,
	Megaphone,
	Save,
	Users,
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

export type AudienceTier = "basic" | "verified" | "premium";
const AUDIENCE_TIERS: AudienceTier[] = ["basic", "verified", "premium"];
const DEFAULT_AUDIENCE_TIERS: AudienceTier[] = [
	"basic",
	"verified",
	"premium",
];

export interface BannerFormPayload extends CreateBannerInput {}

interface BannerFormProps {
	open: boolean;
	mode: "create" | "edit";
	banner: BannerRecord | null;
	channels: ChannelRecord[];
	onClose: () => void;
	onSubmit: (payload: BannerFormPayload) => Promise<void> | void;
	saving?: boolean;
}

interface FormState {
	title: string;
	body: string;
	ctaLabel: string;
	ctaUrl: string;
	status: BannerRecord["status"];
	priority: number;
	startsAt: string;
	endsAt: string;
	audienceTiers: AudienceTier[];
	channelIds: string[];
	dismissable: boolean;
	gradientKey: BannerGradientKey;
}

const STATUS_OPTIONS: BannerRecord["status"][] = [
	"draft",
	"scheduled",
	"active",
	"expired",
	"archived",
];

function isAudienceTier(value: unknown): value is AudienceTier {
	return value === "basic" || value === "verified" || value === "premium";
}

function isGradientKey(value: unknown): value is BannerGradientKey {
	return (
		typeof value === "string" &&
		(BANNER_GRADIENT_KEYS as string[]).includes(value)
	);
}

function isoToDatetimeLocal(value: string | null | undefined): string {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const offset = date.getTimezoneOffset();
	const local = new Date(date.getTime() - offset * 60_000);
	return local.toISOString().slice(0, 16);
}

function datetimeLocalToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

function isValidUrl(value: string): boolean {
	try {
		const parsed = new URL(value);
		return parsed.protocol === "http:" || parsed.protocol === "https:";
	} catch {
		return false;
	}
}

function readMetadataAudienceTiers(
	metadata: Record<string, unknown> | undefined,
): AudienceTier[] {
	const raw = metadata?.audience_tiers;
	if (!Array.isArray(raw)) return DEFAULT_AUDIENCE_TIERS;
	const filtered = raw.filter(isAudienceTier);
	return filtered.length > 0 ? filtered : DEFAULT_AUDIENCE_TIERS;
}

function readMetadataGradient(
	metadata: Record<string, unknown> | undefined,
): BannerGradientKey {
	const raw = metadata?.gradient_key;
	return isGradientKey(raw) ? raw : "primary";
}

function readMetadataDismissable(
	metadata: Record<string, unknown> | undefined,
): boolean {
	const raw = metadata?.dismissable;
	return typeof raw === "boolean" ? raw : true;
}

function bannerToFormState(
	banner: BannerRecord | null,
): FormState {
	if (!banner) {
		return {
			title: "",
			body: "",
			ctaLabel: "",
			ctaUrl: "",
			status: "draft",
			priority: 100,
			startsAt: "",
			endsAt: "",
			audienceTiers: DEFAULT_AUDIENCE_TIERS,
			channelIds: [],
			dismissable: true,
			gradientKey: "primary",
		};
	}
	const metadata = (banner as unknown as { metadata?: Record<string, unknown> })
		.metadata;
	const channelIds = banner.targets
		.filter((target) => target.target_type === "channel" && target.target_channel_id)
		.map((target) => target.target_channel_id as string);
	return {
		title: banner.title,
		body: banner.body ?? "",
		ctaLabel: banner.cta_label ?? "",
		ctaUrl: banner.cta_url ?? "",
		status: banner.status,
		priority: banner.priority,
		startsAt: isoToDatetimeLocal(banner.starts_at),
		endsAt: isoToDatetimeLocal(banner.ends_at),
		audienceTiers: readMetadataAudienceTiers(metadata),
		channelIds,
		dismissable: readMetadataDismissable(metadata),
		gradientKey: readMetadataGradient(metadata),
	};
}

export function BannerForm({
	open,
	mode,
	banner,
	channels,
	onClose,
	onSubmit,
	saving,
}: BannerFormProps) {
	const t = useT();
	const [form, setForm] = useState<FormState>(bannerToFormState(banner));
	const [submitAttempted, setSubmitAttempted] = useState(false);

	useEffect(() => {
		if (!open) return;
		setForm(bannerToFormState(banner));
		setSubmitAttempted(false);
	}, [open, banner]);

	const trimmedTitle = form.title.trim();
	const trimmedBody = form.body.trim();
	const trimmedCtaLabel = form.ctaLabel.trim();
	const trimmedCtaUrl = form.ctaUrl.trim();

	const validationMessage = useMemo(() => {
		if (!trimmedTitle) {
			return t("Banner title is required.");
		}
		if (form.audienceTiers.length === 0) {
			return t("Select at least one audience tier.");
		}
		if (trimmedCtaUrl && !isValidUrl(trimmedCtaUrl)) {
			return t("CTA URL must start with http:// or https://.");
		}
		if (trimmedCtaUrl && !trimmedCtaLabel) {
			return t("CTA label is required when a CTA URL is provided.");
		}
		if (!Number.isFinite(form.priority)) {
			return t("Priority must be a valid number.");
		}
		if (form.startsAt && form.endsAt) {
			const startMs = new Date(form.startsAt).getTime();
			const endMs = new Date(form.endsAt).getTime();
			if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs < startMs) {
				return t("Banner end time must be after the start time.");
			}
		}
		return null;
	}, [
		t,
		trimmedTitle,
		trimmedCtaLabel,
		trimmedCtaUrl,
		form.audienceTiers,
		form.priority,
		form.startsAt,
		form.endsAt,
	]);

	const channelById = useMemo(
		() => new Map(channels.map((channel) => [channel.id, channel])),
		[channels],
	);

	const handleToggleTier = (tier: AudienceTier) => {
		setForm((prev) => {
			const next = prev.audienceTiers.includes(tier)
				? prev.audienceTiers.filter((item) => item !== tier)
				: [...prev.audienceTiers, tier];
			return { ...prev, audienceTiers: next };
		});
	};

	const handleToggleChannel = (channelId: string) => {
		setForm((prev) => {
			const next = prev.channelIds.includes(channelId)
				? prev.channelIds.filter((item) => item !== channelId)
				: [...prev.channelIds, channelId];
			return { ...prev, channelIds: next };
		});
	};

	const buildPayload = (): BannerFormPayload => {
		const targets =
			form.channelIds.length === 0
				? [{ target_type: "global" as const, sort_order: 0 }]
				: form.channelIds.map((channelId, index) => ({
						target_type: "channel" as const,
						target_channel_id: channelId,
						sort_order: index,
					}));

		return {
			title: trimmedTitle,
			body: trimmedBody || undefined,
			cta_label: trimmedCtaLabel || undefined,
			cta_url: trimmedCtaUrl || undefined,
			status: form.status,
			priority: form.priority,
			starts_at: datetimeLocalToIso(form.startsAt),
			ends_at: datetimeLocalToIso(form.endsAt),
			metadata: {
				audience_tiers: form.audienceTiers,
				dismissable: form.dismissable,
				gradient_key: form.gradientKey,
			},
			targets,
		};
	};

	const handleSubmit = async () => {
		setSubmitAttempted(true);
		if (validationMessage) return;
		await onSubmit(buildPayload());
	};

	const fieldStyle = {
		backgroundColor: "var(--color-background)",
		borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
		color: "var(--color-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "color-mix(in srgb, var(--color-border) 70%, transparent)",
	} as const;

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
					<motion.aside
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="ml-auto flex h-full w-full max-w-3xl flex-col overflow-hidden border-l shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor:
								"color-mix(in srgb, var(--color-border) 70%, transparent)",
						}}
						role="dialog"
						aria-label={
							mode === "create" ? t("Create banner") : t("Edit banner")
						}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-border) 70%, transparent)",
							}}
						>
							<div className="min-w-0">
								<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
									{t("Operational banner")}
								</p>
								<h2
									className="mt-1 flex items-center gap-2 truncate text-lg font-semibold"
									style={headingStyle}
								>
									<Megaphone aria-hidden="true" className="h-5 w-5" />
									{mode === "create"
										? t("Create banner")
										: t("Edit banner")}
								</h2>
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

						<div className="flex-1 overflow-y-auto px-6 py-4">
							<section className="space-y-4">
								<div className="space-y-1.5">
									<label
										htmlFor="banner-title"
										className="text-xs font-medium uppercase tracking-wide"
										style={mutedStyle}
									>
										{t("Banner title")}
									</label>
									<Input
										id="banner-title"
										value={form.title}
										onChange={(event) =>
											setForm((prev) => ({ ...prev, title: event.target.value }))
										}
										placeholder={t("Banner title")}
									/>
								</div>

								<div className="space-y-1.5">
									<label
										className="text-xs font-medium uppercase tracking-wide"
										style={mutedStyle}
										htmlFor="banner-body"
									>
										{t("Banner content (Markdown)")}
									</label>
									<div id="banner-body">
										<MarkdownEditor
											value={form.body}
											onChange={(next) =>
												setForm((prev) => ({ ...prev, body: next }))
											}
											toolbar="full"
											minHeight={240}
											placeholder={t("Write the banner content using Markdown.")}
										/>
									</div>
								</div>

								<div className="grid gap-3 md:grid-cols-2">
									<div className="space-y-1.5">
										<label
											htmlFor="banner-cta-label"
											className="text-xs font-medium uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("CTA label")}
										</label>
										<Input
											id="banner-cta-label"
											value={form.ctaLabel}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													ctaLabel: event.target.value,
												}))
											}
											placeholder={t("Optional CTA label")}
										/>
									</div>
									<div className="space-y-1.5">
										<label
											htmlFor="banner-cta-url"
											className="text-xs font-medium uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("CTA URL")}
										</label>
										<Input
											id="banner-cta-url"
											value={form.ctaUrl}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													ctaUrl: event.target.value,
												}))
											}
											placeholder="https://"
										/>
									</div>
								</div>
							</section>

							<section
								className="mt-6 space-y-3 rounded-2xl border p-4"
								style={surfaceStyle}
							>
								<div className="flex items-center gap-2">
									<Users aria-hidden="true" className="h-4 w-4" />
									<h3 className="text-sm font-semibold" style={headingStyle}>
										{t("Audience tiers")}
									</h3>
								</div>
								<p className="text-xs" style={mutedStyle}>
									{t("Choose which user tiers see this banner. Defaults to all tiers.")}
								</p>
								<div className="flex flex-wrap gap-2">
									{AUDIENCE_TIERS.map((tier) => {
										const active = form.audienceTiers.includes(tier);
										return (
											<button
												key={tier}
												type="button"
												onClick={() => handleToggleTier(tier)}
												className={cn(
													"rounded-full border px-3 py-1 text-xs font-medium uppercase tracking-wide transition",
													active
														? "border-transparent bg-[color:var(--color-primary-500)] text-white"
														: "bg-transparent",
												)}
												style={
													active
														? undefined
														: {
																borderColor:
																	"color-mix(in srgb, var(--color-border) 70%, transparent)",
																color: "var(--color-foreground)",
															}
												}
											>
												{t(tier === "basic"
													? "Basic"
													: tier === "verified"
														? "Verified"
														: "Premium")}
											</button>
										);
									})}
								</div>
							</section>

							<section
								className="mt-4 space-y-3 rounded-2xl border p-4"
								style={surfaceStyle}
							>
								<h3 className="text-sm font-semibold" style={headingStyle}>
									{t("Channel scope")}
								</h3>
								<p className="text-xs" style={mutedStyle}>
									{t("Leave empty for a global banner, or select one or more channels.")}
								</p>
								{channels.length === 0 ? (
									<p className="text-xs" style={mutedStyle}>
										{t("No channels available.")}
									</p>
								) : (
									<div className="flex flex-wrap gap-2">
										{channels.map((channel) => {
											const active = form.channelIds.includes(channel.id);
											return (
												<button
													key={channel.id}
													type="button"
													onClick={() => handleToggleChannel(channel.id)}
													className={cn(
														"rounded-full border px-3 py-1 text-xs font-medium transition",
														active
															? "border-transparent bg-[color:var(--color-primary-500)] text-white"
															: "bg-transparent",
													)}
													style={
														active
															? undefined
															: {
																	borderColor:
																		"color-mix(in srgb, var(--color-border) 70%, transparent)",
																	color: "var(--color-foreground)",
																}
													}
												>
													{channel.name}
												</button>
											);
										})}
									</div>
								)}
								{form.channelIds.length > 0 ? (
									<div className="flex flex-wrap gap-1.5 pt-1">
										{form.channelIds.map((id) => (
											<Badge key={id} variant="outline">
												{channelById.get(id)?.name ?? id}
											</Badge>
										))}
									</div>
								) : null}
							</section>

							<section
								className="mt-4 space-y-3 rounded-2xl border p-4"
								style={surfaceStyle}
							>
								<div className="flex items-center gap-2">
									<Calendar aria-hidden="true" className="h-4 w-4" />
									<h3 className="text-sm font-semibold" style={headingStyle}>
										{t("Schedule")}
									</h3>
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									<div className="space-y-1.5">
										<label
											htmlFor="banner-starts-at"
											className="text-xs font-medium uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("Starts at")}
										</label>
										<Input
											id="banner-starts-at"
											type="datetime-local"
											value={form.startsAt}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													startsAt: event.target.value,
												}))
											}
										/>
									</div>
									<div className="space-y-1.5">
										<label
											htmlFor="banner-ends-at"
											className="text-xs font-medium uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("Ends at")}
										</label>
										<Input
											id="banner-ends-at"
											type="datetime-local"
											value={form.endsAt}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													endsAt: event.target.value,
												}))
											}
										/>
									</div>
								</div>
								<div className="grid gap-3 md:grid-cols-2">
									<div className="space-y-1.5">
										<label
											htmlFor="banner-status"
											className="text-xs font-medium uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("Status")}
										</label>
										<select
											id="banner-status"
											value={form.status}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													status: event.target.value as BannerRecord["status"],
												}))
											}
											className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
											style={fieldStyle}
										>
											{STATUS_OPTIONS.map((option) => (
												<option key={option} value={option}>
													{t(
														option === "draft"
															? "Draft"
															: option === "scheduled"
																? "Scheduled"
																: option === "active"
																	? "Active"
																	: option === "expired"
																		? "Expired"
																		: "Archived",
													)}
												</option>
											))}
										</select>
									</div>
									<div className="space-y-1.5">
										<label
											htmlFor="banner-priority"
											className="text-xs font-medium uppercase tracking-wide"
											style={mutedStyle}
										>
											{t("Priority (0-100)")}
										</label>
										<Input
											id="banner-priority"
											type="number"
											min={0}
											max={100}
											value={String(form.priority)}
											onChange={(event) =>
												setForm((prev) => ({
													...prev,
													priority: Number.parseInt(
														event.target.value || "0",
														10,
													),
												}))
											}
										/>
									</div>
								</div>
							</section>

							<section
								className="mt-4 space-y-3 rounded-2xl border p-4"
								style={surfaceStyle}
							>
								<h3 className="text-sm font-semibold" style={headingStyle}>
									{t("Appearance")}
								</h3>
								<div className="space-y-2">
									<p className="text-xs" style={mutedStyle}>
										{t("Choose a hero gradient.")}
									</p>
									<div className="grid grid-cols-3 gap-2 md:grid-cols-6">
										{BANNER_GRADIENT_KEYS.map((key) => {
											const active = form.gradientKey === key;
											return (
												<button
													key={key}
													type="button"
													onClick={() =>
														setForm((prev) => ({ ...prev, gradientKey: key }))
													}
													className={cn(
														"flex h-12 items-center justify-center rounded-2xl border-2 text-[11px] font-medium uppercase tracking-wide text-white shadow-sm transition",
														active ? "ring-2 ring-offset-2" : "border-transparent",
													)}
													style={{
														backgroundImage: gradientCssVar(key),
													}}
													aria-pressed={active}
													aria-label={key}
												>
													{key}
												</button>
											);
										})}
									</div>
								</div>
								<label className="flex items-center gap-2 text-sm" style={headingStyle}>
									<input
										type="checkbox"
										checked={form.dismissable}
										onChange={(event) =>
											setForm((prev) => ({
												...prev,
												dismissable: event.target.checked,
											}))
										}
										className="h-4 w-4 rounded border"
										style={{
											accentColor: "var(--color-primary-500)",
										}}
									/>
									{t("Allow users to dismiss this banner")}
								</label>
							</section>

							<section className="mt-6 space-y-3">
								<div className="flex items-center gap-2">
									<Eye aria-hidden="true" className="h-4 w-4" />
									<h3 className="text-sm font-semibold" style={headingStyle}>
										{t("Live preview")}
									</h3>
								</div>
								<BannerPreview
									title={form.title}
									body={form.body}
									ctaLabel={trimmedCtaLabel || undefined}
									ctaUrl={trimmedCtaUrl || undefined}
									gradientKey={form.gradientKey}
									dismissable={form.dismissable}
									audienceTiers={form.audienceTiers}
								/>
							</section>

							{submitAttempted && validationMessage ? (
								<p className="mt-4 text-sm text-red-600 dark:text-red-300">
									{validationMessage}
								</p>
							) : null}
						</div>

						<footer
							className="flex items-center justify-end gap-3 border-t px-6 py-4"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-border) 70%, transparent)",
							}}
						>
							<Button
								type="button"
								variant="outline"
								onClick={onClose}
								disabled={saving}
							>
								{t("Cancel")}
							</Button>
							<Button
								type="button"
								onClick={() => void handleSubmit()}
								disabled={saving || (submitAttempted && Boolean(validationMessage))}
							>
								{saving ? (
									<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
								) : (
									<Save aria-hidden="true" className="h-4 w-4" />
								)}
								{mode === "create" ? t("Create banner") : t("Save changes")}
							</Button>
						</footer>
					</motion.aside>
				</div>
			) : null}
		</AnimatePresence>
	);
}
