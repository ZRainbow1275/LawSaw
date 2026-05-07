"use client";

import { ProtectedRoute } from "@/components/auth/protected-route";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiClientError, apiClient } from "@/lib/api";
import { useT } from "@/lib/i18n-client";
import { overlayVariants } from "@/lib/motion";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { Filter, Plus, Search, ShieldCheck, Trash2, X } from "lucide-react";
import { useId, useMemo, useState } from "react";

// ─── Types ──────────────────────────────────────────────────────────────────

interface RelationRecord {
	id: string;
	resource_type: string;
	resource_id: string;
	relation: string;
	subject_type: string;
	subject_key: string;
	subject_relation: string | null;
}

interface RelationListResponse {
	items: ReadonlyArray<RelationRecord>;
	total: number;
}

interface RelationCreateResponse {
	success: boolean;
	relation: RelationRecord;
}

interface RelationDeleteResponse {
	success: boolean;
	message: string;
	id: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertRelationListResponse(
	value: unknown,
): asserts value is RelationListResponse {
	if (!isRecord(value) || !Array.isArray(value.items)) {
		throw new Error("Invalid relation list response");
	}
}

function assertRelationCreateResponse(
	value: unknown,
): asserts value is RelationCreateResponse {
	if (
		!isRecord(value) ||
		typeof value.success !== "boolean" ||
		!isRecord(value.relation)
	) {
		throw new Error("Invalid relation mutation response");
	}
}

function assertRelationDeleteResponse(
	value: unknown,
): asserts value is RelationDeleteResponse {
	if (!isRecord(value) || typeof value.success !== "boolean") {
		throw new Error("Invalid relation delete response");
	}
}

function relationsApiMessage(
	t: ReturnType<typeof useT>,
	cause: unknown,
): string {
	if (!(cause instanceof Error)) return t("Unknown error");
	if (!(cause instanceof ApiClientError)) return cause.message;
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
				? t(
						"The authorization service is temporarily unavailable. Please try again later.",
					)
				: cause.message;
	}
}

// ─── Drawer ────────────────────────────────────────────────────────────────

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

interface RelationDrawerProps {
	open: boolean;
	subjectKey: string | null;
	relations: ReadonlyArray<RelationRecord>;
	onClose: () => void;
	onDelete: (id: string) => void;
	deletingId: string | null;
}

function RelationDrawer({
	open,
	subjectKey,
	relations,
	onClose,
	onDelete,
	deletingId,
}: RelationDrawerProps) {
	const t = useT();

	return (
		<AnimatePresence>
			{open ? (
				<motion.div
					className="fixed inset-0 z-50 flex justify-end"
					variants={overlayVariants}
					initial="hidden"
					animate="visible"
					exit="exit"
				>
					<motion.div
						className="fixed inset-0 bg-black/40"
						onClick={onClose}
						variants={overlayVariants}
					/>
					<motion.dialog
						open
						aria-modal="true"
						className="relative z-10 m-0 flex h-full w-full max-w-xl flex-col overflow-hidden border-0 border-l p-0 shadow-2xl"
						style={{
							borderColor: "var(--surface-muted-border)",
							backgroundColor: "var(--color-background)",
						}}
						variants={PANEL_VARIANTS}
						initial="hidden"
						animate="visible"
						exit="exit"
					>
						<div
							className="flex items-center justify-between border-b p-4"
							style={{ borderColor: "var(--surface-muted-border)" }}
						>
							<div>
								<p
									className="text-xs font-semibold uppercase tracking-[0.08em]"
									style={{ color: "var(--surface-muted-text)" }}
								>
									{t("Subject")}
								</p>
								<p
									className="text-base font-semibold"
									style={{ color: "var(--color-foreground)" }}
								>
									{subjectKey ?? "-"}
								</p>
							</div>
							<button
								type="button"
								onClick={onClose}
								className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-white/10"
								aria-label={t("Close")}
							>
								<X aria-hidden="true" className="h-4 w-4" />
							</button>
						</div>
						<div className="flex-1 overflow-auto p-4">
							{relations.length === 0 ? (
								<EmptyState
									title={t("No relations recorded")}
									description={t(
										"This subject has no relation tuples yet. Use the New relation button on the matrix page to add one.",
									)}
								/>
							) : (
								<ul className="space-y-2">
									{relations.map((rel) => (
										<li
											key={rel.id}
											className="flex flex-col gap-2 rounded-xl border p-3 sm:flex-row sm:items-center sm:justify-between"
											style={{
												borderColor: "var(--surface-muted-border)",
												backgroundColor: "var(--surface-elevated-bg)",
											}}
										>
											<div className="space-y-1 text-sm">
												<div className="flex flex-wrap items-center gap-1.5">
													<Badge variant="secondary">{rel.relation}</Badge>
													<span
														className="text-xs"
														style={{ color: "var(--surface-muted-text)" }}
													>
														{t("on")}
													</span>
													<Badge variant="outline">
														{rel.resource_type}:{rel.resource_id}
													</Badge>
												</div>
												{rel.subject_relation ? (
													<p
														className="text-xs"
														style={{ color: "var(--surface-muted-text)" }}
													>
														{t("Subject relation")}: {rel.subject_relation}
													</p>
												) : null}
												<p
													className="break-all text-xs"
													style={{ color: "var(--surface-muted-text)" }}
												>
													ID: {rel.id}
												</p>
											</div>
											<Button
												variant="outline"
												size="sm"
												disabled={deletingId === rel.id}
												onClick={() => onDelete(rel.id)}
											>
												<Trash2
													aria-hidden="true"
													className="mr-1 h-3.5 w-3.5"
												/>
												{deletingId === rel.id ? t("Removing...") : t("Remove")}
											</Button>
										</li>
									))}
								</ul>
							)}
						</div>
					</motion.dialog>
				</motion.div>
			) : null}
		</AnimatePresence>
	);
}

