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
import { ApiClientError } from "@/lib/api";
import type { ApiKey, LoginActivityEntry } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	Copy,
	ExternalLink,
	Eye,
	EyeOff,
	Key,
	Lock,
	RefreshCw,
	Save,
	Shield,
	Smartphone,
	Trash2,
} from "lucide-react";
import Image from "next/image";
import { QRCodeSVG } from "qrcode.react";
import { useEffect, useState } from "react";

function parseCsv(value: string): string[] {
	return value
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

// ---------------------------------------------------------------------------
// Password validation helpers (shared with register-form)
// ---------------------------------------------------------------------------

type PasswordCheck = { label: string; ok: boolean };

function passwordChecks(password: string): PasswordCheck[] {
	return [
		{ label: "At least 12 characters", ok: password.length >= 12 },
		{ label: "No more than 128 characters", ok: password.length <= 128 },
		{ label: "Includes uppercase letter", ok: /[A-Z]/.test(password) },
		{ label: "Includes lowercase letter", ok: /[a-z]/.test(password) },
		{ label: "Includes number", ok: /\d/.test(password) },
		{ label: "Includes symbol", ok: /[^A-Za-z0-9]/.test(password) },
		{ label: "No whitespace characters", ok: !/\s/.test(password) },
	];
}

function validatePasswordPolicy(password: string): string | null {
	if (!password) return "Please enter a password";
	if (password.length < 12) return "Password must be at least 12 characters";
	if (password.length > 128)
		return "Password must be no more than 128 characters";
	if (/\s/.test(password)) return "Password must not contain whitespace";
	const hasLower = /[a-z]/.test(password);
	const hasUpper = /[A-Z]/.test(password);
	const hasDigit = /\d/.test(password);
	const hasSymbol = /[^A-Za-z0-9]/.test(password);
	if (!(hasLower && hasUpper && hasDigit && hasSymbol)) {
		return "Password must include uppercase, lowercase, number, and symbol";
	}
	return null;
}

// ---------------------------------------------------------------------------
// Relative time helper
// ---------------------------------------------------------------------------

function relativeTime(
	isoString: string,
	t: (key: string, params?: Record<string, string | number>) => string,
): string {
	const now = Date.now();
	const then = new Date(isoString).getTime();
	if (Number.isNaN(then)) return t("Unknown time");
	const diffMs = now - then;
	const diffMinutes = Math.floor(diffMs / 60_000);
	if (diffMinutes < 1) return t("Just now");
	if (diffMinutes < 60) return t("{count} minutes ago", { count: diffMinutes });
	const diffHours = Math.floor(diffMinutes / 60);
	if (diffHours < 24) return t("{count} hours ago", { count: diffHours });
	const diffDays = Math.floor(diffHours / 24);
	if (diffDays === 1) return t("Yesterday");
	return t("{count} days ago", { count: diffDays });
}

// ---------------------------------------------------------------------------
// User agent shortener
// ---------------------------------------------------------------------------

function shortenUserAgent(ua: string | null): string {
	if (!ua) return "-";
	// Try extracting browser name
	if (ua.includes("Firefox")) return "Firefox";
	if (ua.includes("Edg/")) return "Edge";
	if (ua.includes("Chrome") && !ua.includes("Edg")) return "Chrome";
	if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari";
	if (ua.includes("curl")) return "curl";
	if (ua.length > 40) return `${ua.slice(0, 37)}...`;
	return ua;
}

// ---------------------------------------------------------------------------
// Action label translation
// ---------------------------------------------------------------------------

function actionLabel(action: string, t: (key: string) => string): string {
	const map: Record<string, string> = {
		login: "Sign in",
		logout: "Sign out",
		register: "Sign up",
		password_change: "Change password",
		mfa_setup: "2FA setup",
		mfa_disable: "Disable 2FA",
		token_refresh: "Session refresh",
	};
	const key = map[action];
	return key ? t(key) : action;
}

// ---------------------------------------------------------------------------
// TenantManagementTab component
// ---------------------------------------------------------------------------

function toOptionalPositiveInteger(
	value: string,
	label: string,
	t: (key: string, params?: Record<string, string | number>) => string,
): number | undefined {
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	const parsed = Number.parseInt(trimmed, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		throw new Error(t("{field} must be a positive integer", { field: label }));
	}
	return parsed;
}

export function uiMessageFromError(
	error: unknown,
	t: (key: string, params?: Record<string, string | number>) => string,
): string {
	if (!(error instanceof ApiClientError)) {
		return error instanceof Error ? error.message : t("Unknown error");
	}

	if (error.status === 0) {
		if (error.code === "CLIENT_TIMEOUT") {
			return t("Request timed out. Please try again.");
		}
		return t("Network issue. Please try again later.");
	}

	if (error.status === 401) {
		return t("Session expired. Please sign in again.");
	}

	if (error.status === 403) {
		return t("You do not have permission to perform this action.");
	}

	if (error.status === 404) {
		return t("The requested resource was not found.");
	}

	if (error.status === 409) {
		return t("Request conflict detected. Please refresh and retry.");
	}

	if (error.status === 412) {
		return t("Data has changed. Please refresh and retry.");
	}

	if (error.status === 428) {
		return t("Missing precondition. Please refresh and retry.");
	}

	if (error.status === 429) {
		return t("Too many requests. Please try again later.");
	}

	if (error.status >= 500) {
		return t("Server is temporarily unavailable. Please try again later.");
	}

	return error.message || t("Unknown error");
}

type TranslateFn = (
	key: string,
	params?: Record<string, string | number>,
) => string;

export type ProfileTabProps = {
	t: TranslateFn;
	profile: { displayName: string; email: string };
	setProfile: (
		updater: (prev: {
			displayName: string;
			email: string;
		}) => {
			displayName: string;
			email: string;
		},
	) => void;
	avatarInputRef: { current: HTMLInputElement | null };
	avatarSrc: string | null;
	isPreviewAvatar: boolean;
	avatarInitial: string;
	uploadingAvatar: boolean;
	avatarFile: File | null;
	handleAvatarChange: (file: File | null) => void;
	onUploadAvatar: () => void;
	onSave: () => Promise<void> | void;
	saving: boolean;
	avatarMaxBytes: number;
};

export function ProfileTab({
	t,
	profile,
	setProfile,
	avatarInputRef,
	avatarSrc,
	isPreviewAvatar,
	avatarInitial,
	uploadingAvatar,
	avatarFile,
	handleAvatarChange,
	onUploadAvatar,
	onSave,
	saving,
	avatarMaxBytes,
}: ProfileTabProps) {
	return (
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
									onClick={onUploadAvatar}
									disabled={!avatarFile || uploadingAvatar}
								>
									{uploadingAvatar ? (
										<RefreshCw
											aria-hidden="true"
											className="mr-2 h-4 w-4 animate-spin"
										/>
									) : null}
									{t("Upload avatar")}
								</Button>
							</div>

							<p className="text-xs text-neutral-500">
								{t("Supported formats: PNG / JPEG / WEBP. Max {size}KB", {
									size: Math.floor(avatarMaxBytes / 1024),
								})}
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
					<Button onClick={() => void onSave()} disabled={saving}>
						{saving ? (
							<RefreshCw
								aria-hidden="true"
								className="mr-2 h-4 w-4 animate-spin"
							/>
						) : (
							<Save aria-hidden="true" className="mr-2 h-4 w-4" />
						)}
						{t("Save changes")}
					</Button>
				</div>
			</CardContent>
		</Card>
	);
}

export type ApiKeysTabProps = {
	t: TranslateFn;
	createdRawKey: string | null;
	onCopyRawKey: (value: string) => Promise<void>;
	onClearRawKey: () => void;
	apiKeyName: string;
	setApiKeyName: (value: string) => void;
	apiKeyPermissions: string;
	setApiKeyPermissions: (value: string) => void;
	apiKeyRateLimit: string;
	setApiKeyRateLimit: (value: string) => void;
	createPending: boolean;
	onCreate: () => void;
	isLoading: boolean;
	isError: boolean;
	isFetching: boolean;
	error: unknown;
	keys: ApiKey[];
	revokePending: boolean;
	deletePending: boolean;
	onRefetch: () => void;
	onRevoke: (id: string) => void;
	onDelete: (id: string) => void;
};

export function ApiKeysTab({
	t,
	createdRawKey,
	onCopyRawKey,
	onClearRawKey,
	apiKeyName,
	setApiKeyName,
	apiKeyPermissions,
	setApiKeyPermissions,
	apiKeyRateLimit,
	setApiKeyRateLimit,
	createPending,
	onCreate,
	isLoading,
	isError,
	isFetching,
	error,
	keys,
	revokePending,
	deletePending,
	onRefetch,
	onRevoke,
	onDelete,
}: ApiKeysTabProps) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>{t("API keys")}</CardTitle>
				<CardDescription>{t("Manage your API access keys")}</CardDescription>
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
							{t("New key (shown only once). Copy and store it now.")}
						</p>
						<div className="mt-3 flex flex-col gap-2 sm:flex-row">
							<Input value={createdRawKey} readOnly />
							<Button
								variant="outline"
								onClick={() => void onCopyRawKey(createdRawKey)}
							>
								<Copy aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("Copy")}
							</Button>
							<Button variant="outline" onClick={onClearRawKey}>
								{t("Close")}
							</Button>
						</div>
					</div>
				)}

				<div className="rounded-lg border border-neutral-100 p-4">
					<p className="text-sm font-medium">{t("Create new key")}</p>
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
								onChange={(e) => setApiKeyPermissions(e.target.value)}
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
								onChange={(e) => setApiKeyRateLimit(e.target.value)}
								placeholder={t("e.g. 100")}
								inputMode="numeric"
							/>
						</div>
					</div>
					<div className="mt-3 flex justify-end">
						<Button onClick={onCreate} disabled={createPending}>
							{createPending ? (
								<RefreshCw
									aria-hidden="true"
									className="mr-2 h-4 w-4 animate-spin"
								/>
							) : (
								<Key aria-hidden="true" className="mr-2 h-4 w-4" />
							)}
							{t("Create")}
						</Button>
					</div>
				</div>

				<div className="space-y-2">
					<div className="flex items-center justify-between">
						<p className="text-sm font-medium">{t("Existing keys")}</p>
						<Button variant="outline" onClick={onRefetch} disabled={isFetching}>
							<RefreshCw
								className={`mr-2 h-4 w-4 ${isFetching ? "animate-spin" : ""}`}
								aria-hidden="true"
								focusable="false"
							/>
							{t("Refresh")}
						</Button>
					</div>

					{isLoading && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Loading...")}
						</p>
					)}

					{isError && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Load failed:")}
							{uiMessageFromError(error, t)}
						</p>
					)}

					{!isLoading && !isError && keys.length === 0 && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("No API keys")}
						</p>
					)}

					{keys.map((k) => (
						<div
							key={k.id}
							className="rounded-lg border border-neutral-100 p-4"
						>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div className="min-w-0">
									<div className="flex items-center gap-2">
										<p className="truncate font-medium">{k.name}</p>
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
										disabled={!k.is_active || revokePending}
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
											onRevoke(k.id);
										}}
									>
										{t("Revoke")}
									</Button>
									<Button
										variant="outline"
										disabled={deletePending}
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
											onDelete(k.id);
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
	);
}

