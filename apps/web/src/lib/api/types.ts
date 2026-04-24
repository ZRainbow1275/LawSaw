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
	created_at?: string | null;
}

export interface AuthResponse {
	success: boolean;
	message: string;
	user: User | null;
	mfa_required?: boolean;
	mfa_challenge?: string;
}

export type RoleTier =
	| "basic_user"
	| "verified_user"
	| "premium_user"
	| "tenant_admin"
	| "super_admin";

export interface AuthzCheckResponse {
	allow: boolean;
	decision_path: string[];
	matched_relation?: string | null;
	role_tier: RoleTier;
}

export interface AuthRelation {
	id: string;
	resource_type: string;
	resource_id: string;
	relation: string;
	subject_type: string;
	subject_id: string;
	created_by: string;
	created_at: string;
	expires_at: string | null;
}

export interface AuthRelationListResponse {
	data: AuthRelation[];
	total: number;
	limit: number;
	offset: number;
}

export interface BannerTarget {
	id: string;
	target_type: "global" | "channel" | "role_tier";
	channel_id: string | null;
	min_role: RoleTier | null;
	created_at: string;
}

export interface Banner {
	id: string;
	title: string;
	body: string | null;
	image_url: string | null;
	cta_label: string | null;
	cta_url: string | null;
	priority: number;
	status: "draft" | "scheduled" | "active" | "expired" | "archived";
	starts_at: string | null;
	ends_at: string | null;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
	targets: BannerTarget[];
}

export interface BannerListResponse {
	data: Banner[];
	total: number;
	limit: number;
	offset: number;
}

export interface FeedResponse {
	role_tier: RoleTier;
	total: number;
	limit: number;
	offset: number;
	articles: Article[];
	banners: Banner[];
	experiments: FeedExperiment[];
}

export interface NotificationEntry {
	id: string;
	seq: number;
	action: string;
	resource: string;
	resource_id: string | null;
	user_id: string | null;
	created_at: string;
	summary: string;
}

export interface NotificationsResponse {
	items: NotificationEntry[];
	last_seen_seq: number;
	total: number;
	limit: number;
	offset: number;
}

export interface MarkNotificationsSeenRequest {
	last_seen_seq: number;
}

export interface MarkSeenResponse {
	success: boolean;
}

export interface FeedExperiment {
	experiment_key: string;
	variant: string;
	is_enabled: boolean;
	is_in_rollout: boolean;
	rollout_percent: number;
	rollback_variant: string;
}

