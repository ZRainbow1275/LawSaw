"use client";

/**
 * BannerPreview — admin-side live preview of a banner.
 *
 * Mirrors the user-facing surface: gradient background, optional CTA, dismissable
 * close button (rendered for visual completeness, not interactive in preview).
 *
 * Markdown body is rendered through the project-wide `<MarkdownReader>` so the
 * preview matches what end users will see verbatim.
 */

import { MarkdownReader } from "@/components/editor";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { ExternalLink, Megaphone, X } from "lucide-react";

export type BannerGradientKey =
	| "primary"
	| "emerald"
	| "amber"
	| "violet"
	| "cyan"
	| "rose";

export const BANNER_GRADIENT_KEYS: BannerGradientKey[] = [
	"primary",
	"emerald",
	"amber",
	"violet",
	"cyan",
	"rose",
];

export function gradientCssVar(key: BannerGradientKey): string {
	return `var(--surface-hero-${key}-gradient)`;
}

interface BannerPreviewProps {
	title: string;
	body?: string;
	ctaLabel?: string;
	ctaUrl?: string;
	gradientKey: BannerGradientKey;
	dismissable?: boolean;
	audienceTiers?: string[];
	className?: string;
}

const TIER_LABELS: Record<string, string> = {
	basic: "Basic",
	verified: "Verified",
	premium: "Premium",
};

export function BannerPreview({
	title,
	body,
	ctaLabel,
	ctaUrl,
	gradientKey,
	dismissable = true,
	audienceTiers = [],
	className,
}: BannerPreviewProps) {
	const t = useT();
	const containerStyle = {
		backgroundImage: gradientCssVar(gradientKey),
		color: "var(--surface-hero-foreground, #ffffff)",
	} as const;

	return (
		<article
			className={cn(
				"relative overflow-hidden rounded-3xl border px-5 py-4 shadow-sm",
				className,
			)}
			style={{
				...containerStyle,
				borderColor: "color-mix(in srgb, var(--color-border) 60%, transparent)",
			}}
			data-testid="banner-preview"
		>
			<div className="flex items-start gap-3">
				<div
					className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl"
					style={{
						backgroundColor: "rgba(255,255,255,0.18)",
					}}
				>
					<Megaphone aria-hidden="true" className="h-5 w-5" />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-base font-semibold leading-snug">
							{title || t("Untitled banner")}
						</h3>
						{audienceTiers.length > 0 ? (
							<div className="flex flex-wrap items-center gap-1.5">
								{audienceTiers.map((tier) => (
									<Badge
										key={tier}
										variant="outline"
										className="border-white/40 bg-white/15 text-[11px] uppercase tracking-wide text-white"
									>
										{TIER_LABELS[tier] ?? tier}
									</Badge>
								))}
							</div>
						) : null}
					</div>
					{body ? (
						<div className="mt-2 max-h-40 overflow-hidden text-sm leading-6 [&_a]:underline [&_p]:!text-current [&_*]:!text-current">
							<MarkdownReader markdown={body} />
						</div>
					) : null}
					{ctaLabel && ctaUrl ? (
						<div className="mt-3">
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="border-white/50 bg-white/15 text-white hover:bg-white/25"
								onClick={(event) => event.preventDefault()}
							>
								<ExternalLink aria-hidden="true" className="h-4 w-4" />
								{ctaLabel}
							</Button>
						</div>
					) : null}
				</div>
				{dismissable ? (
					<button
						type="button"
						className="ml-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white/90 transition hover:bg-white/25"
						aria-label={t("Dismiss banner preview")}
						onClick={(event) => event.preventDefault()}
					>
						<X aria-hidden="true" className="h-4 w-4" />
					</button>
				) : null}
			</div>
		</article>
	);
}
