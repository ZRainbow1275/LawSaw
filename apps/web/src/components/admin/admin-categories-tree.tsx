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
import { ConfirmActionModal } from "@/components/ui/confirm-action-modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ApiClientError, apiClient } from "@/lib/api";
import { type Category, assertCategoryList } from "@/lib/api/types";
import { useT } from "@/lib/i18n-client";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/stores/toast-store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	ChevronDown,
	ChevronRight,
	Folder,
	FolderOpen,
	GripVertical,
	Lock,
	Pencil,
	Plus,
	ShieldCheck,
	Sparkles,
	Trash2,
	Upload,
} from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";

// ─── Visibility tier ────────────────────────────────────────────────────────

type VisibilityTier = "basic" | "verified" | "premium";

const BASIC_VISIBLE_CATEGORY_SLUGS = [
	"legislation",
	"regulation",
	"enforcement",
] as const;

function defaultVisibility(slug: string): VisibilityTier {
	if ((BASIC_VISIBLE_CATEGORY_SLUGS as ReadonlyArray<string>).includes(slug)) {
		return "basic";
	}
	if (slug === "policy") return "verified";
	return "premium";
}

// ─── Seed taxonomy ──────────────────────────────────────────────────────────

interface SeedNode {
	slug: string;
	name: string;
	description?: string;
	visibility: VisibilityTier;
	children?: ReadonlyArray<SeedNode>;
}

const SEED_TAXONOMY: ReadonlyArray<SeedNode> = [
	{
		slug: "legislation",
		name: "立法",
		description:
			"Statutes, regulations, departmental rules and judicial interpretations.",
		visibility: "basic",
		children: [
			{ slug: "legislation-laws", name: "法律", visibility: "basic" },
			{ slug: "legislation-regulations", name: "法规", visibility: "basic" },
			{ slug: "legislation-rules", name: "规章", visibility: "basic" },
			{
				slug: "legislation-judicial-interpretations",
				name: "司法解释",
				visibility: "verified",
			},
			{
				slug: "legislation-normative-documents",
				name: "规范性文件",
				visibility: "verified",
			},
		],
	},
	{
		slug: "regulation",
		name: "监管",
		description:
			"Sectoral regulator activity across finance, data and competition.",
		visibility: "basic",
		children: [
			{ slug: "regulation-finance", name: "金融监管", visibility: "basic" },
			{
				slug: "regulation-securities",
				name: "证券监管",
				visibility: "verified",
			},
			{
				slug: "regulation-banking",
				name: "银行业监管",
				visibility: "verified",
			},
			{
				slug: "regulation-insurance",
				name: "保险监管",
				visibility: "verified",
			},
			{ slug: "regulation-antitrust", name: "反垄断", visibility: "premium" },
			{
				slug: "regulation-data-compliance",
				name: "数据合规",
				visibility: "premium",
			},
			{
				slug: "regulation-cybersecurity",
				name: "网络安全",
				visibility: "premium",
			},
		],
	},
	{
		slug: "enforcement",
		name: "执法",
		description:
			"Administrative penalties, criminal cases, civil judgments and mediation.",
		visibility: "basic",
		children: [
			{
				slug: "enforcement-administrative-penalties",
				name: "行政处罚",
				visibility: "basic",
			},
			{
				slug: "enforcement-criminal-cases",
				name: "刑事案件",
				visibility: "verified",
			},
			{
				slug: "enforcement-civil-judgments",
				name: "民事判决",
				visibility: "verified",
			},
			{ slug: "enforcement-mediation", name: "调解", visibility: "premium" },
		],
	},
	{
		slug: "policy",
		name: "政策",
		description: "Cross-domain government policy activity.",
		visibility: "verified",
		children: [
			{ slug: "policy-economy", name: "经济政策", visibility: "verified" },
			{ slug: "policy-society", name: "社会政策", visibility: "verified" },
			{ slug: "policy-tech", name: "科技政策", visibility: "premium" },
			{ slug: "policy-culture", name: "文化政策", visibility: "premium" },
			{ slug: "policy-education", name: "教育政策", visibility: "premium" },
		],
	},
	{
		slug: "international",
		name: "国际",
		description: "International trade, investment, sanctions and disputes.",
		visibility: "premium",
		children: [
			{ slug: "international-trade", name: "贸易", visibility: "premium" },
			{ slug: "international-investment", name: "投资", visibility: "premium" },
			{ slug: "international-sanctions", name: "制裁", visibility: "premium" },
			{ slug: "international-disputes", name: "争端", visibility: "premium" },
		],
	},
];

// ─── Tree types ─────────────────────────────────────────────────────────────

interface CategoryNode {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	parent_id: string | null;
	sort_order: number;
	icon: string | null;
	color: string | null;
	visibility: VisibilityTier;
	children: CategoryNode[];
	// optional metadata only present for synthetic seed nodes; never trusted as truth
	__seed?: boolean;
}

function categoryToNode(c: Category): CategoryNode {
	return {
		id: c.id,
		slug: c.slug,
		name: c.name,
		description: c.description,
		parent_id: c.parent_id,
		sort_order: c.sort_order,
		icon: c.icon,
		color: c.color,
		visibility: defaultVisibility(c.slug),
		children: [],
	};
}

