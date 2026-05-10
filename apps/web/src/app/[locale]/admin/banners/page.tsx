"use client";

/**
 * /settings/admin/banners — operational banner authoring.
 *
 * Lists every banner the tenant can manage (admin scope; archived included so
 * curators can resurrect retired campaigns) and surfaces a right-slide
 * `<BannerForm>` drawer for create/edit. Tier badges, schedule windows, and
 * status chips are rendered inline so curators can triage without opening
 * the drawer.
 *
 * The drawer persists Markdown body, audience tier targeting, channel scope,
 * priority, schedule, gradient, and dismissable behavior. Audience / gradient
 * / dismissable live in the canonical `metadata` JSONB column so the data
 * round-trips even before the response shape is extended on the API side.
 */

import { BannerForm } from "@/components/admin/banner-form";
import {
	type BannerGradientKey,
	bannerVividGradient,
} from "@/components/admin/banner-preview";
import { Badge } from "@/components/ui/badge";
import { useAdminDeepLink } from "@/hooks/use-admin-deep-link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import {
	type BannerRecord,
	type CreateBannerInput,
	type UpdateBannerInput,
	useAdminBanners,
	useCreateBanner,
	useUpdateBanner,
} from "@/hooks/use-banners";
import { useAdminChannels } from "@/hooks/use-channels";
import { ApiClientError } from "@/lib/api";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useToast } from "@/stores/toast-store";
import {
	Archive,
	CalendarClock,
	CheckCircle2,
	Copy,
	ExternalLink,
	Flag,
	Image as ImageIcon,
	Layers,
	Megaphone,
	Plus,
	RotateCcw,
	Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const VALID_GRADIENT_KEYS: BannerGradientKey[] = [
	"primary",
	"emerald",
	"amber",
	"violet",
	"cyan",
	"rose",
];

function formatBannerAdminErrorMessage(
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

function gradientKeyOf(banner: BannerRecord): BannerGradientKey {
	const key = banner.metadata?.gradient_key;
	if (
		typeof key === "string" &&
		(VALID_GRADIENT_KEYS as string[]).includes(key)
	) {
		return key as BannerGradientKey;
	}
	return "primary";
}

function audienceTiersOf(banner: BannerRecord): string[] {
	const tiers = banner.metadata?.audience_tiers;
	return Array.isArray(tiers)
		? tiers.filter((value): value is string => typeof value === "string")
		: [];
}

function formatScheduleWindow(
	t: ReturnType<typeof useT>,
	locale: ReturnType<typeof useLocale>,
	starts: string | null,
	ends: string | null,
): string {
	if (!starts && !ends) return t("Always on");
	const fmt = (value: string) =>
		formatDateTime(locale, value, {
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
		});
	if (starts && ends) return `${fmt(starts)} → ${fmt(ends)}`;
	if (starts) return `${t("From")} ${fmt(starts)}`;
	return `${t("Until")} ${fmt(ends as string)}`;
}

function statusVariant(
	status: BannerRecord["status"],
): "outline" | "warning" | "success" | "secondary" {
	switch (status) {
		case "active":
			return "success";
		case "scheduled":
			return "warning";
		case "expired":
		case "archived":
			return "outline";
		default:
			return "secondary";
	}
}

export default function AdminBannersPage() {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();
	const { searchParams, clearSearchParams } = useAdminDeepLink();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const bannersQuery = useAdminBanners(true);
	const channelsQuery = useAdminChannels(true);
	const createBanner = useCreateBanner();
	const updateBanner = useUpdateBanner();

	const [drawerMode, setDrawerMode] = useState<"create" | "edit" | null>(null);
	const [editingBanner, setEditingBanner] = useState<BannerRecord | null>(null);
	const createParam = searchParams.get("create");

	const channels = channelsQuery.data ?? [];
	const channelNameById = useMemo(
		() => new Map(channels.map((channel) => [channel.id, channel.name])),
		[channels],
	);
	const banners = bannersQuery.data ?? [];

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	useEffect(() => {
		if (createParam !== "1") return;
		setEditingBanner(null);
		setDrawerMode("create");
	}, [createParam]);

	const openCreateDrawer = () => {
		setEditingBanner(null);
		setDrawerMode("create");
	};

	const openEditDrawer = (banner: BannerRecord) => {
		setEditingBanner(banner);
		setDrawerMode("edit");
	};

	const closeDrawer = () => {
		setDrawerMode(null);
		setEditingBanner(null);
		clearSearchParams(["create"]);
	};

	const handleSubmitForm = async (payload: CreateBannerInput) => {
		if (drawerMode === "create") {
			try {
				await createBanner.mutateAsync(payload);
				success(
					t("Banner created successfully."),
					t("The new banner is now visible in the live banner list."),
				);
				closeDrawer();
			} catch (cause) {
				error(t("Create failed"), formatBannerAdminErrorMessage(t, cause));
			}
			return;
		}
		if (drawerMode === "edit" && editingBanner) {
			const update: UpdateBannerInput = {
				id: editingBanner.id,
				title: payload.title,
				body: payload.body,
				cta_label: payload.cta_label,
				cta_url: payload.cta_url,
				status: payload.status,
				priority: payload.priority,
				starts_at: payload.starts_at,
				ends_at: payload.ends_at,
				metadata: payload.metadata,
				targets: payload.targets,
			};
			try {
				await updateBanner.mutateAsync(update);
				success(
					t("Saved successfully"),
					t("The banner is now reflected in the live banner list."),
				);
				closeDrawer();
			} catch (cause) {
				error(t("Save failed"), formatBannerAdminErrorMessage(t, cause));
			}
		}
	};

	const handleStatusChange = (
		banner: BannerRecord,
		nextStatus: BannerRecord["status"],
	) => {
		updateBanner.mutate(
			{
				id: banner.id,
				status: nextStatus,
				archived_at:
					nextStatus === "archived" ? new Date().toISOString() : null,
			},
			{
				onSuccess: () => {
					success(
						t("Saved successfully"),
						t("The banner status is now reflected in the live banner list."),
					);
				},
				onError: (cause) => {
					error(t("Save failed"), formatBannerAdminErrorMessage(t, cause));
				},
			},
		);
	};

	const handleArchiveToggle = (banner: BannerRecord) => {
		updateBanner.mutate(
			{
				id: banner.id,
				archived_at: banner.archived_at ? null : new Date().toISOString(),
				status: banner.archived_at ? "draft" : "archived",
			},
			{
				onSuccess: () => {
					success(
						t("Saved successfully"),
						t(
							"The banner archive state is now reflected in the live banner list.",
						),
					);
				},
				onError: (cause) => {
					error(t("Save failed"), formatBannerAdminErrorMessage(t, cause));
				},
			},
		);
	};

	const handleDuplicate = async (banner: BannerRecord) => {
		const payload: CreateBannerInput = {
			title: `${banner.title} (${t("Copy")})`,
			body: banner.body ?? undefined,
			cta_label: banner.cta_label ?? undefined,
			cta_url: banner.cta_url ?? undefined,
			status: "draft",
			priority: banner.priority,
			starts_at: banner.starts_at,
			ends_at: banner.ends_at,
			metadata: banner.metadata ?? {},
			targets: banner.targets.map((target, index) => ({
				target_type: target.target_type,
				target_channel_id: target.target_channel_id,
				sort_order: index,
			})),
		};
		try {
			await createBanner.mutateAsync(payload);
			success(
				t("Banner duplicated"),
				t("A draft copy is now in the banner list."),
			);
		} catch (cause) {
			error(t("Duplicate failed"), formatBannerAdminErrorMessage(t, cause));
		}
	};

	const drawerSaving = createBanner.isPending || updateBanner.isPending;

	const bannerStats = useMemo(() => {
		const all = bannersQuery.data ?? [];
		let active = 0;
		let scheduled = 0;
		let archived = 0;
		for (const banner of all) {
			if (banner.status === "active") active += 1;
			else if (banner.status === "scheduled") scheduled += 1;
			else if (banner.status === "archived" || banner.status === "expired")
				archived += 1;
		}
		return { total: all.length, active, scheduled, archived };
	}, [bannersQuery.data]);

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
								<Flag
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Banner management")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t(
									"Create operational banners and control their targeting scope.",
								)}
							</p>
						</div>
						{isAdmin ? (
							<Button type="button" onClick={openCreateDrawer}>
								<Plus aria-hidden="true" className="h-4 w-4" />
								{t("New banner")}
							</Button>
						) : null}
					</div>
				</CardHeader>
			</Card>

			<KpiCardGrid columns={4}>
				<KpiCard
					tone="info"
					label={t("Total banners")}
					value={bannerStats.total}
					icon={Layers}
				/>
				<KpiCard
					tone="success"
					label={t("Active")}
					value={bannerStats.active}
					icon={CheckCircle2}
				/>
				<KpiCard
					tone="warning"
					label={t("Scheduled")}
					value={bannerStats.scheduled}
					icon={CalendarClock}
				/>
				<KpiCard
					tone="error"
					label={t("Archived")}
					value={bannerStats.archived}
					icon={Archive}
				/>
			</KpiCardGrid>

			{!isAdmin ? (
				<EmptyState
					title={t("Access restricted")}
					description={t(
						"You need an administrative role to access this workspace.",
					)}
				/>
			) : (
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2">
							<Megaphone aria-hidden="true" className="h-5 w-5" />
							{t("Banners")}
						</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4">
						{bannersQuery.isLoading ? (
							<p className="text-sm" style={mutedTextStyle}>
								{t("Loading banners")}
							</p>
						) : bannersQuery.isError ? (
							<EmptyState
								variant="error"
								title={t("Failed to load banners")}
								description={
									bannersQuery.error instanceof Error
										? bannersQuery.error.message
										: t("Unknown error")
								}
								action={{
									label: t("Retry"),
									onClick: () => bannersQuery.refetch(),
								}}
							/>
						) : banners.length === 0 ? (
							<EmptyState
								title={t("No banners yet")}
								description={t(
									"Create your first operational banner to surface announcements and actions.",
								)}
							/>
						) : (
							banners.map((banner) => {
								const audienceTiers = audienceTiersOf(banner);
								const gradientKey = gradientKeyOf(banner);
								const channelLabels = banner.targets.map((target) =>
									target.target_type === "global"
										? t("Global")
										: target.target_channel_id
											? (channelNameById.get(target.target_channel_id) ??
												target.target_channel_id)
											: t("Unknown channel"),
								);
								const isArchived = Boolean(banner.archived_at);
								const bodyPreview = (banner.body ?? "")
									.replace(/[#*_`>~\-]/g, "")
									.replace(/\s+/g, " ")
									.trim()
									.slice(0, 140);
								return (
									<div
										key={banner.id}
										className={cn(
											"group relative overflow-hidden rounded-2xl border transition",
											"hover:shadow-md",
											isArchived && "opacity-70",
										)}
										style={surfaceStyle}
									>
										<div className="flex flex-col gap-4 p-4 md:flex-row md:items-stretch">
											{/* Color swatch — compact gradient identity, not a full hero */}
											<div
												className="relative flex h-20 w-20 shrink-0 items-center justify-center self-start rounded-2xl shadow-sm md:h-24 md:w-24"
												style={{
													backgroundImage: bannerVividGradient(gradientKey),
												}}
											>
												<Megaphone
													aria-hidden="true"
													className="h-7 w-7 text-white drop-shadow"
												/>
												{banner.image_url ? (
													<span
														className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full border bg-white text-[10px] dark:bg-neutral-900"
														style={{
															borderColor:
																"color-mix(in srgb, var(--color-border) 70%, transparent)",
															color: "var(--surface-muted-text)",
														}}
														aria-label={t("Banner image URL")}
													>
														<ImageIcon
															aria-hidden="true"
															className="h-3 w-3"
														/>
													</span>
												) : null}
											</div>

											{/* Body — title, status, summary, metadata */}
											<div className="min-w-0 flex-1 space-y-2">
												<div className="flex flex-wrap items-center gap-2">
													<h3
														className="truncate text-base font-semibold leading-snug"
														style={headingStyle}
														title={banner.title}
													>
														{banner.title}
													</h3>
													<Badge variant={statusVariant(banner.status)}>
														{t(
															banner.status === "draft"
																? "Draft"
																: banner.status === "scheduled"
																	? "Scheduled"
																	: banner.status === "active"
																		? "Active"
																		: banner.status === "expired"
																			? "Expired"
																			: "Archived",
														)}
													</Badge>
													{isArchived ? (
														<Badge
															variant="outline"
															className="border-dashed"
														>
															<Archive
																aria-hidden="true"
																className="mr-1 h-3 w-3"
															/>
															{t("Archived")}
														</Badge>
													) : null}
												</div>

												{bodyPreview ? (
													<p
														className="line-clamp-2 text-sm leading-relaxed"
														style={mutedTextStyle}
													>
														{bodyPreview}
													</p>
												) : null}

												<div
													className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs"
													style={mutedTextStyle}
												>
													<span className="inline-flex items-center gap-1">
														<Flag
															aria-hidden="true"
															className="h-3 w-3"
														/>
														{t("Priority")}: {banner.priority}
													</span>
													<span className="inline-flex items-center gap-1">
														<CalendarClock
															aria-hidden="true"
															className="h-3 w-3"
														/>
														{formatScheduleWindow(
															t,
															locale,
															banner.starts_at,
															banner.ends_at,
														)}
													</span>
													{banner.cta_url ? (
														<span className="inline-flex max-w-[260px] items-center gap-1 truncate">
															<ExternalLink
																aria-hidden="true"
																className="h-3 w-3"
															/>
															<span className="truncate">
																{banner.cta_label || banner.cta_url}
															</span>
														</span>
													) : null}
												</div>

												{(audienceTiers.length > 0 ||
													channelLabels.length > 0) && (
													<div className="flex flex-wrap items-center gap-1.5 pt-1">
														{audienceTiers.length > 0 ? (
															<span
																className="inline-flex items-center gap-1 text-[11px] uppercase tracking-wide"
																style={mutedTextStyle}
															>
																<Users
																	aria-hidden="true"
																	className="h-3 w-3"
																/>
															</span>
														) : null}
														{audienceTiers.map((tier) => (
															<Badge
																key={`${banner.id}-tier-${tier}`}
																variant="outline"
																className="text-[11px] uppercase tracking-wide"
															>
																{tier}
															</Badge>
														))}
														{channelLabels.map((label, index) => (
															<Badge
																key={`${banner.id}-target-${index}`}
																variant="secondary"
															>
																{label}
															</Badge>
														))}
													</div>
												)}
											</div>
										</div>

										{/* Action bar */}
										<div
											className="flex flex-wrap items-center gap-2 border-t px-4 py-3"
											style={{
												borderColor:
													"color-mix(in srgb, var(--color-border) 78%, transparent)",
												backgroundColor:
													"color-mix(in srgb, var(--surface-muted-bg) 30%, transparent)",
											}}
										>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => openEditDrawer(banner)}
											>
												{t("Edit banner")}
											</Button>
											<select
												aria-label={t("Status")}
												value={banner.status}
												onChange={(event) =>
													handleStatusChange(
														banner,
														event.target.value as BannerRecord["status"],
													)
												}
												className="h-9 rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
												style={{
													borderColor:
														"color-mix(in srgb, var(--color-border) 80%, transparent)",
													backgroundColor: "var(--color-background)",
													color: "var(--color-foreground)",
												}}
											>
												<option value="draft">{t("Draft")}</option>
												<option value="scheduled">{t("Scheduled")}</option>
												<option value="active">{t("Active")}</option>
												<option value="expired">{t("Expired")}</option>
												<option value="archived">{t("Archived")}</option>
											</select>
											<Button
												type="button"
												variant="outline"
												size="sm"
												onClick={() => void handleDuplicate(banner)}
												disabled={createBanner.isPending}
											>
												<Copy aria-hidden="true" className="h-4 w-4" />
												{t("Duplicate")}
											</Button>
											<div className="ml-auto">
												<Button
													type="button"
													variant={isArchived ? "default" : "outline"}
													size="sm"
													onClick={() => handleArchiveToggle(banner)}
													disabled={updateBanner.isPending}
												>
													{isArchived ? (
														<>
															<RotateCcw
																aria-hidden="true"
																className="h-4 w-4"
															/>
															{t("Restore banner")}
														</>
													) : (
														<>
															<Archive
																aria-hidden="true"
																className="h-4 w-4"
															/>
															{t("Archive banner")}
														</>
													)}
												</Button>
											</div>
										</div>
									</div>
								);
							})
						)}
					</CardContent>
				</Card>
			)}

			<BannerForm
				open={drawerMode !== null}
				mode={drawerMode ?? "create"}
				banner={editingBanner}
				channels={channels}
				onClose={closeDrawer}
				onSubmit={handleSubmitForm}
				saving={drawerSaving}
			/>
		</div>
	);
}
