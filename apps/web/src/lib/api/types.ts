// Base types matching Rust backend models

export interface Article {
	id: string;
	source_id: string;
	category_id: string | null;
	title: string;
	link: string;
	content: string | null;
	summary: string | null;
	author: string | null;
	published_at: string | null;
	risk_score: number | null;
	importance: number | null;
	sentiment: "positive" | "negative" | "neutral" | "mixed" | null;
	tags: string[];
	keywords: string[];
	ai_metadata: Record<string, unknown>;
	// Crawler enhancement: legal domain metadata
	domain_root: string | null;
	domain_sub: string | null;
	authority_level: number | null;
	issuer: string | null;
	doc_number: string | null;
	effective_date: string | null;
	region_code: string | null;
	content_hash: string | null;
	summary_struct: Record<string, unknown> | null;
	source_ref: string | null;
	status: "pending" | "processing" | "published" | "archived" | "rejected";
	version: number;
	created_at: string;
	updated_at: string;
}

export type ArticleRiskLevel =
	| "unknown"
	| "low"
	| "medium"
	| "high"
	| "critical";

/**
 * Unified risk levels (aligned with backend AI risk scoring prompts):
 * - 0-25: low
 * - 26-50: medium
 * - 51-75: high
 * - 76-100: critical
 *
 * Note: `null/undefined` means "unknown" and must not be treated as low risk.
 */
export function getArticleRiskLevel(
	score: number | null | undefined,
): ArticleRiskLevel {
	if (score == null) return "unknown";
	if (score <= 25) return "low";
	if (score <= 50) return "medium";
	if (score <= 75) return "high";
	return "critical";
}

export type ArticleSentimentLabel =
	| "unknown"
	| NonNullable<Article["sentiment"]>;

export function normalizeArticleSentiment(
	sentiment: Article["sentiment"],
): ArticleSentimentLabel {
	return sentiment ?? "unknown";
}

export interface Source {
	id: string;
	name: string;
	url: string;
	source_type: string;
	config: Record<string, unknown>;
	schedule: string | null;
	priority: number;
	is_active: boolean;
	last_fetch: string | null;
	last_error: string | null;
	// Crawler enhancement: health monitoring fields
	health_status: "healthy" | "degraded" | "unhealthy" | "unknown";
	consecutive_failures: number;
	total_articles_fetched: number;
	avg_fetch_duration_ms: number | null;
	render_mode: "static" | "dynamic";
	encoding: string | null;
	created_at: string;
	updated_at: string;
}

export interface Category {
	id: string;
	slug: string;
	name: string;
	description: string | null;
	parent_id: string | null;
	sort_order: number;
	icon: string | null;
	color: string | null;
	created_at: string;
}

export interface User {
	id: string;
	tenant_id: string;
	email: string;
	display_name: string | null;
	avatar_url: string | null;
	is_active: boolean;
	email_verified_at?: string | null;
	version?: number;
	// Returned by some endpoints (e.g. `/api/v1/users/*`). `/api/v1/auth/*` may omit it.
	last_login?: string | null;
	created_at?: string;
}

export interface AuthResponse {
	success: boolean;
	message: string;
	user: User | null;
	mfa_required?: boolean;
	mfa_challenge?: string;
}

export interface DeleteResponse {
	success: boolean;
	message: string;
}

export interface HealthResponse {
	status: string;
	version: string;
}

export interface VapidPublicKeyResponse {
	public_key: string;
}

export interface PushSubscribeResponse {
	id: string;
}

export interface PushTestResponse {
	delivered: number;
	failed: number;
	total: number;
}

export interface ArticleListResponse {
	data: Article[];
	total: number;
	limit: number;
	offset: number;
}

export interface SourceListResponse {
	data: Source[];
	total: number;
	limit: number;
	offset: number;
}

export interface SourceStatsResponse {
	total: number;
	active_count: number;
	error_count: number;
}

export interface SearchResult {
	article_id: string;
	title: string;
	excerpt: string;
	score: number;
}

export interface SearchResponse {
	results: SearchResult[];
	total: number;
}

export interface SemanticSearchResult {
	chunk_id: string;
	article_id: string;
	content: string;
	similarity: number;
}

export interface SemanticSearchResponse {
	results: SemanticSearchResult[];
}

export interface AskResponse {
	answer: string;
	sources: Array<{
		article_id: string;
		title: string;
		excerpt: string;
		relevance: number;
	}>;
	confidence: number;
}

export interface ApiKey {
	id: string;
	name: string;
	key_prefix: string;
	permissions: string[];
	rate_limit: number;
	is_active: boolean;
	last_used: string | null;
	created_at: string;
}

