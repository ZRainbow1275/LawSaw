"use client";

/**
 * `/me/feed` page — 1:1 port of prototype/app.html lines 811-919.
 *
 * Layout (top → bottom):
 *   1. page-header         (title + subtitle)
 *   2. info-cards-row      (3 cards: role tier / readable count / subscribed channels)
 *   3. pinned-articles     (2-column grid)        — `useMeFeed.pinned_articles`
 *   4. system-announcements (active-banner stack) — `useMeFeed.banners`
 *   5. personalized-news   (2-column grid x6)     — `useMeFeed.articles`
 *
 * Copy & icons come from i18n keys (no English bleed-through). All data is
 * fetched live via `useMeFeed`; nothing is mocked. When a section has no
 * payload it is gracefully hidden so the page never renders empty cards.
 */

import { UserShell } from "@/components/layout/user-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { useMeFeed } from "@/hooks/use-me-feed";
import { type RoleTier, normalizeRoleTier } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	AlertTriangle,
	ArrowRight,
	CheckCircle2,
	FileText,
	List,
	type LucideIcon,
	Megaphone,
	Newspaper,
	Pin,
	Rss,
	ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

// ------------------------------------------------------------------
// Tier visual mapping — drives the purple shield card on the left.
// ------------------------------------------------------------------

interface TierVisual {
	labelKey: string;
	descKey: string;
	icon: LucideIcon;
	bg: string;
	color: string;
}

function tierVisual(tier: RoleTier): TierVisual {
	switch (tier) {
		case "super_admin":
		case "tenant_admin":
			return {
				labelKey: "Tenant admin",
				descKey: "Cross-tenant visibility",
				icon: ShieldCheck,
				bg: "#ede9fe",
				color: "#7c3aed",
			};
		case "premium_user":
			return {
				labelKey: "Premium user",
				descKey: "Full article visibility and advanced analytics",
				icon: ShieldCheck,
				bg: "#ede9fe",
				color: "#7c3aed",
			};
		case "verified_user":
			return {
				labelKey: "Verified user",
				descKey: "Verified analysis access",
				icon: ShieldCheck,
				bg: "#dbeafe",
				color: "#2563eb",
			};
		default:
			return {
				labelKey: "Basic user",
				descKey: "Basic visibility scope",
				icon: ShieldCheck,
				bg: "#f1f5f9",
				color: "#475569",
			};
	}
}

// ------------------------------------------------------------------
// Risk → pill colour mapping (mirrors prototype `.risk-pill` modifiers).
// ------------------------------------------------------------------

type RiskBucket = "high" | "mid" | "low" | "unknown";

function bucketRisk(score: number | null | undefined): RiskBucket {
	if (score == null || !Number.isFinite(score)) return "unknown";
	if (score >= 70) return "high";
	if (score >= 40) return "mid";
	return "low";
}

const riskPillStyles: Record<
	RiskBucket,
	{ bg: string; color: string; labelKey: string }
> = {
	high: { bg: "#fee2e2", color: "#b91c1c", labelKey: "High risk" },
	mid: { bg: "#fef3c7", color: "#b45309", labelKey: "Medium risk" },
	low: { bg: "#dcfce7", color: "#15803d", labelKey: "Low risk" },
	unknown: { bg: "#f1f5f9", color: "#475569", labelKey: "Unrated" },
};

function formatRelativeTime(
	value: string | null | undefined,
	t: ReturnType<typeof useT>,
): string {
	if (!value) return "";
	const created = new Date(value).getTime();
	if (!Number.isFinite(created)) return "";
	const diff = Date.now() - created;
	if (diff < 60_000) return t("Just now");
	if (diff < 3_600_000)
		return t("{count} minutes ago", {
			count: String(Math.floor(diff / 60_000)),
		});
	if (diff < 86_400_000)
		return t("{count} hours ago", {
			count: String(Math.floor(diff / 3_600_000)),
		});
	if (diff < 7 * 86_400_000)
		return t("{count} days ago", {
			count: String(Math.floor(diff / 86_400_000)),
		});
	return value.slice(0, 10);
}

// ------------------------------------------------------------------
// Page component.
// ------------------------------------------------------------------

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06, delayChildren: 0.04 },
	},
} as const;

const itemVariants = {
	hidden: { opacity: 0, y: 18 },
	visible: { opacity: 1, y: 0, transition: { duration: 0.36 } },
} as const;

