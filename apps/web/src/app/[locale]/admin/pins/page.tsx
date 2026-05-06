"use client";

/**
 * /settings/admin/pins — pinned-article administration.
 *
 * Layout:
 *   - Left card: published-article picker (used to feed the "Add pin" modal).
 *   - Right card: <PinList> with HTML5 drag-and-drop reordering, inline
 *     priority + ends_at editing, deletion confirmation.
 *
 * The "New pin" modal lets curators search a published article, set the pin
 * window (`ends_at`) and the channel scope. Channel scope is persisted into
 * `metadata.channel_id` because the pin row currently exposes only article_id
 * + priority + windows; this keeps the data round-trip-safe and forward
 * compatible with a future scope/channel_id column.
 */

import { PinList } from "@/components/admin/pin-list";
import { ArticleCard } from "@/components/article/article-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard, KpiCardGrid } from "@/components/ui/kpi-card";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useAdminChannels } from "@/hooks/use-channels";
import {
	type ArticlePinRecord,
	useAdminArticlePins,
	useCreateArticlePin,
	useDeleteArticlePin,
	useUpdateArticlePin,
} from "@/hooks/use-pins";
import type { Article } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { type ToastInput, useToastStore } from "@/stores/toast-store";
import {
	CalendarClock,
	CheckCircle2,
	Pin,
	Plus,
	Save,
	Search,
	Timer,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

function sortPinsByPriority(items: ArticlePinRecord[]): ArticlePinRecord[] {
	return [...items].sort((left, right) => right.priority - left.priority);
}

function errorMessageFromUnknown(
	value: unknown,
	translate: (key: string) => string,
): string {
	return value instanceof Error && value.message
		? value.message
		: translate("Unknown error");
}

function showAdminPinToast(input: ToastInput) {
	useToastStore.getState().addToast(input);
}

function datetimeLocalToIso(value: string): string | null {
	if (!value) return null;
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return null;
	return date.toISOString();
}

interface AddPinModalProps {
	open: boolean;
	onClose: () => void;
	onSubmit: (input: {
		articleId: string;
		endsAtIso: string | null;
		channelId: string | null;
	}) => Promise<void>;
	channels: { id: string; name: string }[];
	articles: Article[];
	pinnedArticleIds: Set<string>;
	saving: boolean;
}

function AddPinModal({
	open,
	onClose,
	onSubmit,
	channels,
	articles,
	pinnedArticleIds,
	saving,
}: AddPinModalProps) {
	const t = useT();
	const [search, setSearch] = useState("");
	const [selectedArticleId, setSelectedArticleId] = useState<string | null>(
		null,
	);
	const [endsAt, setEndsAt] = useState("");
	const [channelId, setChannelId] = useState<string>("");
	const [submitAttempted, setSubmitAttempted] = useState(false);

	useEffect(() => {
		if (!open) {
			setSearch("");
			setSelectedArticleId(null);
			setEndsAt("");
			setChannelId("");
			setSubmitAttempted(false);
		}
	}, [open]);

	const filtered = useMemo(() => {
		const q = search.trim().toLowerCase();
		const candidates = articles.filter(
			(article) => !pinnedArticleIds.has(article.id),
		);
		if (!q) return candidates.slice(0, 25);
		return candidates
			.filter((article) => article.title.toLowerCase().includes(q))
			.slice(0, 25);
	}, [articles, pinnedArticleIds, search]);

	const validation = !selectedArticleId ? t("Pick an article first.") : null;

	const handleSubmit = async () => {
		setSubmitAttempted(true);
		if (validation || !selectedArticleId) return;
		await onSubmit({
			articleId: selectedArticleId,
			endsAtIso: datetimeLocalToIso(endsAt),
			channelId: channelId || null,
		});
	};

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldStyle = {
		backgroundColor: "var(--color-background)",
		borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
		color: "var(--color-foreground)",
	} as const;

	return (
		<Modal isOpen={open} onClose={saving ? () => {} : onClose} size="lg">
			<ModalHeader className="pr-14">
				<h2
					className="flex items-center gap-2 text-lg font-semibold"
					style={headingStyle}
				>
					<Pin aria-hidden="true" className="h-5 w-5" />
					{t("Pin article")}
				</h2>
				<p className="mt-1 text-sm" style={mutedStyle}>
					{t(
						"Search a published article, scope the pin to a channel, and choose when it expires.",
					)}
				</p>
			</ModalHeader>
			<ModalBody className="max-h-[60vh] space-y-4">
				<div className="space-y-1.5">
					<label
						htmlFor="add-pin-search"
						className="text-xs font-medium uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Search articles")}
					</label>
					<div className="relative">
						<Search
							aria-hidden="true"
							className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
							style={mutedStyle}
						/>
						<Input
							id="add-pin-search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder={t("Search by title")}
							className="pl-9"
						/>
					</div>
				</div>

				<div className="space-y-2">
					{filtered.length === 0 ? (
						<p className="text-sm" style={mutedStyle}>
							{t("No matching published articles.")}
						</p>
					) : (
						<ul
							className="max-h-64 space-y-1 overflow-y-auto rounded-2xl border p-1"
							style={fieldStyle}
						>
							{filtered.map((article) => {
								const active = selectedArticleId === article.id;
								return (
									<li key={article.id}>
										<button
											type="button"
											onClick={() => setSelectedArticleId(article.id)}
											className="flex w-full items-start gap-2 rounded-xl px-3 py-2 text-left text-sm transition hover:bg-[color:var(--surface-muted-bg)]"
											style={
												active
													? {
															backgroundColor:
																"color-mix(in srgb, var(--color-primary-500) 14%, transparent)",
															color: "var(--color-foreground)",
														}
													: { color: "var(--color-foreground)" }
											}
											aria-pressed={active}
										>
											<span className="flex-1 truncate font-medium">
												{article.title}
											</span>
											{active ? (
												<Badge variant="success">{t("Selected")}</Badge>
											) : null}
										</button>
									</li>
								);
							})}
						</ul>
					)}
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1.5">
						<label
							htmlFor="add-pin-channel"
							className="text-xs font-medium uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Channel scope")}
						</label>
						<select
							id="add-pin-channel"
							value={channelId}
							onChange={(event) => setChannelId(event.target.value)}
							className="h-10 w-full rounded-lg border px-3 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
							style={fieldStyle}
						>
							<option value="">{t("Global")}</option>
							{channels.map((channel) => (
								<option key={channel.id} value={channel.id}>
									{channel.name}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-1.5">
						<label
							htmlFor="add-pin-ends-at"
							className="text-xs font-medium uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Expires at")}
						</label>
						<Input
							id="add-pin-ends-at"
							type="datetime-local"
							value={endsAt}
							onChange={(event) => setEndsAt(event.target.value)}
						/>
					</div>
				</div>

				{submitAttempted && validation ? (
					<p className="text-sm text-red-600 dark:text-red-300">{validation}</p>
				) : null}
			</ModalBody>
			<ModalFooter>
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
					disabled={saving || !selectedArticleId}
				>
					<Save aria-hidden="true" className="h-4 w-4" />
					{t("Pin article")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}

export default function AdminPinsPage() {
	const t = useT();
	// Server-side admin guard at [locale]/admin/layout.tsx — see users/page.tsx.
	const isAdmin = true;
	const articlesQuery = useArticles({ limit: 50, status: "published" });
	const pinsQuery = useAdminArticlePins();
	const categoriesQuery = useCategories();
	const channelsQuery = useAdminChannels(true);
	const createPin = useCreateArticlePin();
	const updatePin = useUpdateArticlePin();
	const deletePin = useDeleteArticlePin();
	const [orderedPins, setOrderedPins] = useState<ArticlePinRecord[]>([]);
	const [reorderBusy, setReorderBusy] = useState(false);
	const [addModalOpen, setAddModalOpen] = useState(false);

	const channels = channelsQuery.data ?? [];
	const articles = articlesQuery.data?.data ?? [];
	const categoryById = new Map(
		(categoriesQuery.data ?? []).map((item) => [item.id, item]),
	);
	const pinnedArticleIds = new Set(orderedPins.map((pin) => pin.article_id));

	const mutationBusy =
		reorderBusy ||
		createPin.isPending ||
		updatePin.isPending ||
		deletePin.isPending;

	const pinStats = useMemo(() => {
		const now = Date.now();
		let active = 0;
		let scheduled = 0;
		let expired = 0;
		for (const pin of orderedPins) {
			const startsAt = pin.starts_at ? Date.parse(pin.starts_at) : null;
			const endsAt = pin.ends_at ? Date.parse(pin.ends_at) : null;
			if (endsAt !== null && Number.isFinite(endsAt) && endsAt < now) {
				expired += 1;
			} else if (
				startsAt !== null &&
				Number.isFinite(startsAt) &&
				startsAt > now
			) {
				scheduled += 1;
			} else {
				active += 1;
			}
		}
		return { total: orderedPins.length, active, scheduled, expired };
	}, [orderedPins]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	useEffect(() => {
		setOrderedPins(sortPinsByPriority(pinsQuery.data ?? []));
	}, [pinsQuery.data]);

	const showAdminPinErrorToast = (title: string, description: string) => {
		showAdminPinToast({ type: "error", title, description });
	};

	const syncPinPriorities = async (
		nextPins: ArticlePinRecord[],
		previousPins: ArticlePinRecord[],
	) => {
		const previousPriorityById = new Map(
			previousPins.map((item) => [item.id, item.priority]),
		);
		for (const item of nextPins) {
			if (previousPriorityById.get(item.id) === item.priority) continue;
			await updatePin.mutateAsync({ id: item.id, priority: item.priority });
		}
	};

	const handleReorder = async (
		nextOrder: ArticlePinRecord[],
		previousOrder: ArticlePinRecord[],
	) => {
		setOrderedPins(nextOrder);
		setReorderBusy(true);
		try {
			await syncPinPriorities(nextOrder, previousOrder);
			showAdminPinToast({
				type: "success",
				title: t("Pin order updated"),
				description: t(
					"Drag to reorder pinned articles. Changes sync to the live feed immediately.",
				),
			});
		} catch (cause) {
			setOrderedPins(previousOrder);
			showAdminPinErrorToast(
				t("Reorder failed"),
				errorMessageFromUnknown(cause, t),
			);
		} finally {
			setReorderBusy(false);
		}
	};

	const handlePriorityChange = async (
		pin: ArticlePinRecord,
		nextPriority: number,
	) => {
		try {
			const updated = await updatePin.mutateAsync({
				id: pin.id,
				priority: nextPriority,
			});
			setOrderedPins((current) =>
				sortPinsByPriority(
					current.map((item) => (item.id === updated.id ? updated : item)),
				),
			);
			showAdminPinToast({
				type: "success",
				title: t("Pin priority updated"),
				description: t("Live pinned order updated immediately."),
			});
		} catch (cause) {
			showAdminPinErrorToast(
				t("Update failed"),
				errorMessageFromUnknown(cause, t),
			);
		}
	};

	const handleEndsAtChange = async (
		pin: ArticlePinRecord,
		nextIso: string | null,
	) => {
		try {
			const updated = await updatePin.mutateAsync({
				id: pin.id,
				ends_at: nextIso,
			});
			setOrderedPins((current) =>
				current.map((item) => (item.id === updated.id ? updated : item)),
			);
			showAdminPinToast({
				type: "success",
				title: t("Pin window updated"),
				description: t("Pin expiration is now reflected in the live feed."),
			});
		} catch (cause) {
			showAdminPinErrorToast(
				t("Update failed"),
				errorMessageFromUnknown(cause, t),
			);
		}
	};

	const handleDelete = async (pin: ArticlePinRecord) => {
		try {
			await deletePin.mutateAsync(pin.id);
			setOrderedPins((current) => current.filter((item) => item.id !== pin.id));
			showAdminPinToast({
				type: "success",
				title: t("Remove pin"),
				description: t("Pin removed from the live feed."),
			});
		} catch (cause) {
			showAdminPinErrorToast(
				t("Delete failed"),
				errorMessageFromUnknown(cause, t),
			);
		}
	};

	const handleQuickPin = async (article: Article) => {
		try {
			const nextPriority = Math.max(100, (orderedPins[0]?.priority ?? 0) + 100);
			const created = await createPin.mutateAsync({
				article_id: article.id,
				priority: nextPriority,
			});
			setOrderedPins((current) =>
				sortPinsByPriority([
					created,
					...current.filter((item) => item.article_id !== created.article_id),
				]),
			);
			showAdminPinToast({
				type: "success",
				title: t("Pin article"),
				description: t("Pinned article added to the live feed."),
			});
		} catch (cause) {
			showAdminPinErrorToast(
				t("Create failed"),
				errorMessageFromUnknown(cause, t),
			);
		}
	};

	const handleCreateFromModal = async (input: {
		articleId: string;
		endsAtIso: string | null;
		channelId: string | null;
	}) => {
		try {
			const nextPriority = Math.max(100, (orderedPins[0]?.priority ?? 0) + 100);
			const metadata = input.channelId
				? { channel_id: input.channelId }
				: undefined;
			const created = await createPin.mutateAsync({
				article_id: input.articleId,
				priority: nextPriority,
				ends_at: input.endsAtIso,
				metadata,
			});
			setOrderedPins((current) =>
				sortPinsByPriority([
					created,
					...current.filter((item) => item.article_id !== created.article_id),
				]),
			);
			setAddModalOpen(false);
			showAdminPinToast({
				type: "success",
				title: t("Pin article"),
				description: t("Pinned article added to the live feed."),
			});
		} catch (cause) {
			showAdminPinErrorToast(
				t("Create failed"),
				errorMessageFromUnknown(cause, t),
			);
		}
	};

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
								<Pin
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Pinned articles")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t(
									"Pin critical articles to the top of the personalized feed for tenant users.",
								)}
							</p>
						</div>
						{isAdmin ? (
							<Button
								type="button"
								onClick={() => setAddModalOpen(true)}
								disabled={mutationBusy}
							>
								<Plus aria-hidden="true" className="h-4 w-4" />
								{t("New pin")}
							</Button>
						) : null}
					</div>
				</CardHeader>
			</Card>

			<KpiCardGrid columns={4}>
				<KpiCard
					tone="info"
					label={t("Total pins")}
					value={pinStats.total}
					icon={Pin}
				/>
				<KpiCard
					tone="success"
					label={t("Active")}
					value={pinStats.active}
					icon={CheckCircle2}
				/>
				<KpiCard
					tone="warning"
					label={t("Scheduled")}
					value={pinStats.scheduled}
					icon={CalendarClock}
				/>
				<KpiCard
					tone="error"
					label={t("Expired")}
					value={pinStats.expired}
					icon={Timer}
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
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
					<Card>
						<CardHeader>
							<CardTitle>{t("Published articles")}</CardTitle>
						</CardHeader>
						<CardContent>
							{articlesQuery.isLoading ? (
								<p className="text-sm" style={mutedTextStyle}>
									{t("Loading articles")}
								</p>
							) : articlesQuery.isError ? (
								<EmptyState
									variant="error"
									title={t("Failed to load articles")}
									description={
										articlesQuery.error instanceof Error
											? articlesQuery.error.message
											: t("Unknown error")
									}
									action={{
										label: t("Retry"),
										onClick: () => articlesQuery.refetch(),
									}}
								/>
							) : (
								<div className="space-y-4">
									{articles.map((article) => {
										const category = article.category_id
											? categoryById.get(article.category_id)
											: undefined;
										const isPinned = pinnedArticleIds.has(article.id);
										return (
											<div
												key={article.id}
												className="space-y-3 rounded-2xl border p-4"
												style={surfaceStyle}
											>
												<ArticleCard
													article={article}
													categoryName={category?.name}
													showSummary
												/>
												<div className="flex flex-wrap gap-2">
													{isPinned ? (
														<Badge variant="success">{t("Pinned")}</Badge>
													) : (
														<Button
															type="button"
															variant="outline"
															size="sm"
															onClick={() => void handleQuickPin(article)}
															disabled={mutationBusy}
														>
															{t("Pin article")}
														</Button>
													)}
												</div>
											</div>
										);
									})}
								</div>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle>{t("Current pins")}</CardTitle>
							<p className="text-sm" style={mutedTextStyle}>
								{t(
									"Drag to reorder pinned articles. Changes sync to the live feed immediately.",
								)}
							</p>
						</CardHeader>
						<CardContent>
							{pinsQuery.isLoading ? (
								<p className="text-sm" style={mutedTextStyle}>
									{t("Loading pins")}
								</p>
							) : pinsQuery.isError ? (
								<EmptyState
									variant="error"
									title={t("Failed to load pins")}
									description={
										pinsQuery.error instanceof Error
											? pinsQuery.error.message
											: t("Unknown error")
									}
									action={{
										label: t("Retry"),
										onClick: () => pinsQuery.refetch(),
									}}
								/>
							) : (
								<PinList
									pins={orderedPins}
									channels={channels}
									busy={mutationBusy}
									onReorder={handleReorder}
									onPriorityChange={handlePriorityChange}
									onEndsAtChange={handleEndsAtChange}
									onDelete={handleDelete}
								/>
							)}
						</CardContent>
					</Card>
				</div>
			)}

			<AddPinModal
				open={addModalOpen}
				onClose={() => setAddModalOpen(false)}
				onSubmit={handleCreateFromModal}
				channels={channels.map((channel) => ({
					id: channel.id,
					name: channel.name,
				}))}
				articles={articles}
				pinnedArticleIds={pinnedArticleIds}
				saving={createPin.isPending}
			/>
		</div>
	);
}
