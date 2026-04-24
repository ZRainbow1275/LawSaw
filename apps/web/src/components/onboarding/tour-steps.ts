import type { LucideIcon } from "lucide-react";
import {
	ClipboardList,
	FileText,
	LayoutDashboard,
	MessageSquarePlus,
	Settings,
} from "lucide-react";

/**
 * Static onboarding tour step definitions for the end-user surface.
 *
 * Each step focuses on a concrete product capability and anchors to a real
 * route shown in the sidebar. Copy is locale-scoped so the renderer can look
 * up the correct translation via `useT()`. We intentionally reference icons
 * from Lucide (not Emoji) to comply with the design system policy.
 */
export interface OnboardingStep {
	id: string;
	icon: LucideIcon;
	/** i18n key for the step title. Keep stable — used both for rendering and analytics. */
	titleKey: string;
	/** i18n key for the multi-line description body. */
	descriptionKey: string;
	/** Deep link the user can follow to try the feature inline. */
	route: string;
	/**
	 * Optional CSS selector that visually highlights a DOM element while the
	 * step is active. The tour renderer looks up this selector at runtime and
	 * draws an overlay ring around the target, falling back to a centered
	 * card when the selector does not resolve.
	 */
	anchorSelector?: string;
}

export const ONBOARDING_STEPS: OnboardingStep[] = [
	{
		id: "dashboard",
		icon: LayoutDashboard,
		titleKey: "onboarding.dashboard.title",
		descriptionKey: "onboarding.dashboard.description",
		route: "/dashboard",
		anchorSelector: "[data-tour='sidebar-dashboard']",
	},
	{
		id: "articles",
		icon: FileText,
		titleKey: "onboarding.articles.title",
		descriptionKey: "onboarding.articles.description",
		route: "/articles",
		anchorSelector: "[data-tour='sidebar-articles']",
	},
	{
		id: "reports",
		icon: ClipboardList,
		titleKey: "onboarding.reports.title",
		descriptionKey: "onboarding.reports.description",
		route: "/reports",
		anchorSelector: "[data-tour='sidebar-reports']",
	},
	{
		id: "feedback",
		icon: MessageSquarePlus,
		titleKey: "onboarding.feedback.title",
		descriptionKey: "onboarding.feedback.description",
		route: "/feedback",
		anchorSelector: "[data-tour='sidebar-feedback']",
	},
	{
		id: "settings",
		icon: Settings,
		titleKey: "onboarding.settings.title",
		descriptionKey: "onboarding.settings.description",
		route: "/settings",
		anchorSelector: "[data-tour='sidebar-settings']",
	},
];

/**
 * Default inline fallback strings. Used when the i18n message catalog has not
 * been extended yet; the renderer prefers i18n keys first and only falls back
 * to these values when the translation is absent. Keeping Chinese copy here
 * ensures the first-render user of a fresh build never sees an English key
 * surface.
 */
export const ONBOARDING_FALLBACK_COPY: Record<
	string,
	{ title: string; description: string }
> = {
	"onboarding.dashboard": {
		title: "实时感知法规动态",
		description:
			"Dashboard 汇聚全球法规脉动:世界地图热点、时间滑块过滤、行业趋势,以及基于角色分层的资讯流。点击热点进入钻取,按日/周/月/年切换数据窗口。",
	},
	"onboarding.articles": {
		title: "文章阅读与收藏",
		description:
			"在 Articles 页面浏览筛选全部资讯,使用列表/卡片两种视图。进入文章阅读器后,可以用左侧固定目录锚点跳转,右侧快捷操作支持收藏与分享,并可在 Markdown 源视图与渲染视图之间切换。",
	},
	"onboarding.reports": {
		title: "定期与按需报告",
		description:
			"Reports 中心管理订阅制周/月/季报与按需报告。可根据权限导出 PDF/HTML,并查看报告状态流转(草稿-生成中-已审批-已发布)。",
	},
	"onboarding.feedback": {
		title: "反馈与协作",
		description:
			"遇到 Bug、需要建议、希望增加信息源时都可以通过 Feedback 提交。提交的反馈会进入管理员审核队列,进度与答复实时更新。",
	},
	"onboarding.settings": {
		title: "个性化设置",
		description:
			"Settings 面板提供主题/紧凑模式切换、通知偏好、安全选项、API 密钥与系统信息。首次使用建议先完成个人资料填写与通知偏好配置,后续可随时在这里调整。",
	},
};
