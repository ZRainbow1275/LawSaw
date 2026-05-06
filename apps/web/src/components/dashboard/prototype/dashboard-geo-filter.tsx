"use client";

/**
 * DashboardGeoFilter — `prototype/app.html:788-796` geo chips bar (PR1).
 *
 * 7 chip filters (Global / APAC / China / North America / Europe / MEA /
 * South America). Active chip uses neutral-800 surface; the value flows back
 * to the parent so the feed grid can apply it as a region predicate.
 */

import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";

export type GeoRegion =
	| "global"
	| "apac"
	| "china"
	| "north_america"
	| "europe"
	| "mea"
	| "latin_america";

interface Props {
	value: GeoRegion;
	onChange: (next: GeoRegion) => void;
}

export function DashboardGeoFilter({ value, onChange }: Props) {
	const t = useT();

	const chips: Array<{ id: GeoRegion; label: string }> = [
		{ id: "global", label: t("Global") },
		{ id: "apac", label: t("Asia Pacific") },
		{ id: "china", label: t("China") },
		{ id: "north_america", label: t("North America") },
		{ id: "europe", label: t("Europe") },
		{ id: "mea", label: t("MEA") },
		{ id: "latin_america", label: t("Latin America") },
	];

	return (
		<div
			className="mb-3 flex flex-wrap gap-1.5"
			role="tablist"
			aria-label={t("Global")}
		>
			{chips.map((chip) => {
				const active = chip.id === value;
				return (
					<button
						key={chip.id}
						type="button"
						role="tab"
						aria-selected={active}
						onClick={() => onChange(chip.id)}
						className={cn(
							"rounded-full border px-3.5 py-1 text-[11px] font-semibold transition-colors",
						)}
						style={
							active
								? {
										backgroundColor: "var(--color-neutral-800)",
										color: "white",
										borderColor: "var(--color-neutral-800)",
									}
								: {
										backgroundColor: "white",
										color: "var(--color-neutral-600)",
										borderColor: "var(--color-neutral-200)",
									}
						}
					>
						{chip.label}
					</button>
				);
			})}
		</div>
	);
}
