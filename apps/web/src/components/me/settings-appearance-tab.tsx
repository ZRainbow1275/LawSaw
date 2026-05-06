"use client";

/**
 * SettingsAppearanceTab — `/me/settings` Appearance pane.
 * Mirrors `prototype/app.html:1701-1722` (主题模式 / 界面语言 / 紧凑模式).
 *
 * Theme + compactMode persist via `useAppearanceStore`. Language switch
 * uses `useLocale` + `router.replace` to swap the leading `/zh|/en` path
 * segment so the next render renders the new locale.
 */

import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { SUPPORTED_LOCALES, type Locale } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import {
	type AppearanceTheme,
	useAppearanceStore,
} from "@/stores/appearance-store";
import { motion } from "framer-motion";
import { Check, Monitor, Moon, Palette, Sun } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback } from "react";

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 10 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.3, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

interface ThemeChoice {
	value: AppearanceTheme;
	labelKey: string;
	Icon: typeof Sun;
}

const THEME_CHOICES: ReadonlyArray<ThemeChoice> = [
	{ value: "light", labelKey: "Light", Icon: Sun },
	{ value: "dark", labelKey: "Dark", Icon: Moon },
	{ value: "system", labelKey: "Follow system", Icon: Monitor },
];

export function SettingsAppearanceTab() {
	const t = useT();
	const locale = useLocale();
	const router = useRouter();
	const pathname = usePathname();
	const appearance = useAppearanceStore((state) => state.appearance);
	const setAppearance = useAppearanceStore((state) => state.setAppearance);

	const handleThemeChange = useCallback(
		(theme: AppearanceTheme) => {
			setAppearance({ ...appearance, theme });
		},
		[appearance, setAppearance],
	);

	const handleCompactToggle = useCallback(() => {
		setAppearance({ ...appearance, compactMode: !appearance.compactMode });
	}, [appearance, setAppearance]);

	const handleLocaleChange = useCallback(
		(next: Locale) => {
			if (next === locale) return;
			const segments = pathname.split("/").filter(Boolean);
			if (segments.length === 0) {
				router.replace(`/${next}`);
				return;
			}
			segments[0] = next;
			const target = `/${segments.join("/")}`;
			router.replace(target);
		},
		[locale, pathname, router],
	);

	const localeLabels: Record<Locale, string> = {
		zh: "简体中文",
		en: "English",
	};

	return (
		<motion.div
			className="space-y-5"
			variants={containerVariants}
			initial="hidden"
			animate="visible"
		>
			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 text-base">
							<Palette
								aria-hidden="true"
								className="h-4 w-4"
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Theme mode")}
						</CardTitle>
						<CardDescription>
							{t("Choose a light, dark, or system-following theme")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div
							className="flex flex-wrap gap-2"
							role="radiogroup"
							aria-label={t("Theme mode")}
						>
							{THEME_CHOICES.map((choice) => {
								const active = appearance.theme === choice.value;
								return (
									<button
										key={choice.value}
										type="button"
										role="radio"
										aria-checked={active}
										onClick={() => handleThemeChange(choice.value)}
										className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
										style={{
											borderColor: active
												? "var(--color-primary-500)"
												: "var(--color-neutral-200)",
											backgroundColor: active
												? "var(--color-primary-50)"
												: "transparent",
											color: active
												? "var(--color-primary-700)"
												: "var(--color-neutral-700)",
										}}
									>
										<choice.Icon aria-hidden="true" className="h-4 w-4" />
										{t(choice.labelKey)}
										{active ? (
											<Check aria-hidden="true" className="h-3.5 w-3.5" />
										) : null}
									</button>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</motion.div>

			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">
							{t("Interface language")}
						</CardTitle>
						<CardDescription>
							{t("Switch the UI between simplified Chinese and English")}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<div className="flex flex-wrap gap-2">
							{SUPPORTED_LOCALES.map((value) => {
								const active = locale === value;
								return (
									<button
										key={value}
										type="button"
										onClick={() => handleLocaleChange(value)}
										aria-pressed={active}
										className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors"
										style={{
											borderColor: active
												? "var(--color-primary-500)"
												: "var(--color-neutral-200)",
											backgroundColor: active
												? "var(--color-primary-50)"
												: "transparent",
											color: active
												? "var(--color-primary-700)"
												: "var(--color-neutral-700)",
										}}
									>
										{localeLabels[value]}
										{active ? (
											<Check aria-hidden="true" className="h-3.5 w-3.5" />
										) : null}
									</button>
								);
							})}
						</div>
					</CardContent>
				</Card>
			</motion.div>

			<motion.div variants={itemVariants}>
				<Card>
					<CardHeader>
						<CardTitle className="text-base">{t("Compact mode")}</CardTitle>
						<CardDescription>
							{t(
								"Reduce spacing and font sizes to show more content per screen",
							)}
						</CardDescription>
					</CardHeader>
					<CardContent>
						<label className="flex items-center justify-between gap-4">
							<span
								className="text-sm font-medium"
								style={{ color: "var(--color-neutral-800)" }}
							>
								{t("Enable compact mode")}
							</span>
							<input
								type="checkbox"
								checked={appearance.compactMode}
								onChange={handleCompactToggle}
								className="h-5 w-5"
								style={{ accentColor: "var(--color-primary-500)" }}
								aria-label={t("Enable compact mode")}
							/>
						</label>
					</CardContent>
				</Card>
			</motion.div>
		</motion.div>
	);
}