function buildTree(categories: ReadonlyArray<Category>): CategoryNode[] {
	const byId = new Map<string, CategoryNode>();
	for (const c of categories) byId.set(c.id, categoryToNode(c));
	const roots: CategoryNode[] = [];
	for (const node of byId.values()) {
		if (node.parent_id && byId.has(node.parent_id)) {
			byId.get(node.parent_id)?.children.push(node);
		} else {
			roots.push(node);
		}
	}
	const sortRecursive = (nodes: CategoryNode[]) => {
		nodes.sort(
			(a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name),
		);
		for (const n of nodes) sortRecursive(n.children);
	};
	sortRecursive(roots);
	return roots;
}

function buildSeedTree(): CategoryNode[] {
	let counter = 0;
	const make = (
		seed: SeedNode,
		parent: string | null,
		depth: number,
	): CategoryNode => {
		counter += 1;
		const id = `seed-${seed.slug}-${counter}`;
		const node: CategoryNode = {
			id,
			slug: seed.slug,
			name: seed.name,
			description: seed.description ?? null,
			parent_id: parent,
			sort_order: counter,
			icon: null,
			color: null,
			visibility: seed.visibility,
			children: [],
			__seed: true,
		};
		if (seed.children) {
			node.children = seed.children.map((child) => make(child, id, depth + 1));
		}
		return node;
	};
	return SEED_TAXONOMY.map((s) => make(s, null, 0));
}

function collectIds(nodes: ReadonlyArray<CategoryNode>): string[] {
	const acc: string[] = [];
	const walk = (list: ReadonlyArray<CategoryNode>) => {
		for (const node of list) {
			acc.push(node.id);
			walk(node.children);
		}
	};
	walk(nodes);
	return acc;
}

function findNode(
	nodes: ReadonlyArray<CategoryNode>,
	id: string,
): CategoryNode | null {
	for (const node of nodes) {
		if (node.id === id) return node;
		const inChild = findNode(node.children, id);
		if (inChild) return inChild;
	}
	return null;
}

// ─── CSV import helpers ─────────────────────────────────────────────────────

interface CsvRow {
	slug: string;
	name: string;
	parent_slug: string | null;
	visibility: VisibilityTier;
}

function parseCsv(text: string): CsvRow[] {
	const lines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
	if (lines.length === 0) return [];
	const header = lines[0].split(",").map((s) => s.trim().toLowerCase());
	const slugIdx = header.indexOf("slug");
	const nameIdx = header.indexOf("name");
	const parentIdx = header.indexOf("parent_slug");
	const visibilityIdx = header.indexOf("visibility");
	if (slugIdx === -1 || nameIdx === -1) {
		throw new Error("CSV header must include slug and name columns");
	}
	const rows: CsvRow[] = [];
	for (let i = 1; i < lines.length; i += 1) {
		const cells = splitCsvLine(lines[i]);
		const slug = (cells[slugIdx] ?? "").trim();
		const name = (cells[nameIdx] ?? "").trim();
		if (!slug || !name) continue;
		const parent = parentIdx >= 0 ? (cells[parentIdx] ?? "").trim() : "";
		const vis = visibilityIdx >= 0 ? (cells[visibilityIdx] ?? "").trim() : "";
		const visibility: VisibilityTier =
			vis === "basic" || vis === "verified" || vis === "premium"
				? vis
				: "verified";
		rows.push({
			slug,
			name,
			parent_slug: parent.length > 0 ? parent : null,
			visibility,
		});
	}
	return rows;
}

function splitCsvLine(line: string): string[] {
	const cells: string[] = [];
	let buffer = "";
	let inQuote = false;
	for (let i = 0; i < line.length; i += 1) {
		const ch = line[i];
		if (inQuote) {
			if (ch === '"' && line[i + 1] === '"') {
				buffer += '"';
				i += 1;
			} else if (ch === '"') {
				inQuote = false;
			} else {
				buffer += ch;
			}
		} else if (ch === ",") {
			cells.push(buffer);
			buffer = "";
		} else if (ch === '"') {
			inQuote = true;
		} else {
			buffer += ch;
		}
	}
	cells.push(buffer);
	return cells;
}

// ─── Error helper ───────────────────────────────────────────────────────────

function categoriesApiMessage(
	t: ReturnType<typeof useT>,
	cause: unknown,
): string {
	if (!(cause instanceof Error)) return t("Unknown error");
	if (!(cause instanceof ApiClientError)) return cause.message;
	switch (cause.status) {
		case 401:
			return t("Your session has expired. Please sign in again.");
		case 403:
			return t("You do not have permission to manage categories.");
		case 404:
			return t("The requested category was not found.");
		case 409:
			return t("Slug already exists. Choose a unique value.");
		default:
			return cause.status >= 500
				? t("The categories service is temporarily unavailable.")
				: cause.message;
	}
}

// ─── Visibility badge ───────────────────────────────────────────────────────

