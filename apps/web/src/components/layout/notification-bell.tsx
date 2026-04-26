"use client";

/**
 * TopBar notification bell (Phase D.10).
 *
 * Composes:
 *   - lucide-react `Bell` icon button
 *   - framer-motion scale-in numeric badge derived from `useNotifications`
 *     cache (no extra HTTP — same query the drawer renders)
 *   - `NotificationDrawer` mounted as an overlay when opened
 *
 * The list query itself polls every 30 s while the tab is visible — see
 * `useNotifications` for the gating.
 */

import { Button } from "@/components/ui/button";
import { useNotifications } from "@/hooks/use-notifications";
import { useT } from "@/lib/i18n-client";
import { AnimatePresence, motion } from "framer-motion";
import { Bell } from "lucide-react";
import { useMemo, useState } from "react";

import { NotificationDrawer } from "@/components/notifications/notification-drawer";

const badgeVariants = {
	hidden: { opacity: 0, scale: 0.6 },
	visible: {
		opacity: 1,
		scale: 1,
		transition: { type: "spring", stiffness: 360, damping: 22 } as const,
	},
	exit: {
		opacity: 0,
		scale: 0.6,
		transition: { duration: 0.15 } as const,
	},
} as const;

export function NotificationBell() {
	const t = useT();
	const [open, setOpen] = useState(false);
	const query = useNotifications();
	const count = useMemo(() => {
		const data = query.data;
		if (!data) return 0;
		const watermark = data.last_seen_seq;
		let unread = 0;
		for (const entry of data.items) {
			if (entry.seq > watermark) unread += 1;
		}
		return unread;
	}, [query.data]);

	const display = count > 99 ? "99+" : String(count);

	return (
		<>
			<Button
				type="button"
				variant="ghost"
				size="icon"
				className="relative"
				aria-label={t("Notification center")}
				aria-haspopup="dialog"
				aria-expanded={open}
				onClick={() => setOpen(true)}
				data-testid="notification-bell"
			>
				<Bell aria-hidden="true" className="h-5 w-5" />
				<AnimatePresence>
					{count > 0 ? (
						<motion.span
							key={display}
							variants={badgeVariants}
							initial="hidden"
							animate="visible"
							exit="exit"
							aria-live="polite"
							className="pointer-events-none absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold leading-none text-white"
							style={{
								backgroundColor: "var(--color-error)",
								boxShadow:
									"0 0 0 2px var(--color-background, #ffffff)",
							}}
						>
							{display}
						</motion.span>
					) : null}
				</AnimatePresence>
			</Button>

			<NotificationDrawer open={open} onClose={() => setOpen(false)} />
		</>
	);
}
