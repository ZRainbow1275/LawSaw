"use client";

/**
 * /[locale]/admin/channels/[id] — native channel detail page (P0 D1).
 *
 * Renders inline channel metadata, policy list, and bound sources so the main
 * area is meaningful even before the channel-detail drawer opens. The "Edit"
 * CTA forwards to the list page in deep-link mode where the existing drawer
 * owns mutations.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import {
	useAdminChannels,
	useChannelPolicies,
} from "@/hooks/use-channels";
import { useSources } from "@/hooks/use-sources";
import { formatDateTime, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import {
	ArrowLeft,
	CheckCircle2,
	Hash,
	Loader2,
	Radio,
	Rss,
	ShieldCheck,
	XCircle,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useMemo } from "react";

const VISIBILITY_LABEL: Record<string, string> = {
	public: "Public",
	restricted: "Restricted",
	verified: "Verified",
	premium: "Premium",
};

export default function AdminChannelDetailPage() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const params = useParams<{ id: string }>();
	const channelId = typeof params?.id === "string" ? params.id : "";

	const channelsQuery = useAdminChannels(true);
	const policiesQuery = useChannelPolicies(channelId || null);
	const sourcesQuery = useSources({ limit: 100 });

	const channel = useMemo(
		() =>
			(channelsQuery.data ?? []).find((item) => item.id === channelId) ?? null,
		[channelsQuery.data, channelId],
	);

	const linkedSources = useMemo(() => {
		const sources = sourcesQuery.data?.data ?? [];
		return sources.filter(
			(source) => (source as { channel_id?: string }).channel_id === channelId,
		);
	}, [sourcesQuery.data, channelId]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const surfaceStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 78%, transparent)",
		backgroundColor: "var(--color-background)",
	} as const;

	const handleBack = () =>
		router.push(withLocalePath(locale, "/admin/channels"));
	const handleEdit = () =>
		router.push(
			withLocalePath(
				locale,
				`/admin/channels?channelId=${encodeURIComponent(channelId)}`,
			),
		);

	if (!channelId) return null;

	const isLoading = channelsQuery.isLoading;
	const policies = policiesQuery.data ?? [];

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
								<Radio
									aria-hidden="true"
									className="h-7 w-7"
									style={{ color: "var(--color-primary-500)" }}
								/>
								{t("Channel detail")}
							</CardTitle>
							<p className="mt-1 text-sm" style={mutedTextStyle}>
								{t("Inspect channel metadata, access policies, and bound sources.")}
							</p>
						</div>
						<div className="flex flex-wrap items-center gap-2">
							<Button type="button" variant="outline" onClick={handleBack}>
								<ArrowLeft aria-hidden="true" className="h-4 w-4" />
								{t("Back to channels")}
							</Button>
							<Button type="button" onClick={handleEdit} disabled={!channel}>
								{t("Edit channel")}
							</Button>
						</div>
					</div>
				</CardHeader>
			</Card>

			{isLoading ? (
				<Card>
					<CardContent className="flex items-center gap-2 py-8 text-sm">
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						{t("Loading channel detail")}
					</CardContent>
				</Card>
			) : !channel ? (
				<Card>
					<CardContent className="py-8">
						<EmptyState
							title={t("Channel not found")}
							description={t(
								"The channel could not be loaded. It may have been removed.",
							)}
						/>
					</CardContent>
				</Card>
			) : (
				<>
					<Card>
						<CardHeader>
							<CardTitle className="text-base">{t("Profile")}</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3">
							<div className="flex flex-wrap items-center gap-2">
								<p className="text-lg font-semibold" style={headingStyle}>
									{channel.name}
								</p>
								<Badge variant="outline">
									<Hash aria-hidden="true" className="mr-1 h-3 w-3" />
									{channel.slug}
								</Badge>
								<Badge variant="secondary">
									{t(VISIBILITY_LABEL[channel.visibility] ?? channel.visibility)}
								</Badge>
								{channel.is_active ? (
									<Badge variant="success">
										<CheckCircle2 aria-hidden="true" className="mr-1 h-3 w-3" />
										{t("Active")}
									</Badge>
								) : (
									<Badge variant="outline">
										<XCircle aria-hidden="true" className="mr-1 h-3 w-3" />
										{t("Archived")}
									</Badge>
								)}
							</div>
							<p className="text-sm" style={mutedTextStyle}>
								{channel.description ?? t("No description provided.")}
							</p>
							<dl
								className="grid gap-3 text-xs sm:grid-cols-2"
								style={mutedTextStyle}
							>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Created at")}
									</dt>
									<dd className="mt-1" style={headingStyle}>
										{formatDateTime(locale, channel.created_at, {
											year: "numeric",
											month: "2-digit",
											day: "2-digit",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</dd>
								</div>
								<div>
									<dt className="uppercase tracking-wide">
										{t("Updated at")}
									</dt>
									<dd className="mt-1" style={headingStyle}>
										{formatDateTime(locale, channel.updated_at, {
											year: "numeric",
											month: "2-digit",
											day: "2-digit",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</dd>
								</div>
							</dl>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<ShieldCheck aria-hidden="true" className="h-4 w-4" />
								{t("Access policies")}
							</CardTitle>
						</CardHeader>
						<CardContent>
							{policiesQuery.isLoading ? (
								<p
									className="flex items-center gap-2 text-sm"
									style={mutedTextStyle}
								>
									<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
									{t("Loading policies")}
								</p>
							) : policies.length === 0 ? (
								<p className="text-sm" style={mutedTextStyle}>
									{t("No policies configured for this channel.")}
								</p>
							) : (
								<ul className="space-y-2">
									{policies.map((policy) => (
										<li
											key={policy.id}
											className="rounded-2xl border px-4 py-3 text-sm"
											style={surfaceStyle}
										>
											<div className="flex flex-wrap items-center justify-between gap-2">
												<span style={headingStyle}>
													{policy.subject_type}: {policy.subject_key}
												</span>
												<div className="flex flex-wrap gap-1">
													{policy.can_read ? (
														<Badge variant="secondary">
															{t("Can read")}
														</Badge>
													) : null}
													{policy.can_read_source_meta ? (
														<Badge variant="secondary">
															{t("Can read source meta")}
														</Badge>
													) : null}
													{policy.can_access_reports ? (
														<Badge variant="secondary">
															{t("Can access reports")}
														</Badge>
													) : null}
												</div>
											</div>
										</li>
									))}
								</ul>
							)}
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-base">
								<Rss aria-hidden="true" className="h-4 w-4" />
								{t("Bound sources")}
								<Badge variant="secondary">{linkedSources.length}</Badge>
							</CardTitle>
						</CardHeader>
						<CardContent>
							{sourcesQuery.isLoading ? (
								<p
									className="flex items-center gap-2 text-sm"
									style={mutedTextStyle}
								>
									<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
									{t("Loading sources")}
								</p>
							) : linkedSources.length === 0 ? (
								<p className="text-sm" style={mutedTextStyle}>
									{t("No sources are bound to this channel yet.")}
								</p>
							) : (
								<ul className="space-y-2">
									{linkedSources.map((source) => {
										const sourceRecord = source as {
											id: string;
											name: string;
											url?: string;
										};
										return (
											<li
												key={sourceRecord.id}
												className="rounded-2xl border px-4 py-3 text-sm"
												style={surfaceStyle}
											>
												<button
													type="button"
													className="flex w-full items-center justify-between gap-2 text-left"
													onClick={() =>
														router.push(
															withLocalePath(
																locale,
																`/admin/sources/${encodeURIComponent(sourceRecord.id)}`,
															),
														)
													}
												>
													<span style={headingStyle}>{sourceRecord.name}</span>
													<span
														className="truncate text-xs"
														style={mutedTextStyle}
													>
														{sourceRecord.url ?? ""}
													</span>
												</button>
											</li>
										);
									})}
								</ul>
							)}
						</CardContent>
					</Card>
				</>
			)}
		</div>
	);
}
