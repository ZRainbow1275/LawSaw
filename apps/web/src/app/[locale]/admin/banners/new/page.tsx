"use client";

/**
 * /[locale]/admin/banners/new — native banner creation page (P0 D1).
 *
 * Replaces the previous redirect-to-list shim. Surfaces a full inline form
 * (title / body / audience / channel scope / schedule / priority / dismissable)
 * so the route renders meaningful main-area content without relying on the
 * list page's drawer.
 *
 * Persistence is delegated to `useCreateBanner`. On success the page toasts
 * and pushes back to `/admin/banners` so the new banner shows up in the list.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
	type CreateBannerInput,
	useCreateBanner,
} from "@/hooks/use-banners";
import { useAdminChannels } from "@/hooks/use-channels";
import { ApiClientError } from "@/lib/api";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { ArrowLeft, Loader2, Megaphone, Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";

const AUDIENCE_TIER_OPTIONS = [
	{ value: "basic_user", labelKey: "Basic user" },
	{ value: "verified_user", labelKey: "Verified user" },
	{ value: "premium_user", labelKey: "Premium user" },
	{ value: "tenant_admin", labelKey: "Tenant admin" },
] as const;

const STATUS_OPTIONS = [
	"draft",
	"scheduled",
	"active",
] as const satisfies ReadonlyArray<NonNullable<CreateBannerInput["status"]>>;

interface FormState {
	title: string;
	body: string;
	ctaLabel: string;
	ctaUrl: string;
	status: NonNullable<CreateBannerInput["status"]>;
	priority: number;
	startsAt: string;
	endsAt: string;
	audienceTiers: string[];
	channelIds: string[];
	dismissable: boolean;
}

const INITIAL_STATE: FormState = {
	title: "",
	body: "",
	ctaLabel: "",
	ctaUrl: "",
	status: "draft",
	priority: 50,
	startsAt: "",
	endsAt: "",
	audienceTiers: ["basic_user", "verified_user"],
	channelIds: [],
	dismissable: true,
};

function isValidUrl(value: string): boolean {
	if (!value) return true;
	return /^https?:\/\//i.test(value);
}

function datetimeLocalToIso(value: string): string | null {
	if (!value) return null;
	const ms = new Date(value).getTime();
	if (!Number.isFinite(ms)) return null;
	return new Date(ms).toISOString();
}

function formatBannerErrorMessage(
	t: ReturnType<typeof useT>,
	cause: unknown,
): string {
	if (!(cause instanceof Error)) return t("Unknown error");
	if (!(cause instanceof ApiClientError)) return cause.message;
	switch (cause.status) {
		case 400:
			return t(
				"The banner request is invalid. Check the banner fields and try again.",
			);
		case 401:
			return t("Your session has expired. Please sign in again.");
		case 403:
			return t("You do not have permission to manage banners.");
		default:
			return cause.status >= 500
				? t(
						"The banner service is temporarily unavailable. Please try again later.",
					)
				: cause.message;
	}
}

export default function AdminBannerNewPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const { success, error } = useToast();

	const channelsQuery = useAdminChannels(true);
	const createBanner = useCreateBanner();

	const [form, setForm] = useState<FormState>(INITIAL_STATE);
	const [submitAttempted, setSubmitAttempted] = useState(false);

	const channels = channelsQuery.data ?? [];

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldSurfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--field-surface)",
	} as const;

	const validationMessage = useMemo(() => {
		const trimmedTitle = form.title.trim();
		const trimmedCtaUrl = form.ctaUrl.trim();
		const trimmedCtaLabel = form.ctaLabel.trim();
		if (!trimmedTitle) return t("Banner title is required.");
		if (form.audienceTiers.length === 0)
			return t("Select at least one audience tier.");
		if (trimmedCtaUrl && !isValidUrl(trimmedCtaUrl))
			return t("CTA URL must start with http:// or https://.");
		if (trimmedCtaUrl && !trimmedCtaLabel)
			return t("CTA label is required when a CTA URL is provided.");
		if (!Number.isFinite(form.priority))
			return t("Priority must be a valid number.");
		if (form.startsAt && form.endsAt) {
			const startMs = new Date(form.startsAt).getTime();
			const endMs = new Date(form.endsAt).getTime();
			if (
				Number.isFinite(startMs) &&
				Number.isFinite(endMs) &&
				endMs < startMs
			) {
				return t("Banner end time must be after the start time.");
			}
		}
		return null;
	}, [t, form]);

	const handleToggleTier = (tier: string) => {
		setForm((prev) => ({
			...prev,
			audienceTiers: prev.audienceTiers.includes(tier)
				? prev.audienceTiers.filter((item) => item !== tier)
				: [...prev.audienceTiers, tier],
		}));
	};

	const handleToggleChannel = (channelId: string) => {
		setForm((prev) => ({
			...prev,
			channelIds: prev.channelIds.includes(channelId)
				? prev.channelIds.filter((item) => item !== channelId)
				: [...prev.channelIds, channelId],
		}));
	};

	const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		setSubmitAttempted(true);
		if (validationMessage) return;

		const targets =
			form.channelIds.length === 0
				? [{ target_type: "global" as const, sort_order: 0 }]
				: form.channelIds.map((channelId, index) => ({
						target_type: "channel" as const,
						target_channel_id: channelId,
						sort_order: index,
					}));

		const payload: CreateBannerInput = {
			title: form.title.trim(),
			body: form.body.trim() || undefined,
			cta_label: form.ctaLabel.trim() || undefined,
			cta_url: form.ctaUrl.trim() || undefined,
			status: form.status,
			priority: form.priority,
			starts_at: datetimeLocalToIso(form.startsAt),
			ends_at: datetimeLocalToIso(form.endsAt),
			metadata: {
				audience_tiers: form.audienceTiers,
				dismissable: form.dismissable,
			},
			targets,
		};

		try {
			await createBanner.mutateAsync(payload);
			success(
				t("Banner created successfully."),
				t("The new banner is now visible in the live banner list."),
			);
			router.push(withLocalePath(locale, "/admin/banners"));
		} catch (cause) {
			error(t("Create failed"), formatBannerErrorMessage(t, cause));
		}
	};

	const showValidation = submitAttempted && validationMessage;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<div className="flex flex-wrap items-start justify-between gap-3">
						<div>
							<CardTitle
								className="flex items-center gap-2 text-3xl font-bold tracking-tight"
								style={headingStyle}
							>
								<Megaphone
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("New banner")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t(
									"Create operational banners and control their targeting scope.",
								)}
							</p>
						</div>
						<Button
							type="button"
							variant="outline"
							onClick={() =>
								router.push(withLocalePath(locale, "/admin/banners"))
							}
						>
							<ArrowLeft aria-hidden="true" className="h-4 w-4" />
							{t("Back to banners")}
						</Button>
					</div>
				</CardHeader>
			</Card>

			<form onSubmit={handleSubmit} className="space-y-6">
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("Banner content")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div>
							<label
								htmlFor="banner-title"
								className="mb-1 block text-sm font-medium"
								style={headingStyle}
							>
								{t("Title")} <span className="text-red-500">*</span>
							</label>
							<Input
								id="banner-title"
								value={form.title}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, title: event.target.value }))
								}
								placeholder={t("Briefly describe your banner")}
								data-testid="banner-new-title"
							/>
						</div>

						<div>
							<label
								htmlFor="banner-body"
								className="mb-1 block text-sm font-medium"
								style={headingStyle}
							>
								{t("Body (Markdown)")}
							</label>
							<textarea
								id="banner-body"
								className="min-h-[140px] w-full rounded-xl border-2 px-4 py-3 text-sm outline-none focus-visible:ring-2"
								style={fieldSurfaceStyle}
								value={form.body}
								onChange={(event) =>
									setForm((prev) => ({ ...prev, body: event.target.value }))
								}
								placeholder={t("Banner body supports Markdown formatting.")}
							/>
						</div>

						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="banner-cta-label"
									className="mb-1 block text-sm font-medium"
									style={headingStyle}
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
									placeholder={t("Read more")}
								/>
							</div>
							<div>
								<label
									htmlFor="banner-cta-url"
									className="mb-1 block text-sm font-medium"
									style={headingStyle}
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
									placeholder="https://..."
								/>
							</div>
						</div>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("Targeting")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<fieldset>
							<legend
								className="mb-2 block text-sm font-medium"
								style={headingStyle}
							>
								{t("Audience tiers")}{" "}
								<span className="text-red-500">*</span>
							</legend>
							<div className="flex flex-wrap gap-2">
								{AUDIENCE_TIER_OPTIONS.map((option) => {
									const active = form.audienceTiers.includes(option.value);
									return (
										<button
											key={option.value}
											type="button"
											onClick={() => handleToggleTier(option.value)}
											className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
											style={
												active
													? {
															backgroundColor: "var(--surface-accent-strong)",
															borderColor: "var(--color-primary-500)",
															color: "var(--color-foreground)",
														}
													: {
															backgroundColor: "var(--field-surface)",
															borderColor: "var(--field-border)",
															color: "var(--surface-muted-text)",
														}
											}
											aria-pressed={active}
										>
											{t(option.labelKey)}
										</button>
									);
								})}
							</div>
						</fieldset>

						<fieldset>
							<legend
								className="mb-2 block text-sm font-medium"
								style={headingStyle}
							>
								{t("Channel scope")}
							</legend>
							{channelsQuery.isLoading ? (
								<p className="text-sm" style={mutedTextStyle}>
									<Loader2
										aria-hidden="true"
										className="mr-2 inline h-4 w-4 animate-spin"
									/>
									{t("Loading channels")}
								</p>
							) : channels.length === 0 ? (
								<p className="text-sm" style={mutedTextStyle}>
									{t("No channels available — banner will target all tenants.")}
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
												className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
												style={
													active
														? {
																backgroundColor:
																	"var(--surface-accent-strong)",
																borderColor: "var(--color-primary-500)",
																color: "var(--color-foreground)",
															}
														: {
																backgroundColor: "var(--field-surface)",
																borderColor: "var(--field-border)",
																color: "var(--surface-muted-text)",
															}
												}
												aria-pressed={active}
											>
												{channel.name}
											</button>
										);
									})}
								</div>
							)}
							<p className="mt-2 text-xs" style={mutedTextStyle}>
								{t("Leave empty to publish as a global banner.")}
							</p>
						</fieldset>
					</CardContent>
				</Card>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("Schedule & display")}</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid gap-4 sm:grid-cols-2">
							<div>
								<label
									htmlFor="banner-starts-at"
									className="mb-1 block text-sm font-medium"
									style={headingStyle}
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
							<div>
								<label
									htmlFor="banner-ends-at"
									className="mb-1 block text-sm font-medium"
									style={headingStyle}
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

						<div className="grid gap-4 sm:grid-cols-3">
							<div>
								<label
									htmlFor="banner-status"
									className="mb-1 block text-sm font-medium"
									style={headingStyle}
								>
									{t("Status")}
								</label>
								<select
									id="banner-status"
									className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2"
									style={fieldSurfaceStyle}
									value={form.status}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											status: event.target
												.value as FormState["status"],
										}))
									}
								>
									{STATUS_OPTIONS.map((option) => (
										<option key={option} value={option}>
											{t(
												option === "draft"
													? "Draft"
													: option === "scheduled"
														? "Scheduled"
														: "Active",
											)}
										</option>
									))}
								</select>
							</div>
							<div>
								<label
									htmlFor="banner-priority"
									className="mb-1 block text-sm font-medium"
									style={headingStyle}
								>
									{t("Priority")}
								</label>
								<Input
									id="banner-priority"
									type="number"
									min={0}
									max={100}
									value={form.priority}
									onChange={(event) =>
										setForm((prev) => ({
											...prev,
											priority: Number.parseInt(event.target.value, 10),
										}))
									}
								/>
							</div>
							<div className="flex items-end">
								<label className="flex items-center gap-2 text-sm">
									<input
										type="checkbox"
										checked={form.dismissable}
										onChange={(event) =>
											setForm((prev) => ({
												...prev,
												dismissable: event.target.checked,
											}))
										}
									/>
									<span style={headingStyle}>{t("Dismissable")}</span>
								</label>
							</div>
						</div>
					</CardContent>
				</Card>

				{showValidation ? (
					<div
						className="rounded-xl border p-3 text-sm"
						style={{
							borderColor: "color-mix(in srgb, #f87171 70%, transparent)",
							backgroundColor: "color-mix(in srgb, #fee2e2 70%, transparent)",
							color: "#b91c1c",
						}}
						role="alert"
					>
						{validationMessage}
					</div>
				) : null}

				<div className="flex flex-wrap items-center justify-end gap-2">
					<Button
						type="button"
						variant="outline"
						onClick={() =>
							router.push(withLocalePath(locale, "/admin/banners"))
						}
					>
						{t("Cancel")}
					</Button>
					<Button
						type="submit"
						disabled={createBanner.isPending}
						data-testid="banner-new-submit"
					>
						{createBanner.isPending ? (
							<>
								<Loader2
									aria-hidden="true"
									className="mr-2 h-4 w-4 animate-spin"
								/>
								{t("Submitting...")}
							</>
						) : (
							<>
								<Save aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("Create banner")}
							</>
						)}
					</Button>
				</div>
			</form>
		</div>
	);
}