type TenantConfigDraft = {
	max_users: string;
	max_articles: string;
	max_sources: string;
	max_storage_mb: string;
	max_reports_per_month: string;
	feature_ai_enabled: boolean;
	feature_knowledge_graph: boolean;
	feature_report_generation: boolean;
	feature_webhook: boolean;
	logo_url: string;
	primary_color: string;
};

export function TenantManagementTab() {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();
	const tenantsQuery = useTenants();
	const [selectedTenantId, setSelectedTenantId] = useState<string | null>(null);
	const tenantDetailQuery = useTenantDetail(selectedTenantId);

	const createTenantMutation = useCreateTenant();
	const updateTenantMutation = useUpdateTenant();
	const deleteTenantMutation = useDeleteTenant();
	const updateConfigMutation = useUpdateTenantConfig();
	const refreshUsageMutation = useRefreshTenantUsage();

	const [createSlug, setCreateSlug] = useState("");
	const [createName, setCreateName] = useState("");
	const [tenantName, setTenantName] = useState("");
	const [configDraft, setConfigDraft] = useState<TenantConfigDraft>({
		max_users: "",
		max_articles: "",
		max_sources: "",
		max_storage_mb: "",
		max_reports_per_month: "",
		feature_ai_enabled: false,
		feature_knowledge_graph: false,
		feature_report_generation: false,
		feature_webhook: false,
		logo_url: "",
		primary_color: "",
	});

	useEffect(() => {
		if (
			!selectedTenantId &&
			tenantsQuery.data &&
			tenantsQuery.data.length > 0
		) {
			setSelectedTenantId(tenantsQuery.data[0].id);
		}
	}, [selectedTenantId, tenantsQuery.data]);

	useEffect(() => {
		const detail = tenantDetailQuery.data;
		if (!detail) return;

		setTenantName(detail.name);
		setConfigDraft({
			max_users: String(detail.config.max_users),
			max_articles: String(detail.config.max_articles),
			max_sources: String(detail.config.max_sources),
			max_storage_mb: String(detail.config.max_storage_mb),
			max_reports_per_month: String(detail.config.max_reports_per_month),
			feature_ai_enabled: detail.config.feature_ai_enabled,
			feature_knowledge_graph: detail.config.feature_knowledge_graph,
			feature_report_generation: detail.config.feature_report_generation,
			feature_webhook: detail.config.feature_webhook,
			logo_url: detail.config.logo_url ?? "",
			primary_color: detail.config.primary_color ?? "",
		});
	}, [tenantDetailQuery.data]);

	const handleCreateTenant = async () => {
		const slug = createSlug.trim().toLowerCase();
		const name = createName.trim();

		if (!slug || !name) {
			toastError(t("Create failed"), t("Slug and name are required"));
			return;
		}

		try {
			const created = await createTenantMutation.mutateAsync({ slug, name });
			setSelectedTenantId(created.id);
			setCreateSlug("");
			setCreateName("");
			toastSuccess(t("Tenant created"), `${created.name} (${created.slug})`);
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Create failed"), message);
		}
	};

	const handleUpdateTenant = async () => {
		if (!selectedTenantId) return;
		const name = tenantName.trim();
		if (!name) {
			toastError(t("Save failed"), t("Tenant name cannot be empty"));
			return;
		}

		try {
			await updateTenantMutation.mutateAsync({ id: selectedTenantId, name });
			toastSuccess(t("Saved"));
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Save failed"), message);
		}
	};

	const handleUpdateConfig = async () => {
		if (!selectedTenantId) return;
		const currentVersion = tenantDetailQuery.data?.config.version;
		if (!currentVersion || currentVersion < 1) {
			toastError(t("Save failed"), t("Tenant config version is missing"));
			return;
		}

		try {
			await updateConfigMutation.mutateAsync({
				id: selectedTenantId,
				version: currentVersion,
				max_users: toOptionalPositiveInteger(
					configDraft.max_users,
					t("Max users"),
					t,
				),
				max_articles: toOptionalPositiveInteger(
					configDraft.max_articles,
					t("Max articles"),
					t,
				),
				max_sources: toOptionalPositiveInteger(
					configDraft.max_sources,
					t("Max sources"),
					t,
				),
				max_storage_mb: toOptionalPositiveInteger(
					configDraft.max_storage_mb,
					t("Max storage (MB)"),
					t,
				),
				max_reports_per_month: toOptionalPositiveInteger(
					configDraft.max_reports_per_month,
					t("Max reports / month"),
					t,
				),
				feature_ai_enabled: configDraft.feature_ai_enabled,
				feature_knowledge_graph: configDraft.feature_knowledge_graph,
				feature_report_generation: configDraft.feature_report_generation,
				feature_webhook: configDraft.feature_webhook,
				logo_url: configDraft.logo_url.trim() || null,
				primary_color: configDraft.primary_color.trim() || null,
			});
			toastSuccess(t("Tenant config updated"));
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Save failed"), message);
		}
	};

	const handleRefreshUsage = async () => {
		if (!selectedTenantId) return;
		try {
			await refreshUsageMutation.mutateAsync(selectedTenantId);
			toastSuccess(t("Usage refreshed"));
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Refresh failed"), message);
		}
	};

	const handleDeleteTenant = async () => {
		if (!selectedTenantId) return;
		const selected = tenantsQuery.data?.find(
			(item) => item.id === selectedTenantId,
		);
		if (!selected) return;
		if (
			!window.confirm(
				t("Delete tenant {name} permanently?", { name: selected.name }),
			)
		)
			return;

		try {
			await deleteTenantMutation.mutateAsync(selectedTenantId);
			toastSuccess(t("Tenant deleted"), selected.name);
			setSelectedTenantId(null);
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Delete failed"), message);
		}
	};

	const quotaFields: Array<{
		key:
			| "max_users"
			| "max_articles"
			| "max_sources"
			| "max_storage_mb"
			| "max_reports_per_month";
		label: string;
	}> = [
		{ key: "max_users", label: "Max users" },
		{ key: "max_articles", label: "Max articles" },
		{ key: "max_sources", label: "Max sources" },
		{ key: "max_storage_mb", label: "Max storage (MB)" },
		{ key: "max_reports_per_month", label: "Max reports / month" },
	];
	const featureFields: Array<{
		key:
			| "feature_ai_enabled"
			| "feature_knowledge_graph"
			| "feature_report_generation"
			| "feature_webhook";
		label: string;
	}> = [
		{ key: "feature_ai_enabled", label: "AI feature" },
		{ key: "feature_knowledge_graph", label: "Knowledge graph feature" },
		{ key: "feature_report_generation", label: "Report generation feature" },
		{ key: "feature_webhook", label: "Webhook feature" },
	];

	const usage = tenantDetailQuery.data?.usage;

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>{t("Tenant management")}</CardTitle>
					<CardDescription>
						{t("Manage tenant lifecycle, quota and feature flags")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="rounded-lg border border-neutral-100 p-4">
						<p className="text-sm font-medium">{t("Create tenant")}</p>
						<div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div>
								<label
									htmlFor="create-tenant-slug"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Tenant slug")}
								</label>
								<Input
									id="create-tenant-slug"
									value={createSlug}
									onChange={(e) => setCreateSlug(e.target.value)}
									placeholder={t("Tenant slug")}
								/>
							</div>
							<div>
								<label
									htmlFor="create-tenant-name"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Tenant name")}
								</label>
								<Input
									id="create-tenant-name"
									value={createName}
									onChange={(e) => setCreateName(e.target.value)}
									placeholder={t("Tenant name")}
								/>
							</div>
						</div>
						<div className="mt-3 flex justify-end">
							<Button
								onClick={handleCreateTenant}
								disabled={createTenantMutation.isPending}
							>
								{createTenantMutation.isPending
									? t("Creating...")
									: t("Create")}
							</Button>
						</div>
					</div>

					<div className="flex items-center justify-between">
						<p className="text-sm font-medium">{t("Tenants")}</p>
						<Button
							variant="outline"
							onClick={() => tenantsQuery.refetch()}
							disabled={tenantsQuery.isFetching}
						>
							<RefreshCw
								aria-hidden="true"
								className={`mr-2 h-4 w-4 ${
									tenantsQuery.isFetching ? "animate-spin" : ""
								}`}
							/>
							{t("Refresh")}
						</Button>
					</div>

					{tenantsQuery.isLoading && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Loading...")}
						</p>
					)}

					{tenantsQuery.isError && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Load failed:")}
							{uiMessageFromError(tenantsQuery.error, t)}
						</p>
					)}

					{tenantsQuery.data && tenantsQuery.data.length === 0 && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("No tenants")}
						</p>
					)}

					{tenantsQuery.data && tenantsQuery.data.length > 0 && (
						<div className="grid grid-cols-1 gap-2 md:grid-cols-2">
							{tenantsQuery.data.map((tenant) => {
								const isActive = selectedTenantId === tenant.id;
								return (
									<button
										key={tenant.id}
										type="button"
										onClick={() => setSelectedTenantId(tenant.id)}
										className={`rounded-lg border p-3 text-left transition-colors ${
											isActive
												? "border-primary-300 bg-primary-50"
												: "border-neutral-100 hover:border-neutral-200"
										}`}
									>
										<p className="font-medium text-neutral-900">
											{tenant.name}
										</p>
										<p className="text-xs text-neutral-500">{tenant.slug}</p>
									</button>
								);
							})}
						</div>
					)}
				</CardContent>
			</Card>

			{selectedTenantId && (
				<Card>
					<CardHeader>
						<CardTitle>{t("Selected tenant settings")}</CardTitle>
						<CardDescription>
							{tenantDetailQuery.data
								? `${tenantDetailQuery.data.name} (${tenantDetailQuery.data.slug})`
								: t("Loading...")}
						</CardDescription>
					</CardHeader>
					<CardContent className="space-y-4">
						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div>
								<label
									htmlFor="tenant-name"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Tenant name")}
								</label>
								<Input
									id="tenant-name"
									value={tenantName}
									onChange={(e) => setTenantName(e.target.value)}
								/>
							</div>
							<div>
								<label
									htmlFor="tenant-primary-color"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Primary color")}
								</label>
								<Input
									id="tenant-primary-color"
									value={configDraft.primary_color}
									onChange={(e) =>
										setConfigDraft((prev) => ({
											...prev,
											primary_color: e.target.value,
										}))
									}
									placeholder="#0f766e"
								/>
							</div>
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
							{quotaFields.map(({ key, label }) => (
								<div key={key}>
									<label
										htmlFor={`tenant-${key}`}
										className="mb-1 block text-xs font-medium text-neutral-600"
									>
										{t(label)}
									</label>
									<Input
										id={`tenant-${key}`}
										inputMode="numeric"
										value={configDraft[key]}
										onChange={(e) =>
											setConfigDraft((prev) => ({
												...prev,
												[key]: e.target.value,
											}))
										}
									/>
								</div>
							))}
						</div>

						<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
							<div>
								<label
									htmlFor="tenant-logo-url"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Logo URL")}
								</label>
								<Input
									id="tenant-logo-url"
									value={configDraft.logo_url}
									onChange={(e) =>
										setConfigDraft((prev) => ({
											...prev,
											logo_url: e.target.value,
										}))
									}
									placeholder="https://..."
								/>
							</div>
							<div className="grid grid-cols-2 gap-2 rounded-lg border border-neutral-100 p-3">
								{featureFields.map(({ key, label }) => (
									<label
										key={key}
										className="inline-flex items-center gap-2 text-xs text-neutral-700"
									>
										<input
											type="checkbox"
											checked={configDraft[key]}
											onChange={(e) =>
												setConfigDraft((prev) => ({
													...prev,
													[key]: e.target.checked,
												}))
											}
										/>
										{t(label)}
									</label>
								))}
							</div>
						</div>

						{usage && (
							<div className="rounded-lg border border-neutral-100 p-4">
								<div className="mb-2 flex items-center justify-between">
									<p className="text-sm font-medium">{t("Current usage")}</p>
									<Button
										variant="outline"
										size="sm"
										onClick={handleRefreshUsage}
										disabled={refreshUsageMutation.isPending}
									>
										{refreshUsageMutation.isPending
											? t("Refreshing...")
											: t("Refresh usage")}
									</Button>
								</div>
								<div className="grid grid-cols-2 gap-2 text-xs text-neutral-600 sm:grid-cols-3">
									<div>
										{t("Users")}: {usage.current_users}
									</div>
									<div>
										{t("Articles")}: {usage.current_articles}
									</div>
									<div>
										{t("Sources")}: {usage.current_sources}
									</div>
									<div>
										{t("Storage (MB)")}: {usage.current_storage_mb}
									</div>
									<div>
										{t("Reports this month")}:{" "}
										{usage.current_reports_this_month}
									</div>
									<div>
										{t("Updated at")}:{" "}
										{relativeTime(usage.last_refreshed_at, t)}
									</div>
								</div>
							</div>
						)}

						<div className="flex flex-wrap justify-end gap-2">
							<Button
								variant="outline"
								onClick={handleUpdateTenant}
								disabled={updateTenantMutation.isPending}
							>
								{updateTenantMutation.isPending
									? t("Saving...")
									: t("Save tenant")}
							</Button>
							<Button
								onClick={handleUpdateConfig}
								disabled={updateConfigMutation.isPending}
							>
								{updateConfigMutation.isPending
									? t("Saving...")
									: t("Save config")}
							</Button>
							<Button
								variant="outline"
								onClick={handleDeleteTenant}
								disabled={deleteTenantMutation.isPending}
							>
								{deleteTenantMutation.isPending
									? t("Deleting...")
									: t("Delete tenant")}
							</Button>
						</div>
					</CardContent>
				</Card>
			)}
		</div>
	);
}

