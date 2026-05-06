"use client";

/**
 * /settings/admin/channels — tenant feed-channel management.
 *
 * Reads `GET /api/v1/admin/channels?include_inactive=true` and applies
 * search + visibility filters client-side because the backend list endpoint
 * does not yet expose those query params.
 *
 * Row click opens `<ChannelDetailDrawer>` (4 tabs: overview / policies /
 * linked banners / actions). Top-right "New channel" surfaces
 * `<ChannelFormModal>` for create; row "Edit" reuses the same modal in
 * edit mode. The is_active toggle is inline so curators can disable a
 * channel without opening the drawer. Soft-archive is the only
 * destructive path because the backend has no DELETE endpoint.
 */

import { ChannelDetailDrawer } from "@/components/admin/channel-detail-drawer";
import { useAdminDeepLink } from "@/hooks/use-admin-deep-link";
import { ChannelFormModal } from "@/components/admin/channel-form-modal";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import { useCategories } from "@/hooks/use-categories";
import {
	type ChannelRecord,
	useAdminChannels,
	useUpdateChannel,
} from "@/hooks/use-channels";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { motion } from "framer-motion";
import {
	CheckCircle2,
	Crown,
	Filter,
	Globe2,
	Layers3,
	Loader2,
	Pencil,
	Plus,
	Power,
	Search,
	ShieldCheck,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PAGE_SIZE = 25;

const VISIBILITY_FILTERS: ReadonlyArray<{
	value: "all" | ChannelRecord["visibility"];
	labelKey: string;
}> = [
	{ value: "all", labelKey: "All visibility" },
	{ value: "public", labelKey: "Public" },
	{ value: "restricted", labelKey: "Restricted" },
	{ value: "verified", labelKey: "Verified" },
	{ value: "premium", labelKey: "Premium" },
];

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.04, delayChildren: 0.06 },
	},
} as const;

const rowVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.18 } },
} as const;

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

