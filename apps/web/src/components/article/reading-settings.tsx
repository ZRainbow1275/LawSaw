"use client";

/**
 * 阅读设置组件
 * 字体大小、行高、主题切换
 */

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
	type ContentWidth,
	type FontFamily,
	type FontSize,
	type LineHeight,
	type ReadingTheme,
	contentWidthMap,
	fontFamilyMap,
	fontSizeMap,
	lineHeightMap,
	themeMap,
	useReadingStore,
} from "@/stores/reading-store";
import { AnimatePresence, motion } from "framer-motion";
import { AlignJustify, Leaf, Moon, Sun, Type, X } from "lucide-react";
import type * as React from "react";

// ============================================
// 类型定义
// ============================================

interface ReadingSettingsProps {
	/** 是否打开 */
	open: boolean;
	/** 关闭回调 */
	onClose: () => void;
}

// ============================================
// 配置
// ============================================

const fontSizeOptions: { value: FontSize; label: string; preview: string }[] = [
	{ value: "sm", label: "小", preview: "A" },
	{ value: "md", label: "中", preview: "A" },
	{ value: "lg", label: "大", preview: "A" },
	{ value: "xl", label: "特大", preview: "A" },
];

const lineHeightOptions: { value: LineHeight; label: string }[] = [
	{ value: "compact", label: "紧凑" },
	{ value: "normal", label: "标准" },
	{ value: "relaxed", label: "宽松" },
];

const themeOptions: {
	value: ReadingTheme;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
	bg: string;
	border: string;
}[] = [
	{
		value: "light",
		label: "默认",
		icon: Sun,
		bg: "bg-white",
		border: "border-neutral-200",
	},
	{
		value: "dark",
		label: "暗色",
		icon: Moon,
		bg: "bg-neutral-900",
		border: "border-neutral-700",
	},
	{
		value: "sepia",
		label: "护眼",
		icon: Leaf,
		bg: "bg-amber-50",
		border: "border-amber-200",
	},
];

const contentWidthOptions: { value: ContentWidth; label: string }[] = [
	{ value: "narrow", label: "窄" },
	{ value: "normal", label: "标准" },
	{ value: "wide", label: "宽" },
];

const fontFamilyOptions: {
	value: FontFamily;
	label: string;
	sample: string;
}[] = [
	{ value: "sans", label: "无衬线", sample: "Aa" },
	{ value: "serif", label: "衬线体", sample: "Aa" },
];

// ============================================
// 主组件
// ============================================