// ---------------------------------------------------------------------------
// WebhookManagementTab component
// ---------------------------------------------------------------------------

export function WebhookManagementTab() {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();
	const createWebhookMutation = useCreateWebhook();
	const updateWebhookMutation = useUpdateWebhook();
	const deleteWebhookMutation = useDeleteWebhook();
	const testWebhookMutation = useTestWebhook();

	const [name, setName] = useState("");
	const [url, setUrl] = useState("");
	const [signingSecret, setSigningSecret] = useState("");
	const [events, setEvents] = useState("reports.generated,webhooks.test");
	const [timeoutMs, setTimeoutMs] = useState("10000");
	const [maxRetries, setMaxRetries] = useState("5");
	const [enabled, setEnabled] = useState(true);
	const [webhookSearch, setWebhookSearch] = useState("");
	const [enabledFilter, setEnabledFilter] =
		useState<WebhookEnabledFilter>("all");
	const [deliveryFilter, setDeliveryFilter] =
		useState<WebhookDeliveryFilter>("all");
	const webhooksQuery = useWebhooks({
		limit: 100,
		offset: 0,
		search: webhookSearch,
		enabled: enabledFilter,
		delivery: deliveryFilter,
	});
	const webhookStats = webhooksQuery.data?.stats;

	const handleCreateWebhook = async () => {
		const webhookName = name.trim();
		const webhookUrl = url.trim();
		const webhookSecret = signingSecret.trim();
		const webhookEvents = parseCsv(events);

		if (
			!webhookName ||
			!webhookUrl ||
			!webhookSecret ||
			webhookEvents.length === 0
		) {
			toastError(
				t("Create failed"),
				t("Name, URL, signing secret and events are required"),
			);
			return;
		}

		const timeout = Number.parseInt(timeoutMs.trim(), 10);
		const retries = Number.parseInt(maxRetries.trim(), 10);
		if (!Number.isFinite(timeout) || timeout < 1000) {
			toastError(t("Create failed"), t("timeout_ms must be >= 1000"));
			return;
		}
		if (!Number.isFinite(retries) || retries < 0) {
			toastError(t("Create failed"), t("max_retries must be >= 0"));
			return;
		}

		try {
			await createWebhookMutation.mutateAsync({
				name: webhookName,
				url: webhookUrl,
				signing_secret: webhookSecret,
				enabled,
				events: webhookEvents,
				timeout_ms: timeout,
				max_retries: retries,
			});
			toastSuccess(t("Webhook created"), webhookName);
			setName("");
			setUrl("");
			setSigningSecret("");
			setEvents("reports.generated,webhooks.test");
			setTimeoutMs("10000");
			setMaxRetries("5");
			setEnabled(true);
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Create failed"), message);
		}
	};

	const handleToggleWebhook = async (id: string, nextEnabled: boolean) => {
		try {
			await updateWebhookMutation.mutateAsync({ id, enabled: nextEnabled });
			toastSuccess(nextEnabled ? t("Webhook enabled") : t("Webhook disabled"));
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Update failed"), message);
		}
	};

	const handleTestWebhook = async (id: string) => {
		try {
			const result = await testWebhookMutation.mutateAsync({ id });
			toastSuccess(
				t("Test event queued"),
				`${result.event_type} · ${result.event_id}`,
			);
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Test failed"), message);
		}
	};

	const handleDeleteWebhook = async (id: string, webhookName: string) => {
		if (
			!window.confirm(
				t("Delete webhook {name} permanently?", { name: webhookName }),
			)
		)
			return;

		try {
			await deleteWebhookMutation.mutateAsync(id);
			toastSuccess(t("Webhook deleted"), webhookName);
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Delete failed"), message);
		}
	};

	return (
		<div className="space-y-4">
			<Card>
				<CardHeader>
					<CardTitle>{t("Webhook management")}</CardTitle>
					<CardDescription>
						{t("Manage outbound event delivery endpoints")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					<div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
						<div>
							<label
								htmlFor="webhook-name"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Name")}
							</label>
							<Input
								id="webhook-name"
								value={name}
								onChange={(e) => setName(e.target.value)}
								placeholder={t("e.g. CI / integration service")}
							/>
						</div>
						<div>
							<label
								htmlFor="webhook-url"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Webhook URL")}
							</label>
							<Input
								id="webhook-url"
								value={url}
								onChange={(e) => setUrl(e.target.value)}
								placeholder="https://..."
							/>
						</div>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="sm:col-span-2">
							<label
								htmlFor="webhook-secret"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Signing secret")}
							</label>
							<Input
								id="webhook-secret"
								type="password"
								value={signingSecret}
								onChange={(e) => setSigningSecret(e.target.value)}
								placeholder={t("Input webhook signing secret")}
							/>
						</div>
						<label className="inline-flex items-center gap-2 self-end pb-2 text-sm text-neutral-700">
							<input
								type="checkbox"
								checked={enabled}
								onChange={(e) => setEnabled(e.target.checked)}
							/>
							{t("Enabled")}
						</label>
					</div>

					<div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
						<div className="sm:col-span-2">
							<label
								htmlFor="webhook-events"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Events (comma-separated)")}
							</label>
							<Input
								id="webhook-events"
								value={events}
								onChange={(e) => setEvents(e.target.value)}
								placeholder="reports.generated,webhooks.test"
							/>
						</div>
						<div className="grid grid-cols-2 gap-3">
							<div>
								<label
									htmlFor="webhook-timeout"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Timeout (ms)")}
								</label>
								<Input
									id="webhook-timeout"
									inputMode="numeric"
									value={timeoutMs}
									onChange={(e) => setTimeoutMs(e.target.value)}
								/>
							</div>
							<div>
								<label
									htmlFor="webhook-retries"
									className="mb-1 block text-xs font-medium text-neutral-600"
								>
									{t("Max retries")}
								</label>
								<Input
									id="webhook-retries"
									inputMode="numeric"
									value={maxRetries}
									onChange={(e) => setMaxRetries(e.target.value)}
								/>
							</div>
						</div>
					</div>

					<div className="flex justify-end">
						<Button
							onClick={handleCreateWebhook}
							disabled={createWebhookMutation.isPending}
						>
							{createWebhookMutation.isPending
								? t("Creating...")
								: t("Create webhook")}
						</Button>
					</div>
				</CardContent>
			</Card>

			<Card>
				<CardHeader>
					<CardTitle>{t("Configured webhooks")}</CardTitle>
					<CardDescription>
						{t("Delivery health and quick operations")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-3">
					<div className="grid grid-cols-1 gap-3 md:grid-cols-3">
						<div>
							<label
								htmlFor="webhook-search"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Search")}
							</label>
							<Input
								id="webhook-search"
								value={webhookSearch}
								onChange={(e) => setWebhookSearch(e.target.value)}
								placeholder={t("Search webhooks by name, URL or event")}
							/>
						</div>
						<div>
							<label
								htmlFor="webhook-enabled-filter"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Status")}
							</label>
							<select
								id="webhook-enabled-filter"
								value={enabledFilter}
								onChange={(e) =>
									setEnabledFilter(e.target.value as WebhookEnabledFilter)
								}
								className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700"
							>
								<option value="all">{t("All statuses")}</option>
								<option value="enabled">{t("Enabled only")}</option>
								<option value="disabled">{t("Disabled only")}</option>
							</select>
						</div>
						<div>
							<label
								htmlFor="webhook-delivery-filter"
								className="mb-1 block text-xs font-medium text-neutral-600"
							>
								{t("Delivery state")}
							</label>
							<select
								id="webhook-delivery-filter"
								value={deliveryFilter}
								onChange={(e) =>
									setDeliveryFilter(e.target.value as WebhookDeliveryFilter)
								}
								className="h-10 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm text-neutral-700"
							>
								<option value="all">{t("All delivery states")}</option>
								<option value="healthy">{t("Healthy")}</option>
								<option value="failing">{t("Failing")}</option>
								<option value="never">{t("Never delivered")}</option>
							</select>
						</div>
					</div>

					{webhookStats && (
						<div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
							<Badge variant="outline">
								{t("Total")}: {webhookStats.total}
							</Badge>
							<Badge variant="outline">
								{t("Enabled")}: {webhookStats.enabled}
							</Badge>
							<Badge variant="outline">
								{t("Disabled")}: {webhookStats.disabled}
							</Badge>
							<Badge variant="outline">
								{t("Healthy")}: {webhookStats.healthy}
							</Badge>
							<Badge variant="outline">
								{t("Failing")}: {webhookStats.failing}
							</Badge>
							<Badge variant="outline">
								{t("Never delivered")}: {webhookStats.never}
							</Badge>
						</div>
					)}

					{webhooksQuery.data && (
						<p className="text-xs text-neutral-500">
							{t("Filtered {count} of {total}", {
								count: webhooksQuery.data.filtered_total,
								total: webhooksQuery.data.stats.total,
							})}
						</p>
					)}

					<div className="flex items-center justify-end">
						<Button
							variant="outline"
							onClick={() => webhooksQuery.refetch()}
							disabled={webhooksQuery.isFetching}
						>
							<RefreshCw
								aria-hidden="true"
								className={`mr-2 h-4 w-4 ${
									webhooksQuery.isFetching ? "animate-spin" : ""
								}`}
							/>
							{t("Refresh")}
						</Button>
					</div>

					{webhooksQuery.isLoading && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Loading...")}
						</p>
					)}
					{webhooksQuery.isError && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Load failed:")}
							{uiMessageFromError(webhooksQuery.error, t)}
						</p>
					)}
					{webhooksQuery.data && webhooksQuery.data.items.length === 0 && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("No webhooks")}
						</p>
					)}

					{webhooksQuery.data?.items.map((item) => (
						<div
							key={item.id}
							className="rounded-lg border border-neutral-100 p-4"
						>
							<div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
								<div className="min-w-0 space-y-1">
									<div className="flex items-center gap-2">
										<p className="truncate font-medium text-neutral-900">
											{item.name}
										</p>
										<Badge variant="outline">
											{item.enabled ? t("Enabled") : t("Disabled")}
										</Badge>
									</div>
									<div className="flex items-center gap-2 text-xs text-neutral-500">
										<a
											href={item.url}
											target="_blank"
											rel="noreferrer"
											className="inline-flex items-center gap-1 text-primary-600 hover:underline"
										>
											{item.url}
											<ExternalLink aria-hidden="true" className="h-3 w-3" />
										</a>
									</div>
									<p className="text-xs text-neutral-500">
										{t("Events")}: {item.events.join(", ")}
									</p>
									<p className="text-xs text-neutral-500">
										{t("Timeout (ms)")}: {item.timeout_ms} · {t("Max retries")}:{" "}
										{item.max_retries}
									</p>
									{item.last_error && (
										<p className="text-xs text-error">{item.last_error}</p>
									)}
								</div>

								<div className="flex flex-wrap gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleToggleWebhook(item.id, !item.enabled)}
										disabled={updateWebhookMutation.isPending}
									>
										{item.enabled ? t("Disable") : t("Enable")}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleTestWebhook(item.id)}
										disabled={testWebhookMutation.isPending}
									>
										{t("Test")}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={() => handleDeleteWebhook(item.id, item.name)}
										disabled={deleteWebhookMutation.isPending}
									>
										{t("Delete")}
									</Button>
								</div>
							</div>
						</div>
					))}
				</CardContent>
			</Card>
		</div>
	);
}

