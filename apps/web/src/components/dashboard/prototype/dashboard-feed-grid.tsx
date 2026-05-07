"use client";

/**
 * DashboardFeedGrid — `prototype/app.html:798-805` 6-card feed grid (PR1).
 *
 * Layout:
 *   - First card spans full width (.feed-card.hero-card) — left dash visual,
 *     right content
 *   - Following 5 cards are standard .feed-card in a 2-column grid
 *
 * Uses real backend data via `useArticles({ status: 'published', limit: 6 })`.
 * Filters are applied client-side because the public articles endpoint does
 * not (yet) accept a `region` query parameter — when one becomes available
 * the parent should pass `categoryId` to the hook for server-side filtering.
 */

import { ReactionToggle } from "@/components/reactions/reaction-toggle";
import { useArticles } from "@/hooks/use-articles";
import { useCategories } from "@/hooks/use-categories";
import { useReactionSummariesBatch } from "@/hooks/use-reaction";
import { type Article, getArticleRiskLevel } from "@/lib/api/types";
import {
	type Locale,
	formatTimeAgo as i18nFormatTimeAgo,
	withLocalePath,
} from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import {
	AlertCircle,
	BookOpen,
	BookmarkPlus,
	CheckCircle2,
	Clock,
	HelpCircle,
	Share2,
} from "lucide-react";
import Link from "next/link";
import { useMemo } from "react";

import type { GeoRegion } from "./dashboard-geo-filter";

interface Props {
	geoRegion: GeoRegion;
	categoryId: string | null;
}

const REGION_PREFIX_BY_GEO: Record<GeoRegion, string[] | null> = {
	global: null,
	apac: ["156", "392", "702", "036", "082", "356"],
	china: ["156"],
	north_america: ["840", "124"],
	europe: ["056", "276", "250", "826", "380", "528"],
	mea: ["818", "682", "710"],
	latin_america: ["076", "032", "152", "604"],
};

function timeAgoFor(locale: Locale, iso: string | null): string {
	if (!iso) return i18nFormatTimeAgo(locale, new Date());
	return i18nFormatTimeAgo(locale, iso);
}

function readingMinutes(article: Article): number {
	const content = article.content ?? article.summary ?? "";
	const words = content.length / 2; // approximate CJK reading speed
	return Math.max(1, Math.round(words / 200));
}

function getRiskPillStyle(level: ReturnType<typeof getArticleRiskLevel>) {
	switch (level) {
		case "low":
			return {
				bg: "var(--risk-low-bg)",
				fg: "var(--risk-low-fg)",
				icon: CheckCircle2,
				labelKey: "Low risk" as const,
			};
		case "medium":
			return {
				bg: "var(--risk-mid-bg)",
				fg: "var(--risk-mid-fg)",
				icon: AlertCircle,
				labelKey: "Medium risk" as const,
			};
		case "high":
			return {
				bg: "var(--risk-high-bg)",
				fg: "var(--risk-high-fg)",
				icon: AlertCircle,
				labelKey: "High risk" as const,
			};
		case "critical":
			return {
				bg: "var(--risk-critical-bg)",
				fg: "var(--risk-critical-fg)",
				icon: AlertCircle,
				labelKey: "Critical risk" as const,
			};
		default:
			return {
				bg: "var(--risk-unknown-bg)",
				fg: "var(--risk-unknown-fg)",
				icon: HelpCircle,
				labelKey: "Unknown risk" as const,
			};
	}
}

