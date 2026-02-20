"use client";

import { stripLocalePrefix, withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { ChevronRight, Home } from "lucide-react";
import Link from "next/link";

const SEGMENT_LABELS: Record<string, string> = {
	analytics: "Analytics",
	apikeys: "API Keys",
	articles: "Articles",
	category: "Categories",
	data: "Data Sources",
	feedback: "Feedback",
	knowledge: "Knowledge Graph",
	reports: "Reports",
	search: "Search",
	settings: "Settings",
	sources: "Sources",
	users: "Users",
};

function isLikelyEntityId(segment: string): boolean {
	return (
		/^[0-9]+$/.test(segment) ||
		/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
			segment,
		)
	);
}

function decodeSegment(segment: string): string {
	try {
		return decodeURIComponent(segment);
	} catch {
		return segment;
	}
}

function titleCase(value: string): string {
	if (!value) return value;
	return value.charAt(0).toUpperCase() + value.slice(1);
}

function segmentLabel(segment: string, isLast: boolean): string {
	const mapped = SEGMENT_LABELS[segment.toLowerCase()];
	if (mapped) return mapped;
	if (isLast && isLikelyEntityId(segment)) return "Detail";
	return titleCase(decodeSegment(segment).replace(/[-_]+/g, " "));
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
		return {
			key: `${index}-${segment}`,
			href: withLocalePath(locale, hrefPath),
			label: t(segmentLabel(segment, isLast)),
			isLast,
		};
	});

	return (
		<nav
			aria-label={t("Breadcrumb")}
			className={cn("overflow-x-auto whitespace-nowrap", className)}
		>
			<ol className="flex items-center gap-1 text-sm text-neutral-500">
				<li>
					<Link
						href={withLocalePath(locale, "/")}
						className="inline-flex items-center rounded px-1 py-0.5 hover:bg-neutral-100 hover:text-neutral-700"
					>
						<Home aria-hidden="true" className="h-3.5 w-3.5" />
						<span className="sr-only">{t("Home")}</span>
					</Link>
				</li>
				{items.map((item) => (
					<li key={item.key} className="inline-flex items-center gap-1">
						<ChevronRight
							aria-hidden="true"
							className="h-3.5 w-3.5 text-neutral-400"
						/>
						{item.isLast ? (
							<span
								aria-current="page"
								className="max-w-[18rem] truncate text-neutral-700"
							>
								{item.label}
							</span>
						) : (
							<Link
								href={item.href}
								className="max-w-[16rem] truncate rounded px-1 py-0.5 hover:bg-neutral-100 hover:text-neutral-700"
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