// ---------------------------------------------------------------------------
// SecurityTab component
// ---------------------------------------------------------------------------

export function SecurityTab() {
	const t = useT();
	const { success: toastSuccess, error: toastError } = useToast();

	// ── Change Password state ──────────────────────────────────────
	const [currentPassword, setCurrentPassword] = useState("");
	const [newPassword, setNewPassword] = useState("");
	const [confirmNewPassword, setConfirmNewPassword] = useState("");
	const [showCurrentPw, setShowCurrentPw] = useState(false);
	const [showNewPw, setShowNewPw] = useState(false);
	const [showConfirmPw, setShowConfirmPw] = useState(false);
	const [pwTouched, setPwTouched] = useState(false);

	const changePasswordMutation = useChangePassword();

	const handleChangePassword = async () => {
		setPwTouched(true);
		const policyError = validatePasswordPolicy(newPassword);
		if (policyError) {
			toastError(t("Password change failed"), t(policyError));
			return;
		}
		if (newPassword !== confirmNewPassword) {
			toastError(t("Password change failed"), t("Passwords do not match"));
			return;
		}
		if (!currentPassword) {
			toastError(
				t("Password change failed"),
				t("Current password is incorrect"),
			);
			return;
		}
		try {
			await changePasswordMutation.mutateAsync({
				current_password: currentPassword,
				new_password: newPassword,
			});
			toastSuccess(t("Password changed successfully"));
			setCurrentPassword("");
			setNewPassword("");
			setConfirmNewPassword("");
			setPwTouched(false);
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Password change failed"), message);
		}
	};

	const pwChecks = passwordChecks(newPassword);
	const canSubmitPw =
		!!currentPassword &&
		!validatePasswordPolicy(newPassword) &&
		newPassword === confirmNewPassword &&
		!changePasswordMutation.isPending;

	// ── MFA TOTP state ─────────────────────────────────────────────
	type MfaPhase = "idle" | "setup" | "verify" | "enabled";
	const [mfaPhase, setMfaPhase] = useState<MfaPhase>("idle");
	const [totpCode, setTotpCode] = useState("");
	const [totpSecret, setTotpSecret] = useState("");
	const [totpUri, setTotpUri] = useState("");
	const [totpVerifiedAt, setTotpVerifiedAt] = useState<string | null>(null);
	const [totpLastUsedAt, setTotpLastUsedAt] = useState<string | null>(null);

	const mfaSetupMutation = useMfaTotpSetup();
	const mfaConfirmMutation = useMfaTotpConfirm();
	const mfaDisableMutation = useMfaTotpDisable();

	const handleMfaSetup = async () => {
		try {
			const result = await mfaSetupMutation.mutateAsync();
			setTotpSecret(result.secret);
			setTotpUri(result.provisioning_uri);
			setMfaPhase("setup");
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Operation failed"), message);
		}
	};

	const handleMfaConfirm = async () => {
		if (totpCode.length !== 6) return;
		try {
			const result = await mfaConfirmMutation.mutateAsync(totpCode);
			if (result.enabled) {
				setMfaPhase("enabled");
				setTotpVerifiedAt(result.verified_at);
				setTotpLastUsedAt(result.last_used_at);
				setTotpCode("");
				toastSuccess(t("2FA enabled successfully"));
			}
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Verification failed"), message);
		}
	};

	const handleMfaDisable = async () => {
		try {
			await mfaDisableMutation.mutateAsync();
			setMfaPhase("idle");
			setTotpSecret("");
			setTotpUri("");
			setTotpVerifiedAt(null);
			setTotpLastUsedAt(null);
			toastSuccess(t("2FA disabled successfully"));
		} catch (err) {
			const message = uiMessageFromError(err, t);
			toastError(t("Operation failed"), message);
		}
	};

	// ── Login Activity ─────────────────────────────────────────────
	const loginActivityQuery = useLoginActivity();

	return (
		<div className="space-y-6">
			{/* Card 1: Change Password */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Lock aria-hidden="true" className="h-5 w-5" />
						{t("Change password")}
					</CardTitle>
					<CardDescription>
						{t("Manage your account security options")}
					</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{/* Current password */}
					<div>
						<label
							htmlFor="security-current-password"
							className="mb-1 block text-sm font-medium"
						>
							{t("Current password")}
						</label>
						<div className="relative">
							<Input
								id="security-current-password"
								type={showCurrentPw ? "text" : "password"}
								value={currentPassword}
								onChange={(e) => setCurrentPassword(e.target.value)}
								autoComplete="current-password"
							/>
							<button
								type="button"
								className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
								onClick={() => setShowCurrentPw(!showCurrentPw)}
								aria-label={showCurrentPw ? "Hide password" : "Show password"}
							>
								{showCurrentPw ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						</div>
					</div>

					{/* New password */}
					<div>
						<label
							htmlFor="security-new-password"
							className="mb-1 block text-sm font-medium"
						>
							{t("New password")}
						</label>
						<div className="relative">
							<Input
								id="security-new-password"
								type={showNewPw ? "text" : "password"}
								value={newPassword}
								onChange={(e) => {
									setNewPassword(e.target.value);
									setPwTouched(true);
								}}
								autoComplete="new-password"
								placeholder={t("At least 12 characters")}
							/>
							<button
								type="button"
								className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
								onClick={() => setShowNewPw(!showNewPw)}
								aria-label={showNewPw ? "Hide password" : "Show password"}
							>
								{showNewPw ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						</div>
						{pwTouched && newPassword && (
							<ul className="mt-2 space-y-0.5 text-xs">
								{pwChecks.map((c) => (
									<li
										key={c.label}
										className={c.ok ? "text-emerald-700" : "text-neutral-500"}
									>
										{c.ok ? "\u2713" : "\u2717"} {t(c.label)}
									</li>
								))}
							</ul>
						)}
					</div>

					{/* Confirm new password */}
					<div>
						<label
							htmlFor="security-confirm-password"
							className="mb-1 block text-sm font-medium"
						>
							{t("Confirm new password")}
						</label>
						<div className="relative">
							<Input
								id="security-confirm-password"
								type={showConfirmPw ? "text" : "password"}
								value={confirmNewPassword}
								onChange={(e) => setConfirmNewPassword(e.target.value)}
								autoComplete="new-password"
								placeholder={t("Re-enter password")}
							/>
							<button
								type="button"
								className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral-400 hover:text-neutral-600"
								onClick={() => setShowConfirmPw(!showConfirmPw)}
								aria-label={showConfirmPw ? "Hide password" : "Show password"}
							>
								{showConfirmPw ? (
									<EyeOff className="h-4 w-4" />
								) : (
									<Eye className="h-4 w-4" />
								)}
							</button>
						</div>
						{confirmNewPassword && newPassword !== confirmNewPassword && (
							<p className="mt-1 text-xs text-error">
								{t("Passwords do not match")}
							</p>
						)}
					</div>

					<div className="flex justify-end">
						<Button onClick={handleChangePassword} disabled={!canSubmitPw}>
							{changePasswordMutation.isPending ? (
								<RefreshCw
									aria-hidden="true"
									className="mr-2 h-4 w-4 animate-spin"
								/>
							) : (
								<Lock aria-hidden="true" className="mr-2 h-4 w-4" />
							)}
							{t("Change password")}
						</Button>
					</div>
				</CardContent>
			</Card>

			{/* Card 2: Two-Factor Authentication */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Smartphone aria-hidden="true" className="h-5 w-5" />
						{t("Two-factor authentication")}
					</CardTitle>
					<CardDescription>{t("2FA setup")}</CardDescription>
				</CardHeader>
				<CardContent className="space-y-4">
					{mfaPhase === "idle" && (
						<div className="flex items-center justify-between rounded-lg border border-neutral-100 p-4">
							<div>
								<p className="font-medium">{t("Two-factor authentication")}</p>
								<p className="text-sm text-neutral-500">{t("Not enabled")}</p>
							</div>
							<Button
								onClick={handleMfaSetup}
								disabled={mfaSetupMutation.isPending}
							>
								{mfaSetupMutation.isPending ? (
									<RefreshCw
										aria-hidden="true"
										className="mr-2 h-4 w-4 animate-spin"
									/>
								) : (
									<Shield aria-hidden="true" className="mr-2 h-4 w-4" />
								)}
								{t("Set up 2FA")}
							</Button>
						</div>
					)}

					{mfaPhase === "setup" && (
						<div className="space-y-4">
							<div className="flex flex-col items-center gap-4 rounded-lg border border-neutral-100 p-6">
								<p className="text-sm font-medium">
									{t("Scan QR code with your authenticator app")}
								</p>
								<div className="rounded-lg bg-white p-3">
									<QRCodeSVG value={totpUri} size={200} />
								</div>
								<div className="w-full">
									<p className="mb-1 text-xs text-neutral-500">
										{t("Manual entry key")}
									</p>
									<div className="flex items-center gap-2">
										<code className="flex-1 rounded bg-neutral-100 px-3 py-2 text-xs font-mono break-all select-all">
											{totpSecret}
										</code>
										<Button
											variant="outline"
											size="sm"
											onClick={async () => {
												try {
													await navigator.clipboard.writeText(totpSecret);
													toastSuccess(t("Copied to clipboard"));
												} catch {
													toastError(
														t("Copy failed"),
														t(
															"Clipboard access is blocked by the browser. Please copy manually.",
														),
													);
												}
											}}
										>
											<Copy aria-hidden="true" className="h-4 w-4" />
										</Button>
									</div>
								</div>
							</div>

							<div>
								<label
									htmlFor="security-totp-code"
									className="mb-1 block text-sm font-medium"
								>
									{t("Enter the 6-digit code from your authenticator app")}
								</label>
								<div className="flex gap-2">
									<Input
										id="security-totp-code"
										value={totpCode}
										onChange={(e) => {
											const val = e.target.value.replace(/\D/g, "").slice(0, 6);
											setTotpCode(val);
										}}
										placeholder="000000"
										inputMode="numeric"
										maxLength={6}
										className="font-mono text-center tracking-widest"
									/>
									<Button
										onClick={handleMfaConfirm}
										disabled={
											totpCode.length !== 6 || mfaConfirmMutation.isPending
										}
									>
										{mfaConfirmMutation.isPending ? (
											<RefreshCw
												aria-hidden="true"
												className="mr-2 h-4 w-4 animate-spin"
											/>
										) : null}
										{t("Verify code")}
									</Button>
								</div>
							</div>
						</div>
					)}

					{(mfaPhase === "verify" || mfaPhase === "enabled") && (
						<div className="space-y-3">
							<div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 p-4">
								<div>
									<div className="flex items-center gap-2">
										<p className="font-medium">
											{t("Two-factor authentication")}
										</p>
										<Badge className="bg-emerald-100 text-emerald-800">
											{t("Enabled")}
										</Badge>
									</div>
									<p className="mt-1 text-sm text-neutral-600">
										{t("2FA is currently enabled")}
									</p>
									{totpVerifiedAt && (
										<p className="mt-1 text-xs text-neutral-500">
											{t("Verified at")}:{" "}
											{new Date(totpVerifiedAt).toLocaleString()}
										</p>
									)}
									{totpLastUsedAt && (
										<p className="text-xs text-neutral-500">
											{t("Last used")}:{" "}
											{new Date(totpLastUsedAt).toLocaleString()}
										</p>
									)}
								</div>
								<Button
									variant="outline"
									onClick={handleMfaDisable}
									disabled={mfaDisableMutation.isPending}
								>
									{mfaDisableMutation.isPending ? (
										<RefreshCw
											aria-hidden="true"
											className="mr-2 h-4 w-4 animate-spin"
										/>
									) : null}
									{t("Disable 2FA")}
								</Button>
							</div>
						</div>
					)}
				</CardContent>
			</Card>

			{/* Card 3: Login Activity */}
			<Card>
				<CardHeader>
					<CardTitle className="flex items-center gap-2">
						<Shield aria-hidden="true" className="h-5 w-5" />
						{t("Login activity")}
					</CardTitle>
					<CardDescription>
						{t("Manage your account security options")}
					</CardDescription>
				</CardHeader>
				<CardContent>
					{loginActivityQuery.isLoading && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Loading...")}
						</p>
					)}

					{loginActivityQuery.isError && (
						<p className="py-6 text-center text-sm text-neutral-500">
							{t("Load failed:")}
							{uiMessageFromError(loginActivityQuery.error, t)}
						</p>
					)}

					{loginActivityQuery.data &&
						loginActivityQuery.data.items.length === 0 && (
							<p className="py-6 text-center text-sm text-neutral-500">
								{t("No login activity yet")}
							</p>
						)}

					{loginActivityQuery.data &&
						loginActivityQuery.data.items.length > 0 && (
							<div className="space-y-2">
								{loginActivityQuery.data.items.map(
									(entry: LoginActivityEntry) => (
										<div
											key={entry.id}
											className="flex flex-col gap-1 rounded-lg border border-neutral-100 p-3 sm:flex-row sm:items-center sm:justify-between"
										>
											<div className="min-w-0">
												<p className="text-sm font-medium">
													{actionLabel(entry.action, t)}
												</p>
												<p className="text-xs text-neutral-500">
													{entry.ip_address ?? "-"}{" "}
													<span className="text-neutral-400">&middot;</span>{" "}
													{shortenUserAgent(entry.user_agent)}
												</p>
											</div>
											<p className="shrink-0 text-xs text-neutral-500">
												{relativeTime(entry.created_at, t)}
											</p>
										</div>
									),
								)}
							</div>
						)}
				</CardContent>
			</Card>
		</div>
	);
}
