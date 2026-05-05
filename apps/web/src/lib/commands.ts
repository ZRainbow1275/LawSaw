import { type Locale, withLocalePath } from "@/lib/i18n";
import type {
	AppearancePreferences,
	AppearanceTheme,
} from "@/stores/appearance-store";
import { useOnboardingStore } from "@/stores/onboarding-store";
import {
	BarChart3,
	BookOpen,
	Compass,
	FileText,
	Home,
	KeyRound,
	Languages,
	Layers,
	LayoutDashboard,
	LifeBuoy,
	LogOut,
	type LucideIcon,
	MessageSquarePlus,
	Newspaper,
	PanelLeft,
	Radio,
	Search,
	Settings,
	Shield,
	SlidersHorizontal,
	Sparkles,
	Sun,
	TableProperties,
} from "lucide-react";

export type CommandCategory = "navigate" | "action" | "settings" | "help";

export interface CommandContext {
	locale: Locale;
	pathname: string;
	router: {
		push: (href: string) => void;
		replace: (href: string) => void;
	};
	appearance: AppearancePreferences;
	setAppearance: (next: AppearancePreferences) => void;
	toggleSidebar: () => void;
	switchLocale: () => void;
	logout: () => void | Promise<void>;
	openShortcutsHelp: () => void;
	closePalette: () => void;
}

export interface Command {
	id: string;
	title: string;
	titleEn: string;
	keywords?: string[];
	category: CommandCategory;
	icon?: LucideIcon;
	shortcut?: string;
	run: (ctx: CommandContext) => void | Promise<void>;
}

interface NavigationCommandSpec {
	id: string;
	title: string;
	titleEn: string;
	href: string;
	icon: LucideIcon;
	shortcut?: string;
}

const navigationCommandSpecs: NavigationCommandSpec[] = [
	{
		id: "navigate.dashboard",
		title: "数据看板",
		titleEn: "Dashboard",
		href: "/dashboard",
		icon: LayoutDashboard,
	},
	{
		id: "navigate.feed",
		title: "我的订阅",
		titleEn: "My feed",
		href: "/me/feed",
		icon: Home,
	},
	{
		id: "navigate.articles",
		title: "资讯",
		titleEn: "Articles",
		href: "/articles",
		icon: Newspaper,
	},
	{
		id: "navigate.reports",
		title: "报告",
		titleEn: "Reports",
		href: "/reports",
		icon: FileText,
	},
	{
		id: "navigate.analytics",
		title: "统计分析",
		titleEn: "Analytics",
		href: "/analytics",
		icon: BarChart3,
	},
	{
		id: "navigate.knowledge",
		title: "知识图谱",
		titleEn: "Knowledge graph",
		href: "/knowledge",
		icon: BookOpen,
	},
	{
		id: "navigate.feedback",
		title: "留言反馈",
		titleEn: "Feedback",
		href: "/feedback",
		icon: MessageSquarePlus,
	},
	{
		id: "navigate.sources",
		title: "信息源管理",
		titleEn: "Sources",
		href: "/sources",
		icon: Radio,
	},
	{
		id: "navigate.data",
		title: "数据视图",
		titleEn: "Data explorer",
		href: "/data",
		icon: TableProperties,
	},
	{
		id: "navigate.search",
		title: "搜索",
		titleEn: "Search",
		href: "/search",
		icon: Search,
	},
	{
		id: "navigate.settings",
		title: "系统设置",
		titleEn: "Settings",
		href: "/settings",
		icon: Settings,
	},
];

interface SettingsCommandSpec {
	id: string;
	title: string;
	titleEn: string;
	tab: string;
	icon: LucideIcon;
}

const settingsCommandSpecs: SettingsCommandSpec[] = [
	{
		id: "settings.profile",
		title: "打开设置 · 账户资料",
		titleEn: "Settings — Profile",
		tab: "profile",
		icon: Compass,
	},
	{
		id: "settings.notifications",
		title: "打开设置 · 通知",
		titleEn: "Settings — Notifications",
		tab: "notifications",
		icon: MessageSquarePlus,
	},
	{
		id: "settings.appearance",
		title: "打开设置 · 外观",
		titleEn: "Settings — Appearance",
		tab: "appearance",
		icon: SlidersHorizontal,
	},
	{
		id: "settings.security",
		title: "打开设置 · 安全",
		titleEn: "Settings — Security",
		tab: "security",
		icon: Shield,
	},
	{
		id: "settings.api",
		title: "打开设置 · API 密钥",
		titleEn: "Settings — API keys",
		tab: "api",
		icon: KeyRound,
	},
	{
		id: "settings.system",
		title: "打开设置 · 系统信息",
		titleEn: "Settings — System info",
		tab: "system",
		icon: Layers,
	},
];

