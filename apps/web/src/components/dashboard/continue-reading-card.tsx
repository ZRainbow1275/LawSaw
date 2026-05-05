"use client";

/**
 * Dashboard "Continue reading" card (Phase D.11).
 *
 * Shows the user's 1-3 most recent **un-finished** articles with a slim
 * progress bar (peak `scroll_pct`) and a Continue button that deep-links
 * back into `/articles/{id}`.
 *
 * Data depends on a future `GET /api/v1/me/reading-history` endpoint
 * (see `useContinueReading`). Until that ships, the card renders its
 * empty/placeholder state and emits no network traffic.
 */

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useContinueReading } from "@/hooks/use-reading-history";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Clock3, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import type { CSSProperties } from "react";

const listVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.04, delayChildren: 0.05 },
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 6 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.2 } },
} as const;

function relativeTime(t: ReturnType<typeof useT>, value: string): string {
	const created = new Date(value).getTime();
	const diff = Date.now() - created;
	if (diff < 0 || !Number.isFinite(diff)) return value;
	if (diff < 60_000) return t("Just now");
	if (diff < 3_600_000) {
		return t("{count} minutes ago", {
			count: String(Math.floor(diff / 60_000)),
		});
	}
	if (diff < 86_400_000) {
		return t("{count} hours ago", {
			count: String(Math.floor(diff / 3_600_000)),
		});
	}
	return t("{count} days ago", {
		count: String(Math.floor(diff / 86_400_000)),
	});
}

export function ContinueReadingCard() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();

	const query = useContinueReading(8);
	const items = (query.data?.items ?? [])
		.filter((row) => !row.finished)
		.slice(0, 3);
	const isPending = query.fetchStatus === "fetching";

	const headingStyle: CSSProperties = { color: "var(--color-foreground)" };
	const mutedStyle: CSSProperties = { color: "var(--surface-muted-text)" };
	const itemSurface: CSSProperties = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	};
	const progressTrackStyle: CSSProperties = {
		backgroundColor: "var(--surface-muted-bg)",
	};
	const progressFillStyle: CSSProperties = {
		backgroundColor: "var(--color-primary-500)",
	};

	return (
		<Card>
			<CardHeader>
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div>
						<CardTitle className="flex items-center gap-2" style={headingStyle}>
							<BookOpen aria-hidden="true" className="h-5 w-5" />
							{t("Continue reading")}
						</CardTitle>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{t("Pick up where you left off.")}
						</p>
					</div>
					<Button
						type="button"
						variant="ghost"
						size="sm"
						onClick={() =>
							router.push(withLocalePath(locale, "/me/reading-history"))
						}
					>
						{t("Reading history")}
						<ArrowRight aria-hidden="true" className="h-4 w-4" />
					</Button>
				</div>
			</CardHeader>
			<CardContent>
				{isPending ? (
					<div
						className="flex items-center gap-2 py-6 text-sm"
						style={mutedStyle}
					>
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						{t("Loading reading history")}
					</div>
				) : items.length === 0 ? (
					<div
						className="flex flex-col items-center justify-center gap-2 py-8 text-center"
						style={mutedStyle}
					>
						<div
							className="flex h-12 w-12 items-center justify-center rounded-full"
							style={{
								backgroundColor:
									"color-mix(in srgb, var(--surface-muted-bg) 80%, transparent)",
							}}
						>
							<BookOpen aria-hidden="true" className="h-6 w-6" />
						</div>
						<p className="text-sm font-medium" style={headingStyle}>
							{t("You haven't started reading yet")}
						</p>
						<p className="text-xs" style={mutedStyle}>
							{t(
								"Open any article — your reading progress will appear here for quick access.",
							)}
						</p>
					</div>
				) : (
					<motion.ul
						variants={listVariants}
						initial="hidden"
						animate="visible"
						className="space-y-2"
					>
						{items.map((item) => {
							const pct = Math.max(0, Math.min(100, item.scroll_pct_peak));
							return (
								<motion.li key={item.article_id} variants={itemVariants}>
									<button
										type="button"
										onClick={() =>
											router.push(
												withLocalePath(locale, `/articles/${item.article_id}`),
											)
										}
										className="flex w-full items-start gap-3 rounded-2xl border p-3 text-left transition-colors hover:[border-color:color-mix(in_srgb,var(--color-primary-500)_45%,var(--color-border)_55%)]"
										style={itemSurface}
									>
										<div
											className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
											style={{
												backgroundColor: "var(--surface-muted-bg)",
												color: "var(--surface-muted-text)",
											}}
										>
											<BookOpen aria-hidden="true" className="h-4 w-4" />
										</div>
										<div className="min-w-0 flex-1">
											<p
												className="truncate text-sm font-semibold"
												style={headingStyle}
											>
												{item.title}
											</p>
											<div
												className="mt-2 h-1.5 w-full overflow-hidden rounded-full"
												style={progressTrackStyle}
												aria-label={t("Reading progress")}
											>
												<div
													className="h-full rounded-full"
													style={{
														...progressFillStyle,
														width: `${pct}%`,
													}}
												/>
											</div>
											<div
												className="mt-1.5 flex items-center justify-between gap-2 text-xs"
												style={mutedStyle}
											>
												<span className="tabular-nums">
													{t("Reading progress")} {pct}%
												</span>
												<span className="flex items-center gap-1 tabular-nums">
													<Clock3 aria-hidden="true" className="h-3 w-3" />
													{t("Last read")} {relativeTime(t, item.last_read_at)}
												</span>
											</div>
										</div>
									</button>
								</motion.li>
							);
						})}
					</motion.ul>
				)}
			</CardContent>
		</Card>
	);
}