function VisibilityBadge({ tier }: { tier: VisibilityTier }) {
	const t = useT();
	const labelKey =
		tier === "basic" ? "Basic" : tier === "verified" ? "Verified" : "Premium";
	const Icon =
		tier === "basic" ? Folder : tier === "verified" ? FolderOpen : Sparkles;
	const colorBg =
		tier === "basic"
			? "color-mix(in srgb, #16a34a 12%, transparent)"
			: tier === "verified"
				? "color-mix(in srgb, #2563eb 12%, transparent)"
				: "color-mix(in srgb, #b45309 12%, transparent)";
	const fg =
		tier === "basic" ? "#15803d" : tier === "verified" ? "#1d4ed8" : "#92400e";
	return (
		<span
			className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold uppercase tracking-[0.04em]"
			style={{ backgroundColor: colorBg, color: fg }}
		>
			<Icon aria-hidden="true" className="h-3 w-3" />
			{t(labelKey)}
		</span>
	);
}

// ─── Edit drawer/modal payload ──────────────────────────────────────────────

interface EditCategoryPayload {
	id: string;
	slug: string;
	name: string;
	description: string;
	visibility: VisibilityTier;
	icon: string;
	color: string;
}

interface CreateCategoryPayload {
	parent_id: string | null;
	slug: string;
	name: string;
	description: string;
	visibility: VisibilityTier;
}

// ─── Edit modal ─────────────────────────────────────────────────────────────

interface CategoryEditModalProps {
	open: boolean;
	mode: "create" | "edit";
	initial?: EditCategoryPayload;
	parentName?: string | null;
	onClose: () => void;
	onSubmit: (payload: EditCategoryPayload | CreateCategoryPayload) => void;
	saving: boolean;
}

function CategoryEditModal({
	open,
	mode,
	initial,
	parentName,
	onClose,
	onSubmit,
	saving,
}: CategoryEditModalProps) {
	const t = useT();
	const [slug, setSlug] = useState(initial?.slug ?? "");
	const [name, setName] = useState(initial?.name ?? "");
	const [description, setDescription] = useState(initial?.description ?? "");
	const [visibility, setVisibility] = useState<VisibilityTier>(
		initial?.visibility ?? "verified",
	);
	const [icon, setIcon] = useState(initial?.icon ?? "");
	const [color, setColor] = useState(initial?.color ?? "");
	const [touched, setTouched] = useState(false);

	useEffect(() => {
		if (!open) return;
		setSlug(initial?.slug ?? "");
		setName(initial?.name ?? "");
		setDescription(initial?.description ?? "");
		setVisibility(initial?.visibility ?? "verified");
		setIcon(initial?.icon ?? "");
		setColor(initial?.color ?? "");
		setTouched(false);
	}, [open, initial]);

	const isValid = slug.trim() !== "" && name.trim() !== "";

	const handleSubmit = () => {
		setTouched(true);
		if (!isValid) return;
		const trimmedDesc = description.trim();
		if (mode === "edit" && initial) {
			onSubmit({
				id: initial.id,
				slug: slug.trim(),
				name: name.trim(),
				description: trimmedDesc,
				visibility,
				icon: icon.trim(),
				color: color.trim(),
			});
		} else {
			onSubmit({
				parent_id: null,
				slug: slug.trim(),
				name: name.trim(),
				description: trimmedDesc,
				visibility,
			});
		}
	};

	return (
		<Modal isOpen={open} onClose={onClose} size="lg">
			<div className="space-y-4 p-6">
				<div>
					<h3
						className="text-lg font-semibold"
						style={{ color: "var(--color-foreground)" }}
					>
						{mode === "edit"
							? t("Edit category")
							: parentName
								? t("Add child of {parent}", { parent: parentName })
								: t("Add root category")}
					</h3>
					<p className="text-xs" style={{ color: "var(--surface-muted-text)" }}>
						{t(
							"Slug must be unique across the tenant. Visibility tier controls which user tier can see this branch.",
						)}
					</p>
				</div>
				<div className="grid grid-cols-2 gap-3">
					<LabeledInput
						label={t("Slug")}
						value={slug}
						onChange={setSlug}
						placeholder="legislation-laws"
						error={touched && !slug.trim() ? t("Required") : null}
					/>
					<LabeledInput
						label={t("Display name")}
						value={name}
						onChange={setName}
						placeholder="法律"
						error={touched && !name.trim() ? t("Required") : null}
					/>
					<div className="col-span-2">
						<label className="block text-xs">
							<span
								className="mb-1 block font-medium"
								style={{ color: "var(--color-foreground)" }}
							>
								{t("Description")}
							</span>
							<textarea
								value={description}
								onChange={(e) => setDescription(e.target.value)}
								rows={2}
								className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
								style={{
									borderColor:
										"color-mix(in srgb, var(--color-border) 80%, transparent)",
									backgroundColor: "var(--color-background)",
									color: "var(--color-foreground)",
								}}
								placeholder={t("Optional summary used in UI tooltips.")}
							/>
						</label>
					</div>
					<label className="block text-xs">
						<span
							className="mb-1 block font-medium"
							style={{ color: "var(--color-foreground)" }}
						>
							{t("Visibility tier")}
						</span>
						<select
							value={visibility}
							onChange={(e) => setVisibility(e.target.value as VisibilityTier)}
							className="w-full rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
							style={{
								borderColor:
									"color-mix(in srgb, var(--color-border) 80%, transparent)",
								backgroundColor: "var(--color-background)",
								color: "var(--color-foreground)",
							}}
						>
							<option value="basic">{t("Basic")}</option>
							<option value="verified">{t("Verified")}</option>
							<option value="premium">{t("Premium")}</option>
						</select>
					</label>
					{mode === "edit" ? (
						<>
							<LabeledInput
								label={t("Icon (lucide name)")}
								value={icon}
								onChange={setIcon}
								placeholder="Folder"
							/>
							<LabeledInput
								label={t("Color (hex)")}
								value={color}
								onChange={setColor}
								placeholder="#3b82f6"
							/>
						</>
					) : null}
				</div>
				<div className="flex justify-end gap-2 pt-2">
					<Button variant="outline" onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button onClick={handleSubmit} disabled={saving || !isValid}>
						{saving
							? t("Saving...")
							: mode === "edit"
								? t("Save changes")
								: t("Create category")}
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

// ─── CSV import modal ──────────────────────────────────────────────────────

interface CsvImportModalProps {
	open: boolean;
	onClose: () => void;
	onImport: (rows: CsvRow[]) => void;
	importing: boolean;
}

function CsvImportModal({
	open,
	onClose,
	onImport,
	importing,
}: CsvImportModalProps) {
	const t = useT();
	const [text, setText] = useState("");
	const [parseError, setParseError] = useState<string | null>(null);

	useEffect(() => {
		if (!open) {
			setText("");
			setParseError(null);
		}
	}, [open]);

	const handleFile = (file: File) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = typeof reader.result === "string" ? reader.result : "";
			setText(result);
			setParseError(null);
		};
		reader.onerror = () => {
			setParseError(t("Failed to read file"));
		};
		reader.readAsText(file);
	};

	const handleImport = () => {
		try {
			const rows = parseCsv(text);
			if (rows.length === 0) {
				setParseError(t("CSV did not contain any data rows"));
				return;
			}
			onImport(rows);
		} catch (err) {
			setParseError(err instanceof Error ? err.message : t("Unknown error"));
		}
	};

	return (
		<Modal isOpen={open} onClose={onClose} size="lg">
			<div className="space-y-4 p-6">
				<div>
					<h3
						className="text-lg font-semibold"
						style={{ color: "var(--color-foreground)" }}
					>
						{t("Bulk import categories")}
					</h3>
					<p className="text-xs" style={{ color: "var(--surface-muted-text)" }}>
						{t(
							"Header columns: slug,name,parent_slug,visibility. Visibility accepts basic|verified|premium (defaults to verified).",
						)}
					</p>
				</div>
				<input
					type="file"
					accept=".csv,text/csv"
					onChange={(e) => {
						const file = e.target.files?.[0];
						if (file) handleFile(file);
					}}
					className="block w-full text-xs"
				/>
				<textarea
					value={text}
					onChange={(e) => setText(e.target.value)}
					rows={8}
					className="w-full rounded-lg border px-3 py-2 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-primary-300)]"
					style={{
						borderColor:
							"color-mix(in srgb, var(--color-border) 80%, transparent)",
						backgroundColor: "var(--color-background)",
						color: "var(--color-foreground)",
					}}
					placeholder="slug,name,parent_slug,visibility"
				/>
				{parseError ? (
					<p className="text-xs text-red-600 dark:text-red-300">{parseError}</p>
				) : null}
				<div className="flex justify-end gap-2">
					<Button variant="outline" onClick={onClose}>
						{t("Cancel")}
					</Button>
					<Button onClick={handleImport} disabled={importing || !text.trim()}>
						{importing ? t("Importing...") : t("Parse and queue import")}
					</Button>
				</div>
			</div>
		</Modal>
	);
}

