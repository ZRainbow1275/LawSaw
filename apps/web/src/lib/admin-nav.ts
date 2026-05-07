import {
	BarChart3,
	Bell,
	BookOpen,
	BrainCircuit,
	Building2,
	Database,
	FileSearch,
	Globe,
	Globe as GlobeIcon,
	Heart,
	Key,
	LayoutDashboard,
	type LucideIcon,
	MessageSquareText,
	Network,
	Pin,
	Settings as SettingsIcon,
	Shield,
	ShieldCheck,
	Sparkles,
	User,
} from "lucide-react";

/**
 * Single source of truth for admin workspace navigation.
 *
 * Consumed by:
 * - `components/layout/admin-shell.tsx` — grouped sidebar inside `/admin/*`
 * - `components/layout/sidebar.tsx` — flat admin shortcut list inside the
 *   client navigation (visible to tenant_admin / super_admin tiers).
 * - `app/[locale]/admin/page.tsx` — workspace tile grid landing page.
 *
 * Order mirrors `SPEC-02-DUAL-PANEL.md` §2.1.
 */

export interface AdminNavItem {
	href: string;
	labelKey: string;
	icon: LucideIcon;
}

export interface AdminNavGroup {
	titleKey: string;
	items: ReadonlyArray<AdminNavItem>;
}

export interface AdminWorkspaceTile extends AdminNavItem {
	descriptionKey: string;
	disabled?: boolean;
}

export const ADMIN_NAV_GROUPS: ReadonlyArray<AdminNavGroup> = [
	{
		titleKey: "Overview",
		items: [
			{ href: "/admin", labelKey: "Admin workspace", icon: LayoutDashboard },
		],
	},
	{
		titleKey: "Tenant operations",
		items: [
			{ href: "/admin/users", labelKey: "User directory", icon: User },
			{
				href: "/admin/relations",
				labelKey: "Authorization relations",
				icon: Network,
			},
			{
				href: "/admin/permissions",
				labelKey: "Permission matrix",
				icon: ShieldCheck,
			},
			{ href: "/admin/tenants", labelKey: "Tenants", icon: Building2 },
			{ href: "/admin/apikeys", labelKey: "API keys", icon: Key },
		],
	},
	{
		titleKey: "Content control",
		items: [
			{ href: "/admin/channels", labelKey: "Channel management", icon: Globe },
			{ href: "/admin/categories", labelKey: "Categories", icon: BookOpen },
			{ href: "/admin/banners", labelKey: "Banner management", icon: Bell },
			{ href: "/admin/pins", labelKey: "Pinned articles", icon: Pin },
			{
				href: "/admin/sources",
				labelKey: "Source registry",
				icon: GlobeIcon,
			},
		],
	},
	{
		titleKey: "Operations & telemetry",
		items: [
			{
				href: "/admin/feedbacks",
				labelKey: "Feedback desk",
				icon: MessageSquareText,
			},
			{ href: "/admin/audit", labelKey: "Audit trail", icon: FileSearch },
			{ href: "/admin/ai-usage", labelKey: "AI usage", icon: BrainCircuit },
			{
				href: "/admin/ai-governance",
				labelKey: "AI governance",
				icon: Sparkles,
			},
			{ href: "/admin/reports", labelKey: "Reports", icon: Database },
			{
				href: "/admin/knowledge",
				labelKey: "Knowledge graph",
				icon: BarChart3,
			},
			{
				href: "/admin/insights/reactions",
				labelKey: "Reaction insights",
				icon: Heart,
			},
		],
	},
];

/**
 * Flat shortcut list surfaced inside the client `Sidebar` for admin tiers.
 * Order matches the legacy hand-written list so existing accessibility
 * snapshots stay stable.
 */
