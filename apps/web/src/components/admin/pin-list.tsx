"use client";

/**
 * PinList — admin pinned-articles surface with HTML5 drag-and-drop reordering.
 *
 * Self-contained: handles drag state, optimistic reorder, priority editing,
 * deletion confirmation, and surfacing the current pin window (ends_at).
 *
 * Persistence is delegated to the parent through three callbacks so this
 * component remains transport-agnostic and testable:
 *   - `onPriorityChange(pin, nextPriority)` — used by both the inline number
 *     input and by the drop-handler to broadcast each pin whose priority
 *     drifted after a reorder.
 *   - `onEndsAtChange(pin, nextIso)` — datetime-local field for pin window.
 *   - `onDelete(pin)` — invoked after the delete confirmation modal.
 *
 * The parent also passes `channels` so we can render the channel scope tag
 * pulled from `pin.metadata.channel_id` (the canonical pin row does not yet
 * expose `scope/channel_id` columns; we degrade to "Global" when absent).
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import type { ArticlePinRecord } from "@/hooks/use-pins";
import type { ChannelRecord } from "@/hooks/use-channels";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { Calendar, GripVertical, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";

interface PinListProps {
	pins: ArticlePinRecord[];
	channels: ChannelRecord[];
	busy?: boolean;
	onReorder: (
		nextOrder: ArticlePinRecord[],
		previousOrder: ArticlePinRecord[],
	) => void | Promise<void>;
	onPriorityChange: (
		pin: ArticlePinRecord,
		nextPriority: number,
	) => void | Promise<void>;
	onEndsAtChange: (
		pin: ArticlePinRecord,
		nextIso: string | null,
	) => void | Promise<void>;
	onDelete: (pin: ArticlePinRecord) => void | Promise<void>;
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

function readPinChannelId(pin: ArticlePinRecord): string | null {
	const metadata = (pin as unknown as { metadata?: Record<string, unknown> })
		.metadata;
	const value = metadata?.channel_id;
	return typeof value === "string" && value.length > 0 ? value : null;
}

function applyReorder(
	items: ArticlePinRecord[],
	draggedId: string,
	targetId: string,
): ArticlePinRecord[] {
	if (draggedId === targetId) return items;
	const fromIndex = items.findIndex((item) => item.id === draggedId);
	const toIndex = items.findIndex((item) => item.id === targetId);
	if (fromIndex === -1 || toIndex === -1 || fromIndex === toIndex) return items;
	const next = [...items];
	const [dragged] = next.splice(fromIndex, 1);
	if (!dragged) return items;
	next.splice(toIndex, 0, dragged);
	return next;
}

function applyOrderedPriorities(items: ArticlePinRecord[]): ArticlePinRecord[] {
	const total = items.length;
	return items.map((item, index) => ({
		...item,
		priority: (total - index) * 100,
	}));
}

export function PinList({
	pins,
	channels,
	busy,
	onReorder,
	onPriorityChange,
	onEndsAtChange,
	onDelete,
}: PinListProps) {
	const t = useT();
	const locale = useLocale();
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTargetId, setDropTargetId] = useState<string | null>(null);
	const [pendingDelete, setPendingDelete] = useState<ArticlePinRecord | null>(
		null,
	);

	const channelById = new Map(
		channels.map((channel) => [channel.id, channel.name] as const),
	);

	const surfaceStyle = {
		borderColor:
			"color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;
	const handleStyle = {
		borderColor:
			"color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 70%, var(--color-background) 30%)",
		color: "var(--surface-muted-text)",
	} as const;
	const dropTargetStyle = {
		borderColor:
			"color-mix(in srgb, var(--color-primary-500) 50%, var(--color-border) 50%)",
		boxShadow:
			"0 10px 24px color-mix(in srgb, var(--color-primary-500) 16%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	if (pins.length === 0) {
		return (
			<EmptyState
				title={t("No pinned articles yet")}
				description={t(
					"Pin important articles to keep them above the regular feed list.",
				)}
				className="py-6"
			/>
		);
	}

	const handleDrop = async (targetId: string) => {
		if (!draggingId) return;
		const previousOrder = pins.map((item) => ({ ...item }));
		const reordered = applyReorder(previousOrder, draggingId, targetId);
		setDraggingId(null);
		setDropTargetId(null);
		if (reordered === previousOrder) return;
		const nextOrder = applyOrderedPriorities(reordered);
		await onReorder(nextOrder, previousOrder);
	};

	return (
		<>
			<div
				className="space-y-3"
				data-testid="admin-pin-order-list"
				aria-busy={busy}
			>
				{pins.map((pin) => {
					const channelId = readPinChannelId(pin);
					const channelName = channelId
						? channelById.get(channelId) ?? channelId
						: null;
					const isDragging = draggingId === pin.id;
					const isDropTarget =
						dropTargetId === pin.id && draggingId !== pin.id;
					return (
						<div
							key={pin.id}
							draggable={!busy}
							onDragStart={(event) => {
								if (busy) {
									event.preventDefault();
									return;
								}
								event.dataTransfer.effectAllowed = "move";
								event.dataTransfer.setData("text/plain", pin.id);
								setDraggingId(pin.id);
								setDropTargetId(pin.id);
							}}
							onDragOver={(event) => {
								if (!draggingId || draggingId === pin.id) return;
								event.preventDefault();
								setDropTargetId(pin.id);
							}}
							onDrop={(event) => {
								event.preventDefault();
								void handleDrop(pin.id);
							}}
							onDragEnd={() => {
								setDraggingId(null);
								setDropTargetId(null);
							}}
							className={cn(
								"rounded-2xl border p-4 transition",
								isDragging && "opacity-60",
							)}
							style={
								isDropTarget
									? { ...surfaceStyle, ...dropTargetStyle }
									: surfaceStyle
							}
						>
							<div className="flex items-start gap-3">
								<div
									className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border"
									style={handleStyle}
									aria-label={t("Drag to reorder")}
								>
									{busy && isDragging ? (
										<Loader2
											aria-hidden="true"
											className="h-4 w-4 animate-spin"
										/>
									) : (
										<GripVertical aria-hidden="true" className="h-4 w-4" />
									)}
								</div>
								<div className="min-w-0 flex-1">
									<p
										className="truncate font-semibold"
										style={headingStyle}
										title={pin.article.title}
									>
										{pin.article.title}
									</p>
									<div
										className="mt-1 flex flex-wrap items-center gap-2 text-xs"
										style={mutedStyle}
									>
										<Badge variant={channelName ? "secondary" : "outline"}>
											{channelName ?? t("Global")}
										</Badge>
										{pin.ends_at ? (
											<span className="inline-flex items-center gap-1">
												<Calendar aria-hidden="true" className="h-3 w-3" />
												{t("Expires")}:{" "}
												{formatDateTime(locale, pin.ends_at, {
													year: "numeric",
													month: "2-digit",
													day: "2-digit",
													hour: "2-digit",
													minute: "2-digit",
												})}
											</span>
										) : (
											<span>{t("Never expires")}</span>
										)}
									</div>
								</div>
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={() => setPendingDelete(pin)}
									disabled={busy}
									aria-label={t("Remove pin")}
								>
									<Trash2 aria-hidden="true" className="h-4 w-4" />
								</Button>
							</div>

							<div className="mt-3 grid gap-3 md:grid-cols-2">
								<div className="space-y-1.5">
									<label
										htmlFor={`pin-priority-${pin.id}`}
										className="text-xs font-medium uppercase tracking-wide"
										style={mutedStyle}
									>
										{t("Priority")}
									</label>
									<Input
										id={`pin-priority-${pin.id}`}
										type="number"
										min={0}
										value={String(pin.priority)}
										onChange={(event) => {
											const next = Number.parseInt(
												event.target.value || "0",
												10,
											);
											if (
												Number.isFinite(next) &&
												next !== pin.priority
											) {
												void onPriorityChange(pin, next);
											}
										}}
										disabled={busy}
									/>
								</div>
								<div className="space-y-1.5">
									<label
										htmlFor={`pin-ends-${pin.id}`}
										className="text-xs font-medium uppercase tracking-wide"
										style={mutedStyle}
									>
										{t("Expires at")}
									</label>
									<Input
										id={`pin-ends-${pin.id}`}
										type="datetime-local"
										value={isoToDatetimeLocal(pin.ends_at)}
										onChange={(event) => {
											const nextIso = datetimeLocalToIso(
												event.target.value,
											);
											if (nextIso !== pin.ends_at) {
												void onEndsAtChange(pin, nextIso);
											}
										}}
										disabled={busy}
									/>
								</div>
							</div>
						</div>
					);
				})}
			</div>

			<ConfirmActionModal
				isOpen={!!pendingDelete}
				onClose={() => setPendingDelete(null)}
				onConfirm={async () => {
					if (!pendingDelete) return;
					await onDelete(pendingDelete);
					setPendingDelete(null);
				}}
				title={t("Remove this pin from the live feed?")}
				confirmLabel={t("Remove pin")}
				cancelLabel={t("Cancel")}
				busy={busy}
			/>
		</>
	);
}
