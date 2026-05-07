"use client";

import { Button } from "@/components/ui/button";
import { NoDataState } from "@/components/ui/empty-state";
import { Modal, ModalBody, ModalHeader } from "@/components/ui/modal";
import {
	useMarkNotificationsSeen,
	useNotifications,
} from "@/hooks/use-notifications";
import type { NotificationEntry } from "@/lib/api/types";
import { formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useMemo } from "react";

function maxSeq(items: NotificationEntry[]): number {
	return items.reduce((acc, item) => (item.seq > acc ? item.seq : acc), 0);
}

export function NotificationsModal(props: {
	isOpen: boolean;
	onClose: () => void;
}) {
	const { isOpen, onClose } = props;
	const t = useT();
	const locale = useLocale();

	const query = useNotifications({ enabled: isOpen });
	const markSeen = useMarkNotificationsSeen();

	const lastSeen = query.data?.last_seen_seq ?? 0;
	const items = query.data?.items ?? [];
	const newest = useMemo(() => maxSeq(items), [items]);
	const unreadCount = useMemo(
		() => items.filter((item) => item.seq > lastSeen).length,
		[items, lastSeen],
	);

	const handleMarkAllSeen = async () => {
		if (newest <= lastSeen) return;
		await markSeen.mutateAsync({ last_seen_seq: newest });
	};

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="lg" className="max-h-[85vh]">
			<ModalHeader className="flex items-start justify-between gap-4">
				<div className="min-w-0">
					<h2 className="text-lg font-semibold text-neutral-900 dark:text-neutral-50">
						{t("Notifications")}
					</h2>
					<p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
						{unreadCount > 0
							? `${t("Unread")}: ${unreadCount}`
							: t("All caught up")}
					</p>
				</div>
				<div className="flex items-center gap-2">
					<Button
						variant="outline"
						size="sm"
						onClick={handleMarkAllSeen}
						disabled={markSeen.isPending || newest <= lastSeen}
					>
						{t("Mark all as read")}
					</Button>
					<Button variant="ghost" size="sm" onClick={onClose}>
						{t("Close")}
					</Button>
				</div>
			</ModalHeader>
			<ModalBody className="py-0">
				{query.isLoading ? (
					<div className="py-10 text-sm text-neutral-500 dark:text-neutral-400">
						{t("Loading...")}
					</div>
				) : query.isError ? (
					<div className="py-10 text-sm text-neutral-500 dark:text-neutral-400">
						{t("Load failed")}
					</div>
				) : items.length === 0 ? (
					<NoDataState
						className="py-10"
						title={t("No notifications")}
						description={t("There is nothing to show yet.")}
					/>
				) : (
					<ul className="divide-y divide-neutral-100 dark:divide-white/10">
						{items.map((item) => {
							const unread = item.seq > lastSeen;
							return (
								<li
									key={item.id}
									className={cn(
										"px-2 sm:px-4 py-3",
										unread ? "bg-primary-50/40 dark:bg-primary-500/10" : "bg-transparent",
									)}
								>
									<div className="flex items-start gap-3">
										<div
											className={cn(
												"mt-1 h-2.5 w-2.5 rounded-full",
												unread ? "bg-primary-500" : "bg-neutral-200 dark:bg-white/20",
											)}
										/>
										<div className="min-w-0 flex-1">
											<div className="flex items-start justify-between gap-4">
												<p className="text-sm font-semibold text-neutral-900 truncate dark:text-neutral-50">
													{item.summary}
												</p>
												<p className="text-xs text-neutral-500 whitespace-nowrap dark:text-neutral-400">
													{formatDateTime(locale, item.created_at)}
												</p>
											</div>
											<p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
												{item.action} · {item.resource}
											</p>
										</div>
									</div>
								</li>
							);
						})}
					</ul>
				)}
			</ModalBody>
		</Modal>
	);
}