// ─── Tree row ───────────────────────────────────────────────────────────────

interface TreeRowProps {
	node: CategoryNode;
	depth: number;
	expanded: ReadonlySet<string>;
	selectedId: string | null;
	onToggle: (id: string) => void;
	onSelect: (id: string) => void;
	onAddChild: (id: string) => void;
	onEdit: (id: string) => void;
	onDelete: (id: string) => void;
	onDragStart: (id: string) => void;
	onDragOver: (id: string) => void;
	onDrop: (id: string) => void;
	onDragEnd: () => void;
	draggingId: string | null;
	dropTargetId: string | null;
	canMutate: boolean;
}

function TreeRow({
	node,
	depth,
	expanded,
	selectedId,
	onToggle,
	onSelect,
	onAddChild,
	onEdit,
	onDelete,
	onDragStart,
	onDragOver,
	onDrop,
	onDragEnd,
	draggingId,
	dropTargetId,
	canMutate,
}: TreeRowProps) {
	const t = useT();
	const isExpanded = expanded.has(node.id);
	const isSelected = selectedId === node.id;
	const hasChildren = node.children.length > 0;
	const isDropTarget = dropTargetId === node.id && draggingId !== node.id;
	const isDragging = draggingId === node.id;
	const FolderIcon = isExpanded && hasChildren ? FolderOpen : Folder;

	return (
		<>
			<div
				role="treeitem"
				aria-expanded={hasChildren ? isExpanded : undefined}
				aria-level={depth + 1}
				aria-selected={isSelected}
				draggable={canMutate}
				onDragStart={(event) => {
					if (!canMutate) {
						event.preventDefault();
						return;
					}
					event.dataTransfer.effectAllowed = "move";
					event.dataTransfer.setData("text/plain", node.id);
					onDragStart(node.id);
				}}
				onDragOver={(event) => {
					if (!draggingId || draggingId === node.id) return;
					event.preventDefault();
					onDragOver(node.id);
				}}
				onDrop={(event) => {
					event.preventDefault();
					onDrop(node.id);
				}}
				onDragEnd={onDragEnd}
				className={cn(
					"group flex items-center gap-1 rounded-lg px-2 py-1.5 text-sm transition-colors",
					isDragging && "opacity-60",
					isSelected ? "bg-primary-50 text-primary-700 dark:bg-primary-500/15 dark:text-primary-200" : "hover:bg-neutral-50 dark:hover:bg-white/5",
				)}
				style={{
					paddingLeft: `${depth * 16 + 8}px`,
					boxShadow: isDropTarget
						? "0 0 0 2px color-mix(in srgb, var(--color-primary-500) 60%, transparent)"
						: undefined,
				}}
			>
				{canMutate ? (
					<GripVertical
						aria-hidden="true"
						className="h-3.5 w-3.5 shrink-0 cursor-grab opacity-40 group-hover:opacity-80"
						style={{ color: "var(--surface-muted-text)" }}
					/>
				) : (
					<span className="h-3.5 w-3.5 shrink-0" />
				)}
				<button
					type="button"
					onClick={(e) => {
						e.stopPropagation();
						if (hasChildren) onToggle(node.id);
					}}
					aria-label={
						hasChildren ? (isExpanded ? t("Collapse") : t("Expand")) : undefined
					}
					className={cn(
						"flex h-5 w-5 shrink-0 items-center justify-center rounded",
						hasChildren ? "hover:bg-neutral-100 dark:hover:bg-white/10" : "cursor-default",
					)}
				>
					{hasChildren ? (
						isExpanded ? (
							<ChevronDown
								aria-hidden="true"
								className="h-3.5 w-3.5"
								style={{ color: "var(--surface-muted-text)" }}
							/>
						) : (
							<ChevronRight
								aria-hidden="true"
								className="h-3.5 w-3.5"
								style={{ color: "var(--surface-muted-text)" }}
							/>
						)
					) : null}
				</button>
				<FolderIcon
					aria-hidden="true"
					className="h-4 w-4 shrink-0"
					style={{ color: node.color ?? "var(--color-primary-500)" }}
				/>
				<button
					type="button"
					onClick={() => onSelect(node.id)}
					className="flex-1 truncate text-left"
				>
					<span
						className="font-medium"
						style={{ color: "var(--color-foreground)" }}
					>
						{node.name}
					</span>
					<span
						className="ml-2 font-mono text-[11px]"
						style={{ color: "var(--surface-muted-text)" }}
					>
						{node.slug}
					</span>
				</button>
				<VisibilityBadge tier={node.visibility} />
				{node.__seed ? (
					<Badge variant="outline" className="text-[10px]">
						{t("seed")}
					</Badge>
				) : null}
				<div className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onAddChild(node.id);
						}}
						aria-label={t("Add child category")}
						title={t("Add child category")}
						className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-white/10"
					>
						<Plus
							aria-hidden="true"
							className="h-3.5 w-3.5"
							style={{ color: "var(--surface-muted-text)" }}
						/>
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onEdit(node.id);
						}}
						aria-label={t("Edit category")}
						title={t("Edit category")}
						className="rounded p-1 hover:bg-neutral-100 dark:hover:bg-white/10"
					>
						<Pencil
							aria-hidden="true"
							className="h-3.5 w-3.5"
							style={{ color: "var(--surface-muted-text)" }}
						/>
					</button>
					<button
						type="button"
						onClick={(e) => {
							e.stopPropagation();
							onDelete(node.id);
						}}
						disabled={hasChildren}
						aria-label={t("Delete category")}
						title={
							hasChildren
								? t("Move or delete child categories first")
								: t("Delete category")
						}
						className={cn(
							"rounded p-1",
							hasChildren ? "cursor-not-allowed opacity-40" : "hover:bg-red-50",
						)}
					>
						<Trash2
							aria-hidden="true"
							className="h-3.5 w-3.5"
							style={{
								color: hasChildren
									? "var(--surface-muted-text)"
									: "var(--color-error)",
							}}
						/>
					</button>
				</div>
			</div>
			{isExpanded
				? node.children.map((child) => (
						<TreeRow
							key={child.id}
							node={child}
							depth={depth + 1}
							expanded={expanded}
							selectedId={selectedId}
							onToggle={onToggle}
							onSelect={onSelect}
							onAddChild={onAddChild}
							onEdit={onEdit}
							onDelete={onDelete}
							onDragStart={onDragStart}
							onDragOver={onDragOver}
							onDrop={onDrop}
							onDragEnd={onDragEnd}
							draggingId={draggingId}
							dropTargetId={dropTargetId}
							canMutate={canMutate}
						/>
					))
				: null}
		</>
	);
}

