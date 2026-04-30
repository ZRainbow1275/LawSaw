"use client";

/**
 * Placeholder for admin sub-routes that the dual-panel migration (SPEC-02)
 * declares but whose CRUD/detail UI will land in the P2 wave. The component
 * gives the route a real renderable surface so:
 *
 *   - Breadcrumbs (admin-shell.tsx) resolve cleanly without 404s.
 *   - Server-side guard (`[locale]/admin/layout.tsx`) is the single point of
 *     authorization; this file does not double-check the session.
 *   - Translators see the placeholder copy in `messages/{en,zh}.json` instead
 *     of bleeding-through English strings.
 *
 * Each caller passes:
 *   - `titleKey`: i18n key for the H1.
 *   - `descriptionKey`: i18n key for the supporting paragraph.
 *   - `Icon` (optional): lucide icon shown next to the title.
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useT } from "@/lib/i18n-client";
import type { LucideIcon } from "lucide-react";
import { CircleDashed } from "lucide-react";

interface AdminPlaceholderPageProps {
	titleKey: string;
	descriptionKey: string;
	Icon?: LucideIcon;
}

export function AdminPlaceholderPage({
	titleKey,
	descriptionKey,
	Icon = CircleDashed,
}: AdminPlaceholderPageProps) {
	const t = useT();
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<div className="space-y-6">
			<Card>
				<CardHeader>
					<CardTitle
						className="flex items-center gap-2 text-3xl font-bold tracking-tight"
						style={headingStyle}
					>
						<Icon
							aria-hidden="true"
							className="h-7 w-7"
							style={{ color: "var(--color-primary-500)" }}
						/>
						{t(titleKey)}
					</CardTitle>
					<p className="text-sm" style={mutedTextStyle}>
						{t(descriptionKey)}
					</p>
				</CardHeader>
			</Card>

			<Card>
				<CardContent className="space-y-3 p-6">
					<p className="text-sm leading-6" style={mutedTextStyle}>
						{t(
							"This admin sub-route is reserved by the SPEC-02 dual-panel migration. The CRUD and detail UI will land in a follow-up wave; navigation and authorization are already wired so that no admin links break.",
						)}
					</p>
					<p className="text-xs" style={mutedTextStyle}>
						{t("Coming soon")}
					</p>
				</CardContent>
			</Card>
		</div>
	);
}
