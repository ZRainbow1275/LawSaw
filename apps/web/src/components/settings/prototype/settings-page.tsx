"use client";

/**
 * SettingsPagePrototype — 1:1 still of `prototype/app.html:1635-1786`.
 *
 * Layout:
 *   - .page-header (Gear icon + 系统设置)
 *   - .settings-layout grid 220px 1fr
 *     - left .content-card: 6 tabs (个人资料 / 通知偏好 / 外观 / 安全 / API 密钥 / 系统信息)
 *     - right .content-card: active tab panel
 *
 * All data is real (no mocks):
 *   - profile : useAuth + PATCH /api/v1/users/{id}
 *   - notifications : preferences in user.preferences (PATCH /api/v1/users/{id})
 *   - appearance : preferences.appearance (PATCH /api/v1/users/{id})
 *   - security : useChangePassword + useMfaTotpSetup/Confirm/Disable
 *   - apikeys : GET/POST /api/v1/apikeys via apiClient
 *   - system : useHealth + useArticleStats
 */

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { useAuth } from "@/hooks/use-auth";
import {
	useChangePassword,
	useMfaTotpConfirm,
	useMfaTotpDisable,
	useMfaTotpSetup,
} from "@/hooks/use-security";
import { apiClient, ifMatchFromVersion } from "@/lib/api";
import {
	type ApiKey,
	assertApiKeyListResponse,
	assertArticleStats,
	assertCreateApiKeyResponse,
	assertDeleteResponse,
	assertHealthResponse,
	assertUserDetailResponse,
	assertUserProfile,
} from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	Bell,
	Database,
	Key,
	Loader2,
	type LucideIcon,
	Monitor,
	Moon,
	Settings as SettingsIcon,
	Shield,
	Sun,
	User,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { type CSSProperties, useEffect, useMemo, useState } from "react";

type TabId =
	| "profile"
	| "notifications"
	| "appearance"
	| "security"
	| "apikeys"
	| "system";

interface TabDef {
	id: TabId;
	label: string;
	Icon: LucideIcon;
}

const containerStyle: CSSProperties = {
	padding: 32,
	maxWidth: 1200,
	margin: "0 auto",
	width: "100%",
};

const headerStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	fontSize: 22,
	fontWeight: 700,
	color: "var(--surface-card-foreground)",
	marginBottom: 24,
};

const layoutStyle: CSSProperties = {
	display: "grid",
	gridTemplateColumns: "220px 1fr",
	gap: 16,
	alignItems: "start",
};

const cardStyle: CSSProperties = {
	background: "var(--color-card)",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 12,
	padding: 24,
};

const tabsListCardStyle: CSSProperties = {
	...cardStyle,
	padding: 12,
};

const tabBaseStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: 10,
	padding: "10px 14px",
	width: "100%",
	border: "none",
	borderRadius: 8,
	background: "transparent",
	color: "var(--surface-card-muted-fg)",
	fontSize: 13,
	fontWeight: 500,
	textAlign: "left",
	cursor: "pointer",
	transition: "background-color 0.15s ease, color 0.15s ease",
};

const tabActiveStyle: CSSProperties = {
	background: "var(--color-primary-50)",
	color: "var(--color-primary-700)",
	fontWeight: 600,
};

const sectionTitleStyle: CSSProperties = {
	fontSize: 14,
	fontWeight: 700,
	color: "var(--surface-card-foreground)",
	marginBottom: 16,
};

const formGroupStyle: CSSProperties = {
	marginBottom: 16,
};

const formLabelStyle: CSSProperties = {
	display: "block",
	fontSize: 13,
	fontWeight: 600,
	color: "var(--surface-card-muted-fg)",
	marginBottom: 8,
};

const formInputStyle: CSSProperties = {
	width: "100%",
	padding: "10px 14px",
	fontSize: 13,
	color: "var(--surface-card-foreground)",
	background: "var(--color-card)",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 8,
	outline: "none",
	fontFamily: "inherit",
};

const btnSubmitStyle = (disabled: boolean): CSSProperties => ({
	display: "inline-flex",
	alignItems: "center",
	gap: 8,
	padding: "8px 20px",
	fontSize: 13,
	fontWeight: 600,
	border: "none",
	borderRadius: 8,
	color: "#fff",
	background: disabled
		? "var(--surface-card-border-strong)"
		: "linear-gradient(135deg, #ff8a5e, #ff6b35)",
	boxShadow: disabled ? "none" : "var(--shadow-brand)",
	cursor: disabled ? "not-allowed" : "pointer",
	opacity: disabled ? 0.7 : 1,
});

const btnGhostStyle: CSSProperties = {
	padding: "8px 18px",
	fontSize: 13,
	fontWeight: 600,
	background: "transparent",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 8,
	color: "var(--surface-card-muted-fg)",
	cursor: "pointer",
};

const btnDangerStyle: CSSProperties = {
	padding: "8px 14px",
	fontSize: 12,
	fontWeight: 600,
	border: "1px solid var(--color-error)",
	background: "var(--color-error-light)",
	color: "var(--color-error)",
	borderRadius: 8,
	cursor: "pointer",
};

const toggleRowStyle: CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	padding: "12px 0",
	borderBottom: "1px solid var(--surface-card-tint-bg)",
};

const checkboxStyle: CSSProperties = {
	width: 18,
	height: 18,
	accentColor: "var(--color-primary-500)",
	cursor: "pointer",
};