// ─── Page content ──────────────────────────────────────────────────────────

function AdminCategoriesContent() {
	const t = useT();
	const roles = useAuthStore((s) => s.roles);
	const isAdmin = roles.some((role) =>
		["super_admin", "tenant_admin", "admin"].includes(role),
	);
	const queryClient = useQueryClient();
	const { success: toastSuccess, error: toastError } = useToast();

	const categoriesQuery = useQuery({
		queryKey: ["admin-categories"],
		enabled: isAdmin,
		queryFn: () =>
			apiClient.get<Category[]>("/api/v1/categories", assertCategoryList),
	});

	// Backend mutation endpoints (POST/PATCH/DELETE/reorder under
	// /api/v1/admin/categories) are part of B.6b. We declare the mutations
	// here so the surface is wired but never fire requests today.
	const placeholder = async () => {
		throw new Error(
			t(
				"Categories admin endpoints are reserved for B.6b. UI is preview-only.",
			),
		);
	};

	const createMutation = useMutation({
		mutationFn: async (_payload: CreateCategoryPayload) => placeholder(),
	});
	const updateMutation = useMutation({
		mutationFn: async (_payload: EditCategoryPayload) => placeholder(),
	});
	const deleteMutation = useMutation({
		mutationFn: async (_id: string) => placeholder(),
	});
	const reorderMutation = useMutation({
		mutationFn: async (_payload: {
			node_id: string;
			parent_id: string | null;
			sort_order: number;
		}) => placeholder(),
	});
	const importMutation = useMutation({
		mutationFn: async (_rows: CsvRow[]) => placeholder(),
	});

	const liveTree = useMemo(() => {
		const data = categoriesQuery.data ?? [];
		if (data.length === 0) return null;
		return buildTree(data);
	}, [categoriesQuery.data]);

	const seedTree = useMemo(() => buildSeedTree(), []);
	const tree = liveTree ?? seedTree;
	const usingSeed = liveTree === null;

	const allIds = useMemo(() => collectIds(tree), [tree]);
	const [expanded, setExpanded] = useState<Set<string>>(
		() => new Set<string>(),
	);
	useEffect(() => {
		// Default-expand the root tier on first load.
		setExpanded((prev) => {
			if (prev.size > 0) return prev;
			const next = new Set<string>();
			for (const root of tree) next.add(root.id);
			return next;
		});
	}, [tree]);

	const [selectedId, setSelectedId] = useState<string | null>(null);
	useEffect(() => {
		if (selectedId === null && tree.length > 0) {
			setSelectedId(tree[0].id);
		} else if (selectedId && !allIds.includes(selectedId)) {
			setSelectedId(tree[0]?.id ?? null);
		}
	}, [allIds, selectedId, tree]);

	const selectedNode = useMemo(
		() => (selectedId ? findNode(tree, selectedId) : null),
		[selectedId, tree],
	);

	// Drag-and-drop reorder state (HTML5 native dnd, no third-party libs).
	const [draggingId, setDraggingId] = useState<string | null>(null);
	const [dropTargetId, setDropTargetId] = useState<string | null>(null);

	const handleDrop = (targetId: string) => {
		if (!draggingId || draggingId === targetId) {
			setDraggingId(null);
			setDropTargetId(null);
			return;
		}
		const dragNode = findNode(tree, draggingId);
		const dropNode = findNode(tree, targetId);
		setDraggingId(null);
		setDropTargetId(null);
		if (!dragNode || !dropNode) return;
		// reorderMutation is enabled=false until B.6b ships; surfacing a toast
		// keeps drop UX honest about the disabled persistence path.
		reorderMutation.mutate(
			{
				node_id: dragNode.id,
				parent_id: dropNode.parent_id,
				sort_order: dropNode.sort_order,
			},
			{
				onError: (err) => {
					toastError(t("Reorder unavailable"), categoriesApiMessage(t, err));
				},
			},
		);
	};

	// Add-child / edit / delete state
	const [editOpen, setEditOpen] = useState(false);
	const [editMode, setEditMode] = useState<"create" | "edit">("create");
	const [editParentName, setEditParentName] = useState<string | null>(null);
	const [editParentId, setEditParentId] = useState<string | null>(null);
	const [editInitial, setEditInitial] = useState<
		EditCategoryPayload | undefined
	>(undefined);
	const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
	const [csvOpen, setCsvOpen] = useState(false);

	const openCreate = (parentId: string | null) => {
		const parent = parentId ? findNode(tree, parentId) : null;
		setEditMode("create");
		setEditParentName(parent?.name ?? null);
		setEditParentId(parentId);
		setEditInitial(undefined);
		setEditOpen(true);
	};

	const openEdit = (id: string) => {
		const node = findNode(tree, id);
		if (!node) return;
		setEditMode("edit");
		setEditParentName(null);
		setEditParentId(null);
		setEditInitial({
			id: node.id,
			slug: node.slug,
			name: node.name,
			description: node.description ?? "",
			visibility: node.visibility,
			icon: node.icon ?? "",
			color: node.color ?? "",
		});
		setEditOpen(true);
	};

	const handleEditSubmit = (
		payload: EditCategoryPayload | CreateCategoryPayload,
	) => {
		if (editMode === "create") {
			createMutation.mutate(
				{ ...(payload as CreateCategoryPayload), parent_id: editParentId },
				{
					onSuccess: () => {
						toastSuccess(t("Category created"));
						setEditOpen(false);
						void queryClient.invalidateQueries({
							queryKey: ["admin-categories"],
						});
					},
					onError: (err) => {
						toastError(t("Create failed"), categoriesApiMessage(t, err));
					},
				},
			);
		} else {
			updateMutation.mutate(payload as EditCategoryPayload, {
				onSuccess: () => {
					toastSuccess(t("Category saved"));
					setEditOpen(false);
					void queryClient.invalidateQueries({
						queryKey: ["admin-categories"],
					});
				},
				onError: (err) => {
					toastError(t("Save failed"), categoriesApiMessage(t, err));
				},
			});
		}
	};

	const handleConfirmDelete = () => {
		if (!pendingDeleteId) return;
		deleteMutation.mutate(pendingDeleteId, {
			onSuccess: () => {
				toastSuccess(t("Category deleted"));
				setPendingDeleteId(null);
				void queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			},
			onError: (err) => {
				toastError(t("Delete failed"), categoriesApiMessage(t, err));
				setPendingDeleteId(null);
			},
		});
	};

	const handleCsvImport = (rows: CsvRow[]) => {
		importMutation.mutate(rows, {
			onSuccess: () => {
				toastSuccess(
					t("Import queued"),
					t("{n} rows accepted", { n: rows.length }),
				);
				setCsvOpen(false);
				void queryClient.invalidateQueries({ queryKey: ["admin-categories"] });
			},
			onError: (err) => {
				toastError(t("Import unavailable"), categoriesApiMessage(t, err));
			},
		});
	};

	const expandAll = () => setExpanded(new Set(allIds));
	const collapseAll = () => setExpanded(new Set());

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

	const canMutate = !usingSeed && !reorderMutation.isPending;

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
									{t("Categories taxonomy")}
								</CardTitle>
								<CardDescription>
									{t(
										"Manage the multi-level legal news hierarchy. Tier-aware visibility filters who sees each branch.",
									)}
								</CardDescription>
							</div>
							<div className="flex flex-wrap gap-2">
								<Button
									variant="outline"
									size="sm"
									onClick={() => setCsvOpen(true)}
								>
									<Upload aria-hidden="true" className="mr-2 h-4 w-4" />
									{t("Bulk import CSV")}
								</Button>
								<Button size="sm" onClick={() => openCreate(null)}>
									<Plus aria-hidden="true" className="mr-2 h-4 w-4" />
									{t("New root category")}
								</Button>
							</div>
						</CardHeader>
					</Card>

					{usingSeed ? (
						<Card>
							<CardContent
								className="flex items-start gap-3 p-4 text-sm"
								style={{
									backgroundColor:
										"color-mix(in srgb, var(--surface-hero-amber-gradient) 35%, transparent)",
								}}
							>
								<Lock
									aria-hidden="true"
									className="mt-0.5 h-4 w-4 shrink-0"
									style={{ color: "#b45309" }}
								/>
								<p style={mutedTextStyle}>
									{t(
										"Backend has no categories yet. Showing the seed taxonomy below as preview. Tree edits are disabled until B.6b lands category mutation endpoints.",
									)}
								</p>
							</CardContent>
						</Card>
					) : null}

					<div className="grid gap-4 lg:grid-cols-3">
						<Card className="lg:col-span-2">
							<CardHeader className="flex flex-row items-center justify-between">
								<CardTitle className="text-base" style={headingStyle}>
									{t("Tree")}
								</CardTitle>
								<div className="flex gap-2">
									<Button
										variant="outline"
										size="sm"
										onClick={expandAll}
										disabled={tree.length === 0}
									>
										{t("Expand all")}
									</Button>
									<Button
										variant="outline"
										size="sm"
										onClick={collapseAll}
										disabled={tree.length === 0}
									>
										{t("Collapse all")}
									</Button>
								</div>
							</CardHeader>
							<CardContent
								className="space-y-0 p-2"
								role="tree"
								aria-label={t("Categories tree")}
							>
								{categoriesQuery.isLoading ? (
									<p className="px-3 py-6 text-sm" style={mutedTextStyle}>
										{t("Loading categories")}
									</p>
								) : categoriesQuery.isError && !usingSeed ? (
									<EmptyState
										variant="error"
										title={t("Failed to load categories")}
										description={
											categoriesQuery.error instanceof Error
												? categoriesQuery.error.message
												: t("Unknown error")
										}
										action={{
											label: t("Retry"),
											onClick: () => void categoriesQuery.refetch(),
										}}
									/>
								) : tree.length === 0 ? (
									<EmptyState
										title={t("No categories yet")}
										description={t(
											"Create the first root category or run the bulk import to seed the taxonomy.",
										)}
										action={{
											label: t("New root category"),
											onClick: () => openCreate(null),
										}}
									/>
								) : (
									tree.map((root) => (
										<TreeRow
											key={root.id}
											node={root}
											depth={0}
											expanded={expanded}
											selectedId={selectedId}
											onToggle={(id) =>
												setExpanded((prev) => {
													const next = new Set(prev);
													if (next.has(id)) next.delete(id);
													else next.add(id);
													return next;
												})
											}
											onSelect={setSelectedId}
											onAddChild={(id) => openCreate(id)}
											onEdit={openEdit}
											onDelete={(id) => setPendingDeleteId(id)}
											onDragStart={(id) => {
												setDraggingId(id);
												setDropTargetId(id);
											}}
											onDragOver={(id) => setDropTargetId(id)}
											onDrop={handleDrop}
											onDragEnd={() => {
												setDraggingId(null);
												setDropTargetId(null);
											}}
											draggingId={draggingId}
											dropTargetId={dropTargetId}
											canMutate={canMutate}
										/>
									))
								)}
							</CardContent>
						</Card>

						<Card>
							<CardHeader>
								<CardTitle className="text-base" style={headingStyle}>
									{t("Details")}
								</CardTitle>
								<CardDescription>
									{selectedNode
										? t("Metadata for the highlighted node.")
										: t("Select a node from the tree to inspect.")}
								</CardDescription>
							</CardHeader>
							<CardContent className="space-y-3 text-sm">
								{selectedNode ? (
									<DetailPanel
										node={selectedNode}
										onEdit={() => openEdit(selectedNode.id)}
										onAddChild={() => openCreate(selectedNode.id)}
										onDelete={() => setPendingDeleteId(selectedNode.id)}
										canMutate={canMutate}
										hasChildren={selectedNode.children.length > 0}
									/>
								) : (
									<p style={mutedTextStyle}>{t("No selection")}</p>
								)}
							</CardContent>
						</Card>
				</div>
			</div>

			<CategoryEditModal
				open={editOpen}
				mode={editMode}
				initial={editInitial}
				parentName={editParentName}
				onClose={() => setEditOpen(false)}
				onSubmit={handleEditSubmit}
				saving={createMutation.isPending || updateMutation.isPending}
			/>

			<CsvImportModal
				open={csvOpen}
				onClose={() => setCsvOpen(false)}
				onImport={handleCsvImport}
				importing={importMutation.isPending}
			/>

			<ConfirmActionModal
				isOpen={pendingDeleteId !== null}
				onClose={() => setPendingDeleteId(null)}
				onConfirm={handleConfirmDelete}
				title={t("Delete this category?")}
				description={t(
					"This removes the category from the taxonomy. Articles assigned to it will revert to the parent category.",
				)}
				confirmLabel={t("Delete")}
				cancelLabel={t("Cancel")}
				busy={deleteMutation.isPending}
			/>
		</>
	);
}