// ─── Create Modal ───────────────────────────────────────────────────────────

interface CreateRelationModalProps {
	open: boolean;
	onClose: () => void;
	onCreate: (input: {
		subject_type: string;
		subject_key: string;
		subject_relation: string | null;
		relation: string;
		resource_type: string;
		resource_id: string;
	}) => void;
	creating: boolean;
}

function CreateRelationModal({
	open,
	onClose,
	onCreate,
	creating,
}: CreateRelationModalProps) {
	const t = useT();
	const [subjectType, setSubjectType] = useState("user");
	const [subjectKey, setSubjectKey] = useState("");
	const [subjectRelation, setSubjectRelation] = useState("");
	const [relation, setRelation] = useState("viewer");
	const [resourceType, setResourceType] = useState("source");
	const [resourceId, setResourceId] = useState("");
	const [touched, setTouched] = useState(false);

	const isValid =
		subjectType.trim() !== "" &&
		subjectKey.trim() !== "" &&
		relation.trim() !== "" &&
		resourceType.trim() !== "" &&
		resourceId.trim() !== "";

	const handleSubmit = () => {
		setTouched(true);
		if (!isValid) return;
		onCreate({
			subject_type: subjectType.trim(),
			subject_key: subjectKey.trim(),
			subject_relation: subjectRelation.trim() || null,
			relation: relation.trim(),
			resource_type: resourceType.trim(),
			resource_id: resourceId.trim(),
		});
	};

	return (
		<Modal isOpen={open} onClose={onClose} size="lg">
			<div className="space-y-4 p-6">
				<div>
					<h3
						className="text-lg font-semibold"
						style={{ color: "var(--color-foreground)" }}
					>
						{t("New relation")}
					</h3>
					<p className="text-xs" style={{ color: "var(--surface-muted-text)" }}>
						{t(
							"Compose a tuple in the form (subject_type:subject_id) -[relation]-> (resource_type:resource_id).",
						)}
					</p>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<LabeledInput
						label={t("Subject type")}
						value={subjectType}
						onChange={setSubjectType}
						placeholder="user / role / tenant"
						error={touched && !subjectType.trim() ? t("Required") : null}
					/>
					<LabeledInput
						label={t("Subject id")}
						value={subjectKey}
						onChange={setSubjectKey}
						placeholder="usr_..."
						error={touched && !subjectKey.trim() ? t("Required") : null}
					/>
					<LabeledInput
						label={t("Subject relation (optional)")}
						value={subjectRelation}
						onChange={setSubjectRelation}
						placeholder="member / parent"
					/>
					<LabeledInput
						label={t("Relation")}
						value={relation}
						onChange={setRelation}
						placeholder="viewer / editor / admin"
						error={touched && !relation.trim() ? t("Required") : null}
					/>
					<LabeledInput
						label={t("Resource type")}
						value={resourceType}
						onChange={setResourceType}
						placeholder="source / article / tenant"
						error={touched && !resourceType.trim() ? t("Required") : null}
					/>
					<LabeledInput
						label={t("Resource id")}
						value={resourceId}
						onChange={setResourceId}
						placeholder="src_..."
						error={touched && !resourceId.trim() ? t("Required") : null}
					/>
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button onClick={handleSubmit} disabled={creating || !isValid}>
						{creating ? t("Creating...") : t("Create relation")}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

interface LabeledInputProps {
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	error?: string | null;
}

function LabeledInput({
	label,
	value,
	onChange,
	placeholder,
	error,
}: LabeledInputProps) {
	const inputId = useId();

	return (
		<label htmlFor={inputId} className="block text-xs">
			<span
				className="mb-1 block font-medium"
				style={{ color: "var(--color-foreground)" }}
			>
				{label}
			</span>
			<Input
				id={inputId}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
			/>
			{error ? (
				<span className="mt-1 block text-[11px] text-red-600 dark:text-red-300">
					{error}
				</span>
			) : null}
		</label>
	);
}

// ─── Matrix page content ────────────────────────────────────────────────────

function AdminRelationsMatrixContent() {
	const t = useT();
	const roles = useAuthStore((s) => s.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();

	const [subjectFilter, setSubjectFilter] = useState("");
	const [relationFilter, setRelationFilter] = useState("");
	const [resourceFilter, setResourceFilter] = useState("");

	const [drawerSubject, setDrawerSubject] = useState<string | null>(null);
	const [createOpen, setCreateOpen] = useState(false);
	const [deletingId, setDeletingId] = useState<string | null>(null);

	// B.6a will register `/api/v1/admin/authz/relations`. Until the route lands
	// we keep the hook declared but disabled so the UI doesn't slam a 404.
	const relationsQuery = useQuery({
		queryKey: ["admin-authz-relations"],
		enabled: false,
		queryFn: () =>
			apiClient.get<RelationListResponse>(
				"/api/v1/admin/authz/relations",
				assertRelationListResponse,
			),
	});

	const createMutation = useMutation({
		mutationFn: (payload: {
			subject_type: string;
			subject_key: string;
			subject_relation: string | null;
			relation: string;
			resource_type: string;
			resource_id: string;
		}) =>
			apiClient.post(
				"/api/v1/authz/relations",
				{
					...payload,
					properties: {},
				},
				assertRelationCreateResponse,
			),
		onSuccess: () => {
			toastSuccess(t("Relation created successfully."));
			setCreateOpen(false);
			void queryClient.invalidateQueries({
				queryKey: ["admin-authz-relations"],
			});
		},
		onError: (err) => {
			toastError(t("Create failed"), relationsApiMessage(t, err));
		},
	});

	const deleteMutation = useMutation({
		mutationFn: (id: string) =>
			apiClient.delete(
				`/api/v1/authz/relations/${encodeURIComponent(id)}`,
				assertRelationDeleteResponse,
			),
		onMutate: (id) => {
			setDeletingId(id);
		},
		onSuccess: () => {
			toastSuccess(t("Relation deleted successfully."));
			void queryClient.invalidateQueries({
				queryKey: ["admin-authz-relations"],
			});
		},
		onError: (err) => {
			toastError(t("Delete failed"), relationsApiMessage(t, err));
		},
		onSettled: () => {
			setDeletingId(null);
		},
	});

	const allRelations: ReadonlyArray<RelationRecord> =
		relationsQuery.data?.items ?? [];

	const filtered = useMemo(() => {
		const sf = subjectFilter.trim().toLowerCase();
		const rf = relationFilter.trim().toLowerCase();
		const xf = resourceFilter.trim().toLowerCase();
		return allRelations.filter((r) => {
			if (
				sf &&
				!`${r.subject_type}:${r.subject_key}`.toLowerCase().includes(sf)
			)
				return false;
			if (rf && !r.relation.toLowerCase().includes(rf)) return false;
			if (
				xf &&
				!`${r.resource_type}:${r.resource_id}`.toLowerCase().includes(xf)
			)
				return false;
			return true;
		});
	}, [allRelations, subjectFilter, relationFilter, resourceFilter]);

	// Build matrix: rows = unique subjects, columns = unique resources.
	const matrix = useMemo(() => {
		const subjects = new Map<
			string,
			{ subject_type: string; subject_key: string }
		>();
		const resources = new Map<
			string,
			{ resource_type: string; resource_id: string }
		>();
		const cells = new Map<string, RelationRecord[]>();

		for (const r of filtered) {
			const subjectId = `${r.subject_type}:${r.subject_key}`;
			const resourceId = `${r.resource_type}:${r.resource_id}`;
			subjects.set(subjectId, {
				subject_type: r.subject_type,
				subject_key: r.subject_key,
			});
			resources.set(resourceId, {
				resource_type: r.resource_type,
				resource_id: r.resource_id,
			});
			const cellKey = `${subjectId}|${resourceId}`;
			const existing = cells.get(cellKey) ?? [];
			existing.push(r);
			cells.set(cellKey, existing);
		}

		return {
			subjects: Array.from(subjects.entries()),
			resources: Array.from(resources.entries()),
			cells,
		};
	}, [filtered]);

	const drawerRelations = useMemo(() => {
		if (!drawerSubject) return [];
		return allRelations.filter(
			(r) => `${r.subject_type}:${r.subject_key}` === drawerSubject,
		);
	}, [allRelations, drawerSubject]);

	const pageStyle = {
		backgroundColor:
			"color-mix(in srgb, var(--surface-muted-bg) 55%, transparent)",
	} as const;
	const headingStyle = { color: "var(--color-foreground)" } as const;
	const mutedTextStyle = { color: "var(--surface-muted-text)" } as const;

	if (!isAdmin) {
		return (
			<div className="p-4 md:p-6">
				<EmptyState
					title={t("Access restricted")}
					description={t(
						"You need an administrative role to access this workspace.",
					)}
				/>
			</div>
		);
	}

	return (
		<>
			<div className="space-y-6 p-4 md:p-6">
					<Card>
						<CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<CardTitle
									className="flex items-center gap-2 text-3xl font-bold tracking-tight"
									style={headingStyle}
								>
									<ShieldCheck
										aria-hidden="true"
										className="h-7 w-7"
										style={{ color: "var(--color-primary-500)" }}
									/>
									{t("Authorization relations")}
								</CardTitle>
								<CardDescription>
									{t(
										"Inspect and mutate ReBAC tuples (subject, relation, resource). The matrix groups related rows for fast review.",
									)}
								</CardDescription>
							</div>
							<Button onClick={() => setCreateOpen(true)}>
								<Plus aria-hidden="true" className="mr-2 h-4 w-4" />
								{t("New relation")}
							</Button>
						</CardHeader>
					</Card>

					{/* Filter bar */}
					<Card>
						<CardContent className="grid grid-cols-1 gap-3 p-4 md:grid-cols-3">
							<FilterField
								icon={Search}
								label={t("Subject")}
								value={subjectFilter}
								onChange={setSubjectFilter}
								placeholder={t("e.g. user:usr_123")}
							/>
							<FilterField
								icon={Filter}
								label={t("Relation")}
								value={relationFilter}
								onChange={setRelationFilter}
								placeholder={t("e.g. viewer / editor")}
							/>
							<FilterField
								icon={Search}
								label={t("Resource")}
								value={resourceFilter}
								onChange={setResourceFilter}
								placeholder={t("e.g. source:src_42")}
							/>
						</CardContent>
					</Card>

					{relationsQuery.isLoading ? (
						<Card>
							<CardContent className="py-10 text-sm" style={mutedTextStyle}>
								{t("Loading relations")}
							</CardContent>
						</Card>
					) : relationsQuery.isError ? (
						<EmptyState
							variant="error"
							title={t("Failed to load relations")}
							description={
								relationsQuery.error instanceof Error
									? relationsQuery.error.message
									: t("Unknown error")
							}
							action={{
								label: t("Retry"),
								onClick: () => void relationsQuery.refetch(),
							}}
						/>
					) : matrix.subjects.length === 0 ? (
						<EmptyState
							title={t("No relations to display")}
							description={t(
								"List endpoint /api/v1/admin/authz/relations is reserved for B.6a. Create a relation manually to verify the workflow; the matrix will populate once the list endpoint ships.",
							)}
							action={{
								label: t("New relation"),
								onClick: () => setCreateOpen(true),
							}}
						/>
					) : (
						<Card>
							<CardContent className="overflow-auto p-0">
								<table className="min-w-full border-collapse text-sm">
									<thead>
										<tr
											style={{
												backgroundColor: "var(--surface-muted-bg)",
											}}
										>
											<th
												className="sticky left-0 z-10 border-b border-r px-4 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]"
												style={{
													borderColor: "var(--surface-muted-border)",
													backgroundColor: "var(--surface-muted-bg)",
													color: "var(--surface-muted-text)",
												}}
											>
												{t("Subject")}
											</th>
											{matrix.resources.map(([resourceId, resource]) => (
												<th
													key={resourceId}
													className="border-b px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em]"
													style={{
														borderColor: "var(--surface-muted-border)",
														color: "var(--surface-muted-text)",
													}}
												>
													<span
														className="block max-w-[160px] truncate"
														title={resourceId}
													>
														{resource.resource_type}:{resource.resource_id}
													</span>
												</th>
											))}
										</tr>
									</thead>
									<tbody>
										{matrix.subjects.map(([subjectId, subject]) => (
											<tr
												key={subjectId}
												tabIndex={0}
												className="cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/5"
												onClick={() => setDrawerSubject(subjectId)}
												onKeyDown={(event) => {
													if (event.key === "Enter" || event.key === " ") {
														event.preventDefault();
														setDrawerSubject(subjectId);
													}
												}}
											>
												<td
													className="sticky left-0 z-10 border-b border-r px-4 py-2 text-left text-xs"
													style={{
														borderColor: "var(--surface-muted-border)",
														backgroundColor: "var(--color-background)",
														color: "var(--color-foreground)",
													}}
												>
													<span className="font-medium">
														{subject.subject_key}
													</span>
													<span
														className="ml-2 text-[11px]"
														style={mutedTextStyle}
													>
														{subject.subject_type}
													</span>
												</td>
												{matrix.resources.map(([resourceId]) => {
													const cell = matrix.cells.get(
														`${subjectId}|${resourceId}`,
													);
													return (
														<td
															key={`${subjectId}-${resourceId}`}
															className="border-b px-3 py-2"
															style={{
																borderColor: "var(--surface-muted-border)",
															}}
														>
															{cell && cell.length > 0 ? (
																<div className="flex flex-wrap gap-1">
																	{cell.map((r) => (
																		<Badge
																			key={r.id}
																			variant="secondary"
																			title={r.id}
																		>
																			{r.relation}
																		</Badge>
																	))}
																</div>
															) : (
																<span
																	className="text-xs"
																	style={mutedTextStyle}
																>
																	·
																</span>
															)}
														</td>
													);
												})}
											</tr>
										))}
									</tbody>
								</table>
							</CardContent>
						</Card>
					)}
			</div>

			<RelationDrawer
				open={drawerSubject !== null}
				subjectKey={drawerSubject}
				relations={drawerRelations}
				onClose={() => setDrawerSubject(null)}
				onDelete={(id) => deleteMutation.mutate(id)}
				deletingId={deletingId}
			/>

			<CreateRelationModal
				open={createOpen}
				onClose={() => setCreateOpen(false)}
				onCreate={(payload) => createMutation.mutate(payload)}
				creating={createMutation.isPending}
			/>
		</>
	);
}

interface FilterFieldProps {
	icon: typeof Filter;
	label: string;
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
}

function FilterField({
	icon: Icon,
	label,
	value,
	onChange,
	placeholder,
}: FilterFieldProps) {
	const inputId = useId();

	return (
		<label htmlFor={inputId} className="block text-xs">
			<span
				className="mb-1 flex items-center gap-1.5 font-medium"
				style={{ color: "var(--color-foreground)" }}
			>
				<Icon
					aria-hidden="true"
					className="h-3.5 w-3.5"
					style={{ color: "var(--surface-muted-text)" }}
				/>
				{label}
			</span>
			<Input
				id={inputId}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder={placeholder}
			/>
		</label>
	);
}

export default function AdminRelationsMatrixPage() {
	return (
		<ProtectedRoute>
			<AdminRelationsMatrixContent />
		</ProtectedRoute>
	);
}
