"use client";

import { AnimatedNumber } from "@/components/ui/animated-number";
import { type RoleTier, normalizeRoleTier } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	ArrowRight,
	Crown,
	type LucideIcon,
	Newspaper,
	Pin,
	ShieldCheck,
	Sparkles,
	Star,
} from "lucide-react";
import Link from "next/link";

interface FeedHeroProps {
	articleCount: number;
	visibleChannelCount: number;
	pinnedCount: number;
}

interface TierVisual {
	icon: LucideIcon;
	labelKey: string;
}

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.1, delayChildren: 0.05 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 18 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.4, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

function tierMessageKey(tier: RoleTier): string {
	switch (tier) {
		case "super_admin":
			return "Today's pulse across every tenant";
		case "tenant_admin":
			return "Today's pulse across your tenant";
		case "premium_user":
			return "Premium-grade insights tuned to your subscriptions";
		case "verified_user":
			return "Verified insights tailored to your watchlist";
		default:
			return "Today's regulatory pulse, curated for you";
	}
}

function tierVisual(tier: RoleTier): TierVisual {
	switch (tier) {
		case "super_admin":
			return { icon: Crown, labelKey: "Super admin" };
		case "tenant_admin":
			return { icon: ShieldCheck, labelKey: "Tenant admin" };
		case "premium_user":
			return { icon: Star, labelKey: "Premium user" };
		case "verified_user":
			return { icon: ShieldCheck, labelKey: "Verified user" };
		default:
			return { icon: Sparkles, labelKey: "Basic user" };
	}
}

function shouldShowUpgrade(tier: RoleTier): boolean {
	return tier === "basic_user" || tier === "verified_user";
}

function upgradeCtaKey(tier: RoleTier): string {
	return tier === "basic_user" ? "Verify your account" : "Upgrade to premium";
}

export function FeedHero({
	articleCount,
	visibleChannelCount,
	pinnedCount,
}: FeedHeroProps) {
	const t = useT();
	const locale = useLocale();
	const roleTier = useAuthStore((state) => state.roleTier);
	const tier = normalizeRoleTier(roleTier);
	const tierMeta = tierVisual(tier);
	const TierIcon = tierMeta.icon;
	const showUpgrade = shouldShowUpgrade(tier);
	const upgradeHref = withLocalePath(
		locale,
		tier === "basic_user" ? "/settings" : "/settings",
	);

	return (
		<motion.section
			aria-label={t("Today's insights")}
			className="relative overflow-hidden rounded-3xl bg-gradient-banner p-6 text-white shadow-brand-lg md:p-8"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.22) 0%, transparent 60%)",
				}}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-0"
				style={{
					background:
						"radial-gradient(ellipse at 80% 0%, rgba(255,255,255,0.18) 0%, transparent 55%)",
				}}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute -bottom-16 -right-16 h-64 w-64 rounded-full"
				style={{
					background:
						"radial-gradient(circle, rgba(255,255,255,0.16) 0%, transparent 70%)",
				}}
			/>

			<div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
				<div className="max-w-2xl">
					<motion.div
						className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em]"
						variants={itemVariants}
					>
						<span
							aria-hidden="true"
							className="h-2 w-2 animate-pulse-live rounded-full bg-emerald-300"
						/>
						{t("Live")}
					</motion.div>

					<motion.h1
						className="mt-4 text-3xl font-bold tracking-tight md:text-4xl"
						variants={itemVariants}
					>
						{t("Today's insights")}
					</motion.h1>
					<motion.p
						className="mt-3 text-base text-white/85 md:text-lg"
						variants={itemVariants}
					>
						{t(tierMessageKey(tier))}
					</motion.p>

					<motion.div
						className="mt-5 flex flex-wrap items-center gap-3 text-sm"
						variants={itemVariants}
					>
						<HeroStat
							icon={<Newspaper aria-hidden="true" className="h-4 w-4" />}
							label={t("Articles ready")}
							value={articleCount}
						/>
						<HeroStat
							icon={<Sparkles aria-hidden="true" className="h-4 w-4" />}
							label={t("Visible channels")}
							value={visibleChannelCount}
						/>
						<HeroStat
							icon={<Pin aria-hidden="true" className="h-4 w-4" />}
							label={t("Pinned")}
							value={pinnedCount}
						/>
					</motion.div>
				</div>

				<motion.div
					className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end"
					variants={itemVariants}
				>
					<span
						className="inline-flex items-center gap-2 self-start rounded-full bg-white/20 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] backdrop-blur-sm"
						title={t(tierMeta.labelKey)}
					>
						<TierIcon aria-hidden="true" className="h-4 w-4" />
						{t(tierMeta.labelKey)}
					</span>

					{showUpgrade ? (
						<Link
							href={upgradeHref}
							className="group inline-flex items-center justify-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-[color:var(--color-primary-600)] shadow-brand transition-transform hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
						>
							{t(upgradeCtaKey(tier))}
							<ArrowRight
								aria-hidden="true"
								className="h-4 w-4 transition-transform group-hover:translate-x-0.5"
							/>
						</Link>
					) : null}
				</motion.div>
			</div>
		</motion.section>
	);
}

function HeroStat({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
}) {
	return (
		<span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1.5 text-sm backdrop-blur-sm">
			{icon}
			<AnimatedNumber
				value={value}
				duration={1200}
				animateOnView
				numberClassName="font-semibold tabular-nums text-white"
			/>
			<span className="text-white/80">{label}</span>
		</span>
	);
}
