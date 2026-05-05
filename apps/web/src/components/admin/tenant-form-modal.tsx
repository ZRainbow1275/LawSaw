"use client";

/**
 * Tenant create modal (super-admin only).
 *
 * Drives `useCreateTenant` against `POST /api/v1/super/tenants`. The endpoint
 * accepts `{ slug, name, admin_email, admin_display_name? }` and returns the
 * tenant record plus a one-time password reset token that has to be handed to
 * the new admin out of band. The modal therefore has two phases:
 *   1. Form  — collect slug/name/admin_email/admin_display_name + initial
 *              quotas / feature flags (forwarded to a follow-up PATCH once
 *              the tenant exists)
 *   2. Token — display the reset token + expiry with a copy-to-clipboard
 *              button so super-admins can deliver the credential safely
 *
 * Quotas / feature flags collected on the form are immediately PATCH'd onto
 * the new tenant via `useUpdateTenant` so super-admins can complete the
 * provisioning in a single dialog interaction.
 */

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
	Modal,
	ModalBody,
	ModalFooter,
	ModalHeader,
} from "@/components/ui/modal";
import {
	type CreateTenantResponse,
	useCreateTenant,
	useUpdateTenant,
} from "@/hooks/use-admin-tenants";
import { ApiClientError } from "@/lib/api";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import {
	Building2,
	CheckCircle2,
	Copy,
	Info,
	KeyRound,
	Loader2,
	Save,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const TENANT_SLUG_RE = /^[a-z][a-z0-9-]{2,31}$/;

const STATUS_OPTIONS: ReadonlyArray<{
	value: "active" | "trial" | "suspended";
	labelKey: string;
}> = [
	{ value: "active", labelKey: "Active" },
	{ value: "trial", labelKey: "Trial" },
	{ value: "suspended", labelKey: "Suspended" },
];

const FEATURE_KEYS: ReadonlyArray<{ key: string; labelKey: string }> = [
	{ key: "feature_ai_enabled", labelKey: "AI enrichment" },
	{ key: "feature_knowledge_graph", labelKey: "Knowledge graph" },
	{ key: "feature_report_generation", labelKey: "Report generation" },
	{ key: "feature_webhook", labelKey: "Webhook" },
];

interface TenantFormModalProps {
	isOpen: boolean;
	onClose: () => void;
	onCreated?: () => void;
}

export function TenantFormModal({
	isOpen,
	onClose,
	onCreated,
}: TenantFormModalProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();
	const createTenant = useCreateTenant();
	const updateTenant = useUpdateTenant();

	const [name, setName] = useState("");
	const [slug, setSlug] = useState("");
	const [adminEmail, setAdminEmail] = useState("");
	const [adminDisplayName, setAdminDisplayName] = useState("");
	const [initialStatus, setInitialStatus] = useState<
		"active" | "trial" | "suspended"
	>("active");
	const [features, setFeatures] = useState<Record<string, boolean>>({
		feature_ai_enabled: true,
		feature_knowledge_graph: false,
		feature_report_generation: false,
		feature_webhook: false,
	});
	const [quotaUsers, setQuotaUsers] = useState("100");
	const [quotaStorageMb, setQuotaStorageMb] = useState("10240");
	const [quotaAiTokens, setQuotaAiTokens] = useState("1000000");

	const [createdResponse, setCreatedResponse] =
		useState<CreateTenantResponse | null>(null);
	const [tokenCopied, setTokenCopied] = useState(false);

	useEffect(() => {
		if (!isOpen) {
			setName("");
			setSlug("");
			setAdminEmail("");
			setAdminDisplayName("");
			setInitialStatus("active");
			setFeatures({
				feature_ai_enabled: true,
				feature_knowledge_graph: false,
				feature_report_generation: false,
				feature_webhook: false,
			});
			setQuotaUsers("100");
			setQuotaStorageMb("10240");
			setQuotaAiTokens("1000000");
			setCreatedResponse(null);
			setTokenCopied(false);
		}
	}, [isOpen]);

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
		backgroundColor: "var(--color-background)",
		color: "var(--color-foreground)",
	} as const;

	const trimmedName = name.trim();
	const trimmedSlug = slug.trim();
	const trimmedAdminEmail = adminEmail.trim();

	const validation = useMemo(() => {
		if (!trimmedName) return t("Tenant name is required.");
		if (!trimmedSlug) return t("Tenant slug is required.");
		if (!TENANT_SLUG_RE.test(trimmedSlug)) {
			return t(
				"Slug must start with a lowercase letter, be 3-32 chars, and contain only [a-z0-9-].",
			);
		}
		if (!trimmedAdminEmail) {
			return t("Admin email is required to bootstrap the tenant admin user.");
		}
		const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedAdminEmail);
		if (!looksLikeEmail) {
			return t("Admin email must be a valid email address.");
		}
		const usersNum = Number(quotaUsers);
		if (!Number.isFinite(usersNum) || usersNum < 1) {
			return t("Quota users must be a positive integer.");
		}
		const storageNum = Number(quotaStorageMb);
		if (!Number.isFinite(storageNum) || storageNum < 1) {
			return t("Quota storage MB must be a positive integer.");
		}
		const tokensNum = Number(quotaAiTokens);
		if (!Number.isFinite(tokensNum) || tokensNum < 0) {
			return t("Quota AI tokens must be a non-negative integer.");
		}
		return null;
	}, [
		trimmedName,
		trimmedSlug,
		trimmedAdminEmail,
		quotaUsers,
		quotaStorageMb,
		quotaAiTokens,
		t,
	]);

	const handleSave = () => {
		if (validation) {
			error(t("Validation failed"), validation);
			return;
		}
		createTenant.mutate(
			{
				slug: trimmedSlug,
				name: trimmedName,
				admin_email: trimmedAdminEmail,
				admin_display_name: adminDisplayName.trim() || undefined,
			},
			{
				onSuccess: (response) => {
					setCreatedResponse(response);
					// Apply quotas / feature flags / status as a follow-up PATCH.
					updateTenant.mutate(
						{
							id: response.tenant.id,
							status: initialStatus,
							quota_users: Number(quotaUsers),
							quota_storage_mb: Number(quotaStorageMb),
							quota_ai_tokens_monthly: Number(quotaAiTokens),
							feature_flags: features,
						},
						{
							onError: (cause) => {
								error(
									t("Quotas not saved"),
									cause instanceof Error ? cause.message : t("Unknown error"),
								);
							},
						},
					);
					success(
						t("Tenant created"),
						t("Copy the password reset token to deliver it to the admin."),
					);
					onCreated?.();
				},
				onError: (cause) => {
					error(
						t("Create failed"),
						cause instanceof ApiClientError
							? cause.message
							: cause instanceof Error
								? cause.message
								: t("Unknown error"),
					);
				},
			},
		);
	};

	const handleCopyToken = async () => {
		if (!createdResponse) return;
		try {
			await navigator.clipboard.writeText(createdResponse.password_reset_token);
			setTokenCopied(true);
		} catch {
			error(t("Copy failed"), t("Clipboard access was denied by the browser."));
		}
	};

	if (createdResponse) {
		return (
			<TokenPanel
				response={createdResponse}
				tokenCopied={tokenCopied}
				onCopy={handleCopyToken}
				onClose={onClose}
				headingStyle={headingStyle}
				mutedStyle={mutedStyle}
				fieldStyle={fieldStyle}
				locale={locale}
				t={t}
			/>
		);
	}

	return (
		<Modal isOpen={isOpen} onClose={onClose} size="lg">
			<ModalHeader>
				<div className="flex items-center gap-3">
					<Building2
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<div>
						<h2 className="text-lg font-semibold" style={headingStyle}>
							{t("New tenant")}
						</h2>
						<p className="text-sm" style={mutedStyle}>
							{t(
								"Provision a new tenant. Slug becomes the routing key — pick something stable.",
							)}
						</p>
					</div>
				</div>
			</ModalHeader>

			<ModalBody className="space-y-4">
				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-name"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Tenant name")}
						</label>
						<Input
							id="tenant-form-name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							placeholder={t("e.g., Acme Holdings")}
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-slug"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Slug")}
						</label>
						<Input
							id="tenant-form-slug"
							value={slug}
							onChange={(event) => setSlug(event.target.value)}
							placeholder="acme-holdings"
						/>
						<p className="text-xs" style={mutedStyle}>
							{t("Lowercase, 3-32 chars, [a-z0-9-]. Used in routing keys.")}
						</p>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-email"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Admin email")}
						</label>
						<Input
							id="tenant-form-email"
							value={adminEmail}
							onChange={(event) => setAdminEmail(event.target.value)}
							placeholder="admin@example.com"
							type="email"
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-admin-name"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Admin display name")}
						</label>
						<Input
							id="tenant-form-admin-name"
							value={adminDisplayName}
							onChange={(event) => setAdminDisplayName(event.target.value)}
							placeholder={t("Optional — defaults to the email local part")}
						/>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-status"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Initial status")}
						</label>
						<select
							id="tenant-form-status"
							value={initialStatus}
							onChange={(event) =>
								setInitialStatus(
									event.target.value as "active" | "trial" | "suspended",
								)
							}
							className="h-10 w-full rounded-lg border px-3 text-sm"
							style={fieldStyle}
						>
							{STATUS_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{t(option.labelKey)}
								</option>
							))}
						</select>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-quota-users"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Quota: users")}
						</label>
						<Input
							id="tenant-form-quota-users"
							type="number"
							min={1}
							value={quotaUsers}
							onChange={(event) => setQuotaUsers(event.target.value)}
						/>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-2">
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-quota-storage"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Quota: storage MB")}
						</label>
						<Input
							id="tenant-form-quota-storage"
							type="number"
							min={1}
							value={quotaStorageMb}
							onChange={(event) => setQuotaStorageMb(event.target.value)}
						/>
					</div>
					<div className="space-y-1">
						<label
							htmlFor="tenant-form-quota-ai"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Quota: AI tokens / month")}
						</label>
						<Input
							id="tenant-form-quota-ai"
							type="number"
							min={0}
							value={quotaAiTokens}
							onChange={(event) => setQuotaAiTokens(event.target.value)}
						/>
					</div>
				</div>

				<section
					className="rounded-2xl border p-4"
					style={{
						backgroundColor: "var(--surface-muted-bg)",
						borderColor: "var(--surface-muted-border)",
					}}
				>
					<header>
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{t("Feature flags")}
						</h3>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{t(
								"Defaults applied at creation. Tenant admins can toggle these later in the detail drawer.",
							)}
						</p>
					</header>
					<div className="mt-3 grid gap-2 md:grid-cols-2">
						{FEATURE_KEYS.map((flag) => (
							<label
								key={flag.key}
								className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"
								style={fieldStyle}
							>
								<input
									type="checkbox"
									checked={Boolean(features[flag.key])}
									onChange={(event) =>
										setFeatures((prev) => ({
											...prev,
											[flag.key]: event.target.checked,
										}))
									}
								/>
								<span style={headingStyle}>{t(flag.labelKey)}</span>
							</label>
						))}
					</div>
				</section>

				<div
					className="flex items-start gap-2 rounded-xl border p-3 text-xs"
					style={{
						backgroundColor: "var(--surface-muted-bg)",
						borderColor: "var(--surface-muted-border)",
						color: "var(--surface-muted-text)",
					}}
				>
					<Info aria-hidden="true" className="mt-0.5 h-4 w-4" />
					<p>
						{t(
							"Status, quotas, and feature flags are applied via a follow-up PATCH after the tenant is created. The reset token shown next is the only credential the admin can use to claim the account — copy it before closing the dialog.",
						)}
					</p>
				</div>

				{validation ? <p className="text-xs text-error">{validation}</p> : null}
			</ModalBody>

			<ModalFooter>
				<Button type="button" variant="outline" onClick={onClose}>
					{t("Cancel")}
				</Button>
				<Button
					type="button"
					onClick={handleSave}
					disabled={createTenant.isPending || Boolean(validation)}
				>
					{createTenant.isPending ? (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					) : (
						<Save aria-hidden="true" className="h-4 w-4" />
					)}
					{t("Create tenant")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}

