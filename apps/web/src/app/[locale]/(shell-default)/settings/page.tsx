"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import {
	useChangePassword,
	useLoginActivity,
	useMfaTotpConfirm,
	useMfaTotpDisable,
	useMfaTotpSetup,
} from "@/hooks/use-security";
import {
	useCreateTenant,
	useDeleteTenant,
	useRefreshTenantUsage,
	useTenantDetail,
	useTenants,
	useUpdateTenant,
	useUpdateTenantConfig,
} from "@/hooks/use-tenants";
import {
	type WebhookDeliveryFilter,
	type WebhookEnabledFilter,
	useCreateWebhook,
	useDeleteWebhook,
	useTestWebhook,
	useUpdateWebhook,
	useWebhooks,
} from "@/hooks/use-webhooks";
import { ApiClientError, apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type ApiKey,
	type LoginActivityEntry,
	type UserDetailResponse,
	assertApiKeyListResponse,
	assertArticleStats,
	assertCreateApiKeyResponse,
	assertDeleteResponse,
	assertHealthResponse,
	assertPushSubscribeResponse,
	assertPushTestResponse,
	assertUserDetailResponse,
	assertUserProfile,
	assertVapidPublicKeyResponse,
} from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Bell,
	Building2,
	Copy,
	Database,
	ExternalLink,
	Eye,
	EyeOff,
	Globe,
	Key,
	Lock,
	Moon,
	RefreshCw,
	Save,
	Shield,
	Smartphone,
	Sun,
	Trash2,
	User,
	Webhook,
} from "lucide-react";
import Image from "next/image";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import {
	ApiKeysTab,
	ProfileTab,
	SecurityTab,
	TenantManagementTab,
	WebhookManagementTab,
	uiMessageFromError,
} from "@/components/settings/tabs";

type Theme = "light" | "dark" | "system";

type NotificationsPreferences = {
	emailAlerts: boolean;
	riskAlerts: boolean;
	weeklyDigest: boolean;
	newArticles: boolean;
};

type AppearancePreferences = {
	theme: Theme;
	compactMode: boolean;
};

const DEFAULT_NOTIFICATIONS: NotificationsPreferences = {
	emailAlerts: true,
	riskAlerts: true,
	weeklyDigest: false,
	newArticles: true,
};