export const ADMIN_SHORTCUTS: ReadonlyArray<AdminNavItem> = [
	{ href: "/admin", labelKey: "Admin workspace", icon: Shield },
	{ href: "/admin/users", labelKey: "User directory", icon: User },
	{
		href: "/admin/relations",
		labelKey: "Authorization relations",
		icon: Network,
	},
	{ href: "/admin/channels", labelKey: "Channel management", icon: Globe },
	{ href: "/admin/banners", labelKey: "Banner management", icon: Bell },
	{ href: "/admin/pins", labelKey: "Pinned articles", icon: Pin },
	{
		href: "/admin/feedbacks",
		labelKey: "Feedback desk",
		icon: MessageSquareText,
	},
	{ href: "/admin/audit", labelKey: "Audit trail", icon: FileSearch },
	{ href: "/admin/ai-usage", labelKey: "AI usage", icon: BrainCircuit },
	{ href: "/admin/apikeys", labelKey: "API keys", icon: Key },
	{ href: "/admin/reports", labelKey: "Reports", icon: Database },
	{ href: "/admin/knowledge", labelKey: "Knowledge graph", icon: BarChart3 },
];

/**
 * Workspace tile grid rendered on the `/admin` landing page.
 * Tiles flagged `disabled: true` render in a muted "coming soon" state.
 */
export const ADMIN_WORKSPACE_TILES: ReadonlyArray<AdminWorkspaceTile> = [
	{
		href: "/admin/users",
		labelKey: "User directory",
		descriptionKey: "Browse tenant users and latest account activity.",
		icon: User,
	},
	{
		href: "/admin/relations",
		labelKey: "Authorization relations",
		descriptionKey: "Inspect and mutate ReBAC tuples.",
		icon: Shield,
	},
	{
		href: "/admin/channels",
		labelKey: "Channel management",
		descriptionKey:
			"Manage visibility channels mapped to content categories.",
		icon: Globe,
	},
	{
		href: "/admin/banners",
		labelKey: "Banner management",
		descriptionKey: "Operate banner lifecycle and targeting scope.",
		icon: Bell,
	},
	{
		href: "/admin/pins",
		labelKey: "Pinned articles",
		descriptionKey: "Control editorial pinning priority and placement.",
		icon: Pin,
	},
	{
		href: "/admin/feedbacks",
		labelKey: "Feedback desk",
		descriptionKey: "Review and resolve user feedback.",
		icon: MessageSquareText,
	},
	{
		href: "/admin/audit",
		labelKey: "Audit trail",
		descriptionKey: "Review state transitions and operator actions.",
		icon: FileSearch,
	},
	{
		href: "/admin/ai-usage",
		labelKey: "AI usage",
		descriptionKey: "Monitor model usage, rerank activity, and latency.",
		icon: BrainCircuit,
	},
	{
		href: "/admin/apikeys",
		labelKey: "API keys",
		descriptionKey: "Govern integration secrets and access scopes.",
		icon: Key,
	},
	{
		href: "/admin/reports",
		labelKey: "Reports",
		descriptionKey: "Operate report templates and delivery workflows.",
		icon: Database,
	},
	{
		href: "/admin/knowledge",
		labelKey: "Knowledge graph",
		descriptionKey:
			"Govern entity quality, duplicates, and retrieval analytics.",
		icon: Network,
	},
	{
		href: "/admin/permissions",
		labelKey: "Permission matrix",
		descriptionKey: "Visualize roles, permissions, and resource scopes.",
		icon: Shield,
	},
	{
		href: "/admin/sources",
		labelKey: "Source registry",
		descriptionKey: "Manage crawlers, ingestion sources, and health.",
		icon: BookOpen,
	},
	{
		href: "/admin/ai-governance",
		labelKey: "AI governance",
		descriptionKey: "Configure quotas, prompt versions, and model policy.",
		icon: BarChart3,
	},
	{
		href: "/admin/settings",
		labelKey: "Tenant settings",
		descriptionKey: "Tenant-level webhooks, notifications, and identity.",
		icon: SettingsIcon,
	},
	{
		href: "/admin/insights/reactions",
		labelKey: "Reaction insights",
		descriptionKey:
			"Inspect like / dislike traffic, controversy, and source health across articles.",
		icon: Heart,
	},
];