function cycleTheme(theme: AppearanceTheme): AppearanceTheme {
	if (theme === "light") return "dark";
	if (theme === "dark") return "system";
	return "light";
}

export function builtinCommands(): Command[] {
	const commands: Command[] = [];

	for (const spec of navigationCommandSpecs) {
		commands.push({
			id: spec.id,
			title: spec.title,
			titleEn: spec.titleEn,
			category: "navigate",
			icon: spec.icon,
			shortcut: spec.shortcut,
			keywords: ["go", "navigate", "jump", "转到", "跳转"],
			run: (ctx) => {
				ctx.closePalette();
				ctx.router.push(withLocalePath(ctx.locale, spec.href));
			},
		});
	}

	for (const spec of settingsCommandSpecs) {
		commands.push({
			id: spec.id,
			title: spec.title,
			titleEn: spec.titleEn,
			category: "settings",
			icon: spec.icon,
			keywords: ["settings", "preferences", "配置"],
			run: (ctx) => {
				ctx.closePalette();
				ctx.router.push(
					withLocalePath(ctx.locale, `/settings?tab=${spec.tab}`),
				);
			},
		});
	}

	commands.push({
		id: "action.theme.toggle",
		title: "切换主题",
		titleEn: "Toggle theme",
		category: "action",
		keywords: ["light", "dark", "system", "外观", "主题", "颜色"],
		icon: Sun,
		run: (ctx) => {
			const next: AppearancePreferences = {
				...ctx.appearance,
				theme: cycleTheme(ctx.appearance.theme),
			};
			ctx.setAppearance(next);
			ctx.closePalette();
		},
	});

	commands.push({
		id: "action.theme.cycle-indicator",
		title: "主题状态",
		titleEn: "Theme status",
		category: "action",
		icon: Sun,
		keywords: ["theme", "mode", "主题"],
		run: (ctx) => {
			const next: AppearancePreferences = {
				...ctx.appearance,
				theme: cycleTheme(ctx.appearance.theme),
			};
			ctx.setAppearance(next);
			ctx.closePalette();
		},
	});

	commands.push({
		id: "action.compact-mode.toggle",
		title: "切换紧凑密度",
		titleEn: "Toggle compact density",
		category: "action",
		keywords: ["density", "compact", "comfortable", "密度", "紧凑"],
		icon: SlidersHorizontal,
		run: (ctx) => {
			const next: AppearancePreferences = {
				...ctx.appearance,
				compactMode: !ctx.appearance.compactMode,
			};
			ctx.setAppearance(next);
			ctx.closePalette();
		},
	});

	commands.push({
		id: "action.sidebar.toggle",
		title: "折叠/展开侧边栏",
		titleEn: "Toggle sidebar",
		category: "action",
		keywords: ["sidebar", "nav", "drawer", "侧栏"],
		icon: PanelLeft,
		shortcut: "Ctrl+B",
		run: (ctx) => {
			ctx.toggleSidebar();
			ctx.closePalette();
		},
	});

	commands.push({
		id: "action.locale.switch",
		title: "切换语言 (中 / EN)",
		titleEn: "Switch language (EN / 中)",
		category: "action",
		keywords: ["language", "locale", "语言", "翻译"],
		icon: Languages,
		run: (ctx) => {
			ctx.switchLocale();
			ctx.closePalette();
		},
	});

	commands.push({
		id: "action.shortcuts.help",
		title: "查看全部快捷键",
		titleEn: "View all shortcuts",
		category: "help",
		keywords: ["keyboard", "shortcut", "help", "快捷键", "键盘"],
		icon: LifeBuoy,
		shortcut: "Ctrl+/",
		run: (ctx) => {
			ctx.closePalette();
			ctx.openShortcutsHelp();
		},
	});

	commands.push({
		id: "action.onboarding.rerun",
		title: "重新查看新手引导",
		titleEn: "Re-run onboarding tour",
		category: "help",
		keywords: [
			"onboarding",
			"tour",
			"guide",
			"tutorial",
			"intro",
			"引导",
			"教程",
			"新手",
		],
		icon: Sparkles,
		run: (ctx) => {
			const store = useOnboardingStore.getState();
			store.reset();
			store.open();
			ctx.closePalette();
		},
	});

	commands.push({
		id: "action.logout",
		title: "退出登录",
		titleEn: "Sign out",
		category: "action",
		keywords: ["logout", "signout", "退出"],
		icon: LogOut,
		run: async (ctx) => {
			ctx.closePalette();
			await ctx.logout();
			ctx.router.push(withLocalePath(ctx.locale, "/login"));
		},
	});

	return commands;
}

