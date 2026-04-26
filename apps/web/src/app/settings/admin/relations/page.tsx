"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Header } from "@/components/layout/header";
import { MainContent } from "@/components/layout/main-content";
import { Sidebar } from "@/components/layout/sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiClientError, apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";

type DecisionResponse = {
	allow: boolean;
	decision_path: string[];
	role_tier: string;
	matched_relation: string | null;
	matched_subject: string | null;
	roles: string[];
	permissions: string[];
};

type RelationResponse = {
	success: boolean;
	relation: {
		id: string;
		resource_type: string;
		resource_id: string;
		relation: string;
		subject_type: string;
		subject_key: string;
		subject_relation: string | null;
	};
};

type DeleteResponse = {
	success: boolean;
	message: string;
	id: string;
};

function roleTierLabel(t: ReturnType<typeof useT>, tier: string): string {
	switch (tier) {
		case "super_admin":
			return t("Super admin");
		case "tenant_admin":
			return t("Tenant admin");
		case "premium_user":
			return t("Premium user");
		case "verified_user":
			return t("Verified user");
		case "basic_user":
			return t("Basic user");
		default:
			return t("Unknown role tier");
	}
}

function formatDecisionPathStep(
	t: ReturnType<typeof useT>,
	step: string,
): string {
	const tenantResolvedMatch =
		/^tenant:allow:resource resolved inside tenant (?<tenantId>.+)$/u.exec(step);
	if (tenantResolvedMatch?.groups?.tenantId) {
		return t("Resource was resolved inside tenant {tenantId}.", {
			tenantId: tenantResolvedMatch.groups.tenantId,
		});
	}

	const relationSkipMatch =
		/^relation:skip:no matching relation found for (?<permission>.+)$/u.exec(step);
	if (relationSkipMatch?.groups?.permission) {
		return t("No explicit relation matched permission {permission}.", {
			permission: relationSkipMatch.groups.permission,
		});
	}

	const roleAllowMatch =
		/^role:allow:granted by role baseline for (?<permission>.+)$/u.exec(step);
	if (roleAllowMatch?.groups?.permission) {
		return t("Role baseline granted permission {permission}.", {
			permission: roleAllowMatch.groups.permission,
		});
	}

	const roleDenyMatch =
		/^role:(?:deny|skip):(?:role baseline did not grant|no matching role grant found)(?: for)? (?<permission>.+)$/u.exec(
			step,
		);
	if (roleDenyMatch?.groups?.permission) {
		return t("Role baseline did not grant permission {permission}.", {
			permission: roleDenyMatch.groups.permission,
		});
	}

	if (/^final:allow:/u.test(step)) {
		return t("Final decision: allowed.");
	}

	if (/^final:deny:/u.test(step)) {
		return t("Final decision: denied.");
	}

	const [stage = "", outcome = ""] = step.split(":", 3);
	if (stage === "tenant") {
		if (outcome === "allow") {
			return t("Tenant scope allowed the current resource.");
		}
		if (outcome === "deny") {
			return t("Tenant scope rejected the current resource.");
		}
		return t("Tenant scope could not resolve the current resource.");
	}

	if (stage === "relation") {
		if (outcome === "allow") {
			return t("An explicit relation granted the requested access.");
		}
		if (outcome === "deny") {
			return t("An explicit relation denied the requested access.");
		}
		return t("No explicit relation matched the requested permission.");
	}

	if (stage === "role") {
		if (outcome === "allow") {
			return t("Role baseline granted the requested permission.");
		}
		return t("Role baseline did not grant the requested permission.");
	}

	return t("Authorization check returned an additional system trace.");
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertDecisionResponse(value: unknown): asserts value is DecisionResponse {
	if (!isRecord(value) || typeof value.allow !== "boolean") {
		throw new Error("Invalid authz decision response");
	}
}

function assertRelationResponse(value: unknown): asserts value is RelationResponse {
	if (!isRecord(value) || typeof value.success !== "boolean" || !isRecord(value.relation)) {
		throw new Error("Invalid relation mutation response");
	}
}

function assertDeleteRelationResponse(value: unknown): asserts value is DeleteResponse {
	if (!isRecord(value) || typeof value.success !== "boolean" || typeof value.message !== "string") {
		throw new Error("Invalid delete relation response");
	}
}

function formatRelationsErrorMessage(
	t: ReturnType<typeof useT>,
	cause: unknown,
): string {
	if (!(cause instanceof Error)) {
		return t("Unknown error");
	}

	if (!(cause instanceof ApiClientError)) {
		return cause.message;
	}

	switch (cause.status) {
		case 400:
			return t(
				"The request is invalid. Check the submitted relation fields and try again.",
			);
		case 401:
			return t("Your session has expired. Please sign in again.");
		case 403:
			return t("You do not have permission to manage authorization relations.");
		case 404:
			return t("The requested relation record was not found.");
		default:
			return cause.status >= 500
				? t("The authorization service is temporarily unavailable. Please try again later.")
				: cause.message;
	}
}

function AdminRelationsContent() {
	const t = useT();
	const { success, error } = useToast();
	const roles = useAuthStore((state) => state.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const pageStyle = {
		backgroundColor: "color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;
	const subtleTextStyle = {
		color: "color-mix(in srgb, var(--surface-muted-text) 78%, transparent)",
	} as const;
	const softPanelStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 72%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 72%, var(--color-background) 28%)",
	} as const;
	const fieldStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 80%, transparent)",
		backgroundColor: "var(--color-background)",
		color: "var(--color-foreground)",
	} as const;
	const stepPanelStyle = {
		borderColor: "color-mix(in srgb, var(--color-border) 68%, transparent)",
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 78%, var(--color-background) 22%)",
	} as const;

	const [checkResourceType, setCheckResourceType] = useState("source");
	const [checkResourceId, setCheckResourceId] = useState("");
	const [checkPermission, setCheckPermission] = useState("sources:write");
	const [decision, setDecision] = useState<DecisionResponse | null>(null);
	const [checkAttempted, setCheckAttempted] = useState(false);

	const [createResourceType, setCreateResourceType] = useState("tenant");
	const [createResourceId, setCreateResourceId] = useState("");
	const [relationName, setRelationName] = useState("admin");
	const [subjectType, setSubjectType] = useState("role");
	const [subjectKey, setSubjectKey] = useState("tenant_admin");
	const [subjectRelation, setSubjectRelation] = useState("");
	const [propertiesJson, setPropertiesJson] = useState("{}");
	const [createdRelationId, setCreatedRelationId] = useState<string | null>(null);
	const [createAttempted, setCreateAttempted] = useState(false);

	const [deleteRelationId, setDeleteRelationId] = useState("");
	const [deleteAttempted, setDeleteAttempted] = useState(false);

	const parsedProperties = useMemo(() => {
		try {
			const parsed = JSON.parse(propertiesJson);
			return isRecord(parsed) ? parsed : {};
		} catch {
			return null;
		}
	}, [propertiesJson]);

	const trimmedCheckResourceType = checkResourceType.trim();
	const trimmedCheckResourceId = checkResourceId.trim();
	const trimmedCheckPermission = checkPermission.trim();
	const checkValidationMessage =
		checkAttempted &&
		(!trimmedCheckResourceType || !trimmedCheckResourceId || !trimmedCheckPermission)
			? t("Resource type, resource id, and permission are required.")
			: null;

	const trimmedCreateResourceType = createResourceType.trim();
	const trimmedCreateResourceId = createResourceId.trim();
	const trimmedRelationName = relationName.trim();
	const trimmedSubjectType = subjectType.trim();
	const trimmedSubjectKey = subjectKey.trim();
	const createValidationMessage = createAttempted
		? !trimmedCreateResourceType ||
			!trimmedCreateResourceId ||
			!trimmedRelationName ||
			!trimmedSubjectType ||
			!trimmedSubjectKey
			? t(
					"Resource type, resource id, relation, subject type, and subject key are required.",
				)
			: parsedProperties == null
				? t("Properties JSON must be valid.")
				: null
		: null;

	const trimmedDeleteRelationId = deleteRelationId.trim();
	const deleteValidationMessage =
		deleteAttempted && !trimmedDeleteRelationId ? t("Relation id is required.") : null;
	const decisionRoleTierLabel = decision ? roleTierLabel(t, decision.role_tier) : null;
	const decisionSteps = useMemo(
		() =>
			decision?.decision_path.map((step, index) => ({
				key: `${index}-${step}`,
				label: formatDecisionPathStep(t, step),
			})) ?? [],
		[decision, t],
	);

	const checkMutation = useMutation({
		mutationFn: () =>
			apiClient.get(
				`/api/v1/authz/check?resource_type=${encodeURIComponent(trimmedCheckResourceType)}&resource_id=${encodeURIComponent(trimmedCheckResourceId)}&permission=${encodeURIComponent(trimmedCheckPermission)}`,
				assertDecisionResponse,
			),
		onSuccess: (value) => {
			setDecision(value);
			setCheckAttempted(false);
		},
		onError: (err) => {
			setDecision(null);
			error(t("Run check failed"), formatRelationsErrorMessage(t, err));
		},
	});

	const createMutation = useMutation({
		mutationFn: () => {
			if (parsedProperties == null) {
				throw new Error(t("Properties JSON must be valid."));
			}

			return apiClient.post(
				"/api/v1/authz/relations",
				{
					resource_type: trimmedCreateResourceType,
					resource_id: trimmedCreateResourceId,
					relation: trimmedRelationName,
					subject_type: trimmedSubjectType,
					subject_key: trimmedSubjectKey,
					subject_relation: subjectRelation.trim() || null,
					properties: parsedProperties,
				},
				assertRelationResponse,
			);
		},
		onSuccess: (value) => {
			setCreatedRelationId(value.relation.id);
			setCreateAttempted(false);
			success(t("Relation created successfully."));
		},
		onError: (err) => error(t("Create failed"), formatRelationsErrorMessage(t, err)),
	});

	const deleteMutation = useMutation({
		mutationFn: () =>
			apiClient.delete(
				`/api/v1/authz/relations/${encodeURIComponent(trimmedDeleteRelationId)}`,
				assertDeleteRelationResponse,
			),
		onSuccess: () => {
			success(t("Relation deleted successfully."));
			setDeleteRelationId("");
			setDeleteAttempted(false);
		},
		onError: (err) => error(t("Delete failed"), formatRelationsErrorMessage(t, err)),
	});

	const handleRunCheck = () => {
		setCheckAttempted(true);
		if (!trimmedCheckResourceType || !trimmedCheckResourceId || !trimmedCheckPermission) {
			setDecision(null);
			error(
				t("Validation failed"),
				t("Resource type, resource id, and permission are required."),
			);
			return;
		}

		checkMutation.mutate();
	};

	const handleCreateRelation = () => {
		setCreateAttempted(true);
		if (
			!trimmedCreateResourceType ||
			!trimmedCreateResourceId ||
			!trimmedRelationName ||
			!trimmedSubjectType ||
			!trimmedSubjectKey
		) {
			error(
				t("Validation failed"),
				t(
					"Resource type, resource id, relation, subject type, and subject key are required.",
				),
			);
			return;
		}

		if (parsedProperties == null) {
			error(t("Validation failed"), t("Properties JSON must be valid."));
			return;
		}

		createMutation.mutate();
	};

	const handleDeleteRelation = () => {
		setDeleteAttempted(true);
		if (!trimmedDeleteRelationId) {
			error(t("Validation failed"), t("Relation id is required."));
			return;
		}

		deleteMutation.mutate();
	};

	return (
		<div className="min-h-screen" style={pageStyle}>
			<Sidebar />
			<MainContent>
				<Header />
				<div className="space-y-6 p-4 md:p-6">
					<Card>
						<CardHeader>
							<CardTitle className="flex items-center gap-2 text-3xl font-bold tracking-tight" style={headingStyle}>
								<ShieldCheck aria-hidden="true" className="h-7 w-7" style={{ color: "var(--color-primary-500)" }} />
								{t("Authorization relations")}
							</CardTitle>
							<p className="text-sm" style={mutedTextStyle}>
								{t("Run authorization checks and manage relationship tuples.")}
							</p>
						</CardHeader>
					</Card>

					{!isAdmin ? (
						<EmptyState
							title={t("Access restricted")}
							description={t("You need an administrative role to access this workspace.")}
						/>
					) : (
						<div className="grid gap-4 xl:grid-cols-2">
							<Card>
								<CardHeader>
									<CardTitle>{t("Authorization check")}</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<Input value={checkResourceType} onChange={(e) => setCheckResourceType(e.target.value)} placeholder={t("Resource type")} />
									<Input value={checkResourceId} onChange={(e) => setCheckResourceId(e.target.value)} placeholder={t("Resource id")} />
									<Input value={checkPermission} onChange={(e) => setCheckPermission(e.target.value)} placeholder={t("Permission")} />
									<p className="text-xs" style={subtleTextStyle}>
										{t("Fill all fields to execute a real authorization decision.")}
									</p>
									{checkValidationMessage ? (
										<p className="text-xs text-red-600 dark:text-red-300">
											{checkValidationMessage}
										</p>
									) : null}
									<Button type="button" onClick={handleRunCheck} disabled={checkMutation.isPending}>
										{t("Run check")}
									</Button>
									{decision ? (
										<div className="rounded-2xl border p-4" style={softPanelStyle}>
											<p className="text-sm font-semibold" style={headingStyle}>
												{decision.allow ? t("Allow") : t("Deny")}
											</p>
											<p className="mt-1 text-xs" style={subtleTextStyle}>
												{t("Role tier")}: {decisionRoleTierLabel}
											</p>
											<div className="mt-3 space-y-2 text-sm" style={mutedTextStyle}>
												{decisionSteps.map((step) => (
													<div key={step.key} className="rounded-xl border px-3 py-2" style={stepPanelStyle}>
														<p style={headingStyle}>{step.label}</p>
													</div>
												))}
											</div>
										</div>
									) : null}
								</CardContent>
							</Card>

							<Card>
								<CardHeader>
									<CardTitle>{t("Create relation")}</CardTitle>
								</CardHeader>
								<CardContent className="space-y-3">
									<Input value={createResourceType} onChange={(e) => setCreateResourceType(e.target.value)} placeholder={t("Resource type")} />
									<Input value={createResourceId} onChange={(e) => setCreateResourceId(e.target.value)} placeholder={t("Resource id")} />
									<Input value={relationName} onChange={(e) => setRelationName(e.target.value)} placeholder={t("Relation")} />
									<Input value={subjectType} onChange={(e) => setSubjectType(e.target.value)} placeholder={t("Subject type")} />
									<Input value={subjectKey} onChange={(e) => setSubjectKey(e.target.value)} placeholder={t("Subject key")} />
									<Input value={subjectRelation} onChange={(e) => setSubjectRelation(e.target.value)} placeholder={t("Subject relation")} />
									<textarea
										value={propertiesJson}
										onChange={(e) => setPropertiesJson(e.target.value)}
										className="min-h-28 w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
										style={fieldStyle}
										placeholder={t("Properties JSON")}
									/>
									<p className="text-xs" style={subtleTextStyle}>
										{t("Keep {} when no extra relation properties are needed.")}
									</p>
									{createValidationMessage ? (
										<p className="text-xs text-red-600 dark:text-red-300">
											{createValidationMessage}
										</p>
									) : null}
									<Button type="button" onClick={handleCreateRelation} disabled={createMutation.isPending}>
										{t("Create relation")}
									</Button>
									{createdRelationId ? (
										<p className="text-xs" style={subtleTextStyle}>{t("Latest relation id")}: {createdRelationId}</p>
									) : null}
								</CardContent>
							</Card>

							<Card className="xl:col-span-2">
								<CardHeader>
									<CardTitle>{t("Delete relation")}</CardTitle>
								</CardHeader>
								<CardContent className="flex flex-col gap-3 md:flex-row">
									<Input value={deleteRelationId} onChange={(e) => setDeleteRelationId(e.target.value)} placeholder={t("Relation id")} />
									<Button type="button" variant="outline" onClick={handleDeleteRelation} disabled={deleteMutation.isPending}>
										{t("Delete relation")}
									</Button>
								</CardContent>
								<CardContent className="pt-0">
									<p className="text-xs" style={subtleTextStyle}>
										{t("Use the latest relation id or an existing tuple id to remove a relation.")}
									</p>
									{deleteValidationMessage ? (
										<p className="mt-2 text-xs text-red-600 dark:text-red-300">
											{deleteValidationMessage}
										</p>
									) : null}
								</CardContent>
							</Card>
						</div>
					)}
				</div>
			</MainContent>
		</div>
	);
}

export default function AdminRelationsPage() {
	return (
		<ProtectedRoute>
			<AdminRelationsContent />
		</ProtectedRoute>
	);
}
