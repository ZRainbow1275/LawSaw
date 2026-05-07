"use client";

import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";

const SEGMENT_LABELS: Record<string, string> = {
	admin: "Admin",
	"ai-governance": "AI Governance",
	"ai-usage": "AI Usage",
	analytics: "Analytics",
	apikeys: "API Keys",
	articles: "Articles",
	audit: "Audit",
	banners: "Banners",
	category: "Categories",
	channels: "Channels",
	data: "Data Sources",
	dashboard: "Dashboard",
	feed: "Feed",
	feedback: "Feedback",
	feedbacks: "Feedbacks",
	knowledge: "Knowledge Graph",
	login: "Login",
	logout: "Logout",
	me: "Me",
	new: "New",
	notifications: "Notifications",
	pins: "Pins",
	"reading-history": "Reading History",
	register: "Register",
	relations: "Relations",
	reports: "Reports",
	"reset-password": "Reset Password",
	runs: "Runs",
	search: "Search",
	settings: "Settings",
	sources: "Sources",
	templates: "Templates",
	tenants: "Tenants",
	users: "Users",
	"verify-email": "Verify Email",
};

// Recognise any 36-char hex+dash UUID (v0/seed UUIDs included), not just v1-v5.
const UUID_RE =
	/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REPORT_NUMBER_RE = /^RPT-[A-Z0-9-]+$/i;

function isLikelyEntityId(segment: string): boolean {
	return /^[0-9]+$/.test(segment) || UUID_RE.test(segment);
}

function isReportNumber(segment: string): boolean {
	return REPORT_NUMBER_RE.test(segment);
}

function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

// Compact opaque ids (UUIDs, long hashes) to the first 8 characters followed by
// an ellipsis so the breadcrumb stays readable on narrow screens. Keeping the
// prefix preserves enough signal for users to spot which entity they are on
// when the page itself does not surface a friendlier title.
function shortenId(segment: string): string {
	if (segment.length <= 8) return segment;
	return `${segment.slice(0, 8)}…`;
}

export type SegmentResolution =
	| { kind: "translate"; key: string }
	| { kind: "literal"; text: string };

export function resolveBreadcrumbSegment(
	segment: string,
	_isLast: boolean,
): SegmentResolution {
	const mapped = SEGMENT_LABELS[segment.toLowerCase()];
	if (mapped) return { kind: "translate", key: mapped };
	// Report numbers (e.g. RPT-20260505-0001) are already short and meaningful,
	// so render them as-is without forcing case or routing through i18n.
	if (isReportNumber(segment))
		return { kind: "literal", text: segment };
	// UUIDs / numeric ids never make good i18n keys — show a compact prefix
	// so the segment still tells the user "this is record 12345678…" without
	// relying on detail data the breadcrumb component does not have access to.
	if (isLikelyEntityId(segment))
		return { kind: "literal", text: shortenId(decodeSegment(segment)) };
	// Unknown static segments fall back to the raw decoded value (with
	// hyphen/underscore replaced by space) but never get capitalised through
	// i18n — that path was triggering "[i18n] missing zh key" warnings on
	// every dynamic page.
	return {
		kind: "literal",
		text: decodeSegment(segment).replace(/[-_]+/g, " "),
	};
}

type BreadcrumbsProps = {
	pathname: string;
	className?: string;
};

export function Breadcrumbs({ pathname, className }: BreadcrumbsProps) {
	const locale = useLocale();
	const t = useT();

	const normalizedPath = stripLocalePrefix(pathname || "/");
	const segments = normalizedPath.split("/").filter(Boolean);

	if (segments.length === 0) {
		return null;
	}

	const items = segments.map((segment, index) => {
		const isLast = index === segments.length - 1;
		const hrefPath = `/${segments.slice(0, index + 1).join("/")}`;
		const resolved = resolveBreadcrumbSegment(segment, isLast);
		return {
			key: `${index}-${segment}`,
			href: withLocalePath(locale, hrefPath),
			label:
				resolved.kind === "translate" ? t(resolved.key) : resolved.text,
			isLast,
		};
	});

	return (
		<nav
			aria-label={t("Breadcrumb")}
			className={cn("overflow-x-auto whitespace-nowrap", className)}
		>
			<ol className="flex items-center gap-2 text-sm text-neutral-500 dark:text-neutral-400">
				<li>
					<Link
						href={withLocalePath(locale, "/")}
						className="inline-flex items-center rounded px-1 py-0.5 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
					>
						<Home aria-hidden="true" className="h-3.5 w-3.5" />
						<span className="sr-only">{t("Home")}</span>
					</Link>
				</li>
				{items.map((item) => (
					<li key={item.key} className="inline-flex items-center gap-1">
						<ChevronRight
							aria-hidden="true"
							className="h-3.5 w-3.5 text-neutral-400 dark:text-neutral-500"
						/>
						{item.isLast ? (
							<span
								aria-current="page"
								className="max-w-[18rem] truncate text-neutral-700 dark:text-neutral-200"
							>
								{item.label}
							</span>
						) : (
							<Link
								href={item.href}
								className="max-w-[16rem] truncate rounded px-1 py-0.5 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-white/10 dark:hover:text-neutral-200"
							>
								{item.label}
							</Link>
						)}
					</li>
				))}
			</ol>
		</nav>
	);
}
