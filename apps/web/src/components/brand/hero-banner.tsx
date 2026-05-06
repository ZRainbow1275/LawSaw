"use client";

import { useActiveBanners } from "@/hooks/use-banners";
import { useT } from "@/lib/i18n-client";
import { motion } from "framer-motion";
import { ArrowRight, BookOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

// ---- Static banner card (orange gradient, matching prototype .banner-card) ----

interface StaticHeroBannerProps {
	tag?: string;
	title: ReactNode;
	description?: string;
	ctaLabel?: string;
	ctaHref?: string;
	onCtaClick?: () => void;
}

const bannerShellStyle = {
	backgroundImage: "var(--gradient-banner)",
	boxShadow: "var(--shadow-brand-lg)",
} as const;

const bannerTagStyle = {
	backgroundColor: "rgba(255,255,255,0.22)",
	color: "rgba(255,255,255,0.95)",
	border: "1px solid rgba(255,255,255,0.3)",
} as const;

const bannerBtnStyle = {
	backgroundColor: "rgba(255,255,255,0.18)",
	color: "#ffffff",
	border: "1px solid rgba(255,255,255,0.35)",
} as const;

/**
 * StaticHeroBanner — orange gradient banner card matching prototype `.banner-card`.
 * Use for editorial / featured content callouts on dashboard, feed, reports, etc.
 */
export function StaticHeroBanner({
	tag,
	title,
	description,
	ctaLabel,
	ctaHref,
	onCtaClick,
}: StaticHeroBannerProps) {
	const t = useT();

	const buttonContent = (
		<motion.button
			type="button"
			className="mt-5 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all"
			style={bannerBtnStyle}
			whileHover={{ backgroundColor: "rgba(255,255,255,0.28)", scale: 1.03 }}
			whileTap={{ scale: 0.97 }}
			onClick={onCtaClick}
		>
			{ctaLabel ?? t("Read report")}
			<ArrowRight aria-hidden="true" className="h-4 w-4" />
		</motion.button>
	);

	return (
		<motion.div
			className="relative overflow-hidden rounded-2xl p-6 text-white"
			style={bannerShellStyle}
			initial={{ opacity: 0, y: 10 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.5, ease: "easeOut" }}
		>
			{/* Decorative halo */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full"
				style={{ backgroundColor: "rgba(255,255,255,0.06)" }}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -bottom-8 right-8 h-24 w-24 rounded-full"
				style={{ backgroundColor: "rgba(255,255,255,0.04)" }}
			/>

			<div className="relative flex flex-col gap-2">
				{tag && (
					<span
						className="mb-1 inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold"
						style={bannerTagStyle}
					>
						<Sparkles aria-hidden="true" className="h-3 w-3" />
						{tag}
					</span>
				)}

				<h2 className="text-xl font-bold leading-snug text-white">{title}</h2>

				{description && (
					<p
						className="mt-1 max-w-xs text-sm leading-relaxed"
						style={{ color: "rgba(255,255,255,0.85)" }}
					>
						{description}
					</p>
				)}

				{ctaHref ? (
					<Link href={ctaHref} className="w-fit">
						{buttonContent}
					</Link>
				) : (
					buttonContent
				)}
			</div>
		</motion.div>
	);
}

// ---- Dynamic active-banner card (fetches from /api/v1/banners/active) ----

interface ActiveBannerStripProps {
	channelIds?: string[];
	/** Max number of banners to display. Default 1. */
	max?: number;
}

const activeBannerStyle = {
	backgroundColor: "var(--surface-muted-bg)",
	borderLeft: "3px solid var(--color-primary-500)",
	border: "1px solid var(--surface-muted-border)",
} as const;

const activeBannerCtaStyle = {
	color: "var(--color-primary-600)",
} as const;

/**
 * ActiveBannerStrip — fetches live banners from the API and renders them as
 * notification-style strips below the static hero banner. Falls back silently
 * if no active banners exist.
 */
export function ActiveBannerStrip({
	channelIds = [],
	max = 3,
}: ActiveBannerStripProps) {
	const t = useT();
	const { data: banners } = useActiveBanners(channelIds);

	if (!banners || banners.length === 0) return null;

	const visible = banners.slice(0, max);

	return (
		<div className="flex flex-col gap-3">
			{visible.map((banner) => (
				<motion.div
					key={banner.id}
					className="rounded-xl p-4"
					style={activeBannerStyle}
					initial={{ opacity: 0, x: -6 }}
					animate={{ opacity: 1, x: 0 }}
					transition={{ duration: 0.3 }}
				>
					<div className="flex items-start justify-between gap-4">
						<div className="min-w-0 flex-1">
							<p
								className="text-sm font-semibold"
								style={{ color: "var(--field-foreground)" }}
							>
								{banner.title}
							</p>
							{banner.body && (
								<p
									className="mt-0.5 text-sm"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{banner.body}
								</p>
							)}
						</div>
						{banner.cta_label && banner.cta_url && (
							<Link
								href={banner.cta_url}
								className="shrink-0 text-sm font-medium hover:underline"
								style={activeBannerCtaStyle}
							>
								{banner.cta_label}
								<ArrowRight
									aria-hidden="true"
									className="ml-1 inline h-3.5 w-3.5"
								/>
							</Link>
						)}
					</div>
				</motion.div>
			))}
		</div>
	);
}

// ---- DashboardBannerSection — combines static hero + active strips ----

interface DashboardBannerSectionProps {
	/** Passed to StaticHeroBanner */
	staticProps?: StaticHeroBannerProps;
	/** Passed to ActiveBannerStrip */
	channelIds?: string[];
}

/**
 * DashboardBannerSection — the full banner area for the dashboard page.
 * Renders the orange gradient static card + any live CMS banners below it.
 */
export function DashboardBannerSection({
	staticProps,
	channelIds = [],
}: DashboardBannerSectionProps) {
	const t = useT();

	const merged: StaticHeroBannerProps = {
		tag: t("Featured report"),
		title: t("2024 Antitrust & Compliance Global Regulatory White Paper"),
		description: t(
			"Distills 3,000+ core case files to illuminate the evolution of platform antitrust and cross-border data rules.",
		),
		ctaLabel: t("Read report"),
		ctaHref: "/articles",
		...staticProps,
	};

	return (
		<div className="flex flex-col gap-3">
			<StaticHeroBanner {...merged} />
			<ActiveBannerStrip channelIds={channelIds} />
		</div>
	);
}

// ---- Re-exports ----
export { BookOpen };
