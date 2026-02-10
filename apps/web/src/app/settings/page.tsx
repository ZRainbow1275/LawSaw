"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
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
import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type ApiKey,
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
	Copy,
	Database,
	Globe,
	Key,
	Moon,
	RefreshCw,
	Save,
	Shield,
	Sun,
	Trash2,
	User,
} from "lucide-react";
import Image from "next/image";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useRef, useState } from "react";

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
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();
	const t = useT();
	const searchParams = useSearchParams();

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
		];
		if (allowedTabs.includes(tab)) {
			setActiveTab(tab);
		}
	}, [searchParams]);

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
			toastError(
				t("Failed to enable Web Push"),
				err instanceof Error ? err.message : t("Unknown error"),
			);
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
			toastError(
				t("Failed to disable Web Push"),
				err instanceof Error ? err.message : t("Unknown error"),
			);
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
				err instanceof Error ? err.message : t("Unknown error"),
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
			const message = err instanceof Error ? err.message : t("Unknown error");
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
			const message = err instanceof Error ? err.message : t("Unknown error");
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
			const message = err instanceof Error ? err.message : t("Unknown error");
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
			const message = err instanceof Error ? err.message : t("Unknown error");
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
			const message = err instanceof Error ? err.message : t("Unknown error");
			toastError(t("Delete failed"), message);
		},
	});

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
	];

	return (
		<ProtectedRoute>
			<div className="flex min-h-screen bg-neutral-50">
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						{/* Page Title */}
						<div className="mb-6">
							<h1 className="text-2xl font-bold text-neutral-900">
								{t("Settings")}
							</h1>
							<p className="text-sm text-neutral-500">
								{t("Manage your account and system configuration")}
							</p>
						</div>

						<div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
							{/* Sidebar Tabs */}
							<Card className="h-fit">
								<CardContent className="p-2">
									<nav className="space-y-1">
										{tabs.map((tab) => (
											<button
												key={tab.id}
												type="button"
												onClick={() => setActiveTab(tab.id)}
												className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
													activeTab === tab.id
														? "bg-primary-50 text-primary-700 font-medium"
														: "text-neutral-600 hover:bg-neutral-50"
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
							<div className="lg:col-span-3">
								{/* Profile Settings */}
								{activeTab === "profile" && (
									<Card>
										<CardHeader>
											<CardTitle>{t("Profile")}</CardTitle>
											<CardDescription>
												{t("Manage your account information")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<div>
												<label
													htmlFor="profile-avatar"
													className="mb-1 block text-sm font-medium"
												>
													{t("Avatar")}
												</label>
												<div className="flex flex-col gap-4 sm:flex-row sm:items-center">
													<div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border border-neutral-100 bg-neutral-50">
														{avatarSrc ? (
															<Image
																src={avatarSrc}
																alt={t("Avatar")}
																width={64}
																height={64}
																sizes="64px"
																className="h-16 w-16 object-cover"
																unoptimized={isPreviewAvatar}
															/>
														) : (
															<span className="text-lg font-semibold text-neutral-600">
																{avatarInitial || "U"}
															</span>
														)}
													</div>

													<div className="space-y-2">
														<input
															id="profile-avatar"
															ref={avatarInputRef}
															type="file"
															accept="image/png,image/jpeg,image/webp"
															className="hidden"
															onChange={(e) => {
																const file = e.target.files?.[0] ?? null;
																handleAvatarChange(file);
																e.currentTarget.value = "";
															}}
														/>

														<div className="flex flex-wrap gap-2">
															<Button
																type="button"
																variant="outline"
																onClick={() => avatarInputRef.current?.click()}
																disabled={uploadingAvatar}
															>
																{t("Choose file")}
															</Button>
															<Button
																type="button"
																onClick={() => uploadAvatarMutation.mutate()}
																disabled={!avatarFile || uploadingAvatar}
															>
																{uploadingAvatar ? (
																	<RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
																) : null}
																{t("Upload avatar")}
															</Button>
														</div>

														<p className="text-xs text-neutral-500">
															{t(
																"Supported formats: PNG / JPEG / WEBP. Max {size}KB",
																{
																	size: Math.floor(AVATAR_MAX_BYTES / 1024),
																},
															)}
														</p>
													</div>
												</div>
											</div>

											<div>
												<label
													htmlFor="profile-display-name"
													className="mb-1 block text-sm font-medium"
												>
													{t("Display name")}
												</label>
												<Input
													id="profile-display-name"
													value={profile.displayName}
													onChange={(e) =>
														setProfile((prev) => ({
															...prev,
															displayName: e.target.value,
														}))
													}
													placeholder={t("Your name")}
												/>
											</div>

											<div>
												<label
													htmlFor="profile-email"
													className="mb-1 block text-sm font-medium"
												>
													{t("Email address")}
												</label>
												<Input
													id="profile-email"
													type="email"
													value={profile.email}
													disabled
													readOnly
												/>
												<p className="mt-1 text-xs text-neutral-500">
													{t(
														"Email is used as the login account and cannot be changed online yet.",
													)}
												</p>
											</div>

											<div className="flex justify-end">
												<Button onClick={handleSave} disabled={saving}>
													{saving ? (
														<RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
													) : (
														<Save aria-hidden="true" className="mr-2 h-4 w-4" />
													)}
													{t("Save changes")}
												</Button>
											</div>
										</CardContent>
									</Card>
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
													className="flex items-center justify-between rounded-lg border border-neutral-100 p-4"
												>
													<div>
														<p className="font-medium">{t(labelKey)}</p>
														<p className="text-sm text-neutral-500">
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
														<div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full" />
													</label>
												</div>
											))}

											<div className="rounded-lg border border-neutral-100 p-4">
												<div className="flex items-start justify-between gap-4">
													<div>
														<p className="font-medium">
															{t("Browser push (Web Push)")}
														</p>
														<p className="text-sm text-neutral-500">
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
													<p className="mt-2 text-xs text-neutral-500">
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
														<RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
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
																	? "border-primary-500 bg-primary-50"
																	: "border-neutral-200 hover:bg-neutral-50"
															}`}
														>
															<Icon aria-hidden="true" className="h-5 w-5" />
															<span className="text-sm">{t(labelKey)}</span>
														</button>
													))}
												</div>
											</div>
											<div className="flex items-center justify-between rounded-lg border border-neutral-100 p-4">
												<div>
													<p className="font-medium">{t("Compact mode")}</p>
													<p className="text-sm text-neutral-500">
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
													<div className="peer h-6 w-11 rounded-full bg-neutral-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all after:content-[''] peer-checked:bg-primary-500 peer-checked:after:translate-x-full" />
												</label>
											</div>
										</CardContent>
									</Card>
								)}

								{/* Security Settings */}
								{activeTab === "security" && (
									<Card>
										<CardHeader>
											<CardTitle>{t("Security")}</CardTitle>
											<CardDescription>
												{t("Manage your account security options")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<div className="rounded-lg bg-neutral-50 p-4">
												<p className="text-sm text-neutral-600">
													{t(
														"Security features (change password / 2FA / login activity) will be enabled only after backend workflows are completed to avoid misleading UI.",
													)}
												</p>
											</div>
											<div className="rounded-lg border border-neutral-100 p-4 opacity-70">
												<div className="flex items-center justify-between">
													<div>
														<p className="font-medium">
															{t("Change password")}
														</p>
														<p className="text-sm text-neutral-500">
															{t("Not available")}
														</p>
													</div>
													<Button variant="outline" disabled>
														{t("Change")}
													</Button>
												</div>
											</div>
											<div className="rounded-lg border border-neutral-100 p-4 opacity-70">
												<div className="flex items-center justify-between">
													<div>
														<p className="font-medium">
															{t("Two-factor authentication")}
														</p>
														<p className="text-sm text-neutral-500">
															{t("Not available")}
														</p>
													</div>
													<Badge variant="outline">{t("Not enabled")}</Badge>
												</div>
											</div>
											<div className="rounded-lg border border-neutral-100 p-4 opacity-70">
												<div className="flex items-center justify-between">
													<div>
														<p className="font-medium">{t("Login activity")}</p>
														<p className="text-sm text-neutral-500">
															{t("Not available")}
														</p>
													</div>
													<Button variant="outline" disabled>
														{t("View")}
													</Button>
												</div>
											</div>
										</CardContent>
									</Card>
								)}

								{/* API Keys */}
								{activeTab === "api" && (
									<Card>
										<CardHeader>
											<CardTitle>{t("API keys")}</CardTitle>
											<CardDescription>
												{t("Manage your API access keys")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											<div className="rounded-lg bg-neutral-50 p-4">
												<p className="text-sm text-neutral-600">
													{t(
														"API keys are used for programmatic access. Keep them secret and do not share with others.",
													)}
												</p>
											</div>

											{createdRawKey && (
												<div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
													<p className="text-sm font-medium text-amber-900">
														{t(
															"New key (shown only once). Copy and store it now.",
														)}
													</p>
													<div className="mt-3 flex flex-col gap-2 sm:flex-row">
														<Input value={createdRawKey} readOnly />
														<Button
															variant="outline"
															onClick={async () => {
																try {
																	await navigator.clipboard.writeText(
																		createdRawKey,
																	);
																	toastSuccess(t("Copied to clipboard"));
																} catch (err) {
																	const message =
																		err instanceof Error
																			? err.message
																			: t("Copy failed");
																	toastError(t("Copy failed"), message);
																}
															}}
														>
															<Copy aria-hidden="true" className="mr-2 h-4 w-4" />
															{t("Copy")}
														</Button>
														<Button
															variant="outline"
															onClick={() => setCreatedRawKey(null)}
														>
															{t("Close")}
														</Button>
													</div>
												</div>
											)}

											<div className="rounded-lg border border-neutral-100 p-4">
												<p className="text-sm font-medium">
													{t("Create new key")}
												</p>
												<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
													<div className="sm:col-span-1">
														<label
															htmlFor="apikey-name"
															className="mb-1 block text-xs font-medium text-neutral-600"
														>
															{t("Name")}
														</label>
														<Input
															id="apikey-name"
															value={apiKeyName}
															onChange={(e) => setApiKeyName(e.target.value)}
															placeholder={t("e.g. CI / integration service")}
														/>
													</div>
													<div className="sm:col-span-1">
														<label
															htmlFor="apikey-permissions"
															className="mb-1 block text-xs font-medium text-neutral-600"
														>
															{t("Permissions (optional, comma-separated)")}
														</label>
														<Input
															id="apikey-permissions"
															value={apiKeyPermissions}
															onChange={(e) =>
																setApiKeyPermissions(e.target.value)
															}
															placeholder={t("e.g. read, articles:read")}
														/>
													</div>
													<div className="sm:col-span-1">
														<label
															htmlFor="apikey-rate-limit"
															className="mb-1 block text-xs font-medium text-neutral-600"
														>
															{t("Rate limit (optional)")}
														</label>
														<Input
															id="apikey-rate-limit"
															value={apiKeyRateLimit}
															onChange={(e) =>
																setApiKeyRateLimit(e.target.value)
															}
															placeholder={t("e.g. 100")}
															inputMode="numeric"
														/>
													</div>
												</div>
												<div className="mt-3 flex justify-end">
													<Button
														onClick={() => createApiKeyMutation.mutate()}
														disabled={createApiKeyMutation.isPending}
													>
														{createApiKeyMutation.isPending ? (
															<RefreshCw aria-hidden="true" className="mr-2 h-4 w-4 animate-spin" />
														) : (
															<Key aria-hidden="true" className="mr-2 h-4 w-4" />
														)}
														{t("Create")}
													</Button>
												</div>
											</div>

											<div className="space-y-2">
												<div className="flex items-center justify-between">
													<p className="text-sm font-medium">
														{t("Existing keys")}
													</p>
													<Button
														variant="outline"
														onClick={() => apiKeysQuery.refetch()}
														disabled={apiKeysQuery.isFetching}
													>
														<RefreshCw
															className={`mr-2 h-4 w-4 ${
																apiKeysQuery.isFetching ? "animate-spin" : ""
															}`} aria-hidden="true" focusable="false" />
														{t("Refresh")}
													</Button>
												</div>

												{apiKeysQuery.isLoading && (
													<p className="py-6 text-center text-sm text-neutral-500">
														{t("Loading...")}
													</p>
												)}

												{apiKeysQuery.isError && (
													<p className="py-6 text-center text-sm text-neutral-500">
														{t("Load failed:")}
														{apiKeysQuery.error instanceof Error
															? apiKeysQuery.error.message
															: t("Unknown error")}
													</p>
												)}

												{apiKeysQuery.data &&
													apiKeysQuery.data.keys.length === 0 && (
														<p className="py-6 text-center text-sm text-neutral-500">
															{t("No API keys")}
														</p>
													)}

												{apiKeysQuery.data?.keys.map((k: ApiKey) => (
													<div
														key={k.id}
														className="rounded-lg border border-neutral-100 p-4"
													>
														<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
															<div className="min-w-0">
																<div className="flex items-center gap-2">
																	<p className="truncate font-medium">
																		{k.name}
																	</p>
																	<Badge variant="outline">
																		{k.is_active ? t("Active") : t("Revoked")}
																	</Badge>
																</div>
																<p className="mt-1 text-xs text-neutral-500">
																	{t("Prefix: {prefix} · Rate limit: {limit}", {
																		prefix: k.key_prefix,
																		limit: k.rate_limit,
																	})}
																</p>
																<p className="mt-1 text-xs text-neutral-500">
																	{t("Permissions:")}
																	{k.permissions.length > 0
																		? k.permissions.join(", ")
																		: t("(default)")}
																</p>
															</div>

															<div className="flex gap-2">
																<Button
																	variant="outline"
																	disabled={
																		!k.is_active ||
																		revokeApiKeyMutation.isPending
																	}
																	onClick={() => {
																		if (
																			!window.confirm(
																				t(
																					"Confirm revoke this API key? It will be invalid immediately.",
																				),
																			)
																		) {
																			return;
																		}
																		revokeApiKeyMutation.mutate(k.id);
																	}}
																>
																	{t("Revoke")}
																</Button>
																<Button
																	variant="outline"
																	disabled={deleteApiKeyMutation.isPending}
																	onClick={() => {
																		if (
																			!window.confirm(
																				t(
																					"Confirm delete this API key? This action cannot be undone.",
																				),
																			)
																		) {
																			return;
																		}
																		deleteApiKeyMutation.mutate(k.id);
																	}}
																>
																	<Trash2 aria-hidden="true" className="mr-2 h-4 w-4" />
																	{t("Delete")}
																</Button>
															</div>
														</div>
													</div>
												))}
											</div>
										</CardContent>
									</Card>
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
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">
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
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">
														{t("Backend version")}
													</span>
													<span className="text-sm font-medium">
														{healthQuery.data?.version ?? "-"}
													</span>
												</div>
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">
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
												<div className="flex items-center justify-between border-b border-neutral-50 py-2">
													<span className="text-sm text-neutral-500">
														{t("Total articles")}
													</span>
													<span className="text-sm font-medium">
														{statsQuery.data?.total_articles ?? "-"}
													</span>
												</div>
												<div className="flex items-center justify-between py-2">
													<span className="text-sm text-neutral-500">
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
							</div>
						</div>
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
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