const toolbarBtnStyle = (active: boolean): CSSProperties => ({
	display: "inline-flex",
	alignItems: "center",
	gap: 6,
	padding: "8px 16px",
	fontSize: 13,
	fontWeight: 600,
	border: `1px solid ${active ? "var(--color-primary-500)" : "var(--surface-card-border-strong)"}`,
	background: active ? "var(--color-primary-50)" : "var(--color-card)",
	color: active ? "var(--color-primary-700)" : "var(--surface-card-muted-fg)",
	borderRadius: 8,
	cursor: "pointer",
});

const toolbarSelectStyle: CSSProperties = {
	padding: "8px 14px",
	fontSize: 13,
	color: "var(--surface-card-foreground)",
	background: "var(--color-card)",
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 8,
	cursor: "pointer",
	fontFamily: "inherit",
};

const apiKeyCardStyle: CSSProperties = {
	border: "1px solid var(--surface-card-border-strong)",
	borderRadius: 12,
	padding: "14px 16px",
	marginBottom: 8,
	background: "var(--color-card)",
};

const infoRowStyle: CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	padding: "10px 0",
	borderBottom: "1px solid var(--surface-card-tint-bg)",
	fontSize: 13,
};

const infoLabelStyle: CSSProperties = { color: "var(--surface-card-faint-fg)" };
const infoValueStyle: CSSProperties = {
	fontWeight: 600,
	color: "var(--surface-card-foreground)",
};

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function pickBoolean(value: unknown, fallback: boolean): boolean {
	return typeof value === "boolean" ? value : fallback;
}

type Theme = "light" | "dark" | "system";

function pickTheme(value: unknown, fallback: Theme): Theme {
	return value === "light" || value === "dark" || value === "system"
		? value
		: fallback;
}

function formatRoleLabel(roles: readonly string[] | undefined): string {
	if (!roles || roles.length === 0) return "—";
	if (roles.includes("super_admin")) return "超级管理员";
	if (roles.includes("tenant_admin") || roles.includes("admin"))
		return "租户管理员";
	if (roles.includes("premium_user")) return "高级用户 (Premium)";
	if (roles.includes("verified_user")) return "已认证用户";
	return "标准用户";
}

function formatDateTime(value: string | null | undefined): string {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	const yr = d.getFullYear();
	const mo = String(d.getMonth() + 1).padStart(2, "0");
	const dy = String(d.getDate()).padStart(2, "0");
	const hh = String(d.getHours()).padStart(2, "0");
	const mm = String(d.getMinutes()).padStart(2, "0");
	const ss = String(d.getSeconds()).padStart(2, "0");
	return `${yr}-${mo}-${dy} ${hh}:${mm}:${ss}`;
}