export default function AdminChannelsPage() {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();
	const { searchParams, clearSearchParams } = useAdminDeepLink();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;

	const channelsQuery = useAdminChannels(true);
	const categoriesQuery = useCategories();
	const updateChannel = useUpdateChannel();

	const [page, setPage] = useState(0);
	const [searchQuery, setSearchQuery] = useState("");
	const [visibilityFilter, setVisibilityFilter] = useState<
		"all" | ChannelRecord["visibility"]
	>("all");
	const [drawerChannel, setDrawerChannel] = useState<ChannelRecord | null>(
		null,
	);
	const [formMode, setFormMode] = useState<"create" | "edit" | null>(null);
	const [editingChannel, setEditingChannel] = useState<ChannelRecord | null>(
		null,
	);
	const channelIdParam = searchParams.get("channelId");

	const allChannels = channelsQuery.data ?? [];

	const channelStats = useMemo(() => {
		let active = 0;
		let publicCount = 0;
		let verified = 0;
		let premium = 0;
		for (const channel of allChannels) {
			if (channel.is_active) active += 1;
			if (channel.visibility === "public") publicCount += 1;
			else if (channel.visibility === "verified") verified += 1;
			else if (channel.visibility === "premium") premium += 1;
		}
		return {
			total: allChannels.length,
			active,
			public: publicCount,
			verified,
			premium,
		};
	}, [allChannels]);

	const categoryNameById = useMemo(
		() =>
			new Map(
				(categoriesQuery.data ?? []).map((category) => [
					category.id,
					category.name,
				]),
			),
		[categoriesQuery.data],
	);

	useEffect(() => {
		if (!channelIdParam) return;
		const channel = allChannels.find((item) => item.id === channelIdParam);
		if (!channel) return;
		setSearchQuery("");
		setVisibilityFilter("all");
		setPage(0);
		setDrawerChannel(channel);
	}, [allChannels, channelIdParam]);

	const closeChannelDrawer = () => {
		setDrawerChannel(null);
		clearSearchParams(["channelId"]);
	};

	const filteredChannels = useMemo(() => {
		const trimmed = searchQuery.trim().toLowerCase();
		return allChannels.filter((channel) => {
			if (trimmed.length > 0) {
				const haystack = [channel.slug, channel.name].join(" ").toLowerCase();
				if (!haystack.includes(trimmed)) return false;
			}
			if (visibilityFilter !== "all") {
				if (channel.visibility !== visibilityFilter) return false;
			}
			return true;
		});
	}, [allChannels, searchQuery, visibilityFilter]);

	const totalPages = Math.max(
		1,
		Math.ceil(filteredChannels.length / PAGE_SIZE),
	);
	const safePage = Math.min(page, totalPages - 1);
	const pagedChannels = filteredChannels.slice(
		safePage * PAGE_SIZE,
		(safePage + 1) * PAGE_SIZE,
	);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const handleToggleActive = (
		channel: ChannelRecord,
		nextIsActive: boolean,
	) => {
		updateChannel.mutate(
			{
				id: channel.id,
				is_active: nextIsActive,
			},
			{
				onSuccess: () => {
					success(
						t("Saved successfully"),
						nextIsActive
							? t("Channel is again visible to its target audience.")
							: t("Channel is hidden from active visibility scopes."),
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

	const openCreateModal = () => {
		setEditingChannel(null);
		setFormMode("create");
	};

	const openEditModal = (channel: ChannelRecord) => {
		setEditingChannel(channel);
		setFormMode("edit");
	};

	const closeFormModal = () => {
		setFormMode(null);
		setEditingChannel(null);
	};

	return (
		<>
			<div className="space-y-6">
				<Card>
					<CardHeader>
						<div className="flex flex-wrap items-start justify-between gap-3">
							<div>
								<CardTitle
									className="flex items-center gap-2 text-3xl font-bold tracking-tight"
									style={headingStyle}
								>
									<Layers3
										aria-hidden="true"
										className="h-7 w-7"
										style={{ color: "var(--color-primary-500)" }}
									/>
									{t("Channel management")}
								</CardTitle>
								<p className="mt-1 text-sm" style={mutedTextStyle}>
									{t(
										"Create and govern tenant feed channels with explicit visibility tiers.",
									)}
								</p>
							</div>
							{isAdmin ? (
								<Button type="button" onClick={openCreateModal}>
									<Plus aria-hidden="true" className="h-4 w-4" />
									{t("New channel")}
								</Button>
							) : null}
						</div>
					</CardHeader>
				</Card>

				<KpiCardGrid columns={4}>
					<KpiCard
						tone="info"
						label={t("Total channels")}
						value={channelStats.total}
						icon={Layers3}
					/>
					<KpiCard
						tone="success"
						label={t("Active")}
						value={channelStats.active}
						icon={CheckCircle2}
					/>
					<KpiCard
						tone="warning"
						label={t("Public")}
						value={channelStats.public}
						icon={Globe2}
					/>
					<KpiCard
						tone="error"
						label={t("Premium")}
						value={channelStats.premium}
						icon={Crown}
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
							<div className="flex flex-wrap items-center justify-between gap-3">
								<CardTitle className="flex items-center gap-2">
									<Layers3 aria-hidden="true" className="h-5 w-5" />
									{t("Channels")}
									<Badge variant="secondary">{filteredChannels.length}</Badge>
								</CardTitle>
								<div className="flex flex-wrap items-center gap-2">
									<div className="relative">
										<Search
											aria-hidden="true"
											className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
											style={mutedTextStyle}
										/>
										<Input
											value={searchQuery}
											onChange={(event) => setSearchQuery(event.target.value)}
											placeholder={t("Search slug or name")}
											className="pl-9"
											data-testid="admin-channels-search"
										/>
									</div>
									<div className="flex flex-wrap items-center gap-1">
										<Filter
											aria-hidden="true"
											className="h-4 w-4"
											style={mutedTextStyle}
										/>
										{VISIBILITY_FILTERS.map((option) => (
											<button
												key={option.value}
												type="button"
												onClick={() => setVisibilityFilter(option.value)}
												className="rounded-full border px-3 py-1 text-xs font-medium transition-colors"
												style={
													visibilityFilter === option.value
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
												aria-pressed={visibilityFilter === option.value}
											>
												{t(option.labelKey)}
											</button>
										))}
									</div>
								</div>
							</div>
						</CardHeader>
						<CardContent className="space-y-3">
							{channelsQuery.isLoading ? (
								<div
									className="flex items-center gap-2 text-sm"
									style={mutedTextStyle}
								>
									<Loader2
										aria-hidden="true"
										className="h-4 w-4 animate-spin"
									/>
									{t("Loading channels")}
								</div>
							) : channelsQuery.isError ? (
								<EmptyState
									variant="error"
									title={t("Failed to load channels")}
									description={
										channelsQuery.error instanceof Error
											? channelsQuery.error.message
											: t("Unknown error")
									}
									action={{
										label: t("Retry"),
										onClick: () => channelsQuery.refetch(),
									}}
								/>
							) : pagedChannels.length === 0 ? (
								<EmptyState
									variant="search"
									title={t("No channels match your filters")}
									description={t(
										"Try clearing the search box or selecting a different visibility tier.",
									)}
								/>
							) : (
								<motion.ul
									className="space-y-2"
									variants={listVariants}
									initial="hidden"
									animate="visible"
									data-testid="admin-channels-list"
								>
									{pagedChannels.map((channel) => {
										const linkedCategoryName = channel.linked_category_id
											? (categoryNameById.get(channel.linked_category_id) ??
												channel.linked_category_id)
											: null;
										return (
											<motion.li key={channel.id} variants={rowVariants}>
												<div
													className="rounded-2xl border px-4 py-3"
													style={surfaceStyle}
													data-testid="admin-channels-row"
												>
													<div className="flex flex-wrap items-start justify-between gap-3">
														<button
															type="button"
															onClick={() => setDrawerChannel(channel)}
															className="min-w-0 flex-1 text-left"
														>
															<div className="flex flex-wrap items-center gap-2">
																<p
																	className="truncate text-sm font-semibold"
																	style={headingStyle}
																>
																	{channel.name}
																</p>
																<Badge variant="outline">/{channel.slug}</Badge>
																<Badge
																	variant={visibilityVariant(
																		channel.visibility,
																	)}
																>
																	{t(visibilityLabelKey(channel.visibility))}
																</Badge>
																<Badge
																	variant={
																		channel.is_active ? "success" : "secondary"
																	}
																>
																	{channel.is_active
																		? t("Active")
																		: t("Archived")}
																</Badge>
															</div>
															<p
																className="mt-1 truncate text-xs"
																style={mutedTextStyle}
															>
																{linkedCategoryName
																	? `${t("Linked category")}: ${linkedCategoryName}`
																	: t("No linked category")}
																{` · ${t("Updated")} ${formatDateTime(
																	locale,
																	channel.updated_at,
																	{
																		year: "numeric",
																		month: "2-digit",
																		day: "2-digit",
																	},
																)}`}
															</p>
														</button>
														<div className="flex flex-wrap items-center gap-2">
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() => openEditModal(channel)}
															>
																<Pencil
																	aria-hidden="true"
																	className="h-4 w-4"
																/>
																{t("Edit")}
															</Button>
															<Button
																type="button"
																size="sm"
																variant="outline"
																onClick={() =>
																	handleToggleActive(
																		channel,
																		!channel.is_active,
																	)
																}
																disabled={updateChannel.isPending}
															>
																<Power aria-hidden="true" className="h-4 w-4" />
																{channel.is_active ? t("Disable") : t("Enable")}
															</Button>
														</div>
													</div>
												</div>
											</motion.li>
										);
									})}
								</motion.ul>
							)}

							{filteredChannels.length > PAGE_SIZE ? (
								<div
									className="flex items-center justify-between pt-2 text-xs"
									style={mutedTextStyle}
								>
									<p>
										{t("Page")} {safePage + 1} / {totalPages}
									</p>
									<div className="flex gap-2">
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() => setPage((value) => Math.max(0, value - 1))}
											disabled={safePage === 0}
										>
											{t("Previous")}
										</Button>
										<Button
											type="button"
											size="sm"
											variant="outline"
											onClick={() =>
												setPage((value) => Math.min(totalPages - 1, value + 1))
											}
											disabled={safePage >= totalPages - 1}
										>
											{t("Next")}
										</Button>
									</div>
								</div>
							) : null}
						</CardContent>
					</Card>
				)}
			</div>

			<ChannelDetailDrawer
				open={drawerChannel !== null}
				channel={drawerChannel}
				onClose={closeChannelDrawer}
			/>

			<ChannelFormModal
				isOpen={formMode !== null}
				mode={formMode ?? "create"}
				channel={editingChannel}
				onClose={closeFormModal}
			/>
		</>
	);
}