export interface ApiKeyListResponse {
	keys: ApiKey[];
	total: number;
	limit: number;
	offset: number;
}

export interface CreateApiKeyResponse {
	key: ApiKey;
	raw_key: string;
}

export interface UserProfile {
	id: string;
	email: string;
	display_name: string | null;
	avatar_url: string | null;
	is_active: boolean;
	last_login: string | null;
	version: number;
	created_at: string;
	preferences: Record<string, unknown>;
}

export interface UserDetailResponse {
	user: UserProfile;
	roles: string[];
	permissions: string[];
}

export interface ApiError {
	error: string;
	status: number;
}

export interface ArticleStats {
	total_articles: number;
	pending_count: number;
	published_count: number;
	high_risk_count: number;
	today_count: number;
}

export interface ArticleTrendPoint {
	date: string; // YYYY-MM-DD
	count: number;
}

export interface ArticleCategoryCount {
	category_id: string | null;
	count: number;
}

export interface ArticleStatusCounts {
	pending: number;
	processing: number;
	published: number;
	archived: number;
	rejected: number;
}

export interface ArticleRiskCounts {
	unknown: number;
	low: number;
	medium: number;
	high: number;
	critical: number;
}

export interface ArticleSentimentCounts {
	unknown: number;
	positive: number;
	neutral: number;
	negative: number;
	mixed: number;
}

export interface ArticleAnalyticsSummary {
	total: number;
	status: ArticleStatusCounts;
	risk: ArticleRiskCounts;
	sentiment: ArticleSentimentCounts;
}

export interface BatchStatusConflict {
	id: string;
	expected_version: number;
	current_version: number;
}

export interface BatchStatusResponse {
	updated: number;
	conflicts?: BatchStatusConflict[];
	missing_ids?: string[];
}

export interface Feedback {
	id: string;
	user_id: string | null;
	type: "source_suggestion" | "bug_report" | "feature_request" | "other";
	title: string;
	content: string;
	contact_email: string | null;
	status: "pending" | "reviewing" | "resolved" | "rejected";
	admin_response: string | null;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface CreateFeedbackInput {
	type: Feedback["type"];
	title: string;
	content: string;
	contact_email?: string;
	source_url?: string;
	source_name?: string;
}

// AI types
export interface AiEntity {
	name: string;
	entity_type:
		| "organization"
		| "regulation"
		| "person"
		| "date"
		| "location"
		| "legal_term";
	context?: string;
}

export interface RiskDimension {
	name: string;
	score: number;
	description: string;
}

export interface ArticleAiInsights {
	summary: string;
	abstract_text: string;
	key_points: string[];
	entities: AiEntity[];
	risk_score: number;
	risk_level: "low" | "medium" | "high" | "critical";
	risk_dimensions: RiskDimension[];
	recommendations: string[];
	tags: string[];
	keywords: string[];
}

export interface AiAvailabilityResponse {
	available: boolean;
}

// Knowledge Graph types
export interface KnowledgeEntity {
	id: string;
	name: string;
	entity_type: string;
	aliases: string[];
	properties: Record<string, unknown>;
	mention_count: number;
	first_seen: string;
	last_seen: string;
	created_at: string;
	updated_at: string;
}

export type KnowledgeRelationDirection = "outgoing" | "incoming";

export interface KnowledgeRelatedEntity {
	entity: KnowledgeEntity;
	relation_type: string;
	weight: number;
	direction: KnowledgeRelationDirection;
}

export interface KnowledgeEntityArticle {
	article_id: string;
	title: string;
	published_at: string | null;
	status: string;
	relevance_score: number | null;
}

export interface KnowledgeBackfillResponse {
	articles_considered: number;
	entities_upserted: number;
	article_entities_inserted: number;
	relations_upserted: number;
}

export interface KnowledgeLlmBackfillResponse {
	articles_enqueued: number;
}

export interface KnowledgeSemanticSearchResult {
	id: string;
	name: string;
	entity_type: string;
	aliases: string[];
	properties: Record<string, unknown>;
	mention_count: number;
	first_seen: string;
	last_seen: string;
	created_at: string;
	updated_at: string;
	similarity: number;
}

export interface KnowledgeDuplicateCandidatePair {
	entity1: KnowledgeEntity;
	entity2: KnowledgeEntity;
	similarity: number;
}

export interface KnowledgeMergeEntitiesResponse {
	message: string;
}

export interface KnowledgeDegreeCentrality {
	entity: KnowledgeEntity;
	out_degree: number;
	in_degree: number;
	total_degree: number;
}

export interface KnowledgeCooccurrenceEdge {
	entity1_id: string;
	entity1_name: string;
	entity2_id: string;
	entity2_name: string;
	cooccurrence_count: number;
}

export interface KnowledgeTypeDistribution {
	entity_type: string;
	count: number;
}

export interface KnowledgeGraphStats {
	entity_count: number;
	relation_count: number;
	article_entity_count: number;
	entities_with_embedding: number;
	type_distribution: KnowledgeTypeDistribution[];
}

type JsonRecord = Record<string, unknown>;

const ARTICLE_STATUSES = [
	"pending",
	"processing",
	"published",
	"archived",
	"rejected",
] as const;

const SENTIMENTS = ["positive", "negative", "neutral", "mixed"] as const;

const FEEDBACK_TYPES = [
	"source_suggestion",
	"bug_report",
	"feature_request",
	"other",
] as const;

const FEEDBACK_STATUSES = [
	"pending",
	"reviewing",
	"resolved",
	"rejected",
] as const;

function typeName(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function assertRecord(
	value: unknown,
	path: string,
): asserts value is JsonRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${path}: expected object, got ${typeName(value)}`);
	}
}

function assertString(value: unknown, path: string): asserts value is string {
	if (typeof value !== "string") {
		throw new Error(`${path}: expected string, got ${typeName(value)}`);
	}
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${path}: expected boolean, got ${typeName(value)}`);
	}
}