export function DashboardFeedGrid({ geoRegion, categoryId }: Props) {
	const t = useT();
	const locale = useLocale();
	const categoriesQuery = useCategories();
	// Pull a generous batch so client-side geo filtering still has 6 entries
	// to render. When the backend grows region filtering this becomes server-side.
	const articlesQuery = useArticles({
		limit: 30,
		status: "published",
		category_id: categoryId ?? undefined,
	});

	const categoryById = useMemo(() => {
		const map = new Map<
			string,
			{ name: string; color: string | null; slug: string }
		>();
		for (const c of categoriesQuery.data ?? []) {
			map.set(c.id, { name: c.name, color: c.color, slug: c.slug });
		}
		return map;
	}, [categoriesQuery.data]);

	const filtered = useMemo(() => {
		const all = articlesQuery.data?.data ?? [];
		const allowedPrefixes = REGION_PREFIX_BY_GEO[geoRegion];
		if (!allowedPrefixes) return all;
		return all.filter((a) => {
			if (!a.region_code) return false;
			return allowedPrefixes.some((prefix) =>
				a.region_code?.startsWith(prefix),
			);
		});
	}, [articlesQuery.data, geoRegion]);

	const visible = filtered.slice(0, 6);

	// Prefetch reaction summaries in a single batched call so each card can
	// render its inline pill without firing N separate detail requests.
	useReactionSummariesBatch(
		"article",
		visible.map((a) => a.id),
		{ enabled: visible.length > 0 },
	);

	if (articlesQuery.isPending) {
		return (
			<div className="grid gap-4 md:grid-cols-2">
				{Array.from({ length: 6 }, (_, idx) => (
					<div
						// biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholder list is fixed-size and stable
						key={`feed-skel-${idx}`}
						className="h-48 animate-pulse rounded-2xl border"
						style={{
							backgroundColor: "var(--color-card)",
							borderColor: "var(--surface-card-border-strong)",
						}}
					/>
				))}
			</div>
		);
	}

	if (visible.length === 0) {
		return (
			<div
				className="rounded-2xl border p-12 text-center text-sm"
				style={{
					backgroundColor: "var(--color-card)",
					borderColor: "var(--surface-card-border-strong)",
					color: "var(--surface-card-faint-fg)",
				}}
			>
				{t("No matching results")}
			</div>
		);
	}

	const [hero, ...rest] = visible;

	return (
		<div className="grid gap-4 md:grid-cols-2">
			<HeroCard
				article={hero}
				categoryById={categoryById}
				locale={locale}
				t={t}
			/>
			{rest.map((article, idx) => (
				<StandardCard
					key={article.id}
					article={article}
					categoryById={categoryById}
					locale={locale}
					t={t}
					delay={idx * 0.05}
				/>
			))}
		</div>
	);
}

interface CardProps {
	article: Article;
	categoryById: Map<
		string,
		{ name: string; color: string | null; slug: string }
	>;
	locale: Locale;
	t: ReturnType<typeof useT>;
	delay?: number;
}

function HeroCard({ article, categoryById, locale, t }: CardProps) {
	const risk = getRiskPillStyle(getArticleRiskLevel(article.risk_score));
	const RiskIcon = risk.icon;
	const cat = article.category_id
		? (categoryById.get(article.category_id) ?? null)
		: null;

	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, ease: "easeOut" }}
			whileHover={{ y: -4 }}
			className="group col-span-full grid overflow-hidden rounded-2xl border transition-all hover:shadow-feed-hover md:grid-cols-[1fr_1.1fr]"
			style={{
				backgroundColor: "var(--color-card)",
				borderColor: "var(--surface-card-border-strong)",
				minHeight: 220,
			}}
		>
			<Link
				href={withLocalePath(locale, `/articles/${article.id}`)}
				className="relative flex items-center justify-center overflow-hidden"
				style={{ background: "var(--gradient-hero-visual)" }}
			>
				<span
					aria-hidden="true"
					className="pointer-events-none absolute inset-0"
					style={{
						background:
							"radial-gradient(ellipse at 60% 40%, color-mix(in srgb, var(--color-primary-500) 12%, transparent) 0%, transparent 70%)",
					}}
				/>
				<span className="text-center text-5xl font-extrabold leading-none text-white opacity-10">
					{cat?.slug?.slice(0, 4).toUpperCase() ?? article.title.slice(0, 4)}
				</span>
			</Link>
			<div className="flex flex-col justify-center gap-3 px-7 py-6">
				<div className="flex items-center gap-2">
					<span
						className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
						style={{ backgroundColor: risk.bg, color: risk.fg }}
					>
						<RiskIcon aria-hidden="true" className="h-3 w-3" />
						{t(risk.labelKey)}
					</span>
					{cat ? (
						<span
							className="flex items-center gap-1 text-xs font-semibold"
							style={{ color: cat.color ?? "var(--surface-card-muted-fg)" }}
						>
							<span
								className="h-1.5 w-1.5 rounded-full"
								style={{ backgroundColor: cat.color ?? "currentColor" }}
								aria-hidden="true"
							/>
							{cat.name}
						</span>
					) : null}
				</div>
				<Link
					href={withLocalePath(locale, `/articles/${article.id}`)}
					className="text-[18px] font-semibold leading-snug transition-colors group-hover:text-[var(--color-primary-600)]"
					style={{ color: "var(--field-foreground)" }}
				>
					{article.title}
				</Link>
				{article.summary ? (
					<p
						className="line-clamp-2 text-sm leading-relaxed"
						style={{ color: "var(--surface-card-faint-fg)" }}
					>
						{article.summary}
					</p>
				) : null}
				<CardMeta article={article} cat={cat} t={t} locale={locale} showShare />
			</div>
		</motion.div>
	);
}