export interface ArticlePin {
	id: string;
	article_id: string;
	scope_type: "global" | "channel";
	channel_id: string | null;
	priority: number;
	starts_at: string;
	ends_at: string | null;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface ArticlePinListResponse {
	data: ArticlePin[];
}

export interface UnpinResponse {
	success: boolean;
	pin: ArticlePin;
}

export interface AiPromptVersion {
	id: string;
	version: number;
	prompt_template: string;
	prompt_checksum: string;
	variables: Record<string, unknown>;
	change_note: string | null;
	created_by: string | null;
	created_at: string;
}

export interface AiGovernancePolicy {
	id: string;
	policy_kind: string;
	display_name: string;
	model: string;
	embedding_model: string | null;
	reranker_model: string | null;
	config: Record<string, unknown>;
	budget_daily_tokens: number;
	budget_monthly_tokens: number;
	is_enabled: boolean;
	active_prompt_version: number | null;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface AiPolicySnapshotResponse {
	policy: AiGovernancePolicy;
	active_prompt: AiPromptVersion | null;
}

export interface AiPromptVersionListResponse {
	data: AiPromptVersion[];
	limit: number;
	offset: number;
}

export interface AiContentFlag {
	id: string;
	article_id: string;
	policy_kind: string;
	model_version: string;
	prompt_version: number | null;
	sentiment: string | null;
	risk_level: string | null;
	risk_score: number | null;
	importance: number | null;
	industry: string | null;
	region_code: string | null;
	tags: string[];
	keywords: string[];
	output_hash: string;
	metadata: Record<string, unknown>;
	updated_by_task: string;
	processed_at: string;
	created_at: string;
	updated_at: string;
}

export interface AiContentFlagListResponse {
	data: AiContentFlag[];
	total: number;
	limit: number;
	offset: number;
}

export interface AiMetricBucket {
	key: string;
	count: number;
}

export interface AiMetricsResponse {
	total: number;
	processed_24h: number;
	risk_breakdown: AiMetricBucket[];
	sentiment_breakdown: AiMetricBucket[];
	model_breakdown: AiMetricBucket[];
}

export interface AiTokenUsage {
	id: string;
	policy_kind: string;
	model_version: string;
	operation: string;
	actor_user_id: string | null;
	article_id: string | null;
	request_id: string | null;
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
	latency_ms: number | null;
	status: "success" | "failed" | "degraded";
	metadata: Record<string, unknown>;
	recorded_at: string;
	created_at: string;
}

export interface AiTokenUsageAggregate {
	input_tokens: number;
	output_tokens: number;
	total_tokens: number;
}

export interface AiTokenUsageListResponse {
	data: AiTokenUsage[];
	total: number;
	limit: number;
	offset: number;
	aggregate: AiTokenUsageAggregate;
}

export interface AiBudgetAlert {
	id: string;
	policy_kind: string;
	alert_window: "daily" | "monthly";
	threshold_percent: number;
	budget_tokens: number;
	used_tokens: number;
	status: "triggered" | "resolved" | "suppressed";
	note: string | null;
	metadata: Record<string, unknown>;
	triggered_at: string;
	resolved_at: string | null;
	created_at: string;
	updated_at: string;
}

export interface AiBudgetAlertListResponse {
	data: AiBudgetAlert[];
	total: number;
	limit: number;
	offset: number;
}

export interface RecomputeAiBudgetAlertsResponse {
	active_alerts: number;
}

export interface FeedExperimentConfig {
	id: string;
	experiment_key: "feed_ranking" | "banner_delivery";
	is_enabled: boolean;
	rollout_percent: number;
	variants: Record<string, unknown>;
	rollback_variant: string;
	config: Record<string, unknown>;
	created_by: string | null;
	updated_by: string | null;
	created_at: string;
	updated_at: string;
}

export interface FeedExperimentConfigListResponse {
	data: FeedExperimentConfig[];
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
	next_cursor?: string | null;
}

export interface SourceListResponse {
	data: Source[];
	total: number;
	limit: number;
	offset: number;
	next_cursor?: string | null;
}

export interface UsersListResponse {
	data: User[];
	// Backward-compatible alias from old backend contracts.
	users?: User[];
	total: number;
	limit: number;
	offset: number;
	next_cursor?: string | null;
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
	limit: number;
	offset: number;
	next_cursor?: string | null;
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
	source_url: string | null;
	source_name: string | null;
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

export interface FeedbackListResponse {
	data: Feedback[];
	total: number;
	limit: number;
	offset: number;
	next_cursor?: string | null;
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
	degraded: boolean;
	degraded_reason?: string | null;
}

type ArticleWithAiMetadata = Pick<
	Article,
	"ai_metadata" | "risk_score" | "tags" | "keywords"
> & { summary?: string | null };

function readString(record: Record<string, unknown>, key: string): string {
	const raw = record[key];
	return typeof raw === "string" ? raw : "";
}

function readStringArray(
	record: Record<string, unknown>,
	key: string,
): string[] {
	const raw = record[key];
	if (!Array.isArray(raw)) return [];
	return raw.filter((value): value is string => typeof value === "string");
}

function readEntities(record: Record<string, unknown>): AiEntity[] {
	const raw = record.entities;
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((entry): entry is Record<string, unknown> => {
			return typeof entry === "object" && entry !== null;
		})
		.map((entry) => ({
			name: typeof entry.name === "string" ? entry.name : "",
			entity_type:
				typeof entry.entity_type === "string"
					? (entry.entity_type as AiEntity["entity_type"])
					: "organization",
			context:
				typeof entry.context === "string" ? entry.context : undefined,
		}))
		.filter((entity) => entity.name.length > 0);
}

function readRiskDimensions(
	record: Record<string, unknown>,
): RiskDimension[] {
	const raw = record.risk_dimensions;
	if (!Array.isArray(raw)) return [];
	return raw
		.filter((entry): entry is Record<string, unknown> => {
			return typeof entry === "object" && entry !== null;
		})
		.map((entry) => ({
			name: typeof entry.name === "string" ? entry.name : "",
			score: typeof entry.score === "number" ? entry.score : 0,
			description:
				typeof entry.description === "string" ? entry.description : "",
		}))
		.filter((dim) => dim.name.length > 0);
}

function scoreToRiskLevel(
	score: number | null | undefined,
): ArticleAiInsights["risk_level"] {
	if (score == null) return "low";
	if (score >= 76) return "critical";
	if (score >= 51) return "high";
	if (score >= 26) return "medium";
	return "low";
}

export function normalizeArticleAiInsights(
	article: ArticleWithAiMetadata,
): ArticleAiInsights | null {
	const metadata = article.ai_metadata;
	if (!metadata || typeof metadata !== "object") return null;

	const record = metadata as Record<string, unknown>;
	const summary = readString(record, "summary") || (article.summary ?? "");
	const abstractText = readString(record, "abstract_text") || summary;
	const keyPoints = readStringArray(record, "key_points");
	const entities = readEntities(record);
	const recommendations = readStringArray(record, "recommendations");
	const metadataTags = readStringArray(record, "tags");
	const metadataKeywords = readStringArray(record, "keywords");
	const riskDimensions = readRiskDimensions(record);
	const riskScoreRaw = record.risk_score;
	const riskScore =
		typeof riskScoreRaw === "number"
			? riskScoreRaw
			: (article.risk_score ?? 0);
	const riskLevelRaw = record.risk_level;
	const riskLevel: ArticleAiInsights["risk_level"] =
		riskLevelRaw === "critical" ||
		riskLevelRaw === "high" ||
		riskLevelRaw === "medium" ||
		riskLevelRaw === "low"
			? riskLevelRaw
			: scoreToRiskLevel(article.risk_score);

	const hasAnyContent =
		summary.length > 0 ||
		abstractText.length > 0 ||
		keyPoints.length > 0 ||
		entities.length > 0 ||
		recommendations.length > 0 ||
		metadataTags.length > 0 ||
		metadataKeywords.length > 0;

	if (!hasAnyContent) return null;

	return {
		summary,
		abstract_text: abstractText,
		key_points: keyPoints,
		entities,
		risk_score: riskScore,
		risk_level: riskLevel,
		risk_dimensions: riskDimensions,
		recommendations,
		tags: metadataTags.length > 0 ? metadataTags : article.tags,
		keywords:
			metadataKeywords.length > 0 ? metadataKeywords : article.keywords,
	};
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

function assertArrayUntyped(
	value: unknown,
	path: string,
): asserts value is unknown[] {
	if (!Array.isArray(value)) {
		throw new Error(`${path}: expected array, got ${typeName(value)}`);
	}
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
	assertOptional(createdAt, `${path}.created_at`, (v, p) =>
		assertNullable(v, p, assertString),
	);
}

export function assertUsersListResponse(
	value: unknown,
	path = "usersListResponse",
): asserts value is UsersListResponse {
	assertRecord(value, path);

	const data = getOptional(value, "data");
	const users = getOptional(value, "users");

	if (data === undefined && users === undefined) {
		throw new Error(`${path}: expected either data or users field`);
	}

	if (data !== undefined) {
		assertArray(data, `${path}.data`, assertUser);
	}

	if (users !== undefined) {
		assertArray(users, `${path}.users`, assertUser);
	}

	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);

	const nextCursor = getOptional(value, "next_cursor");
	assertOptional(nextCursor, `${path}.next_cursor`, (v, p) =>
		assertNullable(v, p, assertString),
	);
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

const ROLE_TIERS = [
	"basic_user",
	"verified_user",
	"premium_user",
	"tenant_admin",
	"super_admin",
] as const;

const BANNER_STATUSES = [
	"draft",
	"scheduled",
	"active",
	"expired",
	"archived",
] as const;

const BANNER_TARGET_TYPES = ["global", "channel", "role_tier"] as const;

const ARTICLE_PIN_SCOPE_TYPES = ["global", "channel"] as const;

const CONTENT_FLAG_RISK_LEVELS = [
	"unknown",
	"low",
	"medium",
	"high",
	"critical",
] as const;

const TOKEN_USAGE_STATUSES = ["success", "failed", "degraded"] as const;

const BUDGET_ALERT_WINDOWS = ["daily", "monthly"] as const;

const BUDGET_ALERT_STATUSES = ["triggered", "resolved", "suppressed"] as const;

const FEED_EXPERIMENT_KEYS = ["feed_ranking", "banner_delivery"] as const;

export function assertAuthzCheckResponse(
	value: unknown,
	path = "authzCheckResponse",
): asserts value is AuthzCheckResponse {
	assertRecord(value, path);

	assertBoolean(getRequired(value, "allow", path), `${path}.allow`);
	const decisionPath = getRequired(value, "decision_path", path);
	assertArray(decisionPath, `${path}.decision_path`, assertString);

	const matchedRelation = getOptional(value, "matched_relation");
	assertOptional(matchedRelation, `${path}.matched_relation`, (v, p) =>
		assertNullable(v, p, assertString),
	);

	const roleTier = getRequired(value, "role_tier", path);
	assertOneOf(roleTier, `${path}.role_tier`, ROLE_TIERS);
}

function assertAuthRelation(
	value: unknown,
	path = "authRelation",
): asserts value is AuthRelation {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(
		getRequired(value, "resource_type", path),
		`${path}.resource_type`,
	);
	assertString(getRequired(value, "resource_id", path), `${path}.resource_id`);
	assertString(getRequired(value, "relation", path), `${path}.relation`);
	assertString(
		getRequired(value, "subject_type", path),
		`${path}.subject_type`,
	);
	assertString(getRequired(value, "subject_id", path), `${path}.subject_id`);
	assertString(getRequired(value, "created_by", path), `${path}.created_by`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertNullable(
		getRequired(value, "expires_at", path),
		`${path}.expires_at`,
		assertString,
	);
}

export function assertAuthRelationResponse(
	value: unknown,
	path = "authRelationResponse",
): asserts value is AuthRelation {
	assertAuthRelation(value, path);
}

export function assertAuthRelationListResponse(
	value: unknown,
	path = "authRelationListResponse",
): asserts value is AuthRelationListResponse {
	assertRecord(value, path);
	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertAuthRelation);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

function assertBannerTarget(
	value: unknown,
	path = "bannerTarget",
): asserts value is BannerTarget {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertOneOf(
		getRequired(value, "target_type", path),
		`${path}.target_type`,
		BANNER_TARGET_TYPES,
	);
	assertNullable(
		getRequired(value, "channel_id", path),
		`${path}.channel_id`,
		assertString,
	);
	const minRole = getRequired(value, "min_role", path);
	assertNullable(minRole, `${path}.min_role`, (v, p) =>
		assertOneOf(v, p, ROLE_TIERS),
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

function assertBanner(
	value: unknown,
	path = "banner",
): asserts value is Banner {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertNullable(
		getRequired(value, "body", path),
		`${path}.body`,
		assertString,
	);
	assertNullable(
		getRequired(value, "image_url", path),
		`${path}.image_url`,
		assertString,
	);
	assertNullable(
		getRequired(value, "cta_label", path),
		`${path}.cta_label`,
		assertString,
	);
	assertNullable(
		getRequired(value, "cta_url", path),
		`${path}.cta_url`,
		assertString,
	);
	assertNumber(getRequired(value, "priority", path), `${path}.priority`);
	assertOneOf(
		getRequired(value, "status", path),
		`${path}.status`,
		BANNER_STATUSES,
	);
	assertNullable(
		getRequired(value, "starts_at", path),
		`${path}.starts_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "ends_at", path),
		`${path}.ends_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "created_by", path),
		`${path}.created_by`,
		assertString,
	);
	assertNullable(
		getRequired(value, "updated_by", path),
		`${path}.updated_by`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);

	const targets = getRequired(value, "targets", path);
	assertArray(targets, `${path}.targets`, assertBannerTarget);
}

export function assertBannerResponse(
	value: unknown,
	path = "bannerResponse",
): asserts value is Banner {
	assertBanner(value, path);
}

export function assertBannerListResponse(
	value: unknown,
	path = "bannerListResponse",
): asserts value is BannerListResponse {
	assertRecord(value, path);
	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertBanner);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

function assertArticlePin(
	value: unknown,
	path = "articlePin",
): asserts value is ArticlePin {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "article_id", path), `${path}.article_id`);
	assertOneOf(
		getRequired(value, "scope_type", path),
		`${path}.scope_type`,
		ARTICLE_PIN_SCOPE_TYPES,
	);
	assertNullable(
		getRequired(value, "channel_id", path),
		`${path}.channel_id`,
		assertString,
	);
	assertNumber(getRequired(value, "priority", path), `${path}.priority`);
	assertString(getRequired(value, "starts_at", path), `${path}.starts_at`);
	assertNullable(
		getRequired(value, "ends_at", path),
		`${path}.ends_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "created_by", path),
		`${path}.created_by`,
		assertString,
	);
	assertNullable(
		getRequired(value, "updated_by", path),
		`${path}.updated_by`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertArticlePinResponse(
	value: unknown,
	path = "articlePinResponse",
): asserts value is ArticlePin {
	assertArticlePin(value, path);
}

export function assertArticlePinListResponse(
	value: unknown,
	path = "articlePinListResponse",
): asserts value is ArticlePinListResponse {
	assertRecord(value, path);
	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertArticlePin);
}

export function assertUnpinResponse(
	value: unknown,
	path = "unpinResponse",
): asserts value is UnpinResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
	const pin = getRequired(value, "pin", path);
	assertArticlePin(pin, `${path}.pin`);
}

function assertAiPromptVersion(
	value: unknown,
	path = "aiPromptVersion",
): asserts value is AiPromptVersion {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertString(
		getRequired(value, "prompt_template", path),
		`${path}.prompt_template`,
	);
	assertString(
		getRequired(value, "prompt_checksum", path),
		`${path}.prompt_checksum`,
	);
	assertRecord(getRequired(value, "variables", path), `${path}.variables`);
	assertNullable(
		getRequired(value, "change_note", path),
		`${path}.change_note`,
		assertString,
	);
	assertNullable(
		getRequired(value, "created_by", path),
		`${path}.created_by`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

function assertAiGovernancePolicy(
	value: unknown,
	path = "aiGovernancePolicy",
): asserts value is AiGovernancePolicy {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "policy_kind", path), `${path}.policy_kind`);
	assertString(
		getRequired(value, "display_name", path),
		`${path}.display_name`,
	);
	assertString(getRequired(value, "model", path), `${path}.model`);
	assertNullable(
		getRequired(value, "embedding_model", path),
		`${path}.embedding_model`,
		assertString,
	);
	assertNullable(
		getRequired(value, "reranker_model", path),
		`${path}.reranker_model`,
		assertString,
	);
	assertRecord(getRequired(value, "config", path), `${path}.config`);
	assertNumber(
		getRequired(value, "budget_daily_tokens", path),
		`${path}.budget_daily_tokens`,
	);
	assertNumber(
		getRequired(value, "budget_monthly_tokens", path),
		`${path}.budget_monthly_tokens`,
	);
	assertBoolean(getRequired(value, "is_enabled", path), `${path}.is_enabled`);
	assertNullable(
		getRequired(value, "active_prompt_version", path),
		`${path}.active_prompt_version`,
		assertNumber,
	);
	assertNullable(
		getRequired(value, "created_by", path),
		`${path}.created_by`,
		assertString,
	);
	assertNullable(
		getRequired(value, "updated_by", path),
		`${path}.updated_by`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertAiPolicySnapshotResponse(
	value: unknown,
	path = "aiPolicySnapshotResponse",
): asserts value is AiPolicySnapshotResponse {
	assertRecord(value, path);
	assertAiGovernancePolicy(
		getRequired(value, "policy", path),
		`${path}.policy`,
	);
	assertNullable(
		getRequired(value, "active_prompt", path),
		`${path}.active_prompt`,
		assertAiPromptVersion,
	);
}

export function assertAiPromptVersionListResponse(
	value: unknown,
	path = "aiPromptVersionListResponse",
): asserts value is AiPromptVersionListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "data", path),
		`${path}.data`,
		assertAiPromptVersion,
	);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

function assertAiContentFlag(
	value: unknown,
	path = "aiContentFlag",
): asserts value is AiContentFlag {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "article_id", path), `${path}.article_id`);
	assertString(getRequired(value, "policy_kind", path), `${path}.policy_kind`);
	assertString(
		getRequired(value, "model_version", path),
		`${path}.model_version`,
	);
	assertNullable(
		getRequired(value, "prompt_version", path),
		`${path}.prompt_version`,
		assertNumber,
	);
	assertNullable(
		getRequired(value, "sentiment", path),
		`${path}.sentiment`,
		(v, p) => assertOneOf(v, p, SENTIMENTS),
	);
	assertNullable(
		getRequired(value, "risk_level", path),
		`${path}.risk_level`,
		(v, p) => assertOneOf(v, p, CONTENT_FLAG_RISK_LEVELS),
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
	assertNullable(
		getRequired(value, "industry", path),
		`${path}.industry`,
		assertString,
	);
	assertNullable(
		getRequired(value, "region_code", path),
		`${path}.region_code`,
		assertString,
	);
	assertArray(getRequired(value, "tags", path), `${path}.tags`, assertString);
	assertArray(
		getRequired(value, "keywords", path),
		`${path}.keywords`,
		assertString,
	);
	assertString(getRequired(value, "output_hash", path), `${path}.output_hash`);
	assertRecord(getRequired(value, "metadata", path), `${path}.metadata`);
	assertString(
		getRequired(value, "updated_by_task", path),
		`${path}.updated_by_task`,
	);
	assertString(
		getRequired(value, "processed_at", path),
		`${path}.processed_at`,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertAiContentFlagListResponse(
	value: unknown,
	path = "aiContentFlagListResponse",
): asserts value is AiContentFlagListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "data", path),
		`${path}.data`,
		assertAiContentFlag,
	);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

function assertAiMetricBucket(
	value: unknown,
	path = "aiMetricBucket",
): asserts value is AiMetricBucket {
	assertRecord(value, path);
	assertString(getRequired(value, "key", path), `${path}.key`);
	assertNumber(getRequired(value, "count", path), `${path}.count`);
}

export function assertAiMetricsResponse(
	value: unknown,
	path = "aiMetricsResponse",
): asserts value is AiMetricsResponse {
	assertRecord(value, path);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(
		getRequired(value, "processed_24h", path),
		`${path}.processed_24h`,
	);
	assertArray(
		getRequired(value, "risk_breakdown", path),
		`${path}.risk_breakdown`,
		assertAiMetricBucket,
	);
	assertArray(
		getRequired(value, "sentiment_breakdown", path),
		`${path}.sentiment_breakdown`,
		assertAiMetricBucket,
	);
	assertArray(
		getRequired(value, "model_breakdown", path),
		`${path}.model_breakdown`,
		assertAiMetricBucket,
	);
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

	const nextCursor = getOptional(value, "next_cursor");
	assertOptional(nextCursor, `${path}.next_cursor`, (v, p) =>
		assertNullable(v, p, assertString),
	);
}

export function assertFeedResponse(
	value: unknown,
	path = "feedResponse",
): asserts value is FeedResponse {
	assertRecord(value, path);
	assertOneOf(
		getRequired(value, "role_tier", path),
		`${path}.role_tier`,
		ROLE_TIERS,
	);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
	assertArray(
		getRequired(value, "articles", path),
		`${path}.articles`,
		assertArticle,
	);
	assertArray(
		getRequired(value, "banners", path),
		`${path}.banners`,
		assertBanner,
	);
	assertArray(
		getRequired(value, "experiments", path),
		`${path}.experiments`,
		(item, itemPath) => {
			assertRecord(item, itemPath);
			assertOneOf(
				getRequired(item, "experiment_key", itemPath),
				`${itemPath}.experiment_key`,
				FEED_EXPERIMENT_KEYS,
			);
			assertString(
				getRequired(item, "variant", itemPath),
				`${itemPath}.variant`,
			);
			assertBoolean(
				getRequired(item, "is_enabled", itemPath),
				`${itemPath}.is_enabled`,
			);
			assertBoolean(
				getRequired(item, "is_in_rollout", itemPath),
				`${itemPath}.is_in_rollout`,
			);
			assertNumber(
				getRequired(item, "rollout_percent", itemPath),
				`${itemPath}.rollout_percent`,
			);
			assertString(
				getRequired(item, "rollback_variant", itemPath),
				`${itemPath}.rollback_variant`,
			);
		},
	);
}

function assertNotificationEntry(
	value: unknown,
	path: string,
): asserts value is NotificationEntry {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertNumber(getRequired(value, "seq", path), `${path}.seq`);
	assertString(getRequired(value, "action", path), `${path}.action`);
	assertString(getRequired(value, "resource", path), `${path}.resource`);
	assertNullable(
		getRequired(value, "resource_id", path),
		`${path}.resource_id`,
		assertString,
	);
	assertNullable(
		getRequired(value, "user_id", path),
		`${path}.user_id`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "summary", path), `${path}.summary`);
}

export function assertNotificationsResponse(
	value: unknown,
	path = "notificationsResponse",
): asserts value is NotificationsResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "items", path),
		`${path}.items`,
		assertNotificationEntry,
	);
	assertNumber(getRequired(value, "last_seen_seq", path), `${path}.last_seen_seq`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

export function assertMarkSeenResponse(
	value: unknown,
	path = "markSeenResponse",
): asserts value is MarkSeenResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
}

function assertAiTokenUsage(
	value: unknown,
	path: string,
): asserts value is AiTokenUsage {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "policy_kind", path), `${path}.policy_kind`);
	assertString(
		getRequired(value, "model_version", path),
		`${path}.model_version`,
	);
	assertString(getRequired(value, "operation", path), `${path}.operation`);
	assertNullable(
		getRequired(value, "actor_user_id", path),
		`${path}.actor_user_id`,
		assertString,
	);
	assertNullable(
		getRequired(value, "article_id", path),
		`${path}.article_id`,
		assertString,
	);
	assertNullable(
		getRequired(value, "request_id", path),
		`${path}.request_id`,
		assertString,
	);
	assertNumber(
		getRequired(value, "input_tokens", path),
		`${path}.input_tokens`,
	);
	assertNumber(
		getRequired(value, "output_tokens", path),
		`${path}.output_tokens`,
	);
	assertNumber(
		getRequired(value, "total_tokens", path),
		`${path}.total_tokens`,
	);
	assertNullable(
		getRequired(value, "latency_ms", path),
		`${path}.latency_ms`,
		assertNumber,
	);
	assertOneOf(
		getRequired(value, "status", path),
		`${path}.status`,
		TOKEN_USAGE_STATUSES,
	);
	assertRecord(getRequired(value, "metadata", path), `${path}.metadata`);
	assertString(getRequired(value, "recorded_at", path), `${path}.recorded_at`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

function assertAiBudgetAlert(
	value: unknown,
	path: string,
): asserts value is AiBudgetAlert {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "policy_kind", path), `${path}.policy_kind`);
	assertOneOf(
		getRequired(value, "alert_window", path),
		`${path}.alert_window`,
		BUDGET_ALERT_WINDOWS,
	);
	assertNumber(
		getRequired(value, "threshold_percent", path),
		`${path}.threshold_percent`,
	);
	assertNumber(
		getRequired(value, "budget_tokens", path),
		`${path}.budget_tokens`,
	);
	assertNumber(getRequired(value, "used_tokens", path), `${path}.used_tokens`);
	assertOneOf(
		getRequired(value, "status", path),
		`${path}.status`,
		BUDGET_ALERT_STATUSES,
	);
	assertNullable(
		getRequired(value, "note", path),
		`${path}.note`,
		assertString,
	);
	assertRecord(getRequired(value, "metadata", path), `${path}.metadata`);
	assertString(
		getRequired(value, "triggered_at", path),
		`${path}.triggered_at`,
	);
	assertNullable(
		getRequired(value, "resolved_at", path),
		`${path}.resolved_at`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

function assertFeedExperimentConfig(
	value: unknown,
	path: string,
): asserts value is FeedExperimentConfig {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertOneOf(
		getRequired(value, "experiment_key", path),
		`${path}.experiment_key`,
		FEED_EXPERIMENT_KEYS,
	);
	assertBoolean(getRequired(value, "is_enabled", path), `${path}.is_enabled`);
	assertNumber(
		getRequired(value, "rollout_percent", path),
		`${path}.rollout_percent`,
	);
	assertRecord(getRequired(value, "variants", path), `${path}.variants`);
	assertString(
		getRequired(value, "rollback_variant", path),
		`${path}.rollback_variant`,
	);
	assertRecord(getRequired(value, "config", path), `${path}.config`);
	assertNullable(
		getRequired(value, "created_by", path),
		`${path}.created_by`,
		assertString,
	);
	assertNullable(
		getRequired(value, "updated_by", path),
		`${path}.updated_by`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertAiTokenUsageListResponse(
	value: unknown,
	path = "aiTokenUsageListResponse",
): asserts value is AiTokenUsageListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "data", path),
		`${path}.data`,
		assertAiTokenUsage,
	);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
	const aggregate = getRequired(value, "aggregate", path);
	assertRecord(aggregate, `${path}.aggregate`);
	assertNumber(
		getRequired(aggregate, "input_tokens", `${path}.aggregate`),
		`${path}.aggregate.input_tokens`,
	);
	assertNumber(
		getRequired(aggregate, "output_tokens", `${path}.aggregate`),
		`${path}.aggregate.output_tokens`,
	);
	assertNumber(
		getRequired(aggregate, "total_tokens", `${path}.aggregate`),
		`${path}.aggregate.total_tokens`,
	);
}

export function assertAiBudgetAlertListResponse(
	value: unknown,
	path = "aiBudgetAlertListResponse",
): asserts value is AiBudgetAlertListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "data", path),
		`${path}.data`,
		assertAiBudgetAlert,
	);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

export function assertRecomputeAiBudgetAlertsResponse(
	value: unknown,
	path = "recomputeAiBudgetAlertsResponse",
): asserts value is RecomputeAiBudgetAlertsResponse {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "active_alerts", path),
		`${path}.active_alerts`,
	);
}

export function assertFeedExperimentConfigListResponse(
	value: unknown,
	path = "feedExperimentConfigListResponse",
): asserts value is FeedExperimentConfigListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "data", path),
		`${path}.data`,
		assertFeedExperimentConfig,
	);
}

export function assertFeedExperimentConfigResponse(
	value: unknown,
	path = "feedExperimentConfigResponse",
): asserts value is FeedExperimentConfig {
	assertFeedExperimentConfig(value, path);
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

	const nextCursor = getOptional(value, "next_cursor");
	assertOptional(nextCursor, `${path}.next_cursor`, (v, p) =>
		assertNullable(v, p, assertString),
	);
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

	const limit = getOptional(value, "limit");
	assertOptional(limit, `${path}.limit`, assertNumber);

	const offset = getOptional(value, "offset");
	assertOptional(offset, `${path}.offset`, assertNumber);

	const nextCursor = getOptional(value, "next_cursor");
	assertOptional(nextCursor, `${path}.next_cursor`, (v, p) =>
		assertNullable(v, p, assertString),
	);
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
	assertBoolean(getRequired(value, "degraded", path), `${path}.degraded`);
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
	assertNullable(
		getRequired(value, "source_url", path),
		`${path}.source_url`,
		assertString,
	);
	assertNullable(
		getRequired(value, "source_name", path),
		`${path}.source_name`,
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

export function assertFeedbackListResponse(
	value: unknown,
	path = "feedbackList",
): asserts value is FeedbackListResponse {
	assertRecord(value, path);

	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertFeedback);

	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);

	const nextCursor = getOptional(value, "next_cursor");
	assertOptional(nextCursor, `${path}.next_cursor`, (v, p) =>
		assertNullable(v, p, assertString),
	);
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

export const REPORT_STATUSES = [
	"draft",
	"generating",
	"generated",
	"review",
	"approved",
	"published",
	"archived",
	"error",
] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_PERIOD_TYPES = [
	"weekly",
	"monthly",
	"quarterly",
	"custom",
] as const;

export type ReportPeriodType = (typeof REPORT_PERIOD_TYPES)[number];

export const REPORT_EXPORT_FORMATS = ["pdf", "docx", "html"] as const;

export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

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
	status: ReportStatus;
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
	next_cursor?: string | null;
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

export interface ReportStatusBucket {
	status: string;
	count: number;
}

export interface ReportGovernanceMetricsResponse {
	total_reports: number;
	by_status: ReportStatusBucket[];
	generating_stuck_count: number;
	approved_unpublished_count: number;
	export_ready_count: number;
	error_24h_count: number;
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
	version: number;
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

// ── Report Assertions ───────────────────────────────────────────────

export function assertReport(
	value: unknown,
	path = "report",
): asserts value is Report {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "tenant_id", path), `${path}.tenant_id`);
	assertString(
		getRequired(value, "report_number", path),
		`${path}.report_number`,
	);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertNullable(
		getRequired(value, "template_id", path),
		`${path}.template_id`,
		assertString,
	);
	assertString(getRequired(value, "author_id", path), `${path}.author_id`);
	assertString(getRequired(value, "period_type", path), `${path}.period_type`);
	assertString(
		getRequired(value, "period_start", path),
		`${path}.period_start`,
	);
	assertString(getRequired(value, "period_end", path), `${path}.period_end`);
	assertOneOf(
		getRequired(value, "status", path),
		`${path}.status`,
		REPORT_STATUSES,
	);
	const content = getRequired(value, "content", path);
	assertRecord(content, `${path}.content`);
	assertNullable(
		getRequired(value, "export_pdf_key", path),
		`${path}.export_pdf_key`,
		assertString,
	);
	assertNullable(
		getRequired(value, "export_docx_key", path),
		`${path}.export_docx_key`,
		assertString,
	);
	assertNullable(
		getRequired(value, "export_html_key", path),
		`${path}.export_html_key`,
		assertString,
	);
	assertNumber(
		getRequired(value, "article_count", path),
		`${path}.article_count`,
	);
	assertNullable(
		getRequired(value, "ai_model", path),
		`${path}.ai_model`,
		assertString,
	);
	assertNullable(
		getRequired(value, "ai_generated_at", path),
		`${path}.ai_generated_at`,
		assertString,
	);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertNullable(
		getRequired(value, "published_at", path),
		`${path}.published_at`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertReportListResponse(
	value: unknown,
	path = "reportList",
): asserts value is ReportListResponse {
	assertRecord(value, path);

	const data = getRequired(value, "data", path);
	assertArray(data, `${path}.data`, assertReport);

	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);

	const nextCursor = getOptional(value, "next_cursor");
	assertOptional(nextCursor, `${path}.next_cursor`, (v, p) =>
		assertNullable(v, p, assertString),
	);
}

export function assertReportTemplate(
	value: unknown,
	path = "reportTemplate",
): asserts value is ReportTemplate {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "tenant_id", path), `${path}.tenant_id`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertNullable(
		getRequired(value, "description", path),
		`${path}.description`,
		assertString,
	);
	assertString(getRequired(value, "period_type", path), `${path}.period_type`);
	assertString(
		getRequired(value, "template_body", path),
		`${path}.template_body`,
	);
	assertNullable(
		getRequired(value, "css_styles", path),
		`${path}.css_styles`,
		assertString,
	);
	const pageConfig = getRequired(value, "page_config", path);
	assertRecord(pageConfig, `${path}.page_config`);
	// sections_config is unknown (can be any JSON)
	getRequired(value, "sections_config", path);
	const isBuiltin = getRequired(value, "is_builtin", path);
	assertBoolean(isBuiltin, `${path}.is_builtin`);
	const isActive = getRequired(value, "is_active", path);
	assertBoolean(isActive, `${path}.is_active`);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertReportTemplateList(
	value: unknown,
	path = "reportTemplates",
): asserts value is ReportTemplate[] {
	assertArray(value, path, assertReportTemplate);
}

export function assertReportTaskEnqueuedResponse(
	value: unknown,
	path = "reportTaskEnqueued",
): asserts value is ReportTaskEnqueuedResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "message", path), `${path}.message`);
	assertString(getRequired(value, "report_id", path), `${path}.report_id`);
}

export function assertReportGovernanceMetricsResponse(
	value: unknown,
	path = "reportGovernanceMetrics",
): asserts value is ReportGovernanceMetricsResponse {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "total_reports", path),
		`${path}.total_reports`,
	);
	const buckets = getRequired(value, "by_status", path);
	assertArray(buckets, `${path}.by_status`, (item, itemPath) => {
		assertRecord(item, itemPath);
		assertString(getRequired(item, "status", itemPath), `${itemPath}.status`);
		assertNumber(getRequired(item, "count", itemPath), `${itemPath}.count`);
	});
	assertNumber(
		getRequired(value, "generating_stuck_count", path),
		`${path}.generating_stuck_count`,
	);
	assertNumber(
		getRequired(value, "approved_unpublished_count", path),
		`${path}.approved_unpublished_count`,
	);
	assertNumber(
		getRequired(value, "export_ready_count", path),
		`${path}.export_ready_count`,
	);
	assertNumber(
		getRequired(value, "error_24h_count", path),
		`${path}.error_24h_count`,
	);
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

// ── Statistics Types ────────────────────────────────────────────────

export interface RegionalCount {
	region_code: string;
	region_name: string;
	count: number;
	percentage: number;
}

export interface RegionalDistribution {
	items: RegionalCount[];
	total: number;
	coverage_rate: number;
}

export interface SubDomainCount {
	domain_sub: string;
	count: number;
}

export interface DomainCount {
	domain_root: string;
	label: string;
	count: number;
	percentage: number;
	sub_domains: SubDomainCount[] | null;
}

export interface IndustryDistribution {
	items: DomainCount[];
	total: number;
	coverage_rate: number;
}

export interface ImportanceDistribution {
	levels: [number, number, number, number, number];
	total: number;
	average: number;
	coverage_rate: number;
}

export interface AuthorityLevelCount {
	level: number;
	label: string;
	count: number;
	percentage: number;
}

export interface AuthorityDistribution {
	levels: AuthorityLevelCount[];
	total: number;
	coverage_rate: number;
}

export interface IssuerCount {
	issuer: string;
	count: number;
	percentage: number;
}

export interface IssuerDistribution {
	items: IssuerCount[];
	total: number;
	unique_issuers: number;
}

export interface CrossDimensionalCell {
	x_value: string;
	y_value: string;
	count: number;
}

export interface CrossDimensionalResult {
	dimension_x: string;
	dimension_y: string;
	cells: CrossDimensionalCell[];
}

export interface TimelinePoint {
	date: string;
	count: number;
}

export interface TimelineSeries {
	dimension_value: string;
	label: string;
	points: TimelinePoint[];
}

export interface TimelineByDimension {
	dimension: string;
	granularity: string;
	series: TimelineSeries[];
}

// ── Statistics Assert Functions ─────────────────────────────────────

export function assertStatisticsOverview(
	value: unknown,
	path = "StatisticsOverview",
): asserts value is StatisticsOverview {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "total_articles", path),
		`${path}.total_articles`,
	);
	assertNumber(getRequired(value, "with_region", path), `${path}.with_region`);
	assertNumber(getRequired(value, "with_domain", path), `${path}.with_domain`);
	assertNumber(
		getRequired(value, "with_importance", path),
		`${path}.with_importance`,
	);
	assertNumber(
		getRequired(value, "with_authority", path),
		`${path}.with_authority`,
	);
	assertNumber(getRequired(value, "with_issuer", path), `${path}.with_issuer`);
}

export function assertRegionalDistribution(
	value: unknown,
	path = "RegionalDistribution",
): asserts value is RegionalDistribution {
	assertRecord(value, path);
	assertArrayUntyped(getRequired(value, "items", path), `${path}.items`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(
		getRequired(value, "coverage_rate", path),
		`${path}.coverage_rate`,
	);
}

export function assertIndustryDistribution(
	value: unknown,
	path = "IndustryDistribution",
): asserts value is IndustryDistribution {
	assertRecord(value, path);
	assertArrayUntyped(getRequired(value, "items", path), `${path}.items`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(
		getRequired(value, "coverage_rate", path),
		`${path}.coverage_rate`,
	);
}

export function assertImportanceDistribution(
	value: unknown,
	path = "ImportanceDistribution",
): asserts value is ImportanceDistribution {
	assertRecord(value, path);
	assertArrayUntyped(getRequired(value, "levels", path), `${path}.levels`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "average", path), `${path}.average`);
	assertNumber(
		getRequired(value, "coverage_rate", path),
		`${path}.coverage_rate`,
	);
}

export function assertAuthorityDistribution(
	value: unknown,
	path = "AuthorityDistribution",
): asserts value is AuthorityDistribution {
	assertRecord(value, path);
	assertArrayUntyped(getRequired(value, "levels", path), `${path}.levels`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(
		getRequired(value, "coverage_rate", path),
		`${path}.coverage_rate`,
	);
}

export function assertIssuerDistribution(
	value: unknown,
	path = "IssuerDistribution",
): asserts value is IssuerDistribution {
	assertRecord(value, path);
	assertArrayUntyped(getRequired(value, "items", path), `${path}.items`);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(
		getRequired(value, "unique_issuers", path),
		`${path}.unique_issuers`,
	);
}

export function assertCrossDimensionalResult(
	value: unknown,
	path = "CrossDimensionalResult",
): asserts value is CrossDimensionalResult {
	assertRecord(value, path);
	assertString(getRequired(value, "dimension_x", path), `${path}.dimension_x`);
	assertString(getRequired(value, "dimension_y", path), `${path}.dimension_y`);
	assertArrayUntyped(getRequired(value, "cells", path), `${path}.cells`);
}

export function assertTimelineByDimension(
	value: unknown,
	path = "TimelineByDimension",
): asserts value is TimelineByDimension {
	assertRecord(value, path);
	assertString(getRequired(value, "dimension", path), `${path}.dimension`);
	assertString(getRequired(value, "granularity", path), `${path}.granularity`);
	assertArrayUntyped(getRequired(value, "series", path), `${path}.series`);
}

// ── Knowledge Advanced Assert Functions ─────────────────────────────

export function assertKnowledgeLlmBackfillResponse(
	value: unknown,
	path = "KnowledgeLlmBackfillResponse",
): asserts value is KnowledgeLlmBackfillResponse {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "articles_enqueued", path),
		`${path}.articles_enqueued`,
	);
}

export function assertKnowledgeSemanticSearchResultList(
	value: unknown,
	path = "KnowledgeSemanticSearchResultList",
): asserts value is KnowledgeSemanticSearchResult[] {
	assertArrayUntyped(value, path);
}

export function assertKnowledgeDuplicateCandidateList(
	value: unknown,
	path = "KnowledgeDuplicateCandidateList",
): asserts value is KnowledgeDuplicateCandidatePair[] {
	assertArrayUntyped(value, path);
}

export function assertKnowledgeMergeEntitiesResponse(
	value: unknown,
	path = "KnowledgeMergeEntitiesResponse",
): asserts value is KnowledgeMergeEntitiesResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "message", path), `${path}.message`);
}

export function assertKnowledgeDegreeCentralityList(
	value: unknown,
	path = "KnowledgeDegreeCentralityList",
): asserts value is KnowledgeDegreeCentrality[] {
	assertArrayUntyped(value, path);
}

export function assertKnowledgeCooccurrenceEdgeList(
	value: unknown,
	path = "KnowledgeCooccurrenceEdgeList",
): asserts value is KnowledgeCooccurrenceEdge[] {
	assertArrayUntyped(value, path);
}

export function assertKnowledgeGraphStats(
	value: unknown,
	path = "KnowledgeGraphStats",
): asserts value is KnowledgeGraphStats {
	assertRecord(value, path);
	assertNumber(
		getRequired(value, "entity_count", path),
		`${path}.entity_count`,
	);
	assertNumber(
		getRequired(value, "relation_count", path),
		`${path}.relation_count`,
	);
	assertNumber(
		getRequired(value, "article_entity_count", path),
		`${path}.article_entity_count`,
	);
	assertNumber(
		getRequired(value, "entities_with_embedding", path),
		`${path}.entities_with_embedding`,
	);
	assertArrayUntyped(
		getRequired(value, "type_distribution", path),
		`${path}.type_distribution`,
	);
}

// ── Security / MFA / Login Activity ─────────────────────────────────

export interface MfaTotpSetupResponse {
	success: boolean;
	issuer: string;
	account_label: string;
	secret: string;
	provisioning_uri: string;
}

export interface MfaTotpStatusResponse {
	success: boolean;
	enabled: boolean;
	verified_at: string | null;
	last_used_at: string | null;
}

export interface ChangePasswordResponse {
	success: boolean;
	message: string;
	version: number;
}

export interface LoginActivityEntry {
	id: string;
	action: string;
	ip_address: string | null;
	user_agent: string | null;
	created_at: string;
}

export interface LoginActivityResponse {
	items: LoginActivityEntry[];
	total: number;
}

export function assertMfaTotpSetupResponse(
	value: unknown,
	path = "mfaTotpSetupResponse",
): asserts value is MfaTotpSetupResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
	assertString(getRequired(value, "issuer", path), `${path}.issuer`);
	assertString(
		getRequired(value, "account_label", path),
		`${path}.account_label`,
	);
	assertString(getRequired(value, "secret", path), `${path}.secret`);
	assertString(
		getRequired(value, "provisioning_uri", path),
		`${path}.provisioning_uri`,
	);
}

export function assertMfaTotpStatusResponse(
	value: unknown,
	path = "mfaTotpStatusResponse",
): asserts value is MfaTotpStatusResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
	assertBoolean(getRequired(value, "enabled", path), `${path}.enabled`);
	assertNullable(
		getRequired(value, "verified_at", path),
		`${path}.verified_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "last_used_at", path),
		`${path}.last_used_at`,
		assertString,
	);
}

export function assertChangePasswordResponse(
	value: unknown,
	path = "changePasswordResponse",
): asserts value is ChangePasswordResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
	assertString(getRequired(value, "message", path), `${path}.message`);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
}

export function assertLoginActivityEntry(
	value: unknown,
	path = "loginActivityEntry",
): asserts value is LoginActivityEntry {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "action", path), `${path}.action`);
	assertNullable(
		getRequired(value, "ip_address", path),
		`${path}.ip_address`,
		assertString,
	);
	assertNullable(
		getRequired(value, "user_agent", path),
		`${path}.user_agent`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

export function assertLoginActivityResponse(
	value: unknown,
	path = "loginActivityResponse",
): asserts value is LoginActivityResponse {
	assertRecord(value, path);
	const items = getRequired(value, "items", path);
	assertArray(items, `${path}.items`, assertLoginActivityEntry);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
}

// ── Webhook Types & Assertions ──────────────────────────────────────

export interface WebhookEndpoint {
	id: string;
	name: string;
	url: string;
	enabled: boolean;
	events: string[];
	timeout_ms: number;
	max_retries: number;
	created_by: string | null;
	last_success_at: string | null;
	last_failure_at: string | null;
	last_status_code: number | null;
	last_error: string | null;
	created_at: string;
	updated_at: string;
}

export interface WebhookListResponse {
	items: WebhookEndpoint[];
	total: number;
	limit: number;
	offset: number;
}

export interface WebhookTestResponse {
	event_id: string;
	event_type: string;
}

export function assertWebhookEndpoint(
	value: unknown,
	path = "webhookEndpoint",
): asserts value is WebhookEndpoint {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "url", path), `${path}.url`);
	assertBoolean(getRequired(value, "enabled", path), `${path}.enabled`);
	assertArray(
		getRequired(value, "events", path),
		`${path}.events`,
		assertString,
	);
	assertNumber(getRequired(value, "timeout_ms", path), `${path}.timeout_ms`);
	assertNumber(getRequired(value, "max_retries", path), `${path}.max_retries`);
	assertNullable(
		getRequired(value, "created_by", path),
		`${path}.created_by`,
		assertString,
	);
	assertNullable(
		getRequired(value, "last_success_at", path),
		`${path}.last_success_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "last_failure_at", path),
		`${path}.last_failure_at`,
		assertString,
	);
	assertNullable(
		getRequired(value, "last_status_code", path),
		`${path}.last_status_code`,
		assertNumber,
	);
	assertNullable(
		getRequired(value, "last_error", path),
		`${path}.last_error`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertWebhookListResponse(
	value: unknown,
	path = "webhookList",
): asserts value is WebhookListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "items", path),
		`${path}.items`,
		assertWebhookEndpoint,
	);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}

export function assertWebhookTestResponse(
	value: unknown,
	path = "webhookTestResponse",
): asserts value is WebhookTestResponse {
	assertRecord(value, path);
	assertString(getRequired(value, "event_id", path), `${path}.event_id`);
	assertString(getRequired(value, "event_type", path), `${path}.event_type`);
}

// ── Tenant Assertions ───────────────────────────────────────────────

export function assertTenant(
	value: unknown,
	path = "tenant",
): asserts value is Tenant {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "slug", path), `${path}.slug`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertTenantConfig(
	value: unknown,
	path = "tenantConfig",
): asserts value is TenantConfig {
	assertRecord(value, path);
	assertString(getRequired(value, "tenant_id", path), `${path}.tenant_id`);
	assertNumber(getRequired(value, "version", path), `${path}.version`);
	assertNumber(getRequired(value, "max_users", path), `${path}.max_users`);
	assertNumber(
		getRequired(value, "max_articles", path),
		`${path}.max_articles`,
	);
	assertNumber(getRequired(value, "max_sources", path), `${path}.max_sources`);
	assertNumber(
		getRequired(value, "max_storage_mb", path),
		`${path}.max_storage_mb`,
	);
	assertNumber(
		getRequired(value, "max_reports_per_month", path),
		`${path}.max_reports_per_month`,
	);
	assertBoolean(
		getRequired(value, "feature_ai_enabled", path),
		`${path}.feature_ai_enabled`,
	);
	assertBoolean(
		getRequired(value, "feature_knowledge_graph", path),
		`${path}.feature_knowledge_graph`,
	);
	assertBoolean(
		getRequired(value, "feature_report_generation", path),
		`${path}.feature_report_generation`,
	);
	assertBoolean(
		getRequired(value, "feature_webhook", path),
		`${path}.feature_webhook`,
	);
	assertNullable(
		getRequired(value, "logo_url", path),
		`${path}.logo_url`,
		assertString,
	);
	assertNullable(
		getRequired(value, "primary_color", path),
		`${path}.primary_color`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertTenantUsage(
	value: unknown,
	path = "tenantUsage",
): asserts value is TenantUsage {
	assertRecord(value, path);
	assertString(getRequired(value, "tenant_id", path), `${path}.tenant_id`);
	assertNumber(
		getRequired(value, "current_users", path),
		`${path}.current_users`,
	);
	assertNumber(
		getRequired(value, "current_articles", path),
		`${path}.current_articles`,
	);
	assertNumber(
		getRequired(value, "current_sources", path),
		`${path}.current_sources`,
	);
	assertNumber(
		getRequired(value, "current_storage_mb", path),
		`${path}.current_storage_mb`,
	);
	assertNumber(
		getRequired(value, "current_reports_this_month", path),
		`${path}.current_reports_this_month`,
	);
	assertString(
		getRequired(value, "last_refreshed_at", path),
		`${path}.last_refreshed_at`,
	);
}

export function assertTenantDetail(
	value: unknown,
	path = "tenantDetail",
): asserts value is TenantDetail {
	assertRecord(value, path);
	// TenantDetail extends Tenant (flattened) + config + usage
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "slug", path), `${path}.slug`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
	assertTenantConfig(getRequired(value, "config", path), `${path}.config`);
	assertTenantUsage(getRequired(value, "usage", path), `${path}.usage`);
}

// ── Permission Audit Assertions ─────────────────────────────────────

export interface PermissionAuditEntry {
	id: string;
	seq: number;
	action: string;
	actor_user_id: string | null;
	target_user_id: string | null;
	before_roles: string[];
	after_roles: string[];
	requested_add_roles: string[];
	requested_remove_roles: string[];
	ip_address: string | null;
	user_agent: string | null;
	created_at: string;
}

export interface PermissionAuditListResponse {
	items: PermissionAuditEntry[];
	total: number;
	limit: number;
	offset: number;
}

export function assertPermissionAuditEntry(
	value: unknown,
	path = "permissionAuditEntry",
): asserts value is PermissionAuditEntry {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertNumber(getRequired(value, "seq", path), `${path}.seq`);
	assertString(getRequired(value, "action", path), `${path}.action`);
	assertNullable(
		getRequired(value, "actor_user_id", path),
		`${path}.actor_user_id`,
		assertString,
	);
	assertNullable(
		getRequired(value, "target_user_id", path),
		`${path}.target_user_id`,
		assertString,
	);
	assertArray(
		getRequired(value, "before_roles", path),
		`${path}.before_roles`,
		assertString,
	);
	assertArray(
		getRequired(value, "after_roles", path),
		`${path}.after_roles`,
		assertString,
	);
	assertArray(
		getRequired(value, "requested_add_roles", path),
		`${path}.requested_add_roles`,
		assertString,
	);
	assertArray(
		getRequired(value, "requested_remove_roles", path),
		`${path}.requested_remove_roles`,
		assertString,
	);
	assertNullable(
		getRequired(value, "ip_address", path),
		`${path}.ip_address`,
		assertString,
	);
	assertNullable(
		getRequired(value, "user_agent", path),
		`${path}.user_agent`,
		assertString,
	);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

export function assertPermissionAuditListResponse(
	value: unknown,
	path = "permissionAuditList",
): asserts value is PermissionAuditListResponse {
	assertRecord(value, path);
	assertArray(
		getRequired(value, "items", path),
		`${path}.items`,
		assertPermissionAuditEntry,
	);
	assertNumber(getRequired(value, "total", path), `${path}.total`);
	assertNumber(getRequired(value, "limit", path), `${path}.limit`);
	assertNumber(getRequired(value, "offset", path), `${path}.offset`);
}