export function MeFeedPagePrototype() {
	const t = useT();
	const locale = useLocale();
	const feedQuery = useMeFeed(20, 8);
	const roleTier = useAuthStore((s) => s.roleTier);
	const tier = normalizeRoleTier(roleTier);

	const articles = feedQuery.data?.articles ?? [];
	const visibleChannels = feedQuery.data?.visible_channels ?? [];
	const pinned = feedQuery.data?.pinned_articles ?? [];
	const banners = feedQuery.data?.banners ?? [];

	const tierMeta = tierVisual(tier);
	const TierIcon = tierMeta.icon;

	const pinnedDisplayed = useMemo(() => pinned.slice(0, 4), [pinned]);
	const bannersDisplayed = useMemo(() => banners.slice(0, 4), [banners]);
	const articlesDisplayed = useMemo(() => articles.slice(0, 6), [articles]);

	const categories = useMemo(() => {
		const map = new Map<string, string>();
		for (const article of articles) {
			if (article.category_id)
				map.set(article.category_id, article.category_id);
		}
		return map;
	}, [articles]);

	if (feedQuery.isLoading) {
		return (
			<UserShell widthVariant="wide">
				<div className="mx-auto max-w-[1200px] space-y-6 p-2">
					<Skeleton variant="rectangular" width="60%" height={32} />
					<div className="grid grid-cols-3 gap-4">
						{[0, 1, 2].map((index) => (
							<Skeleton
								key={`info-skel-${index}`}
								variant="rectangular"
								height={88}
							/>
						))}
					</div>
					<Skeleton variant="rectangular" height={120} />
					<Skeleton variant="rectangular" height={400} />
				</div>
			</UserShell>
		);
	}

	if (feedQuery.isError) {
		return (
			<UserShell widthVariant="wide">
				<div className="mx-auto max-w-[680px] rounded-2xl border border-red-200 bg-red-50 p-6 text-center">
					<AlertTriangle
						aria-hidden="true"
						className="mx-auto h-8 w-8 text-red-500"
					/>
					<p className="mt-3 font-semibold text-neutral-900">
						{t("Failed to load feed items")}
					</p>
					<p className="mt-1 text-sm text-neutral-500">
						{feedQuery.error instanceof Error
							? feedQuery.error.message
							: t("Unknown error")}
					</p>
				</div>
			</UserShell>
		);
	}

	return (
		<UserShell widthVariant="wide">
			<motion.div
				className="mx-auto max-w-[1200px] space-y-6 p-2"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				{/* page-header */}
				<motion.header variants={itemVariants} className="flex flex-col gap-2">
					<h1 className="flex items-center gap-2 text-2xl font-bold text-neutral-900">
						<Newspaper
							aria-hidden="true"
							className="h-6 w-6 text-primary-500"
						/>
						{t("My feed")}
					</h1>
					<p className="text-sm text-neutral-500">
						{t("My feed page subtitle")}
					</p>
				</motion.header>

				{/* info-cards-row */}
				<motion.section
					variants={itemVariants}
					className="grid grid-cols-1 gap-4 md:grid-cols-3"
					aria-label={t("Today's insights")}
				>
					<InfoCard
						icon={
							<TierIcon
								aria-hidden="true"
								className="h-6 w-6"
								style={{ color: tierMeta.color }}
							/>
						}
						iconBg={tierMeta.bg}
						label={t(tierMeta.labelKey)}
						desc={t(tierMeta.descKey)}
					/>
					<InfoCard
						icon={
							<FileText
								aria-hidden="true"
								className="h-6 w-6"
								style={{ color: "var(--color-primary-500)" }}
							/>
						}
						iconBg="var(--color-primary-50)"
						value={articles.length}
						desc={t("Readable in current cycle")}
					/>
					<InfoCard
						icon={
							<Rss
								aria-hidden="true"
								className="h-6 w-6"
								style={{ color: "#10b981" }}
							/>
						}
						iconBg="#ecfdf5"
						value={visibleChannels.length}
						desc={t("Subscribed channels")}
					/>
				</motion.section>

				{/* pinned-articles */}
				{pinnedDisplayed.length > 0 ? (
					<motion.section variants={itemVariants} className="space-y-3">
						<SectionTitle
							icon={
								<Pin aria-hidden="true" className="h-4 w-4 text-primary-500" />
							}
							label={t("Pinned articles")}
						/>
						<div className="grid grid-cols-1 gap-3 md:grid-cols-2">
							{pinnedDisplayed.map((pin) => {
								const article = pin.article;
								return (
									<Link
										key={pin.id}
										href={withLocalePath(locale, `/articles/${article.id}`)}
										className="group flex items-start gap-3 rounded-lg border border-neutral-200 bg-white p-4 transition-colors hover:border-primary-300 hover:shadow-sm"
									>
										<Pin
											aria-hidden="true"
											className="mt-0.5 h-4 w-4 shrink-0 text-primary-500"
											fill="currentColor"
										/>
										<div className="min-w-0 flex-1">
											<p className="line-clamp-2 text-sm font-semibold text-neutral-900 transition-colors group-hover:text-primary-600">
												{article.title}
											</p>
											<p className="mt-1 text-xs text-neutral-500">
												{categories.get(article.category_id ?? "") ??
													t("Article")}
												{" · "}
												{formatRelativeTime(
													article.published_at ?? article.created_at,
													t,
												)}
											</p>
										</div>
									</Link>
								);
							})}
						</div>
					</motion.section>
				) : null}

				{/* system-announcements */}
				{bannersDisplayed.length > 0 ? (
					<motion.section variants={itemVariants} className="space-y-3">
						<SectionTitle
							icon={
								<Megaphone
									aria-hidden="true"
									className="h-4 w-4 text-amber-500"
								/>
							}
							label={t("System announcements")}
						/>
						<div className="flex flex-col gap-3">
							{bannersDisplayed.map((banner, index) => (
								<article
									key={banner.id}
									className="rounded-lg border border-l-4 border-neutral-200 bg-white p-4 transition-shadow hover:shadow-sm"
									style={{
										borderLeftColor: index === 0 ? "#f59e0b" : "#3b82f6",
									}}
								>
									<p className="text-sm font-semibold text-neutral-900">
										{banner.title}
									</p>
									{banner.body ? (
										<p className="mt-1 text-sm text-neutral-600">
											{banner.body}
										</p>
									) : null}
									{banner.cta_label && banner.cta_url ? (
										<Link
											href={banner.cta_url}
											className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-primary-600 hover:text-primary-700"
										>
											{banner.cta_label}
											<ArrowRight aria-hidden="true" className="h-3 w-3" />
										</Link>
									) : null}
								</article>
							))}
						</div>
					</motion.section>
				) : null}

				{/* personalized-news */}
				<motion.section variants={itemVariants} className="space-y-3">
					<SectionTitle
						icon={
							<List aria-hidden="true" className="h-4 w-4 text-neutral-500" />
						}
						label={t("Personalized news")}
					/>
					{articlesDisplayed.length === 0 ? (
						<div className="rounded-xl border border-dashed border-neutral-200 bg-white p-8 text-center text-sm text-neutral-500">
							{t("Your feed is quiet")}
						</div>
					) : (
						<div className="grid grid-cols-1 gap-4 md:grid-cols-2">
							{articlesDisplayed.map((article) => {
								const risk = bucketRisk(article.risk_score);
								const riskMeta = riskPillStyles[risk];
								return (
									<Link
										key={article.id}
										href={withLocalePath(locale, `/articles/${article.id}`)}
										className="group block rounded-xl border border-neutral-200 bg-white p-4 transition-all hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md"
									>
										<div className="mb-2 flex items-center gap-2">
											<span
												className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
												style={{
													background: riskMeta.bg,
													color: riskMeta.color,
												}}
											>
												{risk === "low" ? (
													<CheckCircle2
														aria-hidden="true"
														className="h-3 w-3"
													/>
												) : (
													<AlertTriangle
														aria-hidden="true"
														className="h-3 w-3"
													/>
												)}
												{t(riskMeta.labelKey)}
											</span>
										</div>
										<h3 className="line-clamp-2 text-[15px] font-bold leading-snug text-neutral-900 transition-colors group-hover:text-primary-600">
											{article.title}
										</h3>
										{article.summary ? (
											<p className="mt-1.5 line-clamp-2 text-[13px] leading-normal text-neutral-500">
												{article.summary}
											</p>
										) : null}
										<div className="mt-2.5 flex items-center gap-3 text-[12px] text-neutral-400">
											{article.author ? <span>{article.author}</span> : null}
											{article.published_at || article.created_at ? (
												<span>
													{formatRelativeTime(
														article.published_at ?? article.created_at,
														t,
													)}
												</span>
											) : null}
										</div>
									</Link>
								);
							})}
						</div>
					)}
				</motion.section>
			</motion.div>
		</UserShell>
	);
}