export function navigationHrefs(): string[] {
	return navigationCommandSpecs.map((spec) => spec.href);
}

export function matchCommand(command: Command, query: string): number {
	const normalized = query.trim().toLowerCase();
	if (!normalized) return 1;

	const titleLower = command.title.toLowerCase();
	const titleEnLower = command.titleEn.toLowerCase();
	const keywords = (command.keywords ?? []).map((k) => k.toLowerCase());

	if (titleLower === normalized || titleEnLower === normalized) return 1000;

	let score = 0;
	if (titleLower.startsWith(normalized)) score += 500;
	if (titleEnLower.startsWith(normalized)) score += 500;
	if (titleLower.includes(normalized)) score += 220;
	if (titleEnLower.includes(normalized)) score += 200;

	for (const keyword of keywords) {
		if (keyword === normalized) score += 140;
		else if (keyword.startsWith(normalized)) score += 90;
		else if (keyword.includes(normalized)) score += 40;
	}

	if (score === 0) {
		const tokens = normalized.split(/\s+/u).filter(Boolean);
		if (tokens.length > 1) {
			const allHit = tokens.every(
				(token) =>
					titleLower.includes(token) ||
					titleEnLower.includes(token) ||
					keywords.some((keyword) => keyword.includes(token)),
			);
			if (allHit) score += 80;
		}
	}

	if (score === 0 && titleLower.replaceAll(/\s+/gu, "").includes(normalized)) {
		score += 20;
	}

	return score;
}

export function filterAndRankCommands(
	commands: Command[],
	query: string,
): Command[] {
	if (!query.trim()) return commands;
	const scored = commands.map((command, index) => ({
		command,
		score: matchCommand(command, query),
		index,
	}));

	const matched = scored
		.filter((entry) => entry.score > 0)
		.sort((a, b) => {
			if (b.score !== a.score) return b.score - a.score;
			return a.index - b.index;
		});

	return matched.map((entry) => entry.command);
}

export const COMMAND_PALETTE_RECENT_KEY = "lawsaw.commandpalette.recent";
export const COMMAND_PALETTE_RECENT_MAX = 8;

export function readRecentCommandIds(
	storage: Pick<Storage, "getItem">,
): string[] {
	try {
		const raw = storage.getItem(COMMAND_PALETTE_RECENT_KEY);
		if (!raw) return [];
		const parsed = JSON.parse(raw) as unknown;
		if (!Array.isArray(parsed)) return [];
		return parsed
			.filter((entry): entry is string => typeof entry === "string")
			.slice(0, COMMAND_PALETTE_RECENT_MAX);
	} catch {
		return [];
	}
}

export function writeRecentCommandIds(
	storage: Pick<Storage, "setItem">,
	ids: string[],
): void {
	try {
		storage.setItem(
			COMMAND_PALETTE_RECENT_KEY,
			JSON.stringify(ids.slice(0, COMMAND_PALETTE_RECENT_MAX)),
		);
	} catch {
		// ignore — storage may be unavailable (Safari private, quota)
	}
}

export function appendRecentCommandId(
	ids: readonly string[],
	id: string,
): string[] {
	const filtered = ids.filter((entry) => entry !== id);
	filtered.unshift(id);
	return filtered.slice(0, COMMAND_PALETTE_RECENT_MAX);
}

export interface ShortcutDescriptor {
	id: string;
	combo: string[];
	titleZh: string;
	titleEn: string;
	groupZh: string;
	groupEn: string;
	groupKey: "navigation" | "search" | "reader" | "system" | "platform";
}

