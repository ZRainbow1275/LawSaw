"use client";

/**
 * Reads design-system CSS tokens at runtime so that recharts charts pick up
 * dark-mode swaps without us hard-coding hex literals.
 *
 * The hook re-reads tokens on:
 *  - mount
 *  - `class` attribute changes on `<html>` (light/dark theme toggle path)
 *
 * Returns a stable shape so panels can destructure once.
 */

import { useEffect, useState } from "react";

export interface ReactionChartTokens {
	likeColor: string;
	dislikeColor: string;
	gridColor: string;
	axisColor: string;
	tooltipBg: string;
	tooltipBorder: string;
	tooltipText: string;
	categoryPalette: string[];
}

const FALLBACK: ReactionChartTokens = {
	likeColor: "#22c55e",
	dislikeColor: "#ef4444",
	gridColor: "#e5e7eb",
	axisColor: "#6b7280",
	tooltipBg: "#ffffff",
	tooltipBorder: "#e5e7eb",
	tooltipText: "#111827",
	categoryPalette: [
		"#3498db",
		"#9b59b6",
		"#e74c3c",
		"#f39c12",
		"#27ae60",
		"#1abc9c",
		"#e91e63",
		"#795548",
		"#ff5722",
		"#2196f3",
	],
};

const CAT_VARS = [
	"--cat-legislation",
	"--cat-regulation",
	"--cat-enforcement",
	"--cat-industry",
	"--cat-compliance",
	"--cat-data-trends",
	"--cat-security",
	"--cat-academic",
	"--cat-major-events",
	"--cat-international",
] as const;

function readVar(style: CSSStyleDeclaration, name: string, fallback: string): string {
	const value = style.getPropertyValue(name).trim();
	return value.length > 0 ? value : fallback;
}

function snapshot(): ReactionChartTokens {
	if (typeof window === "undefined") return FALLBACK;
	const style = window.getComputedStyle(document.documentElement);
	const palette = CAT_VARS.map((name, idx) =>
		readVar(style, name, FALLBACK.categoryPalette[idx]),
	);
	return {
		likeColor: readVar(style, "--color-success", FALLBACK.likeColor),
		dislikeColor: readVar(style, "--color-error", FALLBACK.dislikeColor),
		gridColor: readVar(
			style,
			"--surface-muted-border",
			FALLBACK.gridColor,
		),
		axisColor: readVar(
			style,
			"--surface-muted-text",
			FALLBACK.axisColor,
		),
		tooltipBg: readVar(style, "--color-card", FALLBACK.tooltipBg),
		tooltipBorder: readVar(
			style,
			"--surface-muted-border",
			FALLBACK.tooltipBorder,
		),
		tooltipText: readVar(
			style,
			"--field-foreground",
			FALLBACK.tooltipText,
		),
		categoryPalette: palette,
	};
}

export function useReactionChartTokens(): ReactionChartTokens {
	const [tokens, setTokens] = useState<ReactionChartTokens>(FALLBACK);

	useEffect(() => {
		setTokens(snapshot());

		if (typeof MutationObserver === "undefined") return;
		const root = document.documentElement;
		const observer = new MutationObserver(() => {
			setTokens(snapshot());
		});
		observer.observe(root, { attributes: true, attributeFilter: ["class", "data-theme"] });
		return () => observer.disconnect();
	}, []);

	return tokens;
}