function formatDate(value: string | null | undefined): string {
	if (!value) return "—";
	const d = new Date(value);
	if (Number.isNaN(d.getTime())) return value;
	return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function SettingsPagePrototype() {
	const t = useT();
	const { user } = useAuth();
	const setUser = useAuthStore((s) => s.setUser);
	const queryClient = useQueryClient();
	const {
		success: toastSuccess,
		error: toastError,
		info: toastInfo,
	} = useToast();

	const [active, setActive] = useState<TabId>("profile");
	const [profileName, setProfileName] = useState("");
	const [profileEmail, setProfileEmail] = useState("");
	const [notificationsState, setNotificationsState] = useState({
		emailAlerts: true,
		riskAlerts: true,
		weeklyDigest: false,
		newArticles: false,
	});
	const [appearance, setAppearance] = useState<{
		theme: Theme;
		language: "zh" | "en";
		compactMode: boolean;
	}>({
		theme: "light",
		language: "zh",
		compactMode: false,
	});

	const [pwCurrent, setPwCurrent] = useState("");
	const [pwNew, setPwNew] = useState("");
	const [pwConfirm, setPwConfirm] = useState("");

	const [mfaSetup, setMfaSetup] = useState<{
		uri: string;
		secret: string;
	} | null>(null);
	const [mfaCode, setMfaCode] = useState("");

	// User detail (preferences + version)
	const userId = user?.id ?? null;
	const userDetailQuery = useQuery({
		queryKey: ["users", userId],
		enabled: Boolean(userId),
		queryFn: async () => {
			if (!userId) throw new Error("No user");
			return apiClient.get(`/api/v1/users/${userId}`, assertUserDetailResponse);
		},
	});

	useEffect(() => {
		if (!user) return;
		setProfileName(user.display_name ?? "");
		setProfileEmail(user.email ?? "");
	}, [user]);

	useEffect(() => {
		const data = userDetailQuery.data;
		if (!data) return;
		const prefs = data.user.preferences;
		if (isRecord(prefs)) {
			const notif = prefs.notifications;
			if (isRecord(notif)) {
				setNotificationsState({
					emailAlerts: pickBoolean(notif.emailAlerts, true),
					riskAlerts: pickBoolean(notif.riskAlerts, true),
					weeklyDigest: pickBoolean(notif.weeklyDigest, false),
					newArticles: pickBoolean(notif.newArticles, false),
				});
			}
			const app = prefs.appearance;
			if (isRecord(app)) {
				setAppearance((prev) => ({
					...prev,
					theme: pickTheme(app.theme, "light"),
					compactMode: pickBoolean(app.compactMode, false),
				}));
			}
		}
	}, [userDetailQuery.data]);

	const updateUserMutation = useMutation({
		mutationFn: async (kind: "profile" | "notifications" | "appearance") => {
			if (!userId) throw new Error(t("Missing user info"));
			const version = userDetailQuery.data?.user.version;
			if (typeof version !== "number")
				throw new Error(
					t("Missing version info. Please refresh the page and retry."),
				);

			const payload: Record<string, unknown> = {};
			if (kind === "profile") {
				payload.display_name = profileName.trim() || null;
			}
			payload.preferences = {
				notifications: notificationsState,
				appearance: {
					theme: appearance.theme,
					compactMode: appearance.compactMode,
				},
				language: appearance.language,
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
			queryClient.invalidateQueries({ queryKey: ["users", userId] });
		},
		onError: (err) => {
			toastError(
				t("Save failed"),
				err instanceof Error ? err.message : t("Unknown error"),
			);
		},
	});

	// Security: change password + MFA
	const changePassword = useChangePassword();
	const mfaSetupMutation = useMfaTotpSetup();
	const mfaConfirmMutation = useMfaTotpConfirm();
	const mfaDisableMutation = useMfaTotpDisable();

	const handleChangePassword = () => {
		if (!pwNew.trim() || pwNew !== pwConfirm) {
			toastError(t("Update password failed"), t("Passwords do not match"));
			return;
		}
		changePassword.mutate(
			{ current_password: pwCurrent, new_password: pwNew },
			{
				onSuccess: () => {
					toastSuccess(t("Password updated"));
					setPwCurrent("");
					setPwNew("");
					setPwConfirm("");
				},
				onError: (err) => {
					toastError(
						t("Update password failed"),
						err instanceof Error ? err.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const handleSetupMfa = () => {
		mfaSetupMutation.mutate(undefined, {
			onSuccess: (res) => {
				setMfaSetup({ uri: res.provisioning_uri, secret: res.secret });
				toastInfo(
					t("Scan the QR code"),
					t("Use a TOTP app, then enter the 6-digit code to confirm"),
				);
			},
			onError: (err) => {
				toastError(
					t("Setup failed"),
					err instanceof Error ? err.message : t("Unknown error"),
				);
			},
		});
	};

	const handleConfirmMfa = () => {
		if (!mfaCode.trim()) return;
		mfaConfirmMutation.mutate(mfaCode.trim(), {
			onSuccess: () => {
				toastSuccess(t("2FA enabled successfully"));
				setMfaSetup(null);
				setMfaCode("");
				queryClient.invalidateQueries({ queryKey: ["users", userId] });
			},
			onError: (err) => {
				toastError(
					t("MFA verification failed."),
					err instanceof Error ? err.message : t("Unknown error"),
				);
			},
		});
	};

	const handleDisableMfa = () => {
		mfaDisableMutation.mutate(undefined, {
			onSuccess: () => {
				toastSuccess(t("2FA disabled successfully"));
				queryClient.invalidateQueries({ queryKey: ["users", userId] });
			},
			onError: (err) => {
				toastError(
					t("MFA verification failed."),
					err instanceof Error ? err.message : t("Unknown error"),
				);
			},
		});
	};

	// API keys
	const apiKeysQuery = useQuery({
		queryKey: ["apikeys"],
		enabled: active === "apikeys",
		queryFn: () => apiClient.get("/api/v1/apikeys", assertApiKeyListResponse),
	});

	const [creatingKey, setCreatingKey] = useState(false);
	const [newKeyName, setNewKeyName] = useState("");
	const [newKeyPerms, setNewKeyPerms] = useState("");
	const [newKeyRate, setNewKeyRate] = useState("");

	const createKeyMutation = useMutation({
		mutationFn: async () => {
			const name = newKeyName.trim();
			if (!name) throw new Error(t("Please enter a key name"));
			const permissions = newKeyPerms
				.split(",")
				.map((s) => s.trim())
				.filter((s) => s.length > 0);
			const payload: Record<string, unknown> = { name };
			if (permissions.length) payload.permissions = permissions;
			if (newKeyRate.trim()) {
				const rate = Number(newKeyRate);
				if (!Number.isFinite(rate) || rate <= 0) {
					throw new Error(t("rate_limit must be a positive number"));
				}
				payload.rate_limit = Math.floor(rate);
			}
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
			setCreatingKey(false);
			setNewKeyName("");
			setNewKeyPerms("");
			setNewKeyRate("");
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
		onError: (err) => {
			toastError(
				t("Create failed"),
				err instanceof Error ? err.message : t("Unknown error"),
			);
		},
	});

	const revokeKeyMutation = useMutation({
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
	});

	const deleteKeyMutation = useMutation({
		mutationFn: async (id: string) =>
			apiClient.delete(`/api/v1/apikeys/${id}`, assertDeleteResponse),
		onSuccess: () => {
			toastSuccess(t("API key deleted"));
			queryClient.invalidateQueries({ queryKey: ["apikeys"] });
		},
	});

	// System info
	const healthQuery = useQuery({
		queryKey: ["health"],
		enabled: active === "system",
		queryFn: () => apiClient.get("/health", assertHealthResponse),
	});

	const statsQuery = useQuery({
		queryKey: ["articleStats"],
		enabled: active === "system",
		queryFn: () => apiClient.get("/api/v1/articles/stats", assertArticleStats),
	});

	const tabs: TabDef[] = useMemo(
		() => [
			{ id: "profile", label: t("Profile"), Icon: User },
			{ id: "notifications", label: t("Notifications"), Icon: Bell },
			{ id: "appearance", label: t("Appearance"), Icon: Moon },
			{ id: "security", label: t("Security"), Icon: Shield },
			{ id: "apikeys", label: t("API keys"), Icon: Key },
			{ id: "system", label: t("System info"), Icon: Database },
		],
		[t],
	);

	const initial = (profileName || profileEmail || "U")
		.trim()
		.charAt(0)
		.toUpperCase();
	const roleLabel = formatRoleLabel(userDetailQuery.data?.roles);

	return (
		<ProtectedRoute>
			<div
				className="flex min-h-screen"
				style={{ background: "var(--color-background)" }}
			>
				<Sidebar />
				<MainContent>
					<Header />
					<div style={containerStyle}>
						<div style={headerStyle}>
							<SettingsIcon
								aria-hidden="true"
								size={22}
								style={{ color: "var(--color-primary-500)" }}
							/>
							{t("Settings")}
						</div>

						<div style={layoutStyle}>
							<div style={tabsListCardStyle}>
								<nav role="tablist" aria-orientation="vertical">
									{tabs.map((tab) => (
										<button
											key={tab.id}
											type="button"
											role="tab"
											aria-selected={active === tab.id}
											onClick={() => setActive(tab.id)}
											style={{
												...tabBaseStyle,
												...(active === tab.id ? tabActiveStyle : {}),
											}}
										>
											<tab.Icon aria-hidden="true" size={16} />
											{tab.label}
										</button>
									))}
								</nav>
							</div>

							<div style={cardStyle}>
								{active === "profile" ? (
									<ProfilePanel
										t={t}
										initial={initial}
										profileName={profileName}
										profileEmail={profileEmail}
										onChangeName={setProfileName}
										onSave={() => updateUserMutation.mutate("profile")}
										saving={updateUserMutation.isPending}
									/>
								) : null}

								{active === "notifications" ? (
									<NotificationsPanel
										t={t}
										value={notificationsState}
										onChange={setNotificationsState}
										onSave={() => updateUserMutation.mutate("notifications")}
										saving={updateUserMutation.isPending}
									/>
								) : null}

								{active === "appearance" ? (
									<AppearancePanel
										t={t}
										value={appearance}
										onChange={setAppearance}
										onSave={() => updateUserMutation.mutate("appearance")}
										saving={updateUserMutation.isPending}
									/>
								) : null}

								{active === "security" ? (
									<SecurityPanel
										t={t}
										pwCurrent={pwCurrent}
										pwNew={pwNew}
										pwConfirm={pwConfirm}
										onPwCurrent={setPwCurrent}
										onPwNew={setPwNew}
										onPwConfirm={setPwConfirm}
										handleChangePassword={handleChangePassword}
										changing={changePassword.isPending}
										mfaEnabled={
											isRecord(userDetailQuery.data?.user.preferences) &&
											pickBoolean(
												(
													userDetailQuery.data?.user.preferences as Record<
														string,
														unknown
													>
												).mfa_enabled,
												false,
											)
										}
										handleSetupMfa={handleSetupMfa}
										handleConfirmMfa={handleConfirmMfa}
										handleDisableMfa={handleDisableMfa}
										mfaSetup={mfaSetup}
										mfaCode={mfaCode}
										onMfaCode={setMfaCode}
										busy={
											mfaSetupMutation.isPending ||
											mfaConfirmMutation.isPending ||
											mfaDisableMutation.isPending
										}
									/>
								) : null}

								{active === "apikeys" ? (
									<ApiKeysPanel
										t={t}
										keys={apiKeysQuery.data?.keys ?? []}
										isLoading={apiKeysQuery.isLoading}
										isError={apiKeysQuery.isError}
										creating={creatingKey}
										onCreatingChange={setCreatingKey}
										newKeyName={newKeyName}
										onNewKeyName={setNewKeyName}
										newKeyPerms={newKeyPerms}
										onNewKeyPerms={setNewKeyPerms}
										newKeyRate={newKeyRate}
										onNewKeyRate={setNewKeyRate}
										onCreate={() => createKeyMutation.mutate()}
										createPending={createKeyMutation.isPending}
										onRevoke={(id) => revokeKeyMutation.mutate(id)}
										onDelete={(id) => deleteKeyMutation.mutate(id)}
									/>
								) : null}

								{active === "system" ? (
									<SystemPanel
										t={t}
										version={healthQuery.data?.version ?? null}
										apiStatus={
											healthQuery.isLoading
												? t("Checking")
												: healthQuery.isError
													? t("Error")
													: (healthQuery.data?.status ?? t("Unknown"))
										}
										totalArticles={statsQuery.data?.total_articles ?? null}
										todayCount={statsQuery.data?.today_count ?? null}
										role={roleLabel}
										dbStatus={
											statsQuery.isLoading
												? t("Checking")
												: statsQuery.isError
													? t("Error")
													: t("Available")
										}
										lastSync={formatDateTime(
											healthQuery.data ? new Date().toISOString() : null,
										)}
									/>
								) : null}
							</div>
						</div>
					</div>
				</MainContent>
			</div>
		</ProtectedRoute>
	);
}

// ──────────────────────────────────────────────────────────
// Panel components
// ──────────────────────────────────────────────────────────

function ProfilePanel({
	t,
	initial,
	profileName,
	profileEmail,
	onChangeName,
	onSave,
	saving,
}: {
	t: (k: string, p?: Record<string, string | number>) => string;
	initial: string;
	profileName: string;
	profileEmail: string;
	onChangeName: (v: string) => void;
	onSave: () => void;
	saving: boolean;
}) {
	return (
		<div>
			<div style={sectionTitleStyle}>{t("Profile")}</div>

			<div
				style={{
					width: 80,
					height: 80,
					borderRadius: "50%",
					background:
						"linear-gradient(135deg, var(--color-primary-300), var(--color-primary-600))",
					color: "#fff",
					fontSize: 32,
					fontWeight: 700,
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					marginBottom: 20,
				}}
			>
				{initial}
			</div>

			<div style={formGroupStyle}>
				<label htmlFor="settings-display-name" style={formLabelStyle}>
					{t("Display name")}
				</label>
				<input
					id="settings-display-name"
					value={profileName}
					onChange={(e) => onChangeName(e.target.value)}
					style={formInputStyle}
				/>
			</div>

			<div style={formGroupStyle}>
				<label htmlFor="settings-email" style={formLabelStyle}>
					{t("Email address")}
				</label>
				<input
					id="settings-email"
					value={profileEmail}
					readOnly
					style={{ ...formInputStyle, background: "var(--surface-card-subtle-bg)" }}
				/>
			</div>

			<div style={{ marginTop: 20 }}>
				<button
					type="button"
					onClick={onSave}
					disabled={saving}
					style={btnSubmitStyle(saving)}
				>
					{saving ? (
						<>
							<Loader2 aria-hidden="true" size={14} className="animate-spin" />
							{t("Saving...")}
						</>
					) : (
						t("Save changes")
					)}
				</button>
			</div>
		</div>
	);
}

function NotificationsPanel({
	t,
	value,
	onChange,
	onSave,
	saving,
}: {
	t: (k: string, p?: Record<string, string | number>) => string;
	value: {
		emailAlerts: boolean;
		riskAlerts: boolean;
		weeklyDigest: boolean;
		newArticles: boolean;
	};
	onChange: (v: typeof value) => void;
	onSave: () => void;
	saving: boolean;
}) {
	const items: Array<{
		key: keyof typeof value;
		title: string;
		desc: string;
	}> = [
		{
			key: "emailAlerts",
			title: t("Email alerts"),
			desc: t("Receive email notifications for important updates"),
		},
		{
			key: "riskAlerts",
			title: t("Risk alerts"),
			desc: t("Notify when high-risk articles are detected"),
		},
		{
			key: "weeklyDigest",
			title: t("Weekly digest"),
			desc: t("Send a weekly digest of articles"),
		},
		{
			key: "newArticles",
			title: t("New articles"),
			desc: t("Notify when new articles are ingested"),
		},
	];

	return (
		<div>
			<div style={sectionTitleStyle}>{t("Notifications")}</div>
			<div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
				{items.map((it) => (
					<label key={it.key} style={toggleRowStyle}>
						<div>
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: "var(--surface-card-foreground)",
								}}
							>
								{it.title}
							</div>
							<div style={{ fontSize: 12, color: "var(--surface-card-faint-fg)" }}>
								{it.desc}
							</div>
						</div>
						<input
							type="checkbox"
							checked={value[it.key]}
							onChange={(e) =>
								onChange({ ...value, [it.key]: e.target.checked })
							}
							style={checkboxStyle}
						/>
					</label>
				))}

				<div
					style={{
						marginTop: 16,
						padding: 16,
						border: "1px solid var(--surface-card-border-strong)",
						borderRadius: 12,
						background: "var(--surface-card-subtle-bg)",
					}}
				>
					<div
						style={{
							display: "flex",
							alignItems: "center",
							justifyContent: "space-between",
						}}
					>
						<div>
							<div
								style={{
									fontSize: 13,
									fontWeight: 600,
									color: "var(--surface-card-foreground)",
								}}
							>
								{t("Browser push (Web Push)")}
							</div>
							<div style={{ fontSize: 12, color: "var(--surface-card-faint-fg)" }}>
								{t(
									"Receive notifications in the background (requires browser permission and Service Worker)",
								)}
							</div>
						</div>
						<button
							type="button"
							style={{
								...btnSubmitStyle(false),
								padding: "6px 14px",
								fontSize: 12,
							}}
							onClick={async () => {
								if (typeof Notification === "undefined") return;
								await Notification.requestPermission();
							}}
						>
							{t("Enable")}
						</button>
					</div>
				</div>
			</div>

			<div style={{ marginTop: 20 }}>
				<button
					type="button"
					onClick={onSave}
					disabled={saving}
					style={btnSubmitStyle(saving)}
				>
					{saving ? (
						<>
							<Loader2 aria-hidden="true" size={14} className="animate-spin" />
							{t("Saving...")}
						</>
					) : (
						t("Save settings")
					)}
				</button>
			</div>
		</div>
	);
}

function AppearancePanel({
	t,
	value,
	onChange,
	onSave,
	saving,
}: {
	t: (k: string, p?: Record<string, string | number>) => string;
	value: { theme: Theme; language: "zh" | "en"; compactMode: boolean };
	onChange: (v: typeof value) => void;
	onSave: () => void;
	saving: boolean;
}) {
	const themes: Array<{ id: Theme; label: string; Icon: LucideIcon }> = [
		{ id: "light", label: t("Light"), Icon: Sun },
		{ id: "dark", label: t("Dark"), Icon: Moon },
		{ id: "system", label: t("Follow system"), Icon: Monitor },
	];

	return (
		<div>
			<div style={sectionTitleStyle}>{t("Appearance")}</div>

			<div style={{ marginBottom: 20 }}>
				<div style={formLabelStyle}>{t("Theme")}</div>
				<div style={{ display: "flex", gap: 8 }}>
					{themes.map((tp) => (
						<button
							key={tp.id}
							type="button"
							style={toolbarBtnStyle(value.theme === tp.id)}
							onClick={() => onChange({ ...value, theme: tp.id })}
						>
							<tp.Icon aria-hidden="true" size={14} />
							{tp.label}
						</button>
					))}
				</div>
			</div>

			<div style={{ marginBottom: 20 }}>
				<div style={formLabelStyle}>{t("Interface language")}</div>
				<select
					value={value.language}
					onChange={(e) =>
						onChange({
							...value,
							language: e.target.value === "en" ? "en" : "zh",
						})
					}
					style={toolbarSelectStyle}
				>
					<option value="zh">简体中文</option>
					<option value="en">English</option>
				</select>
			</div>

			<label
				style={{
					...toggleRowStyle,
					paddingTop: 16,
					borderTop: "1px solid var(--surface-card-tint-bg)",
				}}
			>
				<div>
					<div
						style={{
							fontSize: 13,
							fontWeight: 600,
							color: "var(--surface-card-foreground)",
						}}
					>
						{t("Compact mode")}
					</div>
					<div style={{ fontSize: 12, color: "var(--surface-card-faint-fg)" }}>
						{t("Reduce spacing to show more content")}
					</div>
				</div>
				<input
					type="checkbox"
					checked={value.compactMode}
					onChange={(e) =>
						onChange({ ...value, compactMode: e.target.checked })
					}
					style={checkboxStyle}
				/>
			</label>

			<div style={{ marginTop: 20 }}>
				<button
					type="button"
					onClick={onSave}
					disabled={saving}
					style={btnSubmitStyle(saving)}
				>
					{saving ? (
						<>
							<Loader2 aria-hidden="true" size={14} className="animate-spin" />
							{t("Saving...")}
						</>
					) : (
						t("Save settings")
					)}
				</button>
			</div>
		</div>
	);
}

function SecurityPanel({
	t,
	pwCurrent,
	pwNew,
	pwConfirm,
	onPwCurrent,
	onPwNew,
	onPwConfirm,
	handleChangePassword,
	changing,
	mfaEnabled,
	handleSetupMfa,
	handleConfirmMfa,
	handleDisableMfa,
	mfaSetup,
	mfaCode,
	onMfaCode,
	busy,
}: {
	t: (k: string, p?: Record<string, string | number>) => string;
	pwCurrent: string;
	pwNew: string;
	pwConfirm: string;
	onPwCurrent: (v: string) => void;
	onPwNew: (v: string) => void;
	onPwConfirm: (v: string) => void;
	handleChangePassword: () => void;
	changing: boolean;
	mfaEnabled: boolean;
	handleSetupMfa: () => void;
	handleConfirmMfa: () => void;
	handleDisableMfa: () => void;
	mfaSetup: { uri: string; secret: string } | null;
	mfaCode: string;
	onMfaCode: (v: string) => void;
	busy: boolean;
}) {
	return (
		<div>
			<div style={sectionTitleStyle}>{t("Security")}</div>

			<div style={formGroupStyle}>
				<label style={formLabelStyle} htmlFor="pw-current">
					{t("Change password")}
				</label>
				<input
					id="pw-current"
					type="password"
					value={pwCurrent}
					onChange={(e) => onPwCurrent(e.target.value)}
					placeholder={t("Current password")}
					style={{ ...formInputStyle, marginBottom: 8 }}
				/>
				<input
					type="password"
					value={pwNew}
					onChange={(e) => onPwNew(e.target.value)}
					placeholder={t("New password")}
					style={{ ...formInputStyle, marginBottom: 8 }}
				/>
				<input
					type="password"
					value={pwConfirm}
					onChange={(e) => onPwConfirm(e.target.value)}
					placeholder={t("Confirm new password")}
					style={formInputStyle}
				/>
			</div>
			<button
				type="button"
				onClick={handleChangePassword}
				disabled={changing}
				style={{ ...btnSubmitStyle(changing), alignSelf: "flex-start" }}
			>
				{changing ? (
					<>
						<Loader2 aria-hidden="true" size={14} className="animate-spin" />
						{t("Updating...")}
					</>
				) : (
					t("Update password")
				)}
			</button>

			<div
				style={{
					marginTop: 24,
					paddingTop: 20,
					borderTop: "1px solid var(--surface-card-tint-bg)",
				}}
			>
				<div
					style={{
						fontSize: 15,
						fontWeight: 700,
						color: "var(--surface-card-foreground)",
						marginBottom: 4,
					}}
				>
					{t("Multi-factor authentication (MFA)")}
				</div>
				<div
					style={{
						fontSize: 13,
						color: "var(--surface-card-faint-fg)",
						marginBottom: 16,
					}}
				>
					{t(
						"Use a TOTP app (e.g. Google Authenticator) to strengthen account security",
					)}
				</div>

				<div
					style={{
						display: "flex",
						alignItems: "center",
						gap: 12,
						padding: 16,
						border: "1px solid var(--surface-card-border-strong)",
						borderRadius: 12,
						background: "var(--surface-card-subtle-bg)",
					}}
				>
					<Shield
						aria-hidden="true"
						size={24}
						style={{
							color: mfaEnabled
								? "var(--color-success)"
								: "var(--surface-card-faint-fg)",
						}}
					/>
					<div style={{ flex: 1 }}>
						<div
							style={{
								fontSize: 13,
								fontWeight: 600,
								color: "var(--surface-card-foreground)",
							}}
						>
							{mfaEnabled ? t("2FA enabled successfully") : t("2FA setup")}
						</div>
						<div style={{ fontSize: 12, color: "var(--surface-card-faint-fg)" }}>
							{mfaEnabled
								? t("Your account is protected by TOTP")
								: t("Enable two-factor for stronger protection")}
						</div>
					</div>
					{mfaEnabled ? (
						<button
							type="button"
							onClick={handleDisableMfa}
							disabled={busy}
							style={btnDangerStyle}
						>
							{t("Disable MFA")}
						</button>
					) : (
						<button
							type="button"
							onClick={handleSetupMfa}
							disabled={busy}
							style={btnSubmitStyle(busy)}
						>
							{t("Enable MFA")}
						</button>
					)}
				</div>

				{mfaSetup ? (
					<div
						style={{
							marginTop: 16,
							padding: 16,
							border: "1px solid var(--surface-card-border-strong)",
							borderRadius: 12,
							background: "var(--color-card)",
						}}
					>
						<div style={{ display: "flex", alignItems: "flex-start", gap: 16 }}>
							<div
								style={{
									background: "#fff",
									padding: 8,
									borderRadius: 8,
									border: "1px solid var(--surface-card-border-strong)",
								}}
							>
								<QRCodeSVG value={mfaSetup.uri} size={140} />
							</div>
							<div style={{ flex: 1 }}>
								<div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
									{t("Scan with your TOTP app")}
								</div>
								<code
									style={{
										display: "block",
										padding: "6px 10px",
										fontSize: 11,
										color: "var(--surface-card-muted-fg)",
										background: "var(--surface-card-subtle-bg)",
										borderRadius: 6,
										marginBottom: 12,
										wordBreak: "break-all",
									}}
								>
									{mfaSetup.secret}
								</code>
								<input
									type="text"
									value={mfaCode}
									onChange={(e) => onMfaCode(e.target.value)}
									placeholder="123456"
									style={{ ...formInputStyle, marginBottom: 8 }}
								/>
								<button
									type="button"
									onClick={handleConfirmMfa}
									disabled={busy || !mfaCode.trim()}
									style={btnSubmitStyle(busy || !mfaCode.trim())}
								>
									{t("Confirm")}
								</button>
							</div>
						</div>
					</div>
				) : null}
			</div>
		</div>
	);
}

function ApiKeysPanel({
	t,
	keys,
	isLoading,
	isError,
	creating,
	onCreatingChange,
	newKeyName,
	onNewKeyName,
	newKeyPerms,
	onNewKeyPerms,
	newKeyRate,
	onNewKeyRate,
	onCreate,
	createPending,
	onRevoke,
	onDelete,
}: {
	t: (k: string, p?: Record<string, string | number>) => string;
	keys: ApiKey[];
	isLoading: boolean;
	isError: boolean;
	creating: boolean;
	onCreatingChange: (v: boolean) => void;
	newKeyName: string;
	onNewKeyName: (v: string) => void;
	newKeyPerms: string;
	onNewKeyPerms: (v: string) => void;
	newKeyRate: string;
	onNewKeyRate: (v: string) => void;
	onCreate: () => void;
	createPending: boolean;
	onRevoke: (id: string) => void;
	onDelete: (id: string) => void;
}) {
	return (
		<div>
			<div style={sectionTitleStyle}>{t("API key management")}</div>

			{!creating ? (
				<button
					type="button"
					onClick={() => onCreatingChange(true)}
					style={{ ...btnSubmitStyle(false), marginBottom: 20 }}
				>
					+ {t("Create new key")}
				</button>
			) : (
				<div
					style={{
						marginBottom: 20,
						padding: 16,
						border: "1px solid var(--color-primary-200)",
						borderRadius: 12,
						background: "var(--color-primary-50)",
					}}
				>
					<div style={formGroupStyle}>
						<label style={formLabelStyle} htmlFor="new-key-name">
							{t("Key name")}
						</label>
						<input
							id="new-key-name"
							value={newKeyName}
							onChange={(e) => onNewKeyName(e.target.value)}
							placeholder={t("e.g. Production key")}
							style={formInputStyle}
						/>
					</div>
					<div style={formGroupStyle}>
						<label style={formLabelStyle} htmlFor="new-key-perms">
							{t("Permissions (comma separated)")}
						</label>
						<input
							id="new-key-perms"
							value={newKeyPerms}
							onChange={(e) => onNewKeyPerms(e.target.value)}
							placeholder="articles:read, sources:read"
							style={formInputStyle}
						/>
					</div>
					<div style={formGroupStyle}>
						<label style={formLabelStyle} htmlFor="new-key-rate">
							{t("Rate limit per minute")}
						</label>
						<input
							id="new-key-rate"
							value={newKeyRate}
							onChange={(e) => onNewKeyRate(e.target.value)}
							placeholder="100"
							style={formInputStyle}
						/>
					</div>
					<div style={{ display: "flex", gap: 8 }}>
						<button
							type="button"
							onClick={onCreate}
							disabled={createPending}
							style={btnSubmitStyle(createPending)}
						>
							{createPending ? t("Creating...") : t("Create")}
						</button>
						<button
							type="button"
							onClick={() => onCreatingChange(false)}
							style={btnGhostStyle}
						>
							{t("Cancel")}
						</button>
					</div>
				</div>
			)}

			{isLoading ? (
				<div
					style={{
						padding: 32,
						textAlign: "center",
						color: "var(--surface-card-faint-fg)",
					}}
				>
					<Loader2
						aria-hidden="true"
						size={18}
						className="animate-spin"
						style={{ display: "inline-block" }}
					/>
				</div>
			) : isError ? (
				<div style={{ padding: 16, color: "var(--color-error)", fontSize: 13 }}>
					{t("Failed to load")}
				</div>
			) : keys.length === 0 ? (
				<div
					style={{
						padding: 32,
						color: "var(--surface-card-faint-fg)",
						fontSize: 13,
						textAlign: "center",
					}}
				>
					{t("No API keys yet")}
				</div>
			) : (
				<div>
					{keys.map((k) => (
						<div key={k.id} style={apiKeyCardStyle}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
								}}
							>
								<div>
									<div
										style={{
											fontSize: 13,
											fontWeight: 600,
											color: "var(--surface-card-foreground)",
										}}
									>
										{k.name}
									</div>
									<div
										style={{
											fontFamily: "var(--font-mono)",
											fontSize: 12,
											color: "var(--surface-card-faint-fg)",
											marginTop: 4,
										}}
									>
										{k.key_prefix}_****
									</div>
								</div>
								<div style={{ display: "flex", alignItems: "center", gap: 8 }}>
									<span
										style={{
											padding: "3px 10px",
											borderRadius: 999,
											fontSize: 11,
											fontWeight: 600,
											background: k.is_active
												? "#e8f5e9"
												: "var(--surface-card-tint-bg)",
											color: k.is_active
												? "#2e7d32"
												: "var(--surface-card-muted-fg)",
										}}
									>
										{k.is_active ? t("Active") : t("Disabled")}
									</span>
									{k.is_active ? (
										<button
											type="button"
											style={btnGhostStyle}
											onClick={() => onRevoke(k.id)}
										>
											{t("Revoke")}
										</button>
									) : null}
									<button
										type="button"
										style={btnDangerStyle}
										onClick={() => onDelete(k.id)}
									>
										{t("Delete")}
									</button>
								</div>
							</div>
							<div
								style={{
									fontSize: 11,
									color: "var(--surface-card-faint-fg)",
									marginTop: 8,
								}}
							>
								{t("Permissions: {value}", {
									value: k.permissions.length ? k.permissions.join(", ") : "*",
								})}
								{" · "}
								{t("Rate limit: {n}/min", { n: k.rate_limit })}
								{" · "}
								{t("Created: {date}", { date: formatDate(k.created_at) })}
							</div>
						</div>
					))}
				</div>
			)}
		</div>
	);
}

function SystemPanel({
	t,
	version,
	apiStatus,
	totalArticles,
	todayCount,
	role,
	dbStatus,
	lastSync,
}: {
	t: (k: string, p?: Record<string, string | number>) => string;
	version: string | null;
	apiStatus: string;
	totalArticles: number | null;
	todayCount: number | null;
	role: string;
	dbStatus: string;
	lastSync: string;
}) {
	const buildVersion =
		typeof process !== "undefined"
			? process.env.NEXT_PUBLIC_APP_VERSION || null
			: null;
	return (
		<div>
			<div style={sectionTitleStyle}>{t("System info")}</div>
			<div
				style={{
					display: "flex",
					flexDirection: "column",
				}}
			>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("Application version")}</span>
					<span style={infoValueStyle}>{buildVersion ?? "v0.1.0"}</span>
				</div>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("Backend version")}</span>
					<span style={infoValueStyle}>{version ?? "—"}</span>
				</div>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("API status")}</span>
					<span
						style={{
							...infoValueStyle,
							color:
								apiStatus === t("Error")
									? "var(--color-error)"
									: "var(--color-success)",
						}}
					>
						{apiStatus}
					</span>
				</div>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("Database")}</span>
					<span
						style={{
							...infoValueStyle,
							color:
								dbStatus === t("Error")
									? "var(--color-error)"
									: "var(--color-success)",
						}}
					>
						{dbStatus}
					</span>
				</div>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("Last sync")}</span>
					<span style={infoValueStyle}>{lastSync}</span>
				</div>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("Total articles")}</span>
					<span style={infoValueStyle}>{totalArticles ?? "—"}</span>
				</div>
				<div style={infoRowStyle}>
					<span style={infoLabelStyle}>{t("Added today")}</span>
					<span style={infoValueStyle}>{todayCount ?? "—"}</span>
				</div>
				<div style={{ ...infoRowStyle, borderBottom: "none" }}>
					<span style={infoLabelStyle}>{t("User role")}</span>
					<span style={infoValueStyle}>{role}</span>
				</div>
			</div>
		</div>
	);
}
