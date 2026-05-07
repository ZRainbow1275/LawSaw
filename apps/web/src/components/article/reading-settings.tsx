"use client";

/**
 * Reading settings UI.
 * Font size, line height, theme, and typography preferences.
 */

import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import {
	type ContentWidth,
	type FontFamily,
	type FontSize,
	type LineHeight,
	type ReadingTheme,
	fontFamilyMap,
	fontSizeMap,
	themeMap,
	useReadingStore,
} from "@/stores/reading-store";
import { AnimatePresence, motion } from "framer-motion";
import { AlignJustify, Leaf, Moon, Sparkles, Sun, Type, X } from "lucide-react";
import type * as React from "react";

// ============================================
// Types
// ============================================

interface ReadingSettingsProps {
	/** Whether the panel is open */
	open: boolean;
	/** Close callback */
	onClose: () => void;
}

// ============================================
// Options
// ============================================

const fontSizeOptions: {
	value: FontSize;
	labelKey: string;
	preview: string;
}[] = [
	{ value: "sm", labelKey: "Small", preview: "A" },
	{ value: "md", labelKey: "Medium", preview: "A" },
	{ value: "lg", labelKey: "Large", preview: "A" },
	{ value: "xl", labelKey: "Extra large", preview: "A" },
];

const lineHeightOptions: { value: LineHeight; labelKey: string }[] = [
	{ value: "compact", labelKey: "Compact" },
	{ value: "normal", labelKey: "Normal" },
	{ value: "relaxed", labelKey: "Relaxed" },
];

const themeOptions: {
	value: ReadingTheme;
	labelKey: string;
	icon: React.ComponentType<{ className?: string }>;
	bg: string;
	border: string;
}[] = [
	{
		value: "light",
		labelKey: themeMap.light.labelKey,
		icon: Sun,
		bg: "bg-white",
		border: "border-neutral-200",
	},
	{
		value: "dark",
		labelKey: themeMap.dark.labelKey,
		icon: Moon,
		bg: "bg-neutral-900",
		border: "border-neutral-700",
	},
	{
		value: "sepia",
		labelKey: themeMap.sepia.labelKey,
		icon: Leaf,
		bg: "bg-amber-50",
		border: "border-amber-200",
	},
];

const contentWidthOptions: { value: ContentWidth; labelKey: string }[] = [
	{ value: "narrow", labelKey: "Narrow" },
	{ value: "normal", labelKey: "Normal" },
	{ value: "wide", labelKey: "Wide" },
];

const fontFamilyOptions: {
	value: FontFamily;
	labelKey: string;
	sample: string;
}[] = [
	{ value: "sans", labelKey: fontFamilyMap.sans.labelKey, sample: "Aa" },
	{ value: "serif", labelKey: fontFamilyMap.serif.labelKey, sample: "Aa" },
];

// ============================================
// Main
// ============================================