interface DetailPanelProps {
	node: CategoryNode;
	onEdit: () => void;
	onAddChild: () => void;
	onDelete: () => void;
	canMutate: boolean;
	hasChildren: boolean;
}

function DetailPanel({
	node,
	onEdit,
	onAddChild,
	onDelete,
	canMutate,
	hasChildren,
}: DetailPanelProps) {
	const t = useT();

	return (
		<div className="space-y-3">
			<div className="flex items-center gap-2">
				<Folder
					aria-hidden="true"
					className="h-5 w-5"
					style={{ color: node.color ?? "var(--color-primary-500)" }}
				/>
				<span
					className="text-base font-semibold"
					style={{ color: "var(--color-foreground)" }}
				>
					{node.name}
				</span>
				<VisibilityBadge tier={node.visibility} />
			</div>
			<DetailRow label={t("Slug")} value={node.slug} mono />
			<DetailRow label={t("Description")} value={node.description ?? "-"} />
			<DetailRow label={t("Parent id")} value={node.parent_id ?? "-"} mono />
			<DetailRow label={t("Sort order")} value={String(node.sort_order)} />
			<DetailRow
				label={t("Articles in branch")}
				value={t("Awaiting B.6b telemetry")}
			/>
			<DetailRow
				label={t("AI categorization accuracy")}
				value={t("Awaiting B.6b telemetry")}
			/>
			<div className="flex flex-wrap gap-2 pt-2">
				<Button
					size="sm"
					variant="outline"
					onClick={onAddChild}
					disabled={!canMutate}
				>
					<Plus aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
					{t("Add child")}
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={onEdit}
					disabled={!canMutate}
				>
					<Pencil aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
					{t("Edit")}
				</Button>
				<Button
					size="sm"
					variant="outline"
					onClick={onDelete}
					disabled={!canMutate || hasChildren}
					title={
						hasChildren ? t("Move or delete child categories first") : undefined
					}
				>
					<Trash2 aria-hidden="true" className="mr-2 h-3.5 w-3.5" />
					{t("Delete")}
				</Button>
			</div>
		</div>
	);
}

interface DetailRowProps {
	label: string;
	value: string;
	mono?: boolean;
}

function DetailRow({ label, value, mono }: DetailRowProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<span
				className="text-[11px] font-semibold uppercase tracking-[0.06em]"
				style={{ color: "var(--surface-muted-text)" }}
			>
				{label}
			</span>
			<span
				className={cn("break-all text-sm", mono ? "font-mono" : undefined)}
				style={{ color: "var(--color-foreground)" }}
			>
				{value}
			</span>
		</div>
	);
}

export default function AdminCategoriesPage() {
	return (
		<ProtectedRoute>
			<AdminCategoriesContent />
		</ProtectedRoute>
	);
}
