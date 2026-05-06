"use client";

import { UserShell } from "@/components/layout/user-shell";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useReadingHistory } from "@/hooks/use-reading-history";
import { useReportSubscriptions } from "@/hooks/use-reports";
import {
	type RoleTier,
	normalizeRoleTier,
	roleTierLabelKey,
} from "@/lib/authz";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { motion } from "framer-motion";
import {
	BookOpen,
	CheckCircle2,
	History,
	Mail,
	MessageSquare,
	PlayCircle,
	Settings,
	ShieldCheck,
	UserCircle,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06, delayChildren: 0.05 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 16 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.35, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

const heroSurfaceStyle: CSSProperties = {
	backgroundImage: "var(--gradient-cta)",
	color: "white",
};

const statCardStyle: CSSProperties = {
	backgroundColor: "var(--surface-popover-bg)",
	borderColor: "var(--surface-muted-border)",
};

const READING_STAT_SKELETON_IDS = [
	"total-read",
	"in-progress",
	"finished",
] as const;

function shortenTenantId(value: string): string {
	if (value.length <= 12) return value;
	return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

export default function LocalizedMePage() {
	const t = useT();
	const locale = useLocale();
	const user = useAuthStore((state) => state.user);
	const roleTier = useAuthStore((state) => state.roleTier);
	const isAuthLoading = useAuthStore((state) => state.isLoading);

	const tier: RoleTier = normalizeRoleTier(roleTier);
	const roleLabel = t(roleTierLabelKey(tier));

	const historyQuery = useReadingHistory({ limit: 100, enabled: !!user });
	const items = historyQuery.data?.items ?? [];
	const totalRead = historyQuery.data?.total ?? 0;
	const finishedCount = items.filter((item) => item.finished).length;
	const inProgressCount = items.filter((item) => !item.finished).length;

	const subscriptionsQuery = useReportSubscriptions({ enabled: !!user });
	const subscriptionCount = subscriptionsQuery.data?.total ?? 0;
	// TODO(B7): bookmarks/sources hooks not yet exposed by backend; use 0 placeholder.
	const bookmarkCount = 0;
	const followedSourceCount = 0;

	const displayName =
		user?.display_name?.trim() || user?.email?.split("@")[0] || t("User");
	const initials = (displayName.charAt(0) || "U").toUpperCase();
	const tenantLabel = user?.tenant_id ? shortenTenantId(user.tenant_id) : "—";

	return (
		<UserShell>
			<motion.div
				className="space-y-6"
				variants={containerVariants}
				initial="hidden"
				animate="visible"
			>
				{/* Hero / profile card */}
				<motion.section variants={itemVariants}>
					<div
						className="relative overflow-hidden rounded-3xl px-6 py-8 shadow-brand-lg md:px-10 md:py-10"
						style={heroSurfaceStyle}
					>
						<div
							aria-hidden="true"
							className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full"
							style={{
								background:
									"radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)",
							}}
						/>
						<div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
							<div className="flex items-center gap-5">
								<div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-white/15 ring-2 ring-white/40 backdrop-blur">
									{user?.avatar_url ? (
										<Image
											src={user.avatar_url}
											alt={displayName}
											width={80}
											height={80}
											sizes="80px"
											className="h-20 w-20 rounded-full object-cover"
										/>
									) : (
										<span className="text-3xl font-semibold">{initials}</span>
									)}
								</div>
								<div className="min-w-0">
									<p className="text-xs uppercase tracking-[0.18em] text-white/75">
										{t("My profile")}
									</p>
									{isAuthLoading && !user ? (
										<Skeleton
											variant="text"
											width={180}
											height={28}
											className="mt-2"
										/>
									) : (
										<h1 className="mt-1 text-2xl font-semibold md:text-3xl">
											{displayName}
										</h1>
									)}
									<div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/85">
										<Mail aria-hidden="true" className="h-4 w-4" />
										<span className="truncate">
											{user?.email ?? t("Loading...")}
										</span>
									</div>
								</div>
							</div>
							<div className="flex flex-wrap items-center gap-2">
								<Badge
									className="border-white/40 bg-white/15 text-white"
									variant="outline"
								>
									<ShieldCheck
										aria-hidden="true"
										className="mr-1 h-3.5 w-3.5"
									/>
									{roleLabel}
								</Badge>
								<Badge
									className="border-white/40 bg-white/15 text-white"
									variant="outline"
								>
									{user?.is_active ? t("Active") : t("Inactive")}
								</Badge>
							</div>
						</div>
					</div>
				</motion.section>

				{/* KPI overview — brief: 阅读数 / 收藏数 / 关注的源数 / 报告订阅 */}
				<motion.section
					variants={itemVariants}
					aria-label={t("Reading stats")}
				>
					<dl
						className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs"
						style={{ color: "var(--surface-muted-text)" }}
						data-testid="me-inline-stats"
					>
						<MeInlineStat
							label={t("Articles read")}
							value={totalRead.toLocaleString()}
						/>
						<span aria-hidden style={{ color: "var(--color-neutral-300)" }}>
							·
						</span>
						<MeInlineStat
							label={t("Bookmarks")}
							value={bookmarkCount.toLocaleString()}
						/>
						<span aria-hidden style={{ color: "var(--color-neutral-300)" }}>
							·
						</span>
						<MeInlineStat
							label={t("Followed sources")}
							value={followedSourceCount.toLocaleString()}
						/>
						<span aria-hidden style={{ color: "var(--color-neutral-300)" }}>
							·
						</span>
						<MeInlineStat
							label={t("Report subscriptions")}
							value={subscriptionCount.toLocaleString()}
						/>
					</dl>
				</motion.section>

				{/* Account information */}
				<motion.section variants={itemVariants}>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<UserCircle
									aria-hidden="true"
									className="h-4 w-4"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Account information")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							<dl className="grid gap-4 md:grid-cols-2">
								<ProfileField label={t("Display name")} value={displayName} />
								<ProfileField
									label={t("Email address")}
									value={user?.email ?? "—"}
								/>
								<ProfileField label={t("Role")} value={roleLabel} />
								<ProfileField label={t("Tenant")} value={tenantLabel} mono />
								<ProfileField
									label={t("Last login")}
									value={
										user?.last_login
											? formatDateTime(locale, user.last_login)
											: "—"
									}
								/>
								<ProfileField
									label={t("Account created")}
									value={
										user?.created_at
											? formatDateTime(locale, user.created_at)
											: "—"
									}
								/>
							</dl>
						</CardContent>
					</Card>
				</motion.section>

				{/* Reading stats */}
				<motion.section variants={itemVariants}>
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<BookOpen
									aria-hidden="true"
									className="h-4 w-4"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Reading stats")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{historyQuery.isLoading ? (
								<div className="grid gap-3 md:grid-cols-3">
									{READING_STAT_SKELETON_IDS.map((skeletonId) => (
										<Skeleton
											key={`stat-skel-${skeletonId}`}
											variant="rectangular"
											height={88}
										/>
									))}
								</div>
							) : (
								<div className="grid gap-3 md:grid-cols-3">
									<StatTile
										icon={<History aria-hidden="true" className="h-5 w-5" />}
										label={t("Articles read")}
										value={totalRead}
									/>
									<StatTile
										icon={
											<CheckCircle2
												aria-hidden="true"
												className="h-5 w-5"
												style={{ color: "var(--color-success-500)" }}
											/>
										}
										label={t("Finished")}
										value={finishedCount}
									/>
									<StatTile
										icon={
											<PlayCircle
												aria-hidden="true"
												className="h-5 w-5"
												style={{ color: "var(--color-primary-500)" }}
											/>
										}
										label={t("In progress")}
										value={inProgressCount}
									/>
								</div>
							)}
						</CardContent>
					</Card>
				</motion.section>

				{/* Quick actions */}
				<motion.section variants={itemVariants}>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("Quick actions")}</CardTitle>
						</CardHeader>
						<CardContent className="grid gap-3 md:grid-cols-3">
							<QuickActionLink
								href={withLocalePath(locale, "/settings")}
								icon={<Settings aria-hidden="true" className="h-4 w-4" />}
								label={t("View settings")}
							/>
							<QuickActionLink
								href={withLocalePath(locale, "/feedback")}
								icon={<MessageSquare aria-hidden="true" className="h-4 w-4" />}
								label={t("Submit feedback")}
							/>
							<QuickActionLink
								href={withLocalePath(locale, "/me/reading-history")}
								icon={<History aria-hidden="true" className="h-4 w-4" />}
								label={t("Reading history")}
							/>
						</CardContent>
					</Card>
				</motion.section>
			</motion.div>
		</UserShell>
	);
}