function assertNumber(value: unknown, path: string): asserts value is number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(`${path}: expected number, got ${typeName(value)}`);
	}
}

function assertArray<T>(
	value: unknown,
	path: string,
	assertItem: (value: unknown, path: string) => asserts value is T,
): asserts value is T[] {
	if (!Array.isArray(value)) {
		throw new Error(`${path}: expected array, got ${typeName(value)}`);
	}
	for (const [index, item] of value.entries()) {
		assertItem(item, `${path}[${index}]`);
	}
}

function assertNullable<T>(
	value: unknown,
	path: string,
	assertValue: (value: unknown, path: string) => asserts value is T,
): asserts value is T | null {
	if (value === null) return;
	assertValue(value, path);
}

function assertOptional<T>(
	value: unknown,
	path: string,
	assertValue: (value: unknown, path: string) => asserts value is T,
): asserts value is T | undefined {
	if (value === undefined) return;
	assertValue(value, path);
}

function assertOneOf<T extends string>(
	value: unknown,
	path: string,
	allowed: readonly T[],
): asserts value is T {
	assertString(value, path);
	if (!allowed.includes(value as T)) {
		throw new Error(`${path}: expected ${allowed.join(" | ")}, got ${value}`);
	}
}

function getRequired(obj: JsonRecord, key: string, path: string): unknown {
	const value = obj[key];
	if (value === undefined) {
		throw new Error(`${path}.${key} is missing`);
	}
	return value;
}

function getOptional(obj: JsonRecord, key: string): unknown {
	return obj[key];
}

export function assertUser(
	value: unknown,
	path = "user",
): asserts value is User {
	assertRecord(value, path);

	const id = getRequired(value, "id", path);
	assertString(id, `${path}.id`);

	const tenantId = getRequired(value, "tenant_id", path);
	assertString(tenantId, `${path}.tenant_id`);

	const email = getRequired(value, "email", path);
	assertString(email, `${path}.email`);

	const displayName = getRequired(value, "display_name", path);
	assertNullable(displayName, `${path}.display_name`, assertString);

	const avatarUrl = getRequired(value, "avatar_url", path);
	assertNullable(avatarUrl, `${path}.avatar_url`, assertString);

	const isActive = getRequired(value, "is_active", path);
	assertBoolean(isActive, `${path}.is_active`);

	const emailVerifiedAt = getOptional(value, "email_verified_at");
	assertOptional(emailVerifiedAt, `${path}.email_verified_at`, (v, p) =>
		assertNullable(v, p, assertString),
	);

	const lastLogin = getOptional(value, "last_login");
	assertOptional(lastLogin, `${path}.last_login`, (v, p) =>
		assertNullable(v, p, assertString),
	);

	const createdAt = getOptional(value, "created_at");
	assertOptional(createdAt, `${path}.created_at`, assertString);
}

export function assertUserProfile(
	value: unknown,
	path = "userProfile",
): asserts value is UserProfile {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "email", path), `${path}.email`);
	assertNullable(
		getRequired(value, "display_name", path),
		`${path}.display_name`,
		assertString,
	);
	assertNullable(
		getRequired(value, "avatar_url", path),
		`${path}.avatar_url`,
		assertString,
	);
	assertBoolean(getRequired(value, "is_active", path), `${path}.is_active`);
	assertNullable(
		getRequired(value, "last_login", path),
		`${path}.last_login`,
		assertString,
	);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);

	const preferences = getRequired(value, "preferences", path);
	assertRecord(preferences, `${path}.preferences`);
}

