"use client";

/**
 * Selector wrapper around `useArticleAi` (#47 / G.5).
 *
 * The legacy `/api/v1/articles/{id}/kg-extract` and
 * `/api/v1/admin/articles/{id}/kg-extract` paths never landed on the
 * backend (verified via `grep kg-extract crates/law-eye-api/src` — no
 * matches). The actual knowledge-graph data is reached through the
 * separate `knowledge` router, which the dedicated `KgQueryPage` already
 * consumes.
 *
 * For per-article enrichment the worker stashes any extracted entities
 * into `MeArticleAiResponse.ai_metadata.kg` (an opaque JSON blob). This
 * wrapper exposes that slice with a tolerant `string[]` coercion — a
 * lightweight surface so existing reader-page code keeps compiling
 * without firing 404s.
 */

import { useArticleAi } from "@/hooks/use-article-ai";

export type KgEntityType = "law" | "regulator" | "company" | "region" | "event";

export interface KgExtractedEntity {
	id?: string;
	name: string;
	type: KgEntityType;
	aliases: string[];
	confidence: number;
	needs_review?: boolean;
}

export interface KgExtractedRelation {
	from: string;
	to: string;
	type: string;
	evidence?: string | null;
	confidence?: number;
}

export interface KgExtractView {
	article_id: string;
	tier: string;
	entities: KgExtractedEntity[];
	relations: KgExtractedRelation[];
}

const KG_ENTITY_TYPES: ReadonlyArray<KgEntityType> = [
	"law",
	"regulator",
	"company",
	"region",
	"event",
];

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coerceEntities(raw: unknown): KgExtractedEntity[] {
	if (!Array.isArray(raw)) return [];
	const out: KgExtractedEntity[] = [];
	for (const item of raw) {
		if (!isRecord(item)) continue;
		const name = item.name;
		const type = item.type;
		if (typeof name !== "string" || typeof type !== "string") continue;
		if (!(KG_ENTITY_TYPES as ReadonlyArray<string>).includes(type)) continue;
		const aliases = Array.isArray(item.aliases)
			? item.aliases.filter((a): a is string => typeof a === "string")
			: [];
		const confidence =
			typeof item.confidence === "number" ? item.confidence : 0;
		out.push({
			id: typeof item.id === "string" ? item.id : undefined,
			name,
			type: type as KgEntityType,
			aliases,
			confidence,
			needs_review:
				typeof item.needs_review === "boolean" ? item.needs_review : undefined,
		});
	}
	return out;
}

function coerceRelations(raw: unknown): KgExtractedRelation[] {
	if (!Array.isArray(raw)) return [];
	const out: KgExtractedRelation[] = [];
	for (const item of raw) {
		if (!isRecord(item)) continue;
		const from = item.from;
		const to = item.to;
		const type = item.type;
		if (typeof from !== "string" || typeof to !== "string") continue;
		if (typeof type !== "string") continue;
		out.push({
			from,
			to,
			type,
			evidence: typeof item.evidence === "string" ? item.evidence : null,
			confidence:
				typeof item.confidence === "number" ? item.confidence : undefined,
		});
	}
	return out;
}

export function useKgExtract(articleId: string | null | undefined) {
	const query = useArticleAi(articleId);
	const payload = query.data;
	const data: KgExtractView | null = payload
		? (() => {
				const meta = isRecord(payload.ai_metadata) ? payload.ai_metadata : null;
				const kg = meta && isRecord(meta.kg) ? meta.kg : null;
				return {
					article_id: payload.article_id,
					tier: payload.tier,
					entities: coerceEntities(kg?.entities),
					relations: coerceRelations(kg?.relations),
				};
			})()
		: null;
	return { ...query, data };
}