function QuickActionLink({
	href,
	icon,
	label,
}: {
	href: string;
	icon: React.ReactNode;
	label: string;
}) {
	return (
		<Link
			href={href}
			className="inline-flex items-center justify-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold transition-colors hover:bg-primary-50/40"
			style={statCardStyle}
		>
			{icon}
			<span style={{ color: "var(--auth-copy-primary)" }}>{label}</span>
		</Link>
	);
}

function ProfileField({
	label,
	value,
	mono = false,
}: {
	label: string;
	value: string;
	mono?: boolean;
}) {
	return (
		<div>
			<dt
				className="text-xs uppercase tracking-[0.12em]"
				style={{ color: "var(--surface-muted-text)" }}
			>
				{label}
			</dt>
			<dd
				className={`mt-1 text-sm font-medium ${mono ? "font-mono" : ""}`}
				style={{ color: "var(--auth-copy-primary)" }}
			>
				{value}
			</dd>
		</div>
	);
}

function StatTile({
	icon,
	label,
	value,
}: {
	icon: React.ReactNode;
	label: string;
	value: number;
}) {
	return (
		<div className="rounded-2xl border p-4" style={statCardStyle}>
			<div
				className="flex items-center gap-2 text-xs uppercase tracking-[0.12em]"
				style={{ color: "var(--surface-muted-text)" }}
			>
				{icon}
				{label}
			</div>
			<div
				className="mt-2 text-3xl font-semibold tabular-nums"
				style={{ color: "var(--auth-copy-primary)" }}
			>
				{value}
			</div>
		</div>
	);
}

function MeInlineStat({ label, value }: { label: string; value: string }) {
	return (
		<div className="inline-flex items-baseline gap-1.5">
			<span style={{ color: "var(--color-neutral-500)" }}>{label}</span>
			<span
				className="text-sm font-semibold tabular-nums"
				style={{ color: "var(--auth-copy-primary)" }}
			>
				{value}
			</span>
		</div>
	);
}