export function ReadingSettings({ open, onClose }: ReadingSettingsProps) {
	const t = useT();
	const settings = useReadingStore((s) => s.settings);
	const updateSettings = useReadingStore((s) => s.updateSettings);
	const resetSettings = useReadingStore((s) => s.resetSettings);

	return (
		<AnimatePresence>
			{open && (
				<>
					{/* Backdrop */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
						className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
					/>

					{/* Panel */}
					<motion.div
						initial={{ opacity: 0, y: 20, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 20, scale: 0.95 }}
						transition={{ type: "spring", damping: 25, stiffness: 300 }}
						className="fixed right-4 bottom-4 lg:right-20 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto z-50 w-72 bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden dark:bg-neutral-900 dark:border-white/10"
					>
						{/* Header */}
						<div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100 dark:border-white/10">
							<h3 className="font-semibold text-neutral-900 dark:text-neutral-50">
								{t("Reading settings")}
							</h3>
							<Button variant="ghost" size="icon" onClick={onClose}>
								<X aria-hidden="true" className="h-4 w-4" />
							</Button>
						</div>

						{/* Content */}
						<div className="p-4 space-y-6">
							{/* Font size */}
							<SettingSection icon={Type} label={t("Font size")}>
								<div className="flex gap-2">
									{fontSizeOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											onClick={() => updateSettings({ fontSize: option.value })}
											aria-label={t(option.labelKey)}
											className={cn(
												"flex-1 h-10 rounded-lg border text-center transition-all",
												"hover:border-primary-200",
												settings.fontSize === option.value
													? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-200"
													: "border-neutral-200 text-neutral-600 dark:border-white/10 dark:text-neutral-300",
											)}
											style={{ fontSize: fontSizeMap[option.value] }}
										>
											{option.preview}
										</button>
									))}
								</div>
							</SettingSection>

							{/* Line height */}
							<SettingSection icon={AlignJustify} label={t("Line spacing")}>
								<div className="flex gap-2">
									{lineHeightOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												updateSettings({ lineHeight: option.value })
											}
											className={cn(
												"flex-1 h-9 rounded-lg border text-sm font-medium transition-all",
												"hover:border-primary-200",
												settings.lineHeight === option.value
													? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-200"
													: "border-neutral-200 text-neutral-600 dark:border-white/10 dark:text-neutral-300",
											)}
										>
											{t(option.labelKey)}
										</button>
									))}
								</div>
							</SettingSection>

							{/* Theme */}
							<SettingSection icon={Sun} label={t("Reading theme")}>
								<div className="flex gap-2">
									{themeOptions.map((option) => {
										const Icon = option.icon;
										return (
											<button
												key={option.value}
												type="button"
												onClick={() => updateSettings({ theme: option.value })}
												className={cn(
													"flex-1 flex flex-col items-center gap-1.5 py-2 rounded-lg border transition-all",
													"hover:border-primary-200",
													settings.theme === option.value
														? "border-primary-500 ring-1 ring-primary-500/20"
														: option.border,
												)}
											>
												<div
													className={cn(
														"w-8 h-8 rounded-full flex items-center justify-center",
														option.bg,
														"border",
														option.border,
													)}
												>
													<Icon
														className={cn(
															"h-4 w-4",
															option.value === "dark"
																? "text-white"
																: "text-neutral-600",
														)}
													/>
												</div>
												<span className="text-xs text-neutral-600 dark:text-neutral-300">
													{t(option.labelKey)}
												</span>
											</button>
										);
									})}
								</div>
							</SettingSection>

							{/* Width */}
							<SettingSection icon={AlignJustify} label={t("Content width")}>
								<div className="flex gap-2">
									{contentWidthOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												updateSettings({ contentWidth: option.value })
											}
											className={cn(
												"flex-1 h-9 rounded-lg border text-sm font-medium transition-all",
												"hover:border-primary-200",
												settings.contentWidth === option.value
													? "border-primary-500 bg-primary-50 text-primary-700 dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-200"
													: "border-neutral-200 text-neutral-600 dark:border-white/10 dark:text-neutral-300",
											)}
										>
											{t(option.labelKey)}
										</button>
									))}
								</div>
							</SettingSection>

							{/* Font family */}
							<SettingSection icon={Type} label={t("Font")}>
								<div className="flex gap-2">
									{fontFamilyOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											onClick={() =>
												updateSettings({ fontFamily: option.value })
											}
											className={cn(
												"flex-1 flex flex-col items-center gap-1 py-2.5 rounded-lg border transition-all",
												"hover:border-primary-200",
												settings.fontFamily === option.value
													? "border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-500/15"
													: "border-neutral-200 dark:border-white/10",
											)}
										>
											<span
												className={cn(
													"text-xl font-medium",
													option.value === "serif" ? "font-serif" : "font-sans",
													settings.fontFamily === option.value
														? "text-primary-700 dark:text-primary-200"
														: "text-neutral-700 dark:text-neutral-200",
												)}
											>
												{option.sample}
											</span>
											<span className="text-xs text-neutral-500 dark:text-neutral-400">
												{t(option.labelKey)}
											</span>
										</button>
									))}
								</div>
							</SettingSection>

							{/* Focus mode (P3#7) */}
							<SettingSection icon={Sparkles} label={t("Focus mode")}>
								<button
									type="button"
									onClick={() =>
										updateSettings({ focusMode: !settings.focusMode })
									}
									aria-pressed={settings.focusMode}
									className={cn(
										"flex w-full items-center justify-between rounded-lg border px-3 py-2.5 text-sm transition-all",
										"hover:border-primary-200",
										settings.focusMode
											? "border-primary-500 bg-primary-50 text-primary-700"
											: "border-neutral-200 text-neutral-600",
									)}
								>
									<span className="flex flex-col items-start gap-0.5 text-left">
										<span className="font-medium">
											{settings.focusMode ? t("On") : t("Off")}
										</span>
										<span className="text-xs text-neutral-500 dark:text-neutral-400">
											{t("Dim non-central paragraphs while reading")}
										</span>
									</span>
									<span
										aria-hidden="true"
										className={cn(
											"relative inline-block h-5 w-9 shrink-0 rounded-full transition-colors",
											settings.focusMode ? "bg-primary-500" : "bg-neutral-300",
										)}
									>
										<span
											className={cn(
												"absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform",
												settings.focusMode ? "translate-x-4" : "translate-x-0.5",
											)}
										/>
									</span>
								</button>
							</SettingSection>
						</div>

						{/* Footer */}
						<div className="px-4 py-3 border-t border-neutral-100 dark:border-white/10">
							<Button
								variant="ghost"
								size="sm"
								onClick={resetSettings}
								className="w-full text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-200"
							>
								{t("Reset to defaults")}
							</Button>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