// ------------------------------------------------------------------
// Local presentational helpers — kept here so the page file is self-
// contained (no extra `import` churn for tiny widgets).
// ------------------------------------------------------------------

interface InfoCardProps {
	icon: React.ReactNode;
	iconBg: string;
	label?: string;
	value?: number;
	desc: string;
}

function InfoCard({ icon, iconBg, label, value, desc }: InfoCardProps) {
	return (
		<div className="flex items-center gap-4 rounded-xl border border-neutral-200 bg-white p-5">
			<span
				className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
				style={{ background: iconBg }}
			>
				{icon}
			</span>
			<div className="min-w-0 flex-1">
				{label ? (
					<p className="truncate text-sm font-semibold text-neutral-900">
						{label}
					</p>
				) : null}
				{value != null ? (
					<p className="text-2xl font-bold tabular-nums text-neutral-900">
						{value}
					</p>
				) : null}
				<p className="mt-0.5 text-xs text-neutral-500">{desc}</p>
			</div>
		</div>
	);
}

interface SectionTitleProps {
	icon: React.ReactNode;
	label: string;
}

function SectionTitle({ icon, label }: SectionTitleProps) {
	return (
		<h2 className="flex items-center gap-2 text-base font-semibold text-neutral-900">
			{icon}
			{label}
		</h2>
	);
}
