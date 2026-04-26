"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { SettingsBillingTab } from "@/components/me/settings-billing-tab";
import { SettingsNotificationsTab } from "@/components/me/settings-notifications-tab";
import { SettingsPrivacyTab } from "@/components/me/settings-privacy-tab";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	ApiKeysTab,
	ProfileTab,
	SecurityTab,
	uiMessageFromError,
} from "@/app/settings/tabs";
import { useAuth } from "@/hooks/use-auth";
import { ApiClientError, apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type UserDetailResponse,
	assertApiKeyListResponse,
	assertCreateApiKeyResponse,
	assertDeleteResponse,
	assertPushSubscribeResponse,
	assertPushTestResponse,
	assertUserDetailResponse,
	assertUserProfile,
	assertVapidPublicKeyResponse,
} from "@/lib/api/types";
import { type RoleTier, normalizeRoleTier } from "@/lib/authz";
import { withLocalePath } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import {
	Bell,
	Crown,
	FileLock2,
	Key,
	type LucideIcon,
	Receipt,
	Shield,
	Sparkles,
	User,
} from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

type MeSettingsTab =
	| "profile"
	| "security"
	| "notifications"
	| "billing"
	| "privacy"
	| "api";

interface TabDefinition {
	key: MeSettingsTab;
	labelKey: string;
	descKey: string;
	Icon: LucideIcon;
}

const TABS: ReadonlyArray<TabDefinition> = [
	{
		key: "profile",
		labelKey: "Profile",
		descKey: "Manage your display name, avatar and account email.",
		Icon: User,
	},
	{
		key: "security",
		labelKey: "Security",
		descKey: "Change your password, manage 2FA, and review login activity.",
		Icon: Shield,
	},
	{
		key: "notifications",
		labelKey: "Notifications",
		descKey:
			"Email categories, browser push notifications and follow-based digests.",
		Icon: Bell,
	},
	{
		key: "billing",
		labelKey: "Billing",
		descKey:
			"Review your current plan, plan tiers, and upgrade options.",
		Icon: Receipt,
	},
	{
		key: "privacy",
		labelKey: "Privacy",
		descKey: "Export your data and request account deletion.",
		Icon: FileLock2,
	},
	{
		key: "api",
		labelKey: "API keys",
		descKey: "Issue programmatic access keys (Premium only).",
		Icon: Key,
	},
];

const containerVariants = {
	hidden: { opacity: 0 },
	visible: {
		opacity: 1,
		transition: { staggerChildren: 0.06, delayChildren: 0.04 },
	},
};

const itemVariants = {
	hidden: { opacity: 0, y: 10 },
	visible: {
		opacity: 1,
		y: 0,
		transition: { duration: 0.28, ease: [0.25, 0.8, 0.25, 1] as const },
	},
};

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

function isPremiumOrStaff(tier: RoleTier): boolean {
	return (
		tier === "premium_user" ||
		tier === "tenant_admin" ||
		tier === "super_admin"
	);
}