const DEFAULT_APPEARANCE: AppearancePreferences = {
	theme: "light",
	compactMode: false,
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

function pickTheme(value: unknown, fallback: Theme): Theme {
	return value === "light" || value === "dark" || value === "system"
		? value
		: fallback;
}

function parseCsv(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

function base64UrlToUint8Array(value: string): Uint8Array<ArrayBuffer> {
	const trimmed = value.trim();
	if (!trimmed) return new Uint8Array(0) as Uint8Array<ArrayBuffer>;

	const base64 = trimmed.replace(/-/g, "+").replace(/_/g, "/");
	const padLength = (4 - (base64.length % 4)) % 4;
	const padded = `${base64}${"=".repeat(padLength)}`;

	const binary = globalThis.atob(padded);
	const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i += 1) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

function SettingsContent() {
	const { user } = useAuth();
	const setUser = useAuthStore((s) => s.setUser);
	const permissions = useAuthStore((s) => s.permissions);
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();
	const t = useT();
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const canManageTenants =
		permissions.includes("tenants:manage") || permissions.includes("*");
	const canManageWebhooks =
		permissions.includes("webhooks:write") || permissions.includes("*");

	const [activeTab, setActiveTab] = useState("profile");
	const [loadedFromServer, setLoadedFromServer] = useState(false);

	useEffect(() => {
		const tab = searchParams.get("tab");
		if (!tab) return;

		const allowedTabs = [
			"profile",
			"notifications",
			"appearance",
			"security",
			"api",
			"system",
			...(canManageTenants ? ["tenants"] : []),
			...(canManageWebhooks ? ["webhooks"] : []),
		];
		if (allowedTabs.includes(tab)) {
			setActiveTab(tab);
		}
	}, [searchParams, canManageTenants, canManageWebhooks]);

	const setActiveTabWithUrl = useCallback(
		(tab: string) => {
			setActiveTab(tab);

			const params = new URLSearchParams(searchParams.toString());
			params.set("tab", tab);
			const query = params.toString();
			const target = query ? `${pathname}?${query}` : pathname;
			router.replace(target, { scroll: false });
		},
		[pathname, router, searchParams],
	);

	const [profile, setProfile] = useState({
		displayName: "",
		email: "",
	});

	const avatarInputRef = useRef<HTMLInputElement | null>(null);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);

	useEffect(() => {
		return () => {
			if (avatarPreviewUrl) {
				URL.revokeObjectURL(avatarPreviewUrl);
			}
		};
	}, [avatarPreviewUrl]);

	const [notifications, setNotifications] = useState<NotificationsPreferences>(
		DEFAULT_NOTIFICATIONS,
	);

	const [appearance, setAppearance] =
		useState<AppearancePreferences>(DEFAULT_APPEARANCE);

	type WebPushState = {
		supported: boolean;
		permission: NotificationPermission;
		enabled: boolean;
		busy: boolean;
	};

	const [webPush, setWebPush] = useState<WebPushState>(() => ({
		supported: false,
		permission:
			typeof Notification !== "undefined" ? Notification.permission : "default",
		enabled: false,
		busy: false,
	}));

	const getServiceWorkerRegistration =
		useCallback(async (): Promise<ServiceWorkerRegistration | null> => {
			if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
				return null;
			}

			const existing = await navigator.serviceWorker.getRegistration("/");
			if (existing) return existing;

			try {
				return await navigator.serviceWorker.register("/sw", { scope: "/" });
			} catch {
				return null;
			}
		}, []);

	const refreshWebPushStatus = useCallback(async (): Promise<void> => {
		if (typeof window === "undefined") return;

		const supported =
			"serviceWorker" in navigator &&
			"PushManager" in window &&
			"Notification" in window;

		if (!supported) {
			setWebPush((prev) => ({
				...prev,
				supported: false,
				permission: "default",
				enabled: false,
			}));
			return;
		}

		const permission = Notification.permission;
		try {
			const registration = await getServiceWorkerRegistration();
			const subscription = registration
				? await registration.pushManager.getSubscription()
				: null;
			setWebPush((prev) => ({
				...prev,
				supported: true,
				permission,
				enabled: Boolean(subscription),
			}));
		} catch {
			setWebPush((prev) => ({
				...prev,
				supported: true,
				permission,
				enabled: false,
			}));
		}
	}, [getServiceWorkerRegistration]);

	useEffect(() => {
		void refreshWebPushStatus();
	}, [refreshWebPushStatus]);

	const enableWebPush = async (): Promise<void> => {
		if (webPush.busy) return;
		setWebPush((prev) => ({ ...prev, busy: true }));

		try {
			if (!webPush.supported) {
				throw new Error(t("Web Push is not supported by this browser"));
			}

			const permission =
				Notification.permission === "default"
					? await Notification.requestPermission()
					: Notification.permission;

			if (permission !== "granted") {
				setWebPush((prev) => ({ ...prev, permission }));
				throw new Error(t("Notification permission was not granted"));
			}

			const registration = await getServiceWorkerRegistration();
			if (!registration) {
				throw new Error(t("Service Worker is not ready"));
			}

			const { public_key } = await apiClient.get(
				"/api/v1/push/vapid-public-key",
				assertVapidPublicKeyResponse,
			);
			const applicationServerKey = base64UrlToUint8Array(public_key);
			if (applicationServerKey.length === 0) {
				throw new Error(t("VAPID public key is empty"));
			}

			const subscription = await registration.pushManager.subscribe({
				userVisibleOnly: true,
				applicationServerKey,
			});

			await apiClient.post(
				"/api/v1/push/subscribe",
				subscription.toJSON(),
				assertPushSubscribeResponse,
			);

			toastSuccess(
				t("Web Push enabled"),
				t("Send a test notification below to verify"),
			);
			await refreshWebPushStatus();
		} catch (err) {
			toastError(t("Failed to enable Web Push"), uiMessageFromError(err, t));
			await refreshWebPushStatus();
		} finally {
			setWebPush((prev) => ({ ...prev, busy: false }));
		}
	};

	const disableWebPush = async (): Promise<void> => {
		if (webPush.busy) return;
		setWebPush((prev) => ({ ...prev, busy: true }));

		try {
			const registration = await getServiceWorkerRegistration();
			const subscription = registration
				? await registration.pushManager.getSubscription()
				: null;

			if (subscription) {
				await apiClient.post("/api/v1/push/unsubscribe", {
					endpoint: subscription.endpoint,
				});
				await subscription.unsubscribe();
			}

			toastSuccess(t("Web Push disabled"));
			await refreshWebPushStatus();
		} catch (err) {
			toastError(t("Failed to disable Web Push"), uiMessageFromError(err, t));
			await refreshWebPushStatus();
		} finally {
			setWebPush((prev) => ({ ...prev, busy: false }));
		}
	};

	const sendTestWebPush = async (): Promise<void> => {
		if (webPush.busy) return;
		setWebPush((prev) => ({ ...prev, busy: true }));

		try {
			const result = await apiClient.post(
				"/api/v1/push/test",
				undefined,
				assertPushTestResponse,
			);
			toastSuccess(
				t("Test notification sent"),
				t("Delivered {delivered}/{total} (failed {failed})", {
					delivered: result.delivered,
					total: result.total,
					failed: result.failed,
				}),
			);
		} catch (err) {
			toastError(
				t("Failed to send test notification"),
				uiMessageFromError(err, t),
			);
		} finally {
			setWebPush((prev) => ({ ...prev, busy: false }));
		}
	};

	const userId = user?.id;

	const userDetailQuery = useQuery({
		queryKey: ["users", userId],
		enabled: Boolean(userId),
		queryFn: async () => {
			if (!userId) {
				throw new Error(t("Missing user info"));
			}
			return apiClient.get(`/api/v1/users/${userId}`, assertUserDetailResponse);
		},
	});

	useEffect(() => {
		if (!userId) {
			setLoadedFromServer(false);
			return;
		}
		setLoadedFromServer(false);
	}, [userId]);

	useEffect(() => {
		if (!user) return;
		setProfile({
			displayName: user.display_name ?? "",
			email: user.email ?? "",
		});
	}, [user]);

	useEffect(() => {
		const data = userDetailQuery.data;
		if (!data || loadedFromServer) return;

		setProfile({
			displayName: data.user.display_name ?? "",
			email: data.user.email ?? "",
		});

		const preferences = data.user.preferences;
		if (isRecord(preferences)) {
			const notif = preferences.notifications;
			if (isRecord(notif)) {
				setNotifications({
					emailAlerts: pickBoolean(
						notif.emailAlerts,
						DEFAULT_NOTIFICATIONS.emailAlerts,
					),
					riskAlerts: pickBoolean(
						notif.riskAlerts,
						DEFAULT_NOTIFICATIONS.riskAlerts,
					),
					weeklyDigest: pickBoolean(
						notif.weeklyDigest,
						DEFAULT_NOTIFICATIONS.weeklyDigest,
					),
					newArticles: pickBoolean(
						notif.newArticles,
						DEFAULT_NOTIFICATIONS.newArticles,
					),
				});
			}

			const app = preferences.appearance;
			if (isRecord(app)) {
				setAppearance({
					theme: pickTheme(app.theme, DEFAULT_APPEARANCE.theme),
					compactMode: pickBoolean(
						app.compactMode,
						DEFAULT_APPEARANCE.compactMode,
					),
				});
			}
		}

		setLoadedFromServer(true);
	}, [loadedFromServer, userDetailQuery.data]);

	const updateUserMutation = useMutation({
		mutationFn: async () => {
			if (!userId) {
				throw new Error(t("Missing user info"));
			}

			const version = userDetailQuery.data?.user.version;
			if (
				typeof version !== "number" ||
				!Number.isFinite(version) ||
				version < 1
			) {
				throw new Error(
					t("Missing version info. Please refresh the page and retry."),
				);
			}

			const payload = {
				display_name: profile.displayName.trim() || null,
				preferences: {
					notifications,
					appearance,
				},
			};

			return apiClient.patch(
				`/api/v1/users/${userId}`,
				payload,
				assertUserProfile,
				{ headers: { "If-Match": ifMatchFromVersion(version) } },
			);
		},
		onSuccess: (updated) => {
			toastSuccess(t("Saved successfully"));
			if (user) {
				setUser({
					...user,
					display_name: updated.display_name,
					avatar_url: updated.avatar_url,
					version: updated.version,
				});
			}
			queryClient.setQueryData<UserDetailResponse | undefined>(
				["users", userId],
				(prev) => (prev ? { ...prev, user: updated } : prev),
			);
			queryClient.invalidateQueries({ queryKey: ["users", userId] });
		},
		onError: (err) => {
			const message = uiMessageFromError(err, t);
			toastError(t("Save failed"), message);
		},
	});

	const saving = updateUserMutation.isPending;

	const uploadAvatarMutation = useMutation({
		mutationFn: async () => {
			if (!userId) {
				throw new Error(t("Missing user info"));
			}
			if (!avatarFile) {
				throw new Error(t("Please select an avatar file"));
			}

			const version = userDetailQuery.data?.user.version;
			if (
				typeof version !== "number" ||
				!Number.isFinite(version) ||
				version < 1
			) {
				throw new Error(
					t("Missing version info. Please refresh the page and retry."),
				);
			}

			const form = new FormData();
			form.append("file", avatarFile, avatarFile.name);

			return apiClient.postForm(
				`/api/v1/users/${userId}/avatar`,
				form,
				assertUserProfile,
				{ headers: { "If-Match": ifMatchFromVersion(version) } },
			);
		},
		onSuccess: (updated) => {
			toastSuccess(t("Avatar updated"));
			if (user) {
				setUser({
					...user,
					display_name: updated.display_name,
					avatar_url: updated.avatar_url,
					version: updated.version,
				});
			}
			setAvatarFile(null);
			setAvatarPreviewUrl(null);
			queryClient.setQueryData<UserDetailResponse | undefined>(
				["users", userId],
				(prev) => (prev ? { ...prev, user: updated } : prev),
			);
			queryClient.invalidateQueries({ queryKey: ["users", userId] });
		},
		onError: (err) => {
			const message = uiMessageFromError(err, t);
			toastError(t("Avatar upload failed"), message);
		},
	});

	const uploadingAvatar = uploadAvatarMutation.isPending;

	const [apiKeyName, setApiKeyName] = useState("");
	const [apiKeyPermissions, setApiKeyPermissions] = useState("");
	const [apiKeyRateLimit, setApiKeyRateLimit] = useState("");
	const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

	const apiKeysQuery = useQuery({
		queryKey: ["apikeys"],
		enabled: activeTab === "api",
		queryFn: () => apiClient.get("/api/v1/apikeys", assertApiKeyListResponse),
	});

	const createApiKeyMutation = useMutation({
		mutationFn: async () => {
			const name = apiKeyName.trim();
			if (!name) {
				throw new Error(t("Please enter a key name"));
			}

			const permissions = parseCsv(apiKeyPermissions);
			const rateLimitRaw = apiKeyRateLimit.trim();
			let rateLimit: number | undefined;
			if (rateLimitRaw) {
				const parsed = Number(rateLimitRaw);
				if (!Number.isFinite(parsed) || parsed <= 0) {
					throw new Error(t("rate_limit must be a positive number"));
				}
				rateLimit = Math.floor(parsed);
			}

			const payload: Record<string, unknown> = { name };
			if (permissions.length > 0) payload.permissions = permissions;
			if (rateLimit !== undefined) payload.rate_limit = rateLimit;

			return apiClient.post(
				"/api/v1/apikeys",
				payload,
				assertCreateApiKeyResponse,
			);
		},
		onSuccess: (res) => {
			toastSuccess(
				t("API key created"),
				t("Prefix: {prefix}", { prefix: res.key.key_prefix }),
			);
			setCreatedRawKey(res.raw_key);
			setApiKeyName("");
			setApiKeyPermissions("");
			setApiKeyRateLimit("");
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			const message = uiMessageFromError(err, t);
			toastError(t("Create failed"), message);
		},
	});

	const revokeApiKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.post(
				`/api/v1/apikeys/${id}/revoke`,
				undefined,
				assertDeleteResponse,
			),
		onSuccess: () => {
			toastSuccess(t("API key revoked"));
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			const message = uiMessageFromError(err, t);
			toastError(t("Revoke failed"), message);
		},
	});

	const deleteApiKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.delete(`/api/v1/apikeys/${id}`, assertDeleteResponse),
		onSuccess: () => {
			toastSuccess(t("API key deleted"));
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			const message = uiMessageFromError(err, t);
			toastError(t("Delete failed"), message);
		},
	});

	const handleCopyRawKey = async (rawKey: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(rawKey);
			toastSuccess(t("Copied to clipboard"));
		} catch (err) {
			const message = err instanceof Error ? err.message : t("Copy failed");
			toastError(t("Copy failed"), message);
		}
	};

	const healthQuery = useQuery({
		queryKey: ["health"],
		enabled: activeTab === "system",
		queryFn: () => apiClient.get("/health", assertHealthResponse),
	});

	const statsQuery = useQuery({
		queryKey: ["articleStats"],
		enabled: activeTab === "system",
		queryFn: () => apiClient.get("/api/v1/articles/stats", assertArticleStats),
	});

	const handleSave = async () => {
		await updateUserMutation.mutateAsync();
	};

	const AVATAR_MAX_BYTES = 1_048_576;
	const allowedAvatarTypes = new Set(["image/png", "image/jpeg", "image/webp"]);

	const avatarSrc = avatarPreviewUrl || user?.avatar_url || null;
	const isPreviewAvatar =
		typeof avatarSrc === "string" &&
		(avatarSrc.startsWith("blob:") || avatarSrc.startsWith("data:"));
	const avatarInitial = (profile.displayName || profile.email || t("User"))
		.trim()
		.charAt(0)
		.toUpperCase();

	const handleAvatarChange = (file: File | null) => {
		if (!file) {
			setAvatarFile(null);
			setAvatarPreviewUrl(null);
			return;
		}

		if (!allowedAvatarTypes.has(file.type)) {
			toastError(
				t("Unsupported image format"),
				t("Only PNG / JPEG / WEBP are supported"),
			);
			return;
		}

		if (file.size > AVATAR_MAX_BYTES) {
			toastError(
				t("Avatar file too large"),
				t("Max {size}KB", {
					size: Math.floor(AVATAR_MAX_BYTES / 1024),
				}),
			);
			return;
		}

		setAvatarFile(file);
		setAvatarPreviewUrl(URL.createObjectURL(file));
	};

	const tabs = [
		{ id: "profile", labelKey: "Profile", icon: User },
		{ id: "notifications", labelKey: "Notifications", icon: Bell },
		{ id: "appearance", labelKey: "Appearance", icon: Moon },
		{ id: "security", labelKey: "Security", icon: Shield },
		{ id: "api", labelKey: "API keys", icon: Key },
		{ id: "system", labelKey: "System info", icon: Database },
		...(canManageTenants
			? [{ id: "tenants", labelKey: "Tenant management", icon: Building2 }]
			: []),
		...(canManageWebhooks
			? [{ id: "webhooks", labelKey: "Webhook management", icon: Webhook }]
			: []),
	];

	return (
		<div className="p-6">
			{/* Page Title */}
			<div className="mb-6">
				<h1 className="text-2xl font-bold text-neutral-900 dark:text-neutral-50">
								{t("Settings")}
							</h1>
							<p className="text-sm text-neutral-500 dark:text-neutral-400">
								{t("Manage your account and system configuration")}
							</p>
						</div>

						<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
							{/* Sidebar Tabs */}
							<Card className="h-fit">
								<CardContent className="p-2">
									<nav
										className="space-y-1"
										role="tablist"
										aria-orientation="vertical"
										aria-label={t("Settings")}
									>
										{tabs.map((tab) => (
											<button
												key={tab.id}
												type="button"
												onClick={() => setActiveTabWithUrl(tab.id)}
												role="tab"
												id={`settings-tab-${tab.id}`}
												aria-selected={activeTab === tab.id}
												aria-controls={`settings-tabpanel-${tab.id}`}
												className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
													activeTab === tab.id
														? "bg-primary-50 text-primary-700 font-medium dark:bg-primary-500/15 dark:text-primary-200"
														: "text-neutral-600 hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-white/5"
												}`}
											>
												<tab.icon className="h-4 w-4" />
												{t(tab.labelKey)}
											</button>
										))}
									</nav>
								</CardContent>
							</Card>

							{/* Content Area */}
							<div
								className="lg:col-span-3"
								role="tabpanel"
								id={`settings-tabpanel-${activeTab}`}
								aria-labelledby={`settings-tab-${activeTab}`}
							>
								{/* Profile Settings */}
								{activeTab === "profile" && (
									<ProfileTab
										t={t}
										profile={profile}
										setProfile={setProfile}
										avatarInputRef={avatarInputRef}
										avatarSrc={avatarSrc}
										isPreviewAvatar={isPreviewAvatar}
										avatarInitial={avatarInitial}
										uploadingAvatar={uploadingAvatar}
										avatarFile={avatarFile}
										handleAvatarChange={handleAvatarChange}
										onUploadAvatar={() => uploadAvatarMutation.mutate()}
										onSave={handleSave}
										saving={saving}
										avatarMaxBytes={AVATAR_MAX_BYTES}
									/>
								)}

								{/* Notification Settings */}
								{activeTab === "notifications" && (
									<Card>
										<CardHeader>
											<CardTitle>{t("Notifications")}</CardTitle>
											<CardDescription>
												{t("Configure the notifications you want to receive")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											{[
												{
													key: "emailAlerts",
													labelKey: "Email alerts",
													descKey:
														"Receive email notifications for important updates",
												},
												{
													key: "riskAlerts",
													labelKey: "Risk alerts",
													descKey:
														"Notify when high-risk articles are detected",
												},
												{
													key: "weeklyDigest",
													labelKey: "Weekly digest",
													descKey: "Send a weekly digest of articles",
												},
												{
													key: "newArticles",
													labelKey: "New articles",
													descKey: "Notify when new articles are ingested",
												},
											].map(({ key, labelKey, descKey }) => (
												<div
													key={key}
													className="flex items-center justify-between rounded-lg border border-neutral-100 p-4 dark:border-white/10"
												>
													<div>
														<p className="font-medium">{t(labelKey)}</p>
														<p className="text-sm text-neutral-500 dark:text-neutral-400">
															{t(descKey)}
														</p>
													</div>
													<label className="relative inline-flex cursor-pointer items-center">
														<input
															type="checkbox"
															checked={
																notifications[key as keyof typeof notifications]
															}
															onChange={(e) =>
																setNotifications({
																	...notifications,
																	[key]: e.target.checked,
																})
															}
															className="peer sr-only"
														/>
														<div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full dark:bg-white/10 dark:after:bg-neutral-200 dark:peer-checked:bg-primary-500" />
													</label>
												</div>
											))}

											<div className="rounded-lg border border-neutral-100 p-4 dark:border-white/10">
												<div className="flex items-start justify-between gap-4">
													<div>
														<p className="font-medium">
															{t("Browser push (Web Push)")}
														</p>
														<p className="text-sm text-neutral-500 dark:text-neutral-400">
															{t(
																"Receive notifications in the background (requires browser permission and Service Worker)",
															)}
														</p>
													</div>

													{!webPush.supported ? (
														<Badge variant="outline">
															{t("Not supported")}
														</Badge>
													) : webPush.enabled ? (
														<div className="flex items-center gap-2">
															<Badge variant="outline">{t("Enabled")}</Badge>
															<Button
																type="button"
																variant="outline"
																size="sm"
																disabled={webPush.busy}
																onClick={disableWebPush}
															>
																{t("Disable")}
															</Button>
														</div>
													) : (
														<Button
															type="button"
															size="sm"
															disabled={
																webPush.busy || webPush.permission === "denied"
															}
															onClick={enableWebPush}
														>
															{t("Enable")}
														</Button>
													)}
												</div>

												{webPush.supported &&
												webPush.permission === "denied" ? (
													<p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
														{t(
															"The browser has denied notification permission. Please allow notifications for this site in browser settings and try again.",
														)}
													</p>
												) : null}

												{webPush.supported && webPush.enabled ? (
													<div className="mt-3 flex gap-2">
														<Button
															type="button"
															variant="outline"
															size="sm"
															disabled={webPush.busy}
															onClick={sendTestWebPush}
														>
															{t("Send test notification")}
														</Button>
													</div>
												) : null}
											</div>
											<div className="flex justify-end">
												<Button onClick={handleSave} disabled={saving}>
													{saving ? (
														<RefreshCw
															aria-hidden="true"
															className="mr-2 h-4 w-4 animate-spin"
														/>
													) : (
														<Save aria-hidden="true" className="mr-2 h-4 w-4" />
													)}
													{t("Save settings")}
												</Button>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Appearance Settings */}
								{activeTab === "appearance" && (
									<Card>
										<CardHeader>
											<CardTitle>{t("Appearance")}</CardTitle>
											<CardDescription>
												{t("Customize the app appearance")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<div>
												<p
													id="appearance-theme-label"
													className="mb-2 block text-sm font-medium"
												>
													{t("Theme")}
												</p>
												<div
													className="flex gap-3"
													role="radiogroup"
													aria-labelledby="appearance-theme-label"
												>
													{[
														{ value: "light", labelKey: "Light", icon: Sun },
														{ value: "dark", labelKey: "Dark", icon: Moon },
														{
															value: "system",
															labelKey: "System",
															icon: Globe,
														},
													].map(({ value, labelKey, icon: Icon }) => (
														<button
															key={value}
															type="button"
															onClick={() =>
																setAppearance({
																	...appearance,
																	theme: value as typeof appearance.theme,
																})
															}
															className={`flex flex-1 flex-col items-center gap-2 rounded-lg border p-4 transition-colors ${
																appearance.theme === value
																	? "border-primary-500 bg-primary-50 dark:border-primary-400 dark:bg-primary-500/15 dark:text-primary-100"
																	: "border-neutral-200 hover:bg-neutral-50 dark:border-white/10 dark:text-neutral-200 dark:hover:bg-white/5"
															}`}
														>
															<Icon aria-hidden="true" className="h-5 w-5" />
															<span className="text-sm">{t(labelKey)}</span>
														</button>
													))}
												</div>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-neutral-100 p-4 dark:border-white/10">
												<div>
													<p className="font-medium">{t("Compact mode")}</p>
													<p className="text-sm text-neutral-500 dark:text-neutral-400">
														{t("Reduce spacing to show more content")}
													</p>
												</div>
												<label className="relative inline-flex cursor-pointer items-center">
													<input
														type="checkbox"
														checked={appearance.compactMode}
														onChange={(e) =>
															setAppearance({
																...appearance,
																compactMode: e.target.checked,
															})
														}
														className="peer sr-only"
													/>
													<div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full dark:bg-white/10 dark:after:bg-neutral-200 dark:peer-checked:bg-primary-500" />
												</label>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Security Settings */}
								{activeTab === "security" && <SecurityTab />}

								{/* API Keys */}
								{activeTab === "api" && (
									<ApiKeysTab
										t={t}
										createdRawKey={createdRawKey}
										onCopyRawKey={handleCopyRawKey}
										onClearRawKey={() => setCreatedRawKey(null)}
										apiKeyName={apiKeyName}
										setApiKeyName={setApiKeyName}
										apiKeyPermissions={apiKeyPermissions}
										setApiKeyPermissions={setApiKeyPermissions}
										apiKeyRateLimit={apiKeyRateLimit}
										setApiKeyRateLimit={setApiKeyRateLimit}
										createPending={createApiKeyMutation.isPending}
										onCreate={() => createApiKeyMutation.mutate()}
										isLoading={apiKeysQuery.isLoading}
										isError={apiKeysQuery.isError}
										isFetching={apiKeysQuery.isFetching}
										error={apiKeysQuery.error}
										keys={apiKeysQuery.data?.keys ?? []}
										revokePending={revokeApiKeyMutation.isPending}
										deletePending={deleteApiKeyMutation.isPending}
										onRefetch={() => apiKeysQuery.refetch()}
										onRevoke={(id) => revokeApiKeyMutation.mutate(id)}
										onDelete={(id) => deleteApiKeyMutation.mutate(id)}
									/>
								)}

								{/* System Info */}
								{activeTab === "system" && (
									<Card>
										<CardHeader>
											<CardTitle>{t("System info")}</CardTitle>
											<CardDescription>
												{t("View system status and version information")}
											</CardDescription>
										</CardHeader>
										<CardContent>
											<div className="space-y-3">
												<div className="flex items-center justify-between border-b border-neutral-50 py-2 dark:border-white/5">
													<span className="text-sm text-neutral-500 dark:text-neutral-400">
														{t("API status")}
													</span>
													<span className="text-sm font-medium">
														{healthQuery.isLoading
															? t("Checking")
															: healthQuery.isError
																? t("Error")
																: (healthQuery.data?.status ?? t("Unknown"))}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2 dark:border-white/5">
													<span className="text-sm text-neutral-500 dark:text-neutral-400">
														{t("Backend version")}
													</span>
													<span className="text-sm font-medium">
														{healthQuery.data?.version ?? "-"}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2 dark:border-white/5">
													<span className="text-sm text-neutral-500 dark:text-neutral-400">
														{t("Database")}
													</span>
													<span className="text-sm font-medium">
														{statsQuery.isLoading
															? t("Checking")
															: statsQuery.isError
																? t("Error")
																: t("Available")}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2 dark:border-white/5">
													<span className="text-sm text-neutral-500 dark:text-neutral-400">
														{t("Total articles")}
													</span>
													<span className="text-sm font-medium">
														{statsQuery.data?.total_articles ?? "-"}
													</span>
												</div>
												<div className="flex items-center justify-between py-2">
													<span className="text-sm text-neutral-500 dark:text-neutral-400">
														{t("Added today")}
													</span>
													<span className="text-sm font-medium">
														{statsQuery.data?.today_count ?? "-"}
													</span>
												</div>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Tenant Management */}
								{activeTab === "tenants" &&
									(canManageTenants ? (
										<TenantManagementTab />
									) : (
										<Card>
											<CardHeader>
												<CardTitle>{t("Tenant management")}</CardTitle>
												<CardDescription>
													{t(
														"You don't have permission to access this resource.",
													)}
												</CardDescription>
											</CardHeader>
										</Card>
									))}

								{/* Webhook Management */}
								{activeTab === "webhooks" &&
									(canManageWebhooks ? (
										<WebhookManagementTab />
									) : (
										<Card>
											<CardHeader>
												<CardTitle>{t("Webhook management")}</CardTitle>
												<CardDescription>
													{t(
														"You don't have permission to access this resource.",
													)}
												</CardDescription>
											</CardHeader>
										</Card>
									))}
							</div>
			</div>
		</div>
	);
}

function SettingsLoading() {
	return (
		<div className="flex min-h-screen items-center justify-center">
			<div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
		</div>
	);
}

export default function SettingsPage() {
	return (
		<Suspense fallback={<SettingsLoading />}>
			<SettingsContent />
		</Suspense>
	);
}