export function ReadingSettings({ open, onClose }: ReadingSettingsProps) {
	const settings = useReadingStore((s) => s.settings);
	const updateSettings = useReadingStore((s) => s.updateSettings);
	const resetSettings = useReadingStore((s) => s.resetSettings);

	return (
		<AnimatePresence>
			{open && (
				<>
					{/* 遮罩 */}
					<motion.div
						initial={{ opacity: 0 }}
						animate={{ opacity: 1 }}
						exit={{ opacity: 0 }}
						onClick={onClose}
						className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm"
					/>

					{/* 设置面板 */}
					<motion.div
						initial={{ opacity: 0, y: 20, scale: 0.95 }}
						animate={{ opacity: 1, y: 0, scale: 1 }}
						exit={{ opacity: 0, y: 20, scale: 0.95 }}
						transition={{ type: "spring", damping: 25, stiffness: 300 }}
						className="fixed right-4 bottom-4 lg:right-20 lg:top-1/2 lg:-translate-y-1/2 lg:bottom-auto z-50 w-72 bg-white rounded-2xl shadow-xl border border-neutral-200 overflow-hidden"
					>
						{/* 头部 */}
						<div className="flex items-center justify-between px-4 py-3 border-b border-neutral-100">
							<h3 className="font-semibold text-neutral-900">阅读设置</h3>
							<Button variant="ghost" size="icon" onClick={onClose}>
								<X className="h-4 w-4" />
							</Button>
						</div>

						{/* 内容 */}
						<div className="p-4 space-y-6">
							{/* 字体大小 */}
							<SettingSection icon={Type} label="字体大小">
								<div className="flex gap-2">
									{fontSizeOptions.map((option) => (
										<button
											key={option.value}
											type="button"
											onClick={() => updateSettings({ fontSize: option.value })}
											className={cn(
												"flex-1 h-10 rounded-lg border text-center transition-all",
												"hover:border-primary-200",
												settings.fontSize === option.value
													? "border-primary-500 bg-primary-50 text-primary-700"
													: "border-neutral-200 text-neutral-600",
											)}
											style={{ fontSize: fontSizeMap[option.value] }}
										>
											{option.preview}
										</button>
									))}
								</div>
							</SettingSection>

							{/* 行高 */}
							<SettingSection icon={AlignJustify} label="行距">
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
													? "border-primary-500 bg-primary-50 text-primary-700"
													: "border-neutral-200 text-neutral-600",
											)}
										>
											{option.label}
										</button>
									))}
								</div>
							</SettingSection>

							{/* 主题 */}
							<SettingSection icon={Sun} label="阅读主题">
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
												<span className="text-xs text-neutral-600">
													{option.label}
												</span>
											</button>
										);
									})}
								</div>
							</SettingSection>

							{/* 阅读宽度 */}
							<SettingSection icon={AlignJustify} label="阅读宽度">
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
													? "border-primary-500 bg-primary-50 text-primary-700"
													: "border-neutral-200 text-neutral-600",
											)}
										>
											{option.label}
										</button>
									))}
								</div>
							</SettingSection>

							{/* 字体类型 */}
							<SettingSection icon={Type} label="字体">
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
													? "border-primary-500 bg-primary-50"
													: "border-neutral-200",
											)}
										>
											<span
												className={cn(
													"text-xl font-medium",
													option.value === "serif" ? "font-serif" : "font-sans",
													settings.fontFamily === option.value
														? "text-primary-700"
														: "text-neutral-700",
												)}
											>
												{option.sample}
											</span>
											<span className="text-xs text-neutral-500">
												{option.label}
											</span>
										</button>
									))}
								</div>
							</SettingSection>
						</div>

						{/* 底部 */}
						<div className="px-4 py-3 border-t border-neutral-100">
							<Button
								variant="ghost"
								size="sm"
								onClick={resetSettings}
								className="w-full text-neutral-500 hover:text-neutral-700"
							>
								重置为默认
							</Button>
						</div>
					</motion.div>
				</>
			)}
		</AnimatePresence>
	);
}

// ============================================
// 设置区块组件
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
				<Icon className="h-4 w-4 text-neutral-400" />
				<span className="text-sm font-medium text-neutral-700">{label}</span>
			</div>
			{children}
		</div>
	);
}

// ============================================
// 快捷设置条（内联版）
// ============================================

export function ReadingSettingsBar({ className }: { className?: string }) {
	const settings = useReadingStore((s) => s.settings);
	const updateSettings = useReadingStore((s) => s.updateSettings);

	return (
		<div
			className={cn(
				"flex items-center gap-4 p-2 rounded-lg bg-neutral-50 border border-neutral-100",
				className,
			)}
		>
			{/* 字体大小快捷切换 */}
			<div className="flex items-center gap-1">
				<span className="text-xs text-neutral-500 mr-1">字号</span>
				{fontSizeOptions.map((option) => (
					<button
						key={option.value}
						type="button"
						onClick={() => updateSettings({ fontSize: option.value })}
						className={cn(
							"w-7 h-7 rounded text-sm transition-all",
							settings.fontSize === option.value
								? "bg-primary-100 text-primary-700"
								: "text-neutral-500 hover:bg-neutral-100",
						)}
						style={{ fontSize: fontSizeMap[option.value] }}
					>
						A
					</button>
				))}
			</div>

			<div className="w-px h-5 bg-neutral-200" />

			{/* 主题快捷切换 */}
			<div className="flex items-center gap-1">
				{themeOptions.map((option) => {
					const Icon = option.icon;
					return (
						<button
							key={option.value}
							type="button"
							onClick={() => updateSettings({ theme: option.value })}
							className={cn(
								"w-7 h-7 rounded flex items-center justify-center transition-all",
								settings.theme === option.value
									? "bg-primary-100 text-primary-700"
									: "text-neutral-500 hover:bg-neutral-100",
							)}
						>
							<Icon className="h-4 w-4" />
						</button>
					);
				})}
			</div>
		</div>
	);
}
