export const SUPPORTED_LOCALES = ["zh", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "zh";
export const LOCALE_COOKIE_NAME = "LAW_EYE_LOCALE";

export function isLocale(value: unknown): value is Locale {
	return (
		typeof value === "string" &&
		(SUPPORTED_LOCALES as readonly string[]).includes(value)
	);
}

export function localeFromPathname(pathname: string): Locale {
	const segments = pathname.split("/").filter(Boolean);
	const maybeLocale = segments[0];
	return isLocale(maybeLocale) ? maybeLocale : DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
	const segments = pathname.split("/").filter(Boolean);
	const maybeLocale = segments[0];
	if (!isLocale(maybeLocale)) return pathname || "/";
	const rest = segments.slice(1).join("/");
	return rest ? `/${rest}` : "/";
}

export function bcp47(locale: Locale): string {
	switch (locale) {
		case "en":
			return "en-US";
		case "zh":
			return "zh-CN";
	}
}

export function withLocalePath(locale: Locale, href: string): string {
	if (href.startsWith("http://") || href.startsWith("https://")) return href;

	const normalized = href.startsWith("/") ? href : `/${href}`;
	const firstSegment = normalized.split("/").filter(Boolean)[0];
	if (isLocale(firstSegment)) return normalized;

	if (normalized === "/") return `/${locale}`;
	return `/${locale}${normalized}`;
}

function parseAcceptLanguage(value: string | null): Locale {
	if (!value) return DEFAULT_LOCALE;
	const lowered = value.toLowerCase();

	// Minimal parsing: prefer explicit "en" over "zh" when present.
	// We intentionally keep this lightweight for Edge runtime compatibility.
	const hasEn = /\ben(-|;|,|$)/.test(lowered);
	const hasZh = /\bzh(-|;|,|$)/.test(lowered);
	if (hasEn && !hasZh) return "en";
	if (hasZh && !hasEn) return "zh";

	// Fallback: choose the first language tag.
	const first = lowered.split(",")[0]?.trim() ?? "";
	if (first.startsWith("en")) return "en";
	if (first.startsWith("zh")) return "zh";
	return DEFAULT_LOCALE;
}

export function detectLocale(options: {
	pathname?: string;
	cookieLocale?: string | null;
	acceptLanguage?: string | null;
}): Locale {
	if (options.pathname) {
		const fromPath = localeFromPathname(options.pathname);
		if (fromPath) return fromPath;
	}

	if (isLocale(options.cookieLocale)) return options.cookieLocale;
	return parseAcceptLanguage(options.acceptLanguage ?? null);
}

export type TranslationParams = Record<string, string | number>;

const EN_TRANSLATIONS: Record<string, string> = {
	"法眼 | Law Eye": "Law Eye",
	法眼: "Law Eye",
	数据看板: "Dashboard",
	信息源管理: "Sources",
	信息源: "Sources",
	全部资讯: "All articles",
	统计分析: "Analytics",
	数据管理: "Data",
	留言反馈: "Feedback",
	系统设置: "Settings",
	登录: "Sign in",
	注册: "Sign up",
	设置: "Settings",
	搜索: "Search",
	反馈: "Feedback",
	知识图谱: "Knowledge Graph",
	文章: "Articles",
	从未: "Never",
	刚刚: "Just now",
	今天: "Today",
	昨天: "Yesterday",
	"{count} 分钟前": "{count} minutes ago",
	"{count} 小时前": "{count} hours ago",
	"{count} 天前": "{count} days ago",
	异常: "Error",
	检测中: "Checking",
	全部正常: "All good",
	部分未配置: "Partially configured",
	部分异常: "Degraded",
	系统状态: "System status",
	实时监控法律资讯动态与系统运行状态:
		"Monitor legal updates and system health in real time",
	"API 服务": "API service",
	"在线（v{version}）": "Online (v{version})",
	采集服务: "Ingestion service",
	"信息源 {count} 个可用": "{count} sources available",
	"AI 服务": "AI service",
	已启用: "Enabled",
	"未配置（需设置 AI API Key）": "Not configured (set AI API key)",
	数据库: "Database",
	"可用（articles/stats OK）": "Available (articles/stats OK)",
	用户: "User",
	打开导航菜单: "Open navigation",
	全局搜索关键词: "Global search keywords",
	"搜索资讯、法规、关键词...": "Search news, regulations, keywords...",
	执行全局搜索: "Run search",
	通知设置: "Notifications",
	退出登录: "Sign out",
	切换语言: "Switch language",
	页面不存在: "Page not found",
	"你访问的页面不存在，可能已被移动或删除。":
		"The page you are looking for doesn't exist. It may have been moved or deleted.",
	返回首页: "Back to home",
	去搜索: "Go to search",
	出现错误: "Something went wrong",
	"页面渲染时发生错误，请重试；若持续发生，请联系管理员。":
		"An error occurred while rendering the page. Please try again. If it keeps happening, contact an administrator.",
	错误详情: "Error details",
	错误标识: "Error ID",
	"API 契约校验失败：{detail}": "API contract validation failed: {detail}",
	导航: "Navigation",
	关闭导航菜单: "Close navigation",
	"{count} 板块": "{count} categories",
	板块加载中: "Loading categories",
	板块加载失败: "Failed to load categories",
	"无法加载板块数据（请检查 API / 登录状态）。":
		"Unable to load categories (check API / login status).",
	重试: "Retry",
	收起菜单: "Collapse menu",
	主导航: "Primary navigation",
	登录已过期: "Session expired",
	请重新登录后继续操作: "Please sign in again to continue.",
	权限不足: "Permission denied",
	您没有访问该资源的权限: "You don't have permission to access this resource.",
	数据已更新: "Data updated",
	"该数据已被其他操作更新，请刷新后重试":
		"This data was updated elsewhere. Please refresh and try again.",
	处理冲突: "Resolve",
	需要刷新数据: "Refresh required",
	请刷新后重新提交，以避免覆盖其他更改:
		"Please refresh and submit again to avoid overwriting other changes.",
	检测到并发冲突: "Concurrency conflict detected",
	"该数据已被其他操作更新。请刷新后重新提交，或查看详情后选择处理方式。":
		"This data was updated elsewhere. Refresh and submit again, or view details to choose how to proceed.",
	冲突信息: "Conflict info",
	调试详情: "Debug details",
	复制详情: "Copy details",
	强制刷新页面: "Hard refresh",
	刷新数据: "Refresh data",
	已复制: "Copied",
	冲突详情已复制到剪贴板: "Conflict details copied to clipboard.",
	复制失败: "Copy failed",
	浏览器禁止访问剪贴板，请手动复制:
		"Clipboard access is blocked by the browser. Please copy manually.",
	网络异常: "Network issue",
	"请求未完成，请检查网络或稍后重试":
		"Request did not complete. Check your network and try again.",
	"登录失败，请重试": "Sign in failed. Please try again.",
	"注册失败，请重试": "Sign up failed. Please try again.",
	"网络异常，请稍后重试": "Network issue. Please try again later.",
	"请求过于频繁，请稍后再试": "Too many requests. Please try again later.",
	邮箱或密码错误: "Incorrect email or password.",
	邮箱已被注册: "Email is already registered.",
	登录成功: "Signed in",
	欢迎回来: "Welcome back",
	登录您的法眼账户: "Sign in to your Law Eye account",
	"登录中...": "Signing in...",
	"还没有账号？": "Don't have an account?",
	立即注册: "Sign up now",
	注册成功: "Signed up",
	已自动登录: "Signed in automatically",
	"注册中...": "Signing up...",
	创建账户: "Create account",
	"已有账号？": "Already have an account?",
	立即登录: "Sign in now",
	注册即表示您同意我们的服务条款和隐私政策:
		"By signing up, you agree to our Terms of Service and Privacy Policy.",
	登录即表示您同意我们的服务条款和隐私政策:
		"By signing in, you agree to our Terms of Service and Privacy Policy.",
	"加入法眼，掌握法律资讯前沿": "Join Law Eye and stay ahead of legal updates",
	显示名称: "Display name",
	可选: "Optional",
	您的名称: "Your name",
	租户标识: "Tenant slug",
	租户名称: "Tenant name",
	不填则默认使用: "Leave blank to use",
	"。规则：小写字母开头，长度 3-32，仅允许":
		". Rules: start with a lowercase letter, length 3-32, allowed",
	"仅在你指定租户标识时生效；不填则默认使用租户标识作为名称。":
		"Only used when you set a tenant slug; if empty, the slug will be used as the name.",
	邮箱: "Email",
	密码: "Password",
	确认密码: "Confirm password",
	再次输入密码: "Re-enter password",
	至少12个字符: "At least 12 characters",
	"强度：": "Strength: ",
	弱: "Weak",
	中: "Medium",
	强: "Strong",
	"至少 12 个字符": "At least 12 characters",
	"不超过 128 个字符": "No more than 128 characters",
	包含大写字母: "Includes uppercase letter",
	包含小写字母: "Includes lowercase letter",
	包含数字: "Includes number",
	包含符号: "Includes symbol",
	不包含空白字符: "No whitespace characters",
	请输入邮箱: "Please enter an email",
	邮箱过长: "Email is too long",
	邮箱格式不正确: "Invalid email format",
	请输入密码: "Please enter a password",
	密码过长: "Password is too long",
	请检查输入内容: "Please check your input",
	"密码至少需要 12 个字符": "Password must be at least 12 characters",
	"密码不能超过 128 个字符": "Password must be no more than 128 characters",
	密码不能包含空白字符: "Password must not contain whitespace",
	"密码需包含大写/小写字母、数字和符号":
		"Password must include uppercase, lowercase, number, and symbol",
	两次输入的密码不一致: "Passwords do not match",
	未评估: "Unrated",
	低风险: "Low risk",
	中风险: "Medium risk",
	高风险: "High risk",
	严重: "Critical",
	数据加密保护中: "Encryption enabled",
	所有数据已加密传输: "All data is transmitted securely",
	加密未启用: "Encryption disabled",
	建议启用数据加密: "Enable encryption for better security",
	状态未知: "Unknown status",
	无法获取安全状态: "Unable to retrieve security status",
	数据完整: "Integrity verified",
	验证中: "Verifying",
	验证失败: "Verification failed",
	"上次同步：": "Last sync: ",
	"租户标识格式无效：需小写字母开头，长度 3-32，仅允许 a-z0-9-":
		"Invalid tenant slug: start with a lowercase letter, length 3-32, only a-z0-9- allowed",
	"租户名称过长：最多 100 个字符":
		"Tenant name is too long (max 100 characters)",
};

function interpolate(
	template: string,
	params: TranslationParams | undefined,
): string {
	if (!params) return template;
	return template.replaceAll(/\{(\w+)\}/g, (match, key: string) => {
		if (!(key in params)) return match;
		return String(params[key]);
	});
}

export function t(
	locale: Locale,
	key: string,
	params?: TranslationParams,
): string {
	const template = locale === "en" ? (EN_TRANSLATIONS[key] ?? key) : key;
	return interpolate(template, params);
}

export function formatDateTime(
	locale: Locale,
	value: Date | string | number,
	options: Intl.DateTimeFormatOptions = {},
): string {
	const date = value instanceof Date ? value : new Date(value);
	const formatter = new Intl.DateTimeFormat(bcp47(locale), options);
	return formatter.format(date);
}

export function formatNumber(
	locale: Locale,
	value: number,
	options: Intl.NumberFormatOptions = {},
): string {
	const formatter = new Intl.NumberFormat(bcp47(locale), options);
	return formatter.format(value);
}

export function formatTimeAgo(
	locale: Locale,
	value: Date | string | number,
): string {
	const date = value instanceof Date ? value : new Date(value);
	const now = new Date();
	const diffMs = now.getTime() - date.getTime();

	if (!Number.isFinite(diffMs)) return "";
	if (diffMs < 0) return formatDateTime(locale, date);

	const diffMins = Math.floor(diffMs / 60000);
	const diffHours = Math.floor(diffMs / 3600000);
	const diffDays = Math.floor(diffMs / 86400000);

	if (diffMins < 1) return t(locale, "刚刚");
	if (diffMins < 60) return t(locale, "{count} 分钟前", { count: diffMins });
	if (diffHours < 24) return t(locale, "{count} 小时前", { count: diffHours });
	return t(locale, "{count} 天前", { count: diffDays });
}