function StandardCard({
	article,
	categoryById,
	locale,
	t,
	delay = 0,
}: CardProps) {
	const risk = getRiskPillStyle(getArticleRiskLevel(article.risk_score));
	const RiskIcon = risk.icon;
	const cat = article.category_id
		? (categoryById.get(article.category_id) ?? null)
		: null;

	return (
		<motion.article
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.4, delay, ease: "easeOut" }}
			whileHover={{ y: -4 }}
			className="group flex flex-col gap-2.5 overflow-hidden rounded-2xl border p-5 transition-all hover:shadow-feed-hover"
			style={{
				backgroundColor: "var(--color-card)",
				borderColor: "var(--surface-card-border-strong)",
			}}
		>
			<div className="flex items-center gap-2">
				<span
					className="flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-bold"
					style={{ backgroundColor: risk.bg, color: risk.fg }}
				>
					<RiskIcon aria-hidden="true" className="h-3 w-3" />
					{t(risk.labelKey)}
				</span>
				{cat ? (
					<span
						className="flex items-center gap-1 text-xs font-semibold"
						style={{ color: cat.color ?? "var(--surface-card-muted-fg)" }}
					>
						<span
							className="h-1.5 w-1.5 rounded-full"
							style={{ backgroundColor: cat.color ?? "currentColor" }}
							aria-hidden="true"
						/>
						{cat.name}
					</span>
				) : null}
			</div>
			<Link
				href={withLocalePath(locale, `/articles/${article.id}`)}
				className={cn(
					"line-clamp-2 text-[15px] font-semibold leading-snug transition-colors",
					"group-hover:text-[var(--color-primary-600)]",
				)}
				style={{ color: "var(--field-foreground)" }}
			>
				{article.title}
			</Link>
			{article.summary ? (
				<p
					className="line-clamp-2 text-sm leading-relaxed"
					style={{ color: "var(--surface-card-faint-fg)" }}
				>
					{article.summary}
				</p>
			) : null}
			<CardMeta article={article} cat={cat} t={t} locale={locale} />
		</motion.article>
	);
}

function CardMeta({
	article,
	cat,
	t,
	locale,
	showShare = false,
}: {
	article: Article;
	cat: { name: string; color: string | null; slug: string } | null;
	t: ReturnType<typeof useT>;
	locale: Locale;
	showShare?: boolean;
}) {
	const sourceLetter = (article.issuer ?? cat?.name ?? "·").charAt(0);
	const minutes = readingMinutes(article);

	return (
		<div className="mt-auto flex items-center justify-between pt-2">
			<div
				className="flex items-center gap-3 text-xs"
				style={{ color: "var(--surface-card-faint-fg)" }}
			>
				<span className="flex items-center gap-1.5 font-medium">
					<span
						className="flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold text-white"
						style={{
							backgroundColor: cat?.color ?? "var(--surface-card-faint-fg)",
						}}
						aria-hidden="true"
					>
						{sourceLetter}
					</span>
					{article.issuer ?? cat?.name ?? t("Source")}
				</span>
				<span className="flex items-center gap-1">
					<Clock aria-hidden="true" className="h-3 w-3" />
					{timeAgoFor(locale, article.published_at)}
				</span>
				<span className="hidden items-center gap-1 sm:flex">
					<BookOpen aria-hidden="true" className="h-3 w-3" />
					{t("{minutes} min read", { minutes })}
				</span>
			</div>
			<div
				className="flex items-center gap-1.5"
				onClick={(e) => e.stopPropagation()}
				onMouseDown={(e) => e.stopPropagation()}
				onPointerDown={(e) => e.stopPropagation()}
				onKeyDown={(e) => e.stopPropagation()}
			>
				<ReactionToggle
					targetType="article"
					targetId={article.id}
					initialSummary={article.reaction_summary ?? null}
					variant="inline"
					lazy
				/>
				<button
					type="button"
					className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-[var(--color-primary-500)]"
					aria-label={t("Bookmark")}
				>
					<BookmarkPlus aria-hidden="true" className="h-3.5 w-3.5" />
				</button>
				{showShare ? (
					<button
						type="button"
						className="flex h-7 w-7 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-[var(--color-primary-500)]"
						aria-label={t("Share")}
					>
						<Share2 aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>
		</div>
	);
}
