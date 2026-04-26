"use client";

/**
 * Right-slide drawer surfacing the full record of a tenant (super-admin).
 *
 * Five tabs:
 *   - 概览 (Overview)        — tenant metadata + live usage snapshot from
 *                              `/super/tenants/:id/usage`
 *   - 配额 (Quota)           — quota progress bars + editable limits, persisted
 *                              via `PATCH /super/tenants/:id`
 *   - 功能开关 (Features)    — feature_flags toggles (free-form JSON object;
 *                              we surface AI / Knowledge / Reports / Webhook
 *                              / MFA as canonical keys)
 *   - 用户 (Users)           — placeholder; backend `/super/tenants/:id/users`
 *                              is not yet exposed
 *   - 操作 (Actions)         — suspend / resume (status PATCH), admin reset
 *                              (placeholder), export (placeholder), and
 *                              soft-delete with double-confirm + `X-Confirm-
 *                              Delete: yes` header.
 */

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { Input } from "@/components/ui/input";
import { Modal, ModalBody, ModalFooter, ModalHeader } from "@/components/ui/modal";
import {
	type ResetAdminPasswordResponse,
	type TenantExportRow,
	type TenantRow,
	type TenantUserRow,
	useDeleteTenant,
	useExportTenantData,
	useResetTenantAdminPassword,
	useSuspendTenant,
	useTenantExports,
	useTenantUsage,
	useTenantUsers,
	useUpdateTenant,
} from "@/hooks/use-admin-tenants";
import { ApiClientError } from "@/lib/api";
import { type Locale, formatDateTime } from "@/lib/i18n";
import { useLocale, useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useToast } from "@/stores/toast-store";
import { AnimatePresence, motion } from "framer-motion";
import {
	Activity,
	AlertCircle,
	Archive,
	Building2,
	CheckCircle2,
	Copy,
	CreditCard,
	Database,
	Download,
	History,
	KeyRound,
	Loader2,
	Power,
	RefreshCw,
	Save,
	ShieldCheck,
	Sliders,
	Trash2,
	Users,
	X,
	XCircle,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";

const PANEL_VARIANTS = {
	hidden: { x: "100%", opacity: 0.6 },
	visible: {
		x: 0,
		opacity: 1,
		transition: { type: "spring", stiffness: 320, damping: 32 },
	},
	exit: {
		x: "100%",
		opacity: 0.6,
		transition: { duration: 0.2 },
	},
} as const;

type DrawerTab =
	| "overview"
	| "quota"
	| "features"
	| "users"
	| "exports"
	| "actions";

interface TenantDetailDrawerProps {
	open: boolean;
	tenant: TenantRow | null;
	onClose: () => void;
}

function statusVariant(
	status: string,
): "outline" | "secondary" | "success" | "warning" {
	switch (status.toLowerCase()) {
		case "active":
			return "success";
		case "trial":
			return "secondary";
		case "suspended":
			return "warning";
		default:
			return "outline";
	}
}

function statusLabelKey(status: string): string {
	switch (status.toLowerCase()) {
		case "active":
			return "Active";
		case "trial":
			return "Trial";
		case "suspended":
			return "Suspended";
		default:
			return status;
	}
}

export function TenantDetailDrawer({
	open,
	tenant,
	onClose,
}: TenantDetailDrawerProps) {
	const t = useT();
	const locale = useLocale();
	const { success, error } = useToast();

	const [activeTab, setActiveTab] = useState<DrawerTab>("overview");
	const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
	const [confirmDeleteSecondOpen, setConfirmDeleteSecondOpen] = useState(false);
	const [usersSearch, setUsersSearch] = useState("");
	const [usersRoleTier, setUsersRoleTier] = useState<string>("");
	const [resetTokenPayload, setResetTokenPayload] =
		useState<ResetAdminPasswordResponse | null>(null);
	const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
	const [exportConfirmOpen, setExportConfirmOpen] = useState(false);
	const [suspendOpen, setSuspendOpen] = useState(false);
	const [suspendReason, setSuspendReason] = useState("");
	const [suspendUntil, setSuspendUntil] = useState("");

	const usageQuery = useTenantUsage(tenant?.id ?? null);
	const usersQuery = useTenantUsers({
		tenantId: tenant?.id ?? null,
		q: usersSearch,
		roleTier: usersRoleTier,
	});
	const exportsQuery = useTenantExports({ tenantId: tenant?.id ?? null });
	const updateTenant = useUpdateTenant();
	const deleteTenant = useDeleteTenant();
	const resetAdmin = useResetTenantAdminPassword();
	const exportData = useExportTenantData();
	const suspendTenant = useSuspendTenant();

	useEffect(() => {
		if (open && tenant) {
			setActiveTab("overview");
		}
	}, [open, tenant]);

	const surfaceStyle = {
		backgroundColor: "var(--surface-muted-bg)",
		borderColor: "var(--surface-muted-border)",
	} as const;
	const fieldStyle = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedStyle = { color: "var(--surface-muted-text)" } as const;

	const handleDeleteConfirmed = () => {
		if (!tenant) return;
		deleteTenant.mutate(tenant.id, {
			onSuccess: () => {
				success(
					t("Tenant deleted"),
					t(
						"Tenant has been soft-deleted. Usage rollups stop accruing immediately.",
					),
				);
				setConfirmDeleteOpen(false);
				setConfirmDeleteSecondOpen(false);
				onClose();
			},
			onError: (cause) => {
				error(
					t("Delete failed"),
					cause instanceof ApiClientError
						? cause.message
						: cause instanceof Error
							? cause.message
							: t("Unknown error"),
				);
			},
		});
	};

	const handleResume = () => {
		if (!tenant) return;
		updateTenant.mutate(
			{ id: tenant.id, status: "active" },
			{
				onSuccess: () => {
					success(
						t("Tenant resumed"),
						t(
							"Tenant logins re-enabled and the worker will resume polling on the next tick.",
						),
					);
				},
				onError: (cause) => {
					error(
						t("Save failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const handleSuspendConfirmed = () => {
		if (!tenant) return;
		const trimmedReason = suspendReason.trim();
		const trimmedUntil = suspendUntil.trim();
		const untilIso = trimmedUntil
			? new Date(trimmedUntil).toISOString()
			: null;
		suspendTenant.mutate(
			{
				tenantId: tenant.id,
				reason: trimmedReason ? trimmedReason : undefined,
				until: untilIso,
			},
			{
				onSuccess: (data) => {
					success(
						t("Tenant suspended"),
						t("Sessions revoked: {count}", {
							count: String(data.sessions_revoked),
						}),
					);
					setSuspendOpen(false);
					setSuspendReason("");
					setSuspendUntil("");
				},
				onError: (cause) => {
					error(
						t("Suspend failed"),
						cause instanceof Error ? cause.message : t("Unknown error"),
					);
				},
			},
		);
	};

	const handleResetAdminConfirmed = () => {
		if (!tenant) return;
		resetAdmin.mutate(tenant.id, {
			onSuccess: (data) => {
				setResetTokenPayload(data);
				setResetConfirmOpen(false);
			},
			onError: (cause) => {
				error(
					t("Reset failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
				setResetConfirmOpen(false);
			},
		});
	};

	const handleExportConfirmed = () => {
		if (!tenant) return;
		exportData.mutate(tenant.id, {
			onSuccess: () => {
				success(
					t("Export queued"),
					t(
						"Export job is queued. Track progress in the Exports tab — it will refresh automatically.",
					),
				);
				setExportConfirmOpen(false);
				setActiveTab("exports");
			},
			onError: (cause) => {
				error(
					t("Export failed"),
					cause instanceof Error ? cause.message : t("Unknown error"),
				);
				setExportConfirmOpen(false);
			},
		});
	};

	if (!tenant) {
		return null;
	}

	return (
		<AnimatePresence>
			{open ? (
				<div className="fixed inset-0 z-50 flex">
					<motion.div
						variants={overlayVariants}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="absolute inset-0 bg-black/55 backdrop-blur-sm"
						onClick={onClose}
						aria-hidden="true"
					/>
					<motion.aside
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
						className="ml-auto flex h-full w-full max-w-2xl flex-col overflow-hidden border-l shadow-2xl"
						style={{
							backgroundColor: "var(--color-background)",
							borderColor: "var(--surface-muted-border)",
						}}
						role="dialog"
						aria-label={t("Tenant detail")}
					>
						<header
							className="flex items-start justify-between gap-4 border-b px-6 py-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div className="min-w-0">
								<p
									className="text-xs uppercase tracking-wide"
									style={mutedStyle}
								>
									{t("Tenant")}
								</p>
								<h2
									className="mt-1 truncate text-lg font-semibold"
									style={headingStyle}
								>
									{tenant.name}
								</h2>
								<div className="mt-2 flex flex-wrap gap-2">
									<Badge variant="outline">/{tenant.slug}</Badge>
									<Badge variant={statusVariant(tenant.status)}>
										{t(statusLabelKey(tenant.status))}
									</Badge>
									{tenant.deleted_at ? (
										<Badge variant="destructive">{t("Deleted")}</Badge>
									) : null}
								</div>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="flex h-9 w-9 items-center justify-center rounded-full border"
								style={fieldStyle}
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</header>

						<nav
							className="flex flex-wrap gap-1 border-b px-2 py-1"
							style={{ borderColor: "var(--surface-muted-border)" }}
							aria-label={t("Tenant tabs")}
						>
							<TabButton
								active={activeTab === "overview"}
								onClick={() => setActiveTab("overview")}
								label={t("Overview")}
								icon={<Building2 aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "quota"}
								onClick={() => setActiveTab("quota")}
								label={t("Quota")}
								icon={<Database aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "features"}
								onClick={() => setActiveTab("features")}
								label={t("Features")}
								icon={<Sliders aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "users"}
								onClick={() => setActiveTab("users")}
								label={t("Users")}
								icon={<Users aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "exports"}
								onClick={() => setActiveTab("exports")}
								label={t("Exports")}
								icon={<History aria-hidden="true" className="h-4 w-4" />}
							/>
							<TabButton
								active={activeTab === "actions"}
								onClick={() => setActiveTab("actions")}
								label={t("Actions")}
								icon={<ShieldCheck aria-hidden="true" className="h-4 w-4" />}
							/>
						</nav>

						<div className="flex-1 overflow-y-auto px-6 py-4">
							{activeTab === "overview" ? (
								<OverviewTab
									tenant={tenant}
									usage={usageQuery.data ?? null}
									usageLoading={usageQuery.isLoading}
									usageError={
										usageQuery.error instanceof Error
											? usageQuery.error.message
											: null
									}
									refreshing={usageQuery.isRefetching}
									onRefresh={() => {
										void usageQuery.refetch();
									}}
									pendingRename={updateTenant.isPending}
									onRename={(nextName) =>
										updateTenant.mutate(
											{ id: tenant.id, name: nextName },
											{
												onSuccess: () => {
													success(
														t("Tenant updated"),
														t("Tenant display name saved."),
													);
												},
												onError: (cause) => {
													error(
														t("Save failed"),
														cause instanceof Error
															? cause.message
															: t("Unknown error"),
													);
												},
											},
										)
									}
									surfaceStyle={surfaceStyle}
									fieldStyle={fieldStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}

							{activeTab === "quota" ? (
								<QuotaTab
									tenant={tenant}
									usage={usageQuery.data ?? null}
									pending={updateTenant.isPending}
									onSave={(payload) =>
										updateTenant.mutate(
											{ id: tenant.id, ...payload },
											{
												onSuccess: () => {
													success(
														t("Quota saved"),
														t(
															"Updated quotas take effect on the next worker tick.",
														),
													);
												},
												onError: (cause) => {
													error(
														t("Save failed"),
														cause instanceof Error
															? cause.message
															: t("Unknown error"),
													);
												},
											},
										)
									}
									surfaceStyle={surfaceStyle}
									fieldStyle={fieldStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}

							{activeTab === "features" ? (
								<FeaturesTab
									tenant={tenant}
									pending={updateTenant.isPending}
									onSave={(nextFlags) =>
										updateTenant.mutate(
											{ id: tenant.id, feature_flags: nextFlags },
											{
												onSuccess: () => {
													success(
														t("Features saved"),
														t(
															"Feature flags will apply on the next request cycle.",
														),
													);
												},
												onError: (cause) => {
													error(
														t("Save failed"),
														cause instanceof Error
															? cause.message
															: t("Unknown error"),
													);
												},
											},
										)
									}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}

							{activeTab === "users" ? (
								<UsersTab
									users={usersQuery.data?.data ?? []}
									total={usersQuery.data?.total ?? 0}
									loading={usersQuery.isLoading}
									errorMessage={
										usersQuery.error instanceof Error
											? usersQuery.error.message
											: null
									}
									search={usersSearch}
									onSearchChange={setUsersSearch}
									roleTier={usersRoleTier}
									onRoleTierChange={setUsersRoleTier}
									surfaceStyle={surfaceStyle}
									fieldStyle={fieldStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}

							{activeTab === "exports" ? (
								<ExportsTab
									exports={exportsQuery.data?.data ?? []}
									loading={exportsQuery.isLoading}
									errorMessage={
										exportsQuery.error instanceof Error
											? exportsQuery.error.message
											: null
									}
									pollingActive={
										exportsQuery.data?.data.some(
											(row) =>
												row.status === "queued" || row.status === "running",
										) ?? false
									}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									locale={locale}
									t={t}
								/>
							) : null}

							{activeTab === "actions" ? (
								<ActionsTab
									tenant={tenant}
									pendingSuspend={
										suspendTenant.isPending || updateTenant.isPending
									}
									pendingReset={resetAdmin.isPending}
									pendingExport={exportData.isPending}
									pendingDelete={deleteTenant.isPending}
									onSuspendOpen={() => setSuspendOpen(true)}
									onResume={handleResume}
									onResetAdmin={() => setResetConfirmOpen(true)}
									onExport={() => setExportConfirmOpen(true)}
									onDelete={() => setConfirmDeleteOpen(true)}
									surfaceStyle={surfaceStyle}
									headingStyle={headingStyle}
									mutedStyle={mutedStyle}
									t={t}
								/>
							) : null}
						</div>
					</motion.aside>

					<ConfirmActionModal
						isOpen={confirmDeleteOpen}
						onClose={() => setConfirmDeleteOpen(false)}
						onConfirm={() => {
							setConfirmDeleteOpen(false);
							setConfirmDeleteSecondOpen(true);
						}}
						title={t("Delete tenant?")}
						description={t(
							"This soft-deletes the tenant. Logins are blocked, worker activity halts, and the slug becomes reserved. Final confirmation follows.",
						)}
						confirmLabel={t("Continue")}
						cancelLabel={t("Cancel")}
						confirmVariant="destructive"
						busy={deleteTenant.isPending}
					/>

					<ConfirmActionModal
						isOpen={confirmDeleteSecondOpen}
						onClose={() => setConfirmDeleteSecondOpen(false)}
						onConfirm={handleDeleteConfirmed}
						title={t("Final confirmation")}
						description={t(
							"This sends DELETE /super/tenants/:id with the X-Confirm-Delete: yes header. The tenant slug remains reserved post-delete.",
						)}
						confirmLabel={t("Permanently delete")}
						cancelLabel={t("Cancel")}
						confirmVariant="destructive"
						busy={deleteTenant.isPending}
					/>

					<ConfirmActionModal
						isOpen={resetConfirmOpen}
						onClose={() => setResetConfirmOpen(false)}
						onConfirm={handleResetAdminConfirmed}
						title={t("Reset tenant admin password?")}
						description={t(
							"Issues a fresh 24h password-reset token for the tenant's first super_admin. The token is shown only once — copy it before closing the next modal.",
						)}
						confirmLabel={t("Issue reset token")}
						cancelLabel={t("Cancel")}
						confirmVariant="default"
						busy={resetAdmin.isPending}
					/>

					<ResetTokenModal
						payload={resetTokenPayload}
						onClose={() => setResetTokenPayload(null)}
						t={t}
					/>

					<ConfirmActionModal
						isOpen={exportConfirmOpen}
						onClose={() => setExportConfirmOpen(false)}
						onConfirm={handleExportConfirmed}
						title={t("Export tenant data?")}
						description={t(
							"Queues a tenant export job. Track progress in the Exports tab — the badge updates from queued → running → completed/failed automatically.",
						)}
						confirmLabel={t("Queue export")}
						cancelLabel={t("Cancel")}
						confirmVariant="default"
						busy={exportData.isPending}
					/>

					<SuspendModal
						open={suspendOpen}
						reason={suspendReason}
						onReasonChange={setSuspendReason}
						until={suspendUntil}
						onUntilChange={setSuspendUntil}
						onClose={() => setSuspendOpen(false)}
						onConfirm={handleSuspendConfirmed}
						busy={suspendTenant.isPending}
						fieldStyle={fieldStyle}
						mutedStyle={mutedStyle}
						t={t}
					/>
				</div>
			) : null}
		</AnimatePresence>
	);
}

function TabButton({
	active,
	onClick,
	label,
	icon,
}: {
	active: boolean;
	onClick: () => void;
	label: string;
	icon: React.ReactNode;
}) {
	return (
		<button
			type="button"
			onClick={onClick}
			className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors"
			style={
				active
					? {
							backgroundColor: "var(--surface-accent-strong)",
							color: "var(--color-foreground)",
						}
					: { color: "var(--surface-muted-text)" }
			}
			aria-pressed={active}
		>
			{icon}
			{label}
		</button>
	);
}

interface UsageRecordShape {
	tenant_id: string;
	current_users: number;
	current_articles: number;
	current_storage_mb: number;
	ai_tokens_this_month: number;
}

interface OverviewTabProps {
	tenant: TenantRow;
	usage: UsageRecordShape | null;
	usageLoading: boolean;
	usageError: string | null;
	refreshing: boolean;
	onRefresh: () => void;
	pendingRename: boolean;
	onRename: (nextName: string) => void;
	surfaceStyle: React.CSSProperties;
	fieldStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function OverviewTab({
	tenant,
	usage,
	usageLoading,
	usageError,
	refreshing,
	onRefresh,
	pendingRename,
	onRename,
	surfaceStyle,
	fieldStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: OverviewTabProps) {
	const [draftName, setDraftName] = useState(tenant.name);
	useEffect(() => {
		setDraftName(tenant.name);
	}, [tenant.name]);

	const dirty = draftName.trim() !== tenant.name && draftName.trim().length > 0;

	return (
		<div className="space-y-5">
			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="tenant-overview-profile"
			>
				<h3 className="text-xs uppercase tracking-wide" style={mutedStyle}>
					{t("Profile")}
				</h3>
				<dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
					<OverviewField
						label={t("Slug")}
						value={`/${tenant.slug}`}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Status")}
						value={t(statusLabelKey(tenant.status))}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Created")}
						value={formatDateTime(locale, tenant.created_at, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
						})}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Updated")}
						value={formatDateTime(locale, tenant.updated_at, {
							year: "numeric",
							month: "2-digit",
							day: "2-digit",
							hour: "2-digit",
							minute: "2-digit",
						})}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<OverviewField
						label={t("Tenant id")}
						value={tenant.id}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
				</dl>

				<div className="mt-4 space-y-1">
					<label
						htmlFor="tenant-overview-name"
						className="text-xs uppercase tracking-wide"
						style={mutedStyle}
					>
						{t("Display name")}
					</label>
					<div className="flex items-center gap-2">
						<Input
							id="tenant-overview-name"
							value={draftName}
							onChange={(event) => setDraftName(event.target.value)}
							style={fieldStyle}
						/>
						<Button
							type="button"
							size="sm"
							onClick={() => onRename(draftName.trim())}
							disabled={!dirty || pendingRename}
						>
							{pendingRename ? (
								<Loader2
									aria-hidden="true"
									className="h-4 w-4 animate-spin"
								/>
							) : (
								<Save aria-hidden="true" className="h-4 w-4" />
							)}
							{t("Save")}
						</Button>
					</div>
				</div>
			</section>

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="tenant-overview-usage"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Current usage")}
						</h3>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{usageLoading
								? t("Loading usage")
								: usageError
									? usageError
									: t(
											"Live snapshot from /super/tenants/:id/usage. Refresh to recompute.",
										)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onRefresh}
						disabled={refreshing || usageLoading}
					>
						{refreshing ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<RefreshCw aria-hidden="true" className="h-4 w-4" />
						)}
						{t("Refresh")}
					</Button>
				</div>
				<dl className="mt-3 grid grid-cols-2 gap-3 text-sm md:grid-cols-3">
					<UsageField
						label={t("Users")}
						value={usage?.current_users ?? 0}
						icon={<Users aria-hidden="true" className="h-4 w-4" />}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<UsageField
						label={t("Articles")}
						value={usage?.current_articles ?? 0}
						icon={<Activity aria-hidden="true" className="h-4 w-4" />}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<UsageField
						label={t("Storage MB")}
						value={usage?.current_storage_mb ?? 0}
						icon={<Database aria-hidden="true" className="h-4 w-4" />}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
					<UsageField
						label={t("AI tokens / mo")}
						value={usage?.ai_tokens_this_month ?? 0}
						icon={<CreditCard aria-hidden="true" className="h-4 w-4" />}
						headingStyle={headingStyle}
						mutedStyle={mutedStyle}
					/>
				</dl>
			</section>
		</div>
	);
}

function OverviewField({
	label,
	value,
	headingStyle,
	mutedStyle,
}: {
	label: string;
	value: string;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
}) {
	return (
		<div className="min-w-0">
			<p className="text-xs uppercase tracking-wide" style={mutedStyle}>
				{label}
			</p>
			<p className="mt-1 truncate text-sm" style={headingStyle}>
				{value}
			</p>
		</div>
	);
}

function UsageField({
	label,
	value,
	icon,
	headingStyle,
	mutedStyle,
}: {
	label: string;
	value: number;
	icon: React.ReactNode;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
}) {
	return (
		<div className="min-w-0">
			<p
				className="flex items-center gap-1 text-xs uppercase tracking-wide"
				style={mutedStyle}
			>
				{icon}
				{label}
			</p>
			<p
				className="mt-1 text-base font-semibold tabular-nums"
				style={headingStyle}
			>
				{value.toLocaleString()}
			</p>
		</div>
	);
}

interface QuotaTabProps {
	tenant: TenantRow;
	usage: UsageRecordShape | null;
	pending: boolean;
	onSave: (payload: {
		quota_users?: number;
		quota_storage_mb?: number;
		quota_ai_tokens_monthly?: number;
	}) => void;
	surfaceStyle: React.CSSProperties;
	fieldStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function QuotaTab({
	tenant,
	usage,
	pending,
	onSave,
	surfaceStyle,
	fieldStyle,
	headingStyle,
	mutedStyle,
	t,
}: QuotaTabProps) {
	const [maxUsers, setMaxUsers] = useState(String(tenant.quota_users));
	const [maxStorageMb, setMaxStorageMb] = useState(
		String(tenant.quota_storage_mb),
	);
	const [maxAiTokens, setMaxAiTokens] = useState(
		String(tenant.quota_ai_tokens_monthly),
	);

	useEffect(() => {
		setMaxUsers(String(tenant.quota_users));
		setMaxStorageMb(String(tenant.quota_storage_mb));
		setMaxAiTokens(String(tenant.quota_ai_tokens_monthly));
	}, [tenant]);

	const dirty = useMemo(
		() =>
			Number(maxUsers) !== tenant.quota_users ||
			Number(maxStorageMb) !== tenant.quota_storage_mb ||
			Number(maxAiTokens) !== tenant.quota_ai_tokens_monthly,
		[
			maxUsers,
			maxStorageMb,
			maxAiTokens,
			tenant.quota_users,
			tenant.quota_storage_mb,
			tenant.quota_ai_tokens_monthly,
		],
	);

	const submit = () => {
		onSave({
			quota_users: Number(maxUsers),
			quota_storage_mb: Number(maxStorageMb),
			quota_ai_tokens_monthly: Number(maxAiTokens),
		});
	};

	const QUOTA_FIELDS = [
		{
			key: "users",
			labelKey: "Quota: users",
			current: usage?.current_users ?? 0,
			limit: tenant.quota_users,
			value: maxUsers,
			setter: setMaxUsers,
		},
		{
			key: "storage",
			labelKey: "Quota: storage MB",
			current: usage?.current_storage_mb ?? 0,
			limit: tenant.quota_storage_mb,
			value: maxStorageMb,
			setter: setMaxStorageMb,
		},
		{
			key: "ai_tokens",
			labelKey: "Quota: AI tokens / month",
			current: usage?.ai_tokens_this_month ?? 0,
			limit: tenant.quota_ai_tokens_monthly,
			value: maxAiTokens,
			setter: setMaxAiTokens,
		},
	] as const;

	return (
		<div className="space-y-4">
			{QUOTA_FIELDS.map((field) => {
				const limitNumber = field.limit > 0 ? field.limit : 0;
				const ratio =
					limitNumber > 0
						? Math.min(1, Number(field.current) / limitNumber)
						: Number(field.current) > 0
							? 1
							: 0;
				const ratioPct = Math.round(ratio * 100);
				const barColor =
					ratio >= 0.9
						? "var(--surface-hero-rose-gradient)"
						: ratio >= 0.7
							? "var(--surface-hero-amber-gradient)"
							: "var(--surface-hero-emerald-gradient)";
				return (
					<section
						key={field.key}
						className="rounded-2xl border p-4"
						style={surfaceStyle}
						data-testid={`tenant-quota-${field.key}`}
					>
						<header className="flex flex-wrap items-end justify-between gap-3">
							<div>
								<h3
									className="text-sm font-semibold"
									style={headingStyle}
								>
									{t(field.labelKey)}
								</h3>
								<p className="mt-1 text-xs" style={mutedStyle}>
									{t("Current")}:{" "}
									<span style={headingStyle}>
										{Number(field.current).toLocaleString()}
									</span>{" "}
									/ {field.limit.toLocaleString()} ({ratioPct}%)
								</p>
							</div>
							<div className="flex items-center gap-2">
								<Input
									type="number"
									min={0}
									value={field.value}
									onChange={(event) => field.setter(event.target.value)}
									style={fieldStyle}
									className="w-32"
								/>
							</div>
						</header>
						<div
							className="mt-3 h-2 overflow-hidden rounded-full"
							style={{ backgroundColor: "var(--field-surface)" }}
						>
							<div
								className="h-full rounded-full"
								style={{
									width: `${ratioPct}%`,
									background: barColor,
								}}
							/>
						</div>
					</section>
				);
			})}

			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="tenant-quota-rate-pending"
			>
				<div className="flex items-start justify-between gap-3">
					<div>
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{t("API rate limit")}
						</h3>
						<p className="mt-1 text-xs" style={mutedStyle}>
							{t(
								"Per-tenant API rate limiting is governed at the gateway and not yet exposed as a tenant-level quota. The control will appear here once the column ships.",
							)}
						</p>
					</div>
					<Badge variant="outline">{t("Pending")}</Badge>
				</div>
			</section>

			<div className="flex justify-end">
				<Button
					type="button"
					onClick={submit}
					disabled={!dirty || pending}
				>
					{pending ? (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					) : (
						<Save aria-hidden="true" className="h-4 w-4" />
					)}
					{t("Save quotas")}
				</Button>
			</div>
		</div>
	);
}

interface FeaturesTabProps {
	tenant: TenantRow;
	pending: boolean;
	onSave: (nextFlags: Record<string, unknown>) => void;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

const FEATURE_KEYS: ReadonlyArray<{
	key: string;
	labelKey: string;
	descriptionKey: string;
}> = [
	{
		key: "feature_ai_enabled",
		labelKey: "AI enrichment",
		descriptionKey:
			"Toggle backend AI enrichment (categorization, summaries, embeddings).",
	},
	{
		key: "feature_knowledge_graph",
		labelKey: "Knowledge graph",
		descriptionKey:
			"Enable graph extraction and the public /knowledge query endpoint.",
	},
	{
		key: "feature_report_generation",
		labelKey: "Report generation",
		descriptionKey:
			"Allow tenant admins to schedule and download generated reports.",
	},
	{
		key: "feature_webhook",
		labelKey: "Webhook",
		descriptionKey: "Enable outbound webhook delivery on tenant events.",
	},
	{
		key: "feature_banners",
		labelKey: "Banner orchestration",
		descriptionKey:
			"Allow this tenant to publish banners targeted at its users.",
	},
	{
		key: "feature_mfa_required",
		labelKey: "Require MFA",
		descriptionKey:
			"Force new sessions for this tenant to complete MFA before issuing a session cookie.",
	},
];

function readFlag(
	flags: Record<string, unknown>,
	key: string,
	fallback: boolean,
): boolean {
	const value = flags[key];
	if (typeof value === "boolean") return value;
	return fallback;
}

function FeaturesTab({
	tenant,
	pending,
	onSave,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: FeaturesTabProps) {
	const [flags, setFlags] = useState<Record<string, boolean>>(() => ({
		feature_ai_enabled: readFlag(tenant.feature_flags, "feature_ai_enabled", true),
		feature_knowledge_graph: readFlag(
			tenant.feature_flags,
			"feature_knowledge_graph",
			false,
		),
		feature_report_generation: readFlag(
			tenant.feature_flags,
			"feature_report_generation",
			false,
		),
		feature_webhook: readFlag(tenant.feature_flags, "feature_webhook", false),
		feature_banners: readFlag(tenant.feature_flags, "feature_banners", false),
		feature_mfa_required: readFlag(
			tenant.feature_flags,
			"feature_mfa_required",
			false,
		),
	}));

	useEffect(() => {
		setFlags({
			feature_ai_enabled: readFlag(
				tenant.feature_flags,
				"feature_ai_enabled",
				true,
			),
			feature_knowledge_graph: readFlag(
				tenant.feature_flags,
				"feature_knowledge_graph",
				false,
			),
			feature_report_generation: readFlag(
				tenant.feature_flags,
				"feature_report_generation",
				false,
			),
			feature_webhook: readFlag(
				tenant.feature_flags,
				"feature_webhook",
				false,
			),
			feature_banners: readFlag(
				tenant.feature_flags,
				"feature_banners",
				false,
			),
			feature_mfa_required: readFlag(
				tenant.feature_flags,
				"feature_mfa_required",
				false,
			),
		});
	}, [tenant]);

	const dirty = useMemo(() => {
		for (const flag of FEATURE_KEYS) {
			if (
				readFlag(tenant.feature_flags, flag.key, flag.key === "feature_ai_enabled") !==
				flags[flag.key]
			) {
				return true;
			}
		}
		return false;
	}, [flags, tenant.feature_flags]);

	const submit = () => {
		const merged: Record<string, unknown> = { ...tenant.feature_flags };
		for (const [key, value] of Object.entries(flags)) {
			merged[key] = value;
		}
		onSave(merged);
	};

	return (
		<div className="space-y-3">
			{FEATURE_KEYS.map((flag) => (
				<section
					key={flag.key}
					className="rounded-2xl border p-4"
					style={surfaceStyle}
					data-testid={`tenant-feature-${flag.key}`}
				>
					<div className="flex items-start justify-between gap-3">
						<div>
							<h3 className="text-sm font-semibold" style={headingStyle}>
								{t(flag.labelKey)}
							</h3>
							<p className="mt-1 text-xs" style={mutedStyle}>
								{t(flag.descriptionKey)}
							</p>
						</div>
						<button
							type="button"
							onClick={() =>
								setFlags((prev) => ({ ...prev, [flag.key]: !prev[flag.key] }))
							}
							className="relative h-6 w-11 rounded-full transition-colors"
							style={{
								backgroundColor: flags[flag.key]
									? "var(--color-primary-500)"
									: "var(--field-surface)",
								borderColor: "var(--field-border)",
								borderWidth: 1,
								borderStyle: "solid",
							}}
							aria-pressed={flags[flag.key]}
							aria-label={t(flag.labelKey)}
						>
							<span
								className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow"
								style={{
									left: flags[flag.key] ? "calc(100% - 22px)" : "2px",
									transition: "left 0.2s ease",
								}}
							/>
						</button>
					</div>
				</section>
			))}

			<div className="flex justify-end">
				<Button
					type="button"
					onClick={submit}
					disabled={!dirty || pending}
				>
					{pending ? (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					) : (
						<Save aria-hidden="true" className="h-4 w-4" />
					)}
					{t("Save features")}
				</Button>
			</div>
		</div>
	);
}

interface UsersTabProps {
	users: TenantUserRow[];
	total: number;
	loading: boolean;
	errorMessage: string | null;
	search: string;
	onSearchChange: (value: string) => void;
	roleTier: string;
	onRoleTierChange: (value: string) => void;
	surfaceStyle: React.CSSProperties;
	fieldStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

const ROLE_TIER_OPTIONS: ReadonlyArray<{ value: string; labelKey: string }> = [
	{ value: "", labelKey: "All tiers" },
	{ value: "basic_user", labelKey: "Basic user+" },
	{ value: "verified_user", labelKey: "Verified user+" },
	{ value: "premium_user", labelKey: "Premium user+" },
	{ value: "tenant_admin", labelKey: "Tenant admin+" },
	{ value: "super_admin", labelKey: "Super admin" },
];

function roleTierLabelKey(tier: string): string {
	switch (tier) {
		case "super_admin":
			return "Super admin";
		case "tenant_admin":
			return "Tenant admin";
		case "premium_user":
			return "Premium";
		case "verified_user":
			return "Verified";
		case "basic_user":
		default:
			return "Basic";
	}
}

function UsersTab({
	users,
	total,
	loading,
	errorMessage,
	search,
	onSearchChange,
	roleTier,
	onRoleTierChange,
	surfaceStyle,
	fieldStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: UsersTabProps) {
	return (
		<div className="space-y-4">
			<section
				className="rounded-2xl border p-4"
				style={surfaceStyle}
				data-testid="tenant-users-filters"
			>
				<div className="flex flex-wrap items-end gap-3">
					<div className="min-w-[200px] flex-1">
						<label
							htmlFor="tenant-users-search"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Search")}
						</label>
						<Input
							id="tenant-users-search"
							value={search}
							onChange={(event) => onSearchChange(event.target.value)}
							placeholder={t("Email or display name")}
							style={fieldStyle}
						/>
					</div>
					<div>
						<label
							htmlFor="tenant-users-role-tier"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Role tier")}
						</label>
						<select
							id="tenant-users-role-tier"
							value={roleTier}
							onChange={(event) => onRoleTierChange(event.target.value)}
							className="h-9 rounded-md border px-3 text-sm"
							style={fieldStyle}
						>
							{ROLE_TIER_OPTIONS.map((option) => (
								<option key={option.value} value={option.value}>
									{t(option.labelKey)}
								</option>
							))}
						</select>
					</div>
				</div>
				<p className="mt-2 text-xs" style={mutedStyle}>
					{t("Total")}: {total.toLocaleString()}
				</p>
			</section>

			<section
				className="rounded-2xl border"
				style={surfaceStyle}
				data-testid="tenant-users-table"
			>
				{loading ? (
					<div
						className="flex items-center gap-2 px-4 py-6 text-sm"
						style={mutedStyle}
					>
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						{t("Loading users")}
					</div>
				) : errorMessage ? (
					<div
						className="flex items-start gap-2 px-4 py-6 text-sm"
						style={mutedStyle}
					>
						<AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
						{errorMessage}
					</div>
				) : users.length === 0 ? (
					<div
						className="px-4 py-6 text-center text-sm"
						style={mutedStyle}
					>
						{t("No users match the current filters.")}
					</div>
				) : (
					<ul className="divide-y" style={{ borderColor: "var(--field-border)" }}>
						<li
							className="grid grid-cols-12 gap-2 px-4 py-2 text-xs uppercase tracking-wide"
							style={mutedStyle}
							aria-hidden="true"
						>
							<span className="col-span-5">{t("Email")}</span>
							<span className="col-span-3">{t("Role tier")}</span>
							<span className="col-span-2">{t("Last login")}</span>
							<span className="col-span-2 text-right">{t("Created")}</span>
						</li>
						{users.map((user) => (
							<li
								key={user.id}
								className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm"
							>
								<div className="col-span-5 min-w-0">
									<p
										className="truncate font-medium"
										style={headingStyle}
									>
										{user.email}
									</p>
									{user.display_name ? (
										<p
											className="truncate text-xs"
											style={mutedStyle}
										>
											{user.display_name}
										</p>
									) : null}
								</div>
								<div className="col-span-3">
									<Badge variant="secondary">
										{t(roleTierLabelKey(user.role_tier))}
									</Badge>
									{!user.is_active ? (
										<Badge variant="warning" className="ml-1">
											{t("Inactive")}
										</Badge>
									) : null}
								</div>
								<div
									className="col-span-2 text-xs tabular-nums"
									style={mutedStyle}
								>
									{user.last_login
										? formatDateTime(locale, user.last_login, {
												month: "2-digit",
												day: "2-digit",
												hour: "2-digit",
												minute: "2-digit",
											})
										: "—"}
								</div>
								<div
									className="col-span-2 text-right text-xs tabular-nums"
									style={mutedStyle}
								>
									{formatDateTime(locale, user.created_at, {
										year: "numeric",
										month: "2-digit",
										day: "2-digit",
									})}
								</div>
							</li>
						))}
					</ul>
				)}
			</section>
		</div>
	);
}

interface ExportsTabProps {
	exports: TenantExportRow[];
	loading: boolean;
	errorMessage: string | null;
	pollingActive: boolean;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	locale: Locale;
	t: ReturnType<typeof useT>;
}

function exportStatusBadgeVariant(
	status: string,
): "outline" | "secondary" | "success" | "warning" | "destructive" {
	switch (status) {
		case "completed":
			return "success";
		case "running":
			return "secondary";
		case "queued":
			return "outline";
		case "failed":
			return "destructive";
		default:
			return "outline";
	}
}

function ExportStatusIcon({ status }: { status: string }) {
	switch (status) {
		case "completed":
			return (
				<CheckCircle2
					aria-hidden="true"
					className="h-4 w-4"
					style={{ color: "var(--color-success, #15803d)" }}
				/>
			);
		case "running":
			return (
				<Loader2
					aria-hidden="true"
					className="h-4 w-4 animate-spin"
					style={{ color: "var(--color-primary-500)" }}
				/>
			);
		case "failed":
			return (
				<XCircle
					aria-hidden="true"
					className="h-4 w-4"
					style={{ color: "var(--color-destructive, #b91c1c)" }}
				/>
			);
		case "queued":
		default:
			return (
				<Archive
					aria-hidden="true"
					className="h-4 w-4"
					style={{ color: "var(--surface-muted-text)" }}
				/>
			);
	}
}

function ExportsTab({
	exports,
	loading,
	errorMessage,
	pollingActive,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	locale,
	t,
}: ExportsTabProps) {
	return (
		<section
			className="rounded-2xl border p-4"
			style={surfaceStyle}
			data-testid="tenant-exports-list"
		>
			<div className="flex items-start justify-between gap-3">
				<div>
					<h3 className="text-sm font-semibold" style={headingStyle}>
						{t("Export history")}
					</h3>
					<p className="mt-1 text-xs" style={mutedStyle}>
						{t(
							"Most recent first. Status transitions live: queued → running → completed/failed.",
						)}
					</p>
				</div>
				{pollingActive ? (
					<Badge variant="secondary" className="flex items-center gap-1">
						<Loader2
							aria-hidden="true"
							className="h-3 w-3 animate-spin"
						/>
						{t("Polling")}
					</Badge>
				) : null}
			</div>

			{loading ? (
				<div
					className="flex items-center gap-2 py-6 text-sm"
					style={mutedStyle}
				>
					<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					{t("Loading exports")}
				</div>
			) : errorMessage ? (
				<div
					className="flex items-start gap-2 py-6 text-sm"
					style={mutedStyle}
				>
					<AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
					{errorMessage}
				</div>
			) : exports.length === 0 ? (
				<div
					className="py-6 text-center text-sm"
					style={mutedStyle}
				>
					{t("No exports yet. Trigger one from the Actions tab.")}
				</div>
			) : (
				<ul
					className="mt-3 divide-y"
					style={{ borderColor: "var(--field-border)" }}
				>
					{exports.map((row) => (
						<li
							key={row.id}
							className="flex items-start gap-3 py-3 text-sm"
						>
							<div className="mt-0.5">
								<ExportStatusIcon status={row.status} />
							</div>
							<div className="min-w-0 flex-1">
								<div className="flex flex-wrap items-center gap-2">
									<Badge variant={exportStatusBadgeVariant(row.status)}>
										{row.status}
									</Badge>
									<span
										className="text-xs tabular-nums"
										style={mutedStyle}
									>
										{formatDateTime(locale, row.created_at, {
											year: "numeric",
											month: "2-digit",
											day: "2-digit",
											hour: "2-digit",
											minute: "2-digit",
										})}
									</span>
									{row.size_bytes != null ? (
										<span
											className="text-xs tabular-nums"
											style={mutedStyle}
										>
											{(row.size_bytes / 1024 / 1024).toFixed(1)} MB
										</span>
									) : null}
								</div>
								<div
									className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs"
									style={mutedStyle}
								>
									<span>
										{t("Started")}:{" "}
										{row.started_at
											? formatDateTime(locale, row.started_at, {
													month: "2-digit",
													day: "2-digit",
													hour: "2-digit",
													minute: "2-digit",
												})
											: "—"}
									</span>
									<span>
										{t("Finished")}:{" "}
										{row.finished_at
											? formatDateTime(locale, row.finished_at, {
													month: "2-digit",
													day: "2-digit",
													hour: "2-digit",
													minute: "2-digit",
												})
											: "—"}
									</span>
								</div>
								{row.status === "failed" && row.error_message ? (
									<p
										className="mt-1 text-xs"
										style={{ color: "var(--color-destructive, #b91c1c)" }}
									>
										{row.error_message}
									</p>
								) : null}
								{row.status === "completed" && row.download_url ? (
									<a
										href={row.download_url}
										className="mt-1 inline-flex items-center gap-1 text-xs underline"
										style={{ color: "var(--color-primary-500)" }}
										target="_blank"
										rel="noreferrer"
									>
										<Download aria-hidden="true" className="h-3 w-3" />
										{t("Download archive")}
									</a>
								) : null}
							</div>
						</li>
					))}
				</ul>
			)}
		</section>
	);
}

interface ActionsTabProps {
	tenant: TenantRow;
	pendingSuspend: boolean;
	pendingReset: boolean;
	pendingExport: boolean;
	pendingDelete: boolean;
	onSuspendOpen: () => void;
	onResume: () => void;
	onResetAdmin: () => void;
	onExport: () => void;
	onDelete: () => void;
	surfaceStyle: React.CSSProperties;
	headingStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function ActionsTab({
	tenant,
	pendingSuspend,
	pendingReset,
	pendingExport,
	pendingDelete,
	onSuspendOpen,
	onResume,
	onResetAdmin,
	onExport,
	onDelete,
	surfaceStyle,
	headingStyle,
	mutedStyle,
	t,
}: ActionsTabProps) {
	const isSuspended = tenant.status === "suspended";
	return (
		<div className="space-y-4">
			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="tenant-action-suspend"
			>
				<div className="flex items-start gap-3">
					<Power
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div className="flex-1">
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{isSuspended ? t("Resume tenant") : t("Suspend tenant")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{isSuspended
								? t(
										"Restores tenant logins and lets the worker resume polling on the next tick.",
									)
								: t(
										"Disables tenant logins and worker activity. Status flips to 'suspended' via PATCH; the change takes effect immediately on subsequent requests.",
									)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={isSuspended ? onResume : onSuspendOpen}
						disabled={pendingSuspend}
					>
						{pendingSuspend ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<Power aria-hidden="true" className="h-4 w-4" />
						)}
						{isSuspended ? t("Resume") : t("Suspend")}
					</Button>
				</div>
			</section>

			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="tenant-action-reset-admin"
			>
				<div className="flex items-start gap-3">
					<KeyRound
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div className="flex-1">
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{t("Reset tenant admin password")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{t(
								"Issues a 24h password-reset token for the tenant's first super_admin. The token is shown only once after confirmation.",
							)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onResetAdmin}
						disabled={pendingReset}
					>
						{pendingReset ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<KeyRound aria-hidden="true" className="h-4 w-4" />
						)}
						{t("Reset")}
					</Button>
				</div>
			</section>

			<section
				className="rounded-2xl border p-5"
				style={surfaceStyle}
				data-testid="tenant-action-export"
			>
				<div className="flex items-start gap-3">
					<Download
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--surface-muted-text)" }}
					/>
					<div className="flex-1">
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{t("Export tenant data")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{t(
								"Queues a full tenant export job. Track status in the Exports tab — the row updates from queued → running → completed/failed.",
							)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="outline"
						onClick={onExport}
						disabled={pendingExport}
					>
						{pendingExport ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<Download aria-hidden="true" className="h-4 w-4" />
						)}
						{t("Export")}
					</Button>
				</div>
			</section>

			<section
				className="rounded-2xl border p-5"
				style={{
					backgroundColor:
						"color-mix(in srgb, #fee2e2 35%, var(--surface-muted-bg))",
					borderColor: "var(--surface-muted-border)",
				}}
				data-testid="tenant-action-delete"
			>
				<div className="flex items-start gap-3">
					<Trash2
						aria-hidden="true"
						className="h-5 w-5"
						style={{ color: "var(--color-destructive, #b91c1c)" }}
					/>
					<div className="flex-1">
						<h3 className="text-sm font-semibold" style={headingStyle}>
							{t("Permanently delete tenant")}
						</h3>
						<p className="mt-1 text-sm" style={mutedStyle}>
							{t(
								"Soft-deletes the tenant record. Logins are blocked, worker activity stops, and the slug is reserved. Two confirmation gates protect against misclicks; the request also includes the X-Confirm-Delete header.",
							)}
						</p>
					</div>
					<Button
						type="button"
						size="sm"
						variant="destructive"
						onClick={onDelete}
						disabled={pendingDelete}
					>
						{pendingDelete ? (
							<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
						) : (
							<Trash2 aria-hidden="true" className="h-4 w-4" />
						)}
						{t("Delete")}
					</Button>
				</div>
			</section>
		</div>
	);
}

interface ResetTokenModalProps {
	payload: ResetAdminPasswordResponse | null;
	onClose: () => void;
	t: ReturnType<typeof useT>;
}

function ResetTokenModal({ payload, onClose, t }: ResetTokenModalProps) {
	const [copied, setCopied] = useState(false);
	useEffect(() => {
		if (!payload) setCopied(false);
	}, [payload]);

	const handleCopy = async () => {
		if (!payload) return;
		try {
			await navigator.clipboard.writeText(payload.reset_token);
			setCopied(true);
		} catch {
			setCopied(false);
		}
	};

	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const fieldSurface = {
		backgroundColor: "var(--field-surface)",
		borderColor: "var(--field-border)",
		color: "var(--field-foreground)",
	} as const;

	const expiresAtLabel = payload
		? new Date(payload.expires_at).toLocaleString()
		: "";

	return (
		<Modal isOpen={payload != null} onClose={onClose} size="md">
			<ModalHeader className="pr-14">
				<h2 className="text-lg font-semibold" style={headingStyle}>
					{t("Reset token issued")}
				</h2>
			</ModalHeader>
			<ModalBody>
				<p className="text-sm" style={mutedTextStyle}>
					{t(
						"Save this token now — it will not be shown again. The tenant admin can use it to set a new password within the validity window below.",
					)}
				</p>
				{payload ? (
					<div className="mt-3 space-y-2 text-sm">
						<div>
							<p
								className="text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Admin email")}
							</p>
							<p style={headingStyle}>{payload.admin_email}</p>
						</div>
						<div>
							<p
								className="text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Expires at")}
							</p>
							<p style={headingStyle}>{expiresAtLabel}</p>
						</div>
						<div>
							<p
								className="text-xs uppercase tracking-wide"
								style={mutedTextStyle}
							>
								{t("Reset token")}
							</p>
							<div
								className="mt-1 flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-xs"
								style={fieldSurface}
							>
								<span className="break-all">{payload.reset_token}</span>
							</div>
						</div>
					</div>
				) : null}
			</ModalBody>
			<ModalFooter className="justify-end">
				<Button type="button" variant="outline" onClick={onClose}>
					{t("Close")}
				</Button>
				<Button type="button" onClick={handleCopy}>
					<Copy aria-hidden="true" className="h-4 w-4" />
					{copied ? t("Copied") : t("Copy token")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}

interface SuspendModalProps {
	open: boolean;
	reason: string;
	onReasonChange: (value: string) => void;
	until: string;
	onUntilChange: (value: string) => void;
	onClose: () => void;
	onConfirm: () => void;
	busy: boolean;
	fieldStyle: React.CSSProperties;
	mutedStyle: React.CSSProperties;
	t: ReturnType<typeof useT>;
}

function SuspendModal({
	open,
	reason,
	onReasonChange,
	until,
	onUntilChange,
	onClose,
	onConfirm,
	busy,
	fieldStyle,
	mutedStyle,
	t,
}: SuspendModalProps) {
	const headingStyle = { color: "var(--color-foreground)" } as const;
	return (
		<Modal isOpen={open} onClose={busy ? () => {} : onClose} size="md">
			<ModalHeader className="pr-14">
				<h2 className="text-lg font-semibold" style={headingStyle}>
					{t("Suspend tenant?")}
				</h2>
			</ModalHeader>
			<ModalBody>
				<p className="text-sm" style={mutedStyle}>
					{t(
						"Logins are blocked immediately and all active tenant sessions are revoked. Provide a reason for the audit log; an optional auto-resume timestamp also flips the tenant back to 'active' once reached.",
					)}
				</p>
				<div className="mt-3 space-y-3 text-sm">
					<div>
						<label
							htmlFor="tenant-suspend-reason"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Reason (optional)")}
						</label>
						<Input
							id="tenant-suspend-reason"
							value={reason}
							onChange={(event) => onReasonChange(event.target.value)}
							placeholder={t("e.g. compliance review")}
							style={fieldStyle}
						/>
					</div>
					<div>
						<label
							htmlFor="tenant-suspend-until"
							className="text-xs uppercase tracking-wide"
							style={mutedStyle}
						>
							{t("Until (optional)")}
						</label>
						<Input
							id="tenant-suspend-until"
							type="datetime-local"
							value={until}
							onChange={(event) => onUntilChange(event.target.value)}
							style={fieldStyle}
						/>
					</div>
				</div>
			</ModalBody>
			<ModalFooter className="justify-end">
				<Button
					type="button"
					variant="outline"
					onClick={onClose}
					disabled={busy}
				>
					{t("Cancel")}
				</Button>
				<Button
					type="button"
					variant="destructive"
					onClick={onConfirm}
					disabled={busy}
				>
					{busy ? (
						<Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
					) : (
						<Power aria-hidden="true" className="h-4 w-4" />
					)}
					{t("Suspend tenant")}
				</Button>
			</ModalFooter>
		</Modal>
	);
}