// ============================================
// Section
// ============================================

interface SettingSectionProps {
	icon: React.ComponentType<{ className?: string }>;
	label: string;
	children: React.ReactNode;
}

function SettingSection({ icon: Icon, label, children }: SettingSectionProps) {
	return (
		<div className="space-y-2">
			<div className="flex items-center gap-2">
				<Icon aria-hidden="true" className="h-4 w-4 text-neutral-400 dark:text-neutral-500" />
				<span className="text-sm font-medium text-neutral-700 dark:text-neutral-200">{label}</span>
			</div>
			{children}
		</div>
	);
}

// ============================================
// Inline bar
// ============================================

export function ReadingSettingsBar({ className }: { className?: string }) {
	const t = useT();
	const settings = useReadingStore((s) => s.settings);
	const updateSettings = useReadingStore((s) => s.updateSettings);

	return (
		<div
			className={cn(
				"flex items-center gap-4 p-2 rounded-lg bg-neutral-50 border border-neutral-100 dark:bg-white/5 dark:border-white/10",
				className,
			)}
		>
			{/* Font size */}
			<div className="flex items-center gap-1">
				<span className="text-xs text-neutral-500 dark:text-neutral-400 mr-1">{t("Font size")}</span>
				{fontSizeOptions.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => updateSettings({ fontSize: option.value })}
						aria-label={t(option.labelKey)}
						className={cn(
							"w-7 h-7 rounded text-sm transition-all",
							settings.fontSize === option.value
								? "bg-primary-100 text-primary-700 dark:bg-primary-500/20 dark:text-primary-200"
								: "text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-white/10",
						)}
						style={{ fontSize: fontSizeMap[option.value] }}
					>
						A
					</button>
				))}
			</div>

			<div className="w-px h-5 bg-neutral-200 dark:bg-white/10" />

			{/* Theme */}
			<div className="flex items-center gap-1">
				{themeOptions.map((option) => {
					const Icon = option.icon;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => updateSettings({ theme: option.value })}
							aria-label={t(option.labelKey)}
							className={cn(
								"w-7 h-7 rounded flex items-center justify-center transition-all",
								settings.theme === option.value
									? "bg-primary-100 text-primary-700"
									: "text-neutral-500 hover:bg-neutral-100",
							)}
						>
							<Icon aria-hidden="true" className="h-4 w-4" />
						</button>
					);
				})}
			</div>
		</div>
	);
}