export const REGISTERED_SHORTCUTS: ShortcutDescriptor[] = [
	{
		id: "global.search",
		combo: ["Ctrl", "K"],
		titleZh: "打开全局搜索",
		titleEn: "Open global search",
		groupZh: "搜索",
		groupEn: "Search",
		groupKey: "search",
	},
	{
		id: "global.command-palette",
		combo: ["Ctrl", "Shift", "P"],
		titleZh: "打开命令面板",
		titleEn: "Open command palette",
		groupZh: "系统",
		groupEn: "System",
		groupKey: "system",
	},
	{
		id: "global.shortcuts-help",
		combo: ["Ctrl", "/"],
		titleZh: "显示快捷键面板",
		titleEn: "Show shortcut reference",
		groupZh: "系统",
		groupEn: "System",
		groupKey: "system",
	},
	{
		id: "global.sidebar-toggle",
		combo: ["Ctrl", "B"],
		titleZh: "折叠/展开侧边栏",
		titleEn: "Toggle sidebar",
		groupZh: "导航",
		groupEn: "Navigation",
		groupKey: "navigation",
	},
	{
		id: "global.save",
		combo: ["Ctrl", "S"],
		titleZh: "保存当前内容",
		titleEn: "Save current content",
		groupZh: "系统",
		groupEn: "System",
		groupKey: "system",
	},
	{
		id: "reader.markdown.heading1",
		combo: ["Ctrl", "1"],
		titleZh: "插入一级标题（Markdown 编辑器）",
		titleEn: "Insert heading 1 (Markdown editor)",
		groupZh: "阅读器",
		groupEn: "Reader",
		groupKey: "reader",
	},
	{
		id: "reader.markdown.heading2",
		combo: ["Ctrl", "2"],
		titleZh: "插入二级标题（Markdown 编辑器）",
		titleEn: "Insert heading 2 (Markdown editor)",
		groupZh: "阅读器",
		groupEn: "Reader",
		groupKey: "reader",
	},
	{
		id: "reader.markdown.bold",
		combo: ["Ctrl", "B"],
		titleZh: "加粗选中文本（Markdown 编辑器）",
		titleEn: "Bold selection (Markdown editor)",
		groupZh: "阅读器",
		groupEn: "Reader",
		groupKey: "reader",
	},
	{
		id: "reader.markdown.link",
		combo: ["Ctrl", "K"],
		titleZh: "插入链接（Markdown 编辑器）",
		titleEn: "Insert link (Markdown editor)",
		groupZh: "阅读器",
		groupEn: "Reader",
		groupKey: "reader",
	},
	{
		id: "knowledge.graph.zoom",
		combo: ["Ctrl", "Scroll"],
		titleZh: "缩放知识图谱",
		titleEn: "Zoom knowledge graph",
		groupZh: "阅读器",
		groupEn: "Reader",
		groupKey: "reader",
	},
	{
		id: "global.dismiss",
		combo: ["Esc"],
		titleZh: "关闭当前浮层",
		titleEn: "Dismiss open overlay",
		groupZh: "系统",
		groupEn: "System",
		groupKey: "system",
	},
];

export function shortcutGroupTitle(
	group: ShortcutDescriptor["groupKey"],
	locale: Locale,
): string {
	const map: Record<
		ShortcutDescriptor["groupKey"],
		{ zh: string; en: string }
	> = {
		navigation: { zh: "导航", en: "Navigation" },
		search: { zh: "搜索", en: "Search" },
		reader: { zh: "阅读器", en: "Reader" },
		system: { zh: "系统", en: "System" },
		platform: { zh: "平台", en: "Platform" },
	};
	return locale === "zh" ? map[group].zh : map[group].en;
}

export function groupedShortcuts(locale: Locale): Array<{
	key: ShortcutDescriptor["groupKey"];
	title: string;
	items: ShortcutDescriptor[];
}> {
	const groupsMap = new Map<
		ShortcutDescriptor["groupKey"],
		ShortcutDescriptor[]
	>();
	for (const descriptor of REGISTERED_SHORTCUTS) {
		const bucket = groupsMap.get(descriptor.groupKey);
		if (bucket) {
			bucket.push(descriptor);
		} else {
			groupsMap.set(descriptor.groupKey, [descriptor]);
		}
	}
	const order: ShortcutDescriptor["groupKey"][] = [
		"navigation",
		"search",
		"reader",
		"system",
		"platform",
	];
	return order
		.filter((key) => groupsMap.has(key))
		.map((key) => ({
			key,
			title: shortcutGroupTitle(key, locale),
			items: groupsMap.get(key) ?? [],
		}));
}

export type { LucideIcon };
