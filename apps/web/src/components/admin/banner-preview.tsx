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

/**
 * Banner-only vivid gradient palette — saturated, high-impact pairs that read
 * as "banner identity" instead of the soft pastel hero gradients used as
 * background washes elsewhere. Each pair travels from a saturated mid tone
 * (Tailwind 500) to a darker shade (700) so the gradient has visible depth
 * even at small swatch sizes.
 */
const BANNER_VIVID_GRADIENT: Record<BannerGradientKey, string> = {
	primary: "linear-gradient(135deg, #FB923C 0%, #EA580C 100%)",
	emerald: "linear-gradient(135deg, #10B981 0%, #047857 100%)",
	amber: "linear-gradient(135deg, #F59E0B 0%, #B45309 100%)",
	violet: "linear-gradient(135deg, #8B5CF6 0%, #6D28D9 100%)",
	cyan: "linear-gradient(135deg, #06B6D4 0%, #0E7490 100%)",
	rose: "linear-gradient(135deg, #F43F5E 0%, #BE123C 100%)",
};

export function bannerVividGradient(key: BannerGradientKey): string {
	return BANNER_VIVID_GRADIENT[key];
}

interface BannerPreviewProps {
	title: string;
	body?: string;
	ctaLabel?: string;
	ctaUrl?: string;
	gradientKey: BannerGradientKey;
	dismissable?: boolean;
	audienceTiers?: string[];
	imageUrl?: string;
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
	imageUrl,
	className,
}: BannerPreviewProps) {
	const t = useT();
	const gradient = bannerVividGradient(gradientKey);
	return (
		<article
			className={cn(
				"relative overflow-hidden rounded-2xl",
				"shadow-[0_12px_28px_-12px_rgba(0,0,0,0.40)]",
				className,
			)}
			style={{
				backgroundImage: gradient,
				color: "#ffffff",
			}}
			data-testid="banner-preview"
		>
			{/* Top sheen — subtle white highlight line */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-x-0 top-0 h-px"
				style={{
					backgroundImage:
						"linear-gradient(to right, transparent, rgba(255,255,255,0.55), transparent)",
				}}
			/>
			{/* Bottom-right radial sheen — depth */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0"
				style={{
					backgroundImage:
						"radial-gradient(ellipse at bottom right, rgba(255,255,255,0.10), transparent 60%)",
				}}
			/>

			<div className="relative flex items-start gap-4 px-6 py-5">
				{/* Icon chip — solid white with brand-color icon, instead of glassy white-on-white */}
				<div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-white shadow-md ring-1 ring-white/40">
					<Megaphone
						aria-hidden="true"
						className="h-5 w-5"
						style={{
							color:
								gradientKey === "amber"
									? "#B45309"
									: gradientKey === "primary"
										? "#EA580C"
										: gradientKey === "emerald"
											? "#047857"
											: gradientKey === "violet"
												? "#6D28D9"
												: gradientKey === "cyan"
													? "#0E7490"
													: "#BE123C",
						}}
					/>
				</div>

				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h3 className="text-lg font-bold leading-tight tracking-tight text-white">
							{title || t("Untitled banner")}
						</h3>
						{audienceTiers.length > 0 ? (
							<div className="flex flex-wrap items-center gap-1.5">
								{audienceTiers.map((tier) => (
									<span
										key={tier}
										className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.08em] text-neutral-800 shadow-sm"
									>
										{TIER_LABELS[tier] ?? tier}
									</span>
								))}
							</div>
						) : null}
					</div>
					{body ? (
						<div className="mt-1.5 max-h-40 overflow-hidden text-[13px] leading-[1.6] text-white/95 [&_a]:underline [&_p]:!text-white/95 [&_*]:!text-white/95">
							<MarkdownReader markdown={body} />
						</div>
					) : null}
					{ctaLabel && ctaUrl ? (
						<div className="mt-3">
							<Button
								type="button"
								size="sm"
								variant="outline"
								className="border-transparent bg-white font-semibold text-neutral-900 shadow-md hover:bg-white/95"
								onClick={(event) => event.preventDefault()}
							>
								<ExternalLink aria-hidden="true" className="h-4 w-4" />
								{ctaLabel}
							</Button>
						</div>
					) : null}
				</div>

				{imageUrl ? (
					<img
						src={imageUrl}
						alt=""
						aria-hidden="true"
						className="hidden h-16 w-24 shrink-0 rounded-xl object-cover shadow-lg ring-2 ring-white/50 sm:block"
						onError={(event) => {
							(event.currentTarget as HTMLImageElement).style.display = "none";
						}}
					/>
				) : null}

				{dismissable ? (
					<button
						type="button"
						className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/15 text-white ring-1 ring-white/20 backdrop-blur-sm transition hover:bg-white/25"
						aria-label={t("Dismiss banner preview")}
						onClick={(event) => event.preventDefault()}
					>
						<X aria-hidden="true" className="h-3.5 w-3.5" />
					</button>
				) : null}
			</div>
		</article>
	);
}
