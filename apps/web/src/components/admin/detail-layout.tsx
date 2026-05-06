"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Shared admin detail-page shell aligned with the prototype mp4:
 * left main column carries the primary cards, right rail carries metadata
 * cards. Collapses to a single column below `xl` so smaller screens still
 * render the full record.
 */

interface DetailLayoutProps {
	header: ReactNode;
	main: ReactNode;
	meta?: ReactNode;
}

export function DetailLayout({ header, main, meta }: DetailLayoutProps) {
	return (
		<div className="space-y-6">
			{header}
			{meta ? (
				<div className="grid gap-6 xl:grid-cols-3">
					<div className="space-y-6 xl:col-span-2">{main}</div>
					<aside className="space-y-6 xl:col-span-1">{meta}</aside>
				</div>
			) : (
				<div className="space-y-6">{main}</div>
			)}
		</div>
	);
}

interface MetaListProps {
	title: string;
	icon?: ReactNode;
	items: ReadonlyArray<{
		label: string;
		value: ReactNode;
	}>;
}

/**
 * Right-rail metadata card. Renders a definition list of `label / value` rows
 * for fields like timestamps, ids, or scalar configuration knobs.
 */
export function MetaList({ title, icon, items }: MetaListProps) {
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	return (
		<Card>
			<CardHeader>
				<CardTitle className="flex items-center gap-2 text-base">
					{icon ?? null}
					{title}
				</CardTitle>
			</CardHeader>
			<CardContent>
				<dl className="space-y-3 text-sm">
					{items.map((item) => (
						<div key={item.label}>
							<dt
								className="text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{item.label}
							</dt>
							<dd className="mt-1 break-words" style={headingStyle}>
								{item.value}
							</dd>
						</div>
					))}
				</dl>
			</CardContent>
		</Card>
	);
}