interface TokenPanelProps {
	response: CreateTenantResponse;
	tokenCopied: boolean;
	onCopy: () => void;
	onClose: () => void;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	fieldStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function TokenPanel({
	response,
	tokenCopied,
	onCopy,
	onClose,
	headingStyle,
	mutedStyle,
	fieldStyle,
	locale,
	t,
}: TokenPanelProps) {
	return (
		<Modal isOpen onClose={onClose} size="lg">
			<ModalHeader>
				<div className="flex items-center gap-3">
					<KeyRound
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--color-primary-500)" }}
					/>
					<div>
						<h2 className="text-lg font-semibold" style={headingStyle}>
							{t("Tenant created — copy admin reset token")}
						</h2>
						<p className="text-sm" style={mutedStyle}>
							{t(
								"This token is shown once. Deliver it to the new admin out of band; the password reset flow on /reset-password validates it.",
							)}
						</p>
					</div>
				</div>
			</ModalHeader>

			<ModalBody className="space-y-4">
				<dl className="grid grid-cols-2 gap-3 text-sm">
					<div>
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("Tenant")}
						</dt>
						<dd className="mt-1 truncate font-semibold" style={headingStyle}>
							{response.tenant.name}{" "}
							<span style={mutedStyle}>(/{response.tenant.slug})</span>
						</dd>
					</div>
					<div>
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("Admin user id")}
						</dt>
						<dd
							className="mt-1 truncate font-mono text-xs"
							style={headingStyle}
						>
							{response.admin_user_id}
						</dd>
					</div>
					<div className="col-span-2">
						<dt className="text-xs uppercase tracking-wide" style={mutedStyle}>
							{t("Token expires")}
						</dt>
						<dd className="mt-1 text-sm" style={headingStyle}>
							{formatDateTime(locale, response.password_reset_expires_at, {
								year: "numeric",
								month: "2-digit",
								day: "2-digit",
								hour: "2-digit",
								minute: "2-digit",
							})}
						</dd>
					</div>
				</dl>

				<div className="space-y-1">
					<label
						htmlFor="tenant-token-readout"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Password reset token")}
					</label>
					<div className="flex gap-2">
						<Input
							id="tenant-token-readout"
							readOnly
							value={response.password_reset_token}
							className="font-mono text-xs"
							style={fieldStyle}
						/>
						<Button type="button" variant="outline" onClick={onCopy}>
							{tokenCopied ? (
								<CheckCircle2 aria-hidden="true" className="h-4 w-4" />
							) : (
								<Copy aria-hidden="true" className="h-4 w-4" />
							)}
							{tokenCopied ? t("Copied") : t("Copy")}
						</Button>
					</div>
				</div>
			</ModalBody>

			<ModalFooter>
				<Button type="button" onClick={onClose}>
					{t("Close")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