function parseCsv(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

const AVATAR_MAX_BYTES = 1_048_576;
const ALLOWED_AVATAR_TYPES = new Set([
	"image/png",
	"image/jpeg",
	"image/webp",
]);

export default function MeSettingsPage() {
	const t = useT();
	const locale = useLocale();
	const { user } = useAuth();
	const setUser = useAuthStore((s) => s.setUser);
	const roleTier = useAuthStore((s) => s.roleTier);
	const tier = normalizeRoleTier(roleTier);
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();

	const [activeTab, setActiveTab] = useState<MeSettingsTab>("profile");

	// ── Profile state ──────────────────────────────────────────────
	const [profile, setProfile] = useState({ displayName: "", email: "" });
	const avatarInputRef = useRef<HTMLInputElement | null>(null);
	const [avatarFile, setAvatarFile] = useState<File | null>(null);
	const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | null>(null);
	const [loadedFromServer, setLoadedFromServer] = useState(false);

	useEffect(() => {
		return () => {
			if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
		};
	}, [avatarPreviewUrl]);

	const userId = user?.id;
	const userDetailQuery = useQuery({
		queryKey: ["users", userId],
		enabled: Boolean(userId),
		queryFn: async () => {
			if (!userId) throw new Error(t("Missing user info"));
			return apiClient.get(
				`/api/v1/users/${userId}`,
				assertUserDetailResponse,
			);
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
		setLoadedFromServer(true);
	}, [loadedFromServer, userDetailQuery.data]);

	const updateUserMutation = useMutation({
		mutationFn: async () => {
			if (!userId) throw new Error(t("Missing user info"));
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
			toastError(t("Save failed"), uiMessageFromError(err, t));
		},
	});

	const uploadAvatarMutation = useMutation({
		mutationFn: async () => {
			if (!userId) throw new Error(t("Missing user info"));
			if (!avatarFile) throw new Error(t("Please select an avatar file"));
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
			toastError(t("Avatar upload failed"), uiMessageFromError(err, t));
		},
	});

	const handleAvatarChange = (file: File | null) => {
		if (!file) {
			setAvatarFile(null);
			setAvatarPreviewUrl(null);
			return;
		}
		if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
			toastError(
				t("Unsupported image format"),
				t("Only PNG / JPEG / WEBP are supported"),
			);
			return;
		}
		if (file.size > AVATAR_MAX_BYTES) {
			toastError(
				t("Avatar file too large"),
				t("Max {size}KB", { size: Math.floor(AVATAR_MAX_BYTES / 1024) }),
			);
			return;
		}
		setAvatarFile(file);
		setAvatarPreviewUrl(URL.createObjectURL(file));
	};

	const avatarSrc = avatarPreviewUrl || user?.avatar_url || null;
	const isPreviewAvatar =
		typeof avatarSrc === "string" &&
		(avatarSrc.startsWith("blob:") || avatarSrc.startsWith("data:"));
	const avatarInitial = (profile.displayName || profile.email || t("User"))
		.trim()
		.charAt(0)
		.toUpperCase();

	// ── Web Push state (notifications tab) ─────────────────────────
	type WebPushState = {
		supported: boolean;
		permission: NotificationPermission;
		enabled: boolean;
		busy: boolean;
	};
	const [webPush, setWebPush] = useState<WebPushState>(() => ({
		supported: false,
		permission:
			typeof Notification !== "undefined"
				? Notification.permission
				: "default",
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
			if (!registration) throw new Error(t("Service Worker is not ready"));
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

	const handleSavePreferences = async () => {
		// Preferences ride along with the next profile save; here we just hint the
		// user. Granular per-category server preferences are tracked in the legacy
		// /settings page until a dedicated /api/v1/me/notification-preferences
		// endpoint lands.
		toastSuccess(
			t("Preferences saved locally"),
			t(
				"Your toggles are stored in this browser. Detailed server-side preferences are coming soon.",
			),
		);
	};

	// ── API keys (premium only) ────────────────────────────────────
	const [apiKeyName, setApiKeyName] = useState("");
	const [apiKeyPermissions, setApiKeyPermissions] = useState("");
	const [apiKeyRateLimit, setApiKeyRateLimit] = useState("");
	const [createdRawKey, setCreatedRawKey] = useState<string | null>(null);

	const apiKeysQuery = useQuery({
		queryKey: ["apikeys"],
		enabled: activeTab === "api" && isPremiumOrStaff(tier),
		queryFn: () => apiClient.get("/api/v1/apikeys", assertApiKeyListResponse),
	});

	const createApiKeyMutation = useMutation({
		mutationFn: async () => {
			const name = apiKeyName.trim();
			if (!name) throw new Error(t("Please enter a key name"));
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
			toastError(t("Create failed"), uiMessageFromError(err, t));
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
			toastError(t("Revoke failed"), uiMessageFromError(err, t));
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
			toastError(t("Delete failed"), uiMessageFromError(err, t));
		},
	});

	const handleCopyRawKey = async (rawKey: string): Promise<void> => {
		try {
			await navigator.clipboard.writeText(rawKey);
			toastSuccess(t("Copied to clipboard"));
		} catch (err) {
			const message =
				err instanceof Error ? err.message : t("Copy failed");
			toastError(t("Copy failed"), message);
		}
	};

	const renderTab = () => {
		switch (activeTab) {
			case "profile":
				return (
					<ProfileTab
						t={t}
						profile={profile}
						setProfile={setProfile}
						avatarInputRef={avatarInputRef}
						avatarSrc={avatarSrc}
						isPreviewAvatar={isPreviewAvatar}
						avatarInitial={avatarInitial}
						uploadingAvatar={uploadAvatarMutation.isPending}
						avatarFile={avatarFile}
						handleAvatarChange={handleAvatarChange}
						onUploadAvatar={() => uploadAvatarMutation.mutate()}
						onSave={async () => {
							await updateUserMutation.mutateAsync();
						}}
						saving={updateUserMutation.isPending}
						avatarMaxBytes={AVATAR_MAX_BYTES}
					/>
				);
			case "security":
				return <SecurityTab />;
			case "notifications":
				return (
					<SettingsNotificationsTab
						webPushSupported={webPush.supported}
						webPushEnabled={webPush.enabled}
						webPushBusy={webPush.busy}
						webPushPermissionDenied={webPush.permission === "denied"}
						onEnableWebPush={() => void enableWebPush()}
						onDisableWebPush={() => void disableWebPush()}
						onSendTestWebPush={() => void sendTestWebPush()}
						onSavePreferences={() => void handleSavePreferences()}
						saving={false}
					/>
				);
			case "billing":
				return <SettingsBillingTab tier={tier} />;
			case "privacy":
				return <SettingsPrivacyTab />;
			case "api":
				if (!isPremiumOrStaff(tier)) {
					return (
						<motion.div
							initial={{ opacity: 0, y: 12 }}
							animate={{ opacity: 1, y: 0 }}
							transition={{ duration: 0.32 }}
						>
							<Card
								className="overflow-hidden border shadow-sm"
								style={{
									backgroundImage: "var(--surface-hero-amber-gradient)",
									borderColor: "var(--surface-accent-border)",
								}}
							>
								<CardHeader>
									<CardTitle className="flex items-center gap-2">
										<Crown
											aria-hidden="true"
											className="h-5 w-5"
											style={{ color: "#b45309" }}
										/>
										{t("API keys are a Premium feature")}
									</CardTitle>
									<CardDescription>
										{t(
											"Upgrade to Premium to issue programmatic API keys with custom permissions and rate limits.",
										)}
									</CardDescription>
								</CardHeader>
								<CardContent className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
									<div
										className="text-sm"
										style={{ color: "var(--surface-muted-text)" }}
									>
										<Badge variant="outline" className="mr-2">
											{t("Current tier")}
										</Badge>
										{t(roleTierLabelKeyFor(tier))}
									</div>
									<Link href={withLocalePath(locale, "/settings/profile")}>
										<Button>
											<Sparkles
												aria-hidden="true"
												className="mr-2 h-4 w-4"
											/>
											{t("Upgrade to Premium")}
										</Button>
									</Link>
								</CardContent>
							</Card>
						</motion.div>
					);
				}
				return (
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
				);
		}
	};

	const activeDef = TABS.find((tab) => tab.key === activeTab) ?? TABS[0];

	return (
		<ProtectedRoute>
			<div
				className="flex min-h-screen"
				style={{ backgroundColor: "var(--color-background)" }}
			>
				<Sidebar />

				<MainContent>
					<Header />

					<div className="p-6">
						<div className="mb-6">
							<h1
								className="text-2xl font-bold"
								style={{ color: "var(--field-foreground)" }}
							>
								{t("Account settings")}
							</h1>
							<p
								className="text-sm"
								style={{ color: "var(--surface-muted-text)" }}
							>
								{t(activeDef.descKey)}
							</p>
						</div>

						<motion.div
							variants={containerVariants}
							initial="hidden"
							animate="visible"
							className="grid grid-cols-1 gap-6 lg:grid-cols-4"
						>
							<motion.div variants={itemVariants}>
								<Card className="h-fit">
									<CardContent className="p-2">
										<nav
											className="space-y-1"
											role="tablist"
											aria-orientation="vertical"
											aria-label={t("Account settings")}
										>
											{TABS.map((tab) => {
												const isActive = activeTab === tab.key;
												const isPremiumLocked =
													tab.key === "api" && !isPremiumOrStaff(tier);
												return (
													<button
														key={tab.key}
														type="button"
														onClick={() => setActiveTab(tab.key)}
														role="tab"
														id={`me-settings-tab-${tab.key}`}
														aria-selected={isActive}
														aria-controls={`me-settings-tabpanel-${tab.key}`}
														className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
															isActive
																? "bg-primary-50 text-primary-700 font-medium"
																: "text-neutral-600 hover:bg-neutral-50"
														}`}
													>
														<tab.Icon
															aria-hidden="true"
															className="h-4 w-4"
														/>
														<span className="flex-1 text-left">
															{t(tab.labelKey)}
														</span>
														{isPremiumLocked && (
															<Crown
																aria-hidden="true"
																className="h-3.5 w-3.5"
																style={{ color: "#b45309" }}
															/>
														)}
													</button>
												);
											})}
										</nav>
									</CardContent>
								</Card>
							</motion.div>

							<motion.div
								variants={itemVariants}
								className="lg:col-span-3"
								role="tabpanel"
								id={`me-settings-tabpanel-${activeTab}`}
								aria-labelledby={`me-settings-tab-${activeTab}`}
							>
								<AnimatePresence mode="wait">
									<motion.div
										key={activeTab}
										initial={{ opacity: 0, y: 8 }}
										animate={{ opacity: 1, y: 0 }}
										exit={{ opacity: 0, y: -6 }}
										transition={{ duration: 0.22 }}
									>
										{renderTab()}
									</motion.div>
								</AnimatePresence>
							</motion.div>
						</motion.div>
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}

function roleTierLabelKeyFor(tier: RoleTier): string {
	switch (tier) {
		case "super_admin":
			return "Super admin";
		case "tenant_admin":
			return "Tenant admin";
		case "premium_user":
			return "Premium user";
		case "verified_user":
			return "Verified user";
		case "basic_user":
			return "Basic user";
	}
}