export function assertUserDetailResponse(
	value: unknown,
	path = "userDetailResponse",
): asserts value is UserDetailResponse {
	assertRecord(value, path);

	const user = getRequired(value, "user", path);
	assertUserProfile(user, `${path}.user`);

	const roles = getRequired(value, "roles", path);
	assertArray(roles, `${path}.roles`, assertString);

	const permissions = getRequired(value, "permissions", path);
	assertArray(permissions, `${path}.permissions`, assertString);
}

export function assertApiKey(
	value: unknown,
	path = "apiKey",
): asserts value is ApiKey {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "key_prefix", path), `${path}.key_prefix`);

	const permissions = getRequired(value, "permissions", path);
	assertArray(permissions, `${path}.permissions`, assertString);

	assertNumber(getRequired(value, "rate_limit", path), `${path}.rate_limit`);
	assertBoolean(getRequired(value, "is_active", path), `${path}.is_active`);
	assertNullable(
		getRequired(value, "last_used", path),
		`${path}.last_used`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

export function assertApiKeyListResponse(
	value: unknown,
	path = "apiKeyListResponse",
): asserts value is ApiKeyListResponse {
	assertRecord(value, path);
	const keys = getRequired(value, "keys", path);
	assertArray(keys, `${path}.keys`, assertApiKey);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

export function assertCreateApiKeyResponse(
	value: unknown,
	path = "createApiKeyResponse",
): asserts value is CreateApiKeyResponse {
	assertRecord(value, path);
	const key = getRequired(value, "key", path);
	assertApiKey(key, `${path}.key`);
	assertString(getRequired(value, "raw_key", path), `${path}.raw_key`);
}

export function assertAuthResponse(
	value: unknown,
	path = "auth",
): asserts value is AuthResponse {
	assertRecord(value, path);

	const success = getRequired(value, "success", path);
	assertBoolean(success, `${path}.success`);

	const message = getRequired(value, "message", path);
	assertString(message, `${path}.message`);

	const user = getRequired(value, "user", path);
	assertNullable(user, `${path}.user`, assertUser);

	const mfaRequired = getOptional(value, "mfa_required");
	assertOptional(mfaRequired, `${path}.mfa_required`, assertBoolean);

	const mfaChallenge = getOptional(value, "mfa_challenge");
	assertOptional(mfaChallenge, `${path}.mfa_challenge`, assertString);
}

export function assertArticle(
	value: unknown,
	path = "article",
): asserts value is Article {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "source_id", path), `${path}.source_id`);
	assertNullable(
		getRequired(value, "category_id", path),
		`${path}.category_id`,
		assertString,
	);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertString(getRequired(value, "link", path), `${path}.link`);
	assertNullable(
		getRequired(value, "content", path),
		`${path}.content`,
		assertString,
	);
	assertNullable(
		getRequired(value, "summary", path),
		`${path}.summary`,
		assertString,
	);
	assertNullable(
		getRequired(value, "author", path),
		`${path}.author`,
		assertString,
	);
	assertNullable(
		getRequired(value, "published_at", path),
		`${path}.published_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "risk_score", path),
		`${path}.risk_score`,
		assertNumber,
	);
	assertNullable(
		getRequired(value, "importance", path),
		`${path}.importance`,
		assertNumber,
	);

	const sentiment = getRequired(value, "sentiment", path);
	if (sentiment !== null) {
		assertOneOf(sentiment, `${path}.sentiment`, SENTIMENTS);
	}

	const tags = getRequired(value, "tags", path);
	assertArray(tags, `${path}.tags`, assertString);

	const keywords = getRequired(value, "keywords", path);
	assertArray(keywords, `${path}.keywords`, assertString);

	const aiMetadata = getRequired(value, "ai_metadata", path);
	assertRecord(aiMetadata, `${path}.ai_metadata`);

	// Crawler enhancement: legal domain metadata
	assertNullable(
		getRequired(value, "domain_root", path),
		`${path}.domain_root`,
		assertString,
	);
	assertNullable(
		getRequired(value, "domain_sub", path),
		`${path}.domain_sub`,
		assertString,
	);
	assertNullable(
		getRequired(value, "authority_level", path),
		`${path}.authority_level`,
		assertNumber,
	);
	assertNullable(
		getRequired(value, "issuer", path),
		`${path}.issuer`,
		assertString,
	);
	assertNullable(
		getRequired(value, "doc_number", path),
		`${path}.doc_number`,
		assertString,
	);
	assertNullable(
		getRequired(value, "effective_date", path),
		`${path}.effective_date`,
		assertString,
	);
	assertNullable(
		getRequired(value, "region_code", path),
		`${path}.region_code`,
		assertString,
	);
	assertNullable(
		getRequired(value, "content_hash", path),
		`${path}.content_hash`,
		assertString,
	);
	const summaryStruct = getRequired(value, "summary_struct", path);
	if (summaryStruct !== null) {
		assertRecord(summaryStruct, `${path}.summary_struct`);
	}
	assertNullable(
		getRequired(value, "source_ref", path),
		`${path}.source_ref`,
		assertString,
	);

	assertOneOf(
		getRequired(value, "status", path),
		`${path}.status`,
		ARTICLE_STATUSES,
	);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertArticleListResponse(
	value: unknown,
	path = "articleList",
): asserts value is ArticleListResponse {
	assertRecord(value, path);

	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertArticle);

	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

export function assertArticleStats(
	value: unknown,
	path = "articleStats",
): asserts value is ArticleStats {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "total_articles", path),
		`${path}.total_articles`,
	);
	assertNumber(
		getRequired(value, "pending_count", path),
		`${path}.pending_count`,
	);
	assertNumber(
		getRequired(value, "published_count", path),
		`${path}.published_count`,
	);
	assertNumber(
		getRequired(value, "high_risk_count", path),
		`${path}.high_risk_count`,
	);
	assertNumber(getRequired(value, "today_count", path), `${path}.today_count`);
}

function assertArticleStatusCounts(
	value: unknown,
	path: string,
): asserts value is ArticleStatusCounts {
	assertRecord(value, path);
	assertNumber(getRequired(value, "pending", path), `${path}.pending`);
	assertNumber(getRequired(value, "processing", path), `${path}.processing`);
	assertNumber(getRequired(value, "published", path), `${path}.published`);
	assertNumber(getRequired(value, "archived", path), `${path}.archived`);
	assertNumber(getRequired(value, "rejected", path), `${path}.rejected`);
}

function assertArticleRiskCounts(
	value: unknown,
	path: string,
): asserts value is ArticleRiskCounts {
	assertRecord(value, path);
	assertNumber(getRequired(value, "unknown", path), `${path}.unknown`);
	assertNumber(getRequired(value, "low", path), `${path}.low`);
	assertNumber(getRequired(value, "medium", path), `${path}.medium`);
	assertNumber(getRequired(value, "high", path), `${path}.high`);
	assertNumber(getRequired(value, "critical", path), `${path}.critical`);
}

function assertArticleSentimentCounts(
	value: unknown,
	path: string,
): asserts value is ArticleSentimentCounts {
	assertRecord(value, path);
	assertNumber(getRequired(value, "unknown", path), `${path}.unknown`);
	assertNumber(getRequired(value, "positive", path), `${path}.positive`);
	assertNumber(getRequired(value, "neutral", path), `${path}.neutral`);
	assertNumber(getRequired(value, "negative", path), `${path}.negative`);
	assertNumber(getRequired(value, "mixed", path), `${path}.mixed`);
}

export function assertArticleAnalyticsSummary(
	value: unknown,
	path = "articleAnalyticsSummary",
): asserts value is ArticleAnalyticsSummary {
	assertRecord(value, path);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertArticleStatusCounts(
		getRequired(value, "status", path),
		`${path}.status`,
	);
	assertArticleRiskCounts(getRequired(value, "risk", path), `${path}.risk`);
	assertArticleSentimentCounts(
		getRequired(value, "sentiment", path),
		`${path}.sentiment`,
	);
}

export function assertArticleTrendPoint(
	value: unknown,
	path = "articleTrendPoint",
): asserts value is ArticleTrendPoint {
	assertRecord(value, path);
	assertString(getRequired(value, "date", path), `${path}.date`);
	assertNumber(getRequired(value, "count", path), `${path}.count`);
}

export function assertArticleTrends(
	value: unknown,
	path = "articleTrends",
): asserts value is ArticleTrendPoint[] {
	assertArray(value, path, assertArticleTrendPoint);
}

export function assertArticleCategoryCount(
	value: unknown,
	path = "articleCategoryCount",
): asserts value is ArticleCategoryCount {
	assertRecord(value, path);
	assertNullable(
		getRequired(value, "category_id", path),
		`${path}.category_id`,
		assertString,
	);
	assertNumber(getRequired(value, "count", path), `${path}.count`);
}

export function assertArticleCategoryCounts(
	value: unknown,
	path = "articleCategoryCounts",
): asserts value is ArticleCategoryCount[] {
	assertArray(value, path, assertArticleCategoryCount);
}

export function assertBatchStatusResponse(
	value: unknown,
	path = "batchStatusResponse",
): asserts value is BatchStatusResponse {
	assertRecord(value, path);
	assertNumber(getRequired(value, "updated", path), `${path}.updated`);

	const conflicts = getOptional(value, "conflicts");
	assertOptional(conflicts, `${path}.conflicts`, (v, p) =>
		assertArray(v, p, (item, itemPath) => {
			assertRecord(item, itemPath);
			assertString(getRequired(item, "id", itemPath), `${itemPath}.id`);
			assertNumber(
				getRequired(item, "expected_version", itemPath),
				`${itemPath}.expected_version`,
			);
			assertNumber(
				getRequired(item, "current_version", itemPath),
				`${itemPath}.current_version`,
			);
		}),
	);

	const missingIds = getOptional(value, "missing_ids");
	assertOptional(missingIds, `${path}.missing_ids`, (v, p) =>
		assertArray(v, p, assertString),
	);
}

export function assertDeleteResponse(
	value: unknown,
	path = "deleteResponse",
): asserts value is DeleteResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
	assertString(getRequired(value, "message", path), `${path}.message`);
}

export function assertHealthResponse(
	value: unknown,
	path = "healthResponse",
): asserts value is HealthResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "status", path), `${path}.status`);
	assertString(getRequired(value, "version", path), `${path}.version`);
}

export function assertCategory(
	value: unknown,
	path = "category",
): asserts value is Category {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "slug", path), `${path}.slug`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertNullable(
		getRequired(value, "description", path),
		`${path}.description`,
		assertString,
	);
	assertNullable(
		getRequired(value, "parent_id", path),
		`${path}.parent_id`,
		assertString,
	);
	assertNumber(getRequired(value, "sort_order", path), `${path}.sort_order`);
	assertNullable(
		getRequired(value, "icon", path),
		`${path}.icon`,
		assertString,
	);
	assertNullable(
		getRequired(value, "color", path),
		`${path}.color`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

export function assertCategoryList(
	value: unknown,
	path = "categories",
): asserts value is Category[] {
	assertArray(value, path, assertCategory);
}

export function assertSource(
	value: unknown,
	path = "source",
): asserts value is Source {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "url", path), `${path}.url`);
	assertString(getRequired(value, "source_type", path), `${path}.source_type`);

	const config = getRequired(value, "config", path);
	assertRecord(config, `${path}.config`);

	assertNullable(
		getRequired(value, "schedule", path),
		`${path}.schedule`,
		assertString,
	);
	assertNumber(getRequired(value, "priority", path), `${path}.priority`);
	assertBoolean(getRequired(value, "is_active", path), `${path}.is_active`);
	assertNullable(
		getRequired(value, "last_fetch", path),
		`${path}.last_fetch`,
		assertString,
	);
	assertNullable(
		getRequired(value, "last_error", path),
		`${path}.last_error`,
		assertString,
	);
	// Crawler enhancement: health monitoring fields
	const HEALTH_STATUSES = [
		"healthy",
		"degraded",
		"unhealthy",
		"unknown",
	] as const;
	assertOneOf(
		getRequired(value, "health_status", path),
		`${path}.health_status`,
		HEALTH_STATUSES,
	);
	assertNumber(
		getRequired(value, "consecutive_failures", path),
		`${path}.consecutive_failures`,
	);
	assertNumber(
		getRequired(value, "total_articles_fetched", path),
		`${path}.total_articles_fetched`,
	);
	assertNullable(
		getRequired(value, "avg_fetch_duration_ms", path),
		`${path}.avg_fetch_duration_ms`,
		assertNumber,
	);
	const RENDER_MODES = ["static", "dynamic"] as const;
	assertOneOf(
		getRequired(value, "render_mode", path),
		`${path}.render_mode`,
		RENDER_MODES,
	);
	assertNullable(
		getRequired(value, "encoding", path),
		`${path}.encoding`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertSourceList(
	value: unknown,
	path = "sources",
): asserts value is Source[] {
	assertArray(value, path, assertSource);
}

export function assertSourceListResponse(
	value: unknown,
	path = "sourceList",
): asserts value is SourceListResponse {
	assertRecord(value, path);

	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertSource);

	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

export function assertSourceStatsResponse(
	value: unknown,
	path = "sourceStats",
): asserts value is SourceStatsResponse {
	assertRecord(value, path);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(
		getRequired(value, "active_count", path),
		`${path}.active_count`,
	);
	assertNumber(getRequired(value, "error_count", path), `${path}.error_count`);
}

export function assertSearchResult(
	value: unknown,
	path = "searchResult",
): asserts value is SearchResult {
	assertRecord(value, path);
	assertString(getRequired(value, "article_id", path), `${path}.article_id`);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertString(getRequired(value, "excerpt", path), `${path}.excerpt`);
	assertNumber(getRequired(value, "score", path), `${path}.score`);
}

export function assertSearchResponse(
	value: unknown,
	path = "searchResponse",
): asserts value is SearchResponse {
	assertRecord(value, path);
	const results = getRequired(value, "results", path);
	assertArray(results, `${path}.results`, assertSearchResult);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
}

export function assertSemanticSearchResult(
	value: unknown,
	path = "semanticSearchResult",
): asserts value is SemanticSearchResult {
	assertRecord(value, path);
	assertString(getRequired(value, "chunk_id", path), `${path}.chunk_id`);
	assertString(getRequired(value, "article_id", path), `${path}.article_id`);
	assertString(getRequired(value, "content", path), `${path}.content`);
	assertNumber(getRequired(value, "similarity", path), `${path}.similarity`);
}

export function assertSemanticSearchResponse(
	value: unknown,
	path = "semanticSearchResponse",
): asserts value is SemanticSearchResponse {
	assertRecord(value, path);
	const results = getRequired(value, "results", path);
	assertArray(results, `${path}.results`, assertSemanticSearchResult);
}

export function assertAskSource(
	value: unknown,
	path = "askSource",
): asserts value is AskResponse["sources"][number] {
	assertRecord(value, path);
	assertString(getRequired(value, "article_id", path), `${path}.article_id`);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertString(getRequired(value, "excerpt", path), `${path}.excerpt`);
	assertNumber(getRequired(value, "relevance", path), `${path}.relevance`);
}

export function assertAskResponse(
	value: unknown,
	path = "askResponse",
): asserts value is AskResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "answer", path), `${path}.answer`);
	const sources = getRequired(value, "sources", path);
	assertArray(sources, `${path}.sources`, assertAskSource);
	assertNumber(getRequired(value, "confidence", path), `${path}.confidence`);
}

export function assertAiAvailabilityResponse(
	value: unknown,
	path = "aiAvailabilityResponse",
): asserts value is AiAvailabilityResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "available", path), `${path}.available`);
}

export function assertVapidPublicKeyResponse(
	value: unknown,
	path = "vapidPublicKeyResponse",
): asserts value is VapidPublicKeyResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "public_key", path), `${path}.public_key`);
}

export function assertPushSubscribeResponse(
	value: unknown,
	path = "pushSubscribeResponse",
): asserts value is PushSubscribeResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
}

export function assertPushTestResponse(
	value: unknown,
	path = "pushTestResponse",
): asserts value is PushTestResponse {
	assertRecord(value, path);
	assertNumber(getRequired(value, "delivered", path), `${path}.delivered`);
	assertNumber(getRequired(value, "failed", path), `${path}.failed`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
}

export function assertFeedback(
	value: unknown,
	path = "feedback",
): asserts value is Feedback {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertNullable(
		getRequired(value, "user_id", path),
		`${path}.user_id`,
		assertString,
	);
	assertOneOf(getRequired(value, "type", path), `${path}.type`, FEEDBACK_TYPES);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertString(getRequired(value, "content", path), `${path}.content`);
	assertNullable(
		getRequired(value, "contact_email", path),
		`${path}.contact_email`,
		assertString,
	);
	assertOneOf(
		getRequired(value, "status", path),
		`${path}.status`,
		FEEDBACK_STATUSES,
	);
	assertNullable(
		getRequired(value, "admin_response", path),
		`${path}.admin_response`,
		assertString,
	);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertFeedbackList(
	value: unknown,
	path = "feedbacks",
): asserts value is Feedback[] {
	assertArray(value, path, assertFeedback);
}

export function assertKnowledgeEntity(
	value: unknown,
	path = "knowledgeEntity",
): asserts value is KnowledgeEntity {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "entity_type", path), `${path}.entity_type`);
	const aliases = getRequired(value, "aliases", path);
	assertArray(aliases, `${path}.aliases`, assertString);
	const properties = getRequired(value, "properties", path);
	assertRecord(properties, `${path}.properties`);
	assertNumber(
		getRequired(value, "mention_count", path),
		`${path}.mention_count`,
	);
	assertString(getRequired(value, "first_seen", path), `${path}.first_seen`);
	assertString(getRequired(value, "last_seen", path), `${path}.last_seen`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertKnowledgeEntityList(
	value: unknown,
	path = "knowledgeEntities",
): asserts value is KnowledgeEntity[] {
	assertArray(value, path, assertKnowledgeEntity);
}

const KNOWLEDGE_RELATION_DIRECTIONS = ["outgoing", "incoming"] as const;

export function assertKnowledgeRelatedEntity(
	value: unknown,
	path = "knowledgeRelatedEntity",
): asserts value is KnowledgeRelatedEntity {
	assertRecord(value, path);

	const entity = getRequired(value, "entity", path);
	assertKnowledgeEntity(entity, `${path}.entity`);
	assertString(
		getRequired(value, "relation_type", path),
		`${path}.relation_type`,
	);
	assertNumber(getRequired(value, "weight", path), `${path}.weight`);
	assertOneOf(
		getRequired(value, "direction", path),
		`${path}.direction`,
		KNOWLEDGE_RELATION_DIRECTIONS,
	);
}

export function assertKnowledgeRelatedEntityList(
	value: unknown,
	path = "knowledgeRelatedEntities",
): asserts value is KnowledgeRelatedEntity[] {
	assertArray(value, path, assertKnowledgeRelatedEntity);
}

export function assertKnowledgeEntityArticle(
	value: unknown,
	path = "knowledgeEntityArticle",
): asserts value is KnowledgeEntityArticle {
	assertRecord(value, path);
	assertString(getRequired(value, "article_id", path), `${path}.article_id`);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertNullable(
		getRequired(value, "published_at", path),
		`${path}.published_at`,
		assertString,
	);
	assertString(getRequired(value, "status", path), `${path}.status`);
	assertNullable(
		getRequired(value, "relevance_score", path),
		`${path}.relevance_score`,
		assertNumber,
	);
}

export function assertKnowledgeEntityArticleList(
	value: unknown,
	path = "knowledgeEntityArticles",
): asserts value is KnowledgeEntityArticle[] {
	assertArray(value, path, assertKnowledgeEntityArticle);
}

export function assertKnowledgeBackfillResponse(
	value: unknown,
	path = "knowledgeBackfillResponse",
): asserts value is KnowledgeBackfillResponse {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "articles_considered", path),
		`${path}.articles_considered`,
	);
	assertNumber(
		getRequired(value, "entities_upserted", path),
		`${path}.entities_upserted`,
	);
	assertNumber(
		getRequired(value, "article_entities_inserted", path),
		`${path}.article_entities_inserted`,
	);
	assertNumber(
		getRequired(value, "relations_upserted", path),
		`${path}.relations_upserted`,
	);
}

// ── Reports ─────────────────────────────────────────────────────────

export interface Report {
	id: string;
	tenant_id: string;
	report_number: string;
	title: string;
	template_id: string | null;
	author_id: string;
	period_type: string;
	period_start: string;
	period_end: string;
	status: string;
	content: Record<string, unknown>;
	export_pdf_key: string | null;
	export_docx_key: string | null;
	export_html_key: string | null;
	article_count: number;
	ai_model: string | null;
	ai_generated_at: string | null;
	version: number;
	published_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface ReportListResponse {
	data: Report[];
	total: number;
	limit: number;
	offset: number;
}

export interface ReportTemplate {
	id: string;
	tenant_id: string;
	name: string;
	description: string | null;
	period_type: string;
	template_body: string;
	css_styles: string | null;
	page_config: Record<string, unknown>;
	sections_config: unknown;
	is_builtin: boolean;
	is_active: boolean;
	version: number;
	created_at: string;
	updated_at: string;
}

export interface ReportTaskEnqueuedResponse {
	message: string;
	report_id: string;
}

// ── Tenants ─────────────────────────────────────────────────────────

export interface Tenant {
	id: string;
	slug: string;
	name: string;
	created_at: string;
	updated_at: string;
}

export interface TenantConfig {
	tenant_id: string;
	max_users: number;
	max_articles: number;
	max_sources: number;
	max_storage_mb: number;
	max_reports_per_month: number;
	feature_ai_enabled: boolean;
	feature_knowledge_graph: boolean;
	feature_report_generation: boolean;
	feature_webhook: boolean;
	logo_url: string | null;
	primary_color: string | null;
	created_at: string;
	updated_at: string;
}

export interface TenantUsage {
	tenant_id: string;
	current_users: number;
	current_articles: number;
	current_sources: number;
	current_storage_mb: number;
	current_reports_this_month: number;
	last_refreshed_at: string;
}

export interface TenantDetail extends Tenant {
	config: TenantConfig;
	usage: TenantUsage;
}

// ── Statistics Overview ─────────────────────────────────────────────

export interface StatisticsOverview {
	total_articles: number;
	with_region: number;
	with_domain: number;
	with_importance: number;
	with_authority: number;
	with_issuer: number;
}
