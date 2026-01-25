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
	ai_metadata?: Record<string, unknown>;
	status: "pending" | "processing" | "published" | "archived" | "rejected";
	created_at: string;
	updated_at: string;
}

export interface Source {
	id: string;
	name: string;
	url: string;
	source_type: "rss" | "spider" | "api";
	config: Record<string, unknown>;
	schedule: string | null;
	priority: number;
	is_active: boolean;
	last_fetch: string | null;
	last_error: string | null;
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
	email: string;
	display_name: string | null;
	avatar_url: string | null;
	is_active: boolean;
	// 仅部分接口返回（如 `/api/v1/users/*`）。`/api/v1/auth/*` 目前不返回。
	last_login?: string | null;
	created_at?: string;
}

export interface AuthResponse {
	success: boolean;
	message: string;
	user: User | null;
}

export interface DeleteResponse {
	success: boolean;
	message: string;
}

export interface ArticleListResponse {
	data: Article[];
	total: number;
	limit: number;
	offset: number;
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
	permissions: Record<string, unknown>;
	rate_limit: number;
	is_active: boolean;
	last_used: string | null;
	created_at: string;
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

export interface Feedback {
	id: string;
	user_id: string | null;
	type: "source_suggestion" | "bug_report" | "feature_request" | "other";
	title: string;
	content: string;
	contact_email: string | null;
	status: "pending" | "reviewing" | "resolved" | "rejected";
	admin_response: string | null;
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

// AI 相关类型
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

const FEEDBACK_STATUSES = ["pending", "reviewing", "resolved", "rejected"] as const;

function typeName(value: unknown): string {
	if (value === null) return "null";
	if (Array.isArray(value)) return "array";
	return typeof value;
}

function assertRecord(value: unknown, path: string): asserts value is JsonRecord {
	if (typeof value !== "object" || value === null || Array.isArray(value)) {
		throw new Error(`${path} 期望 object，实际 ${typeName(value)}`);
	}
}

function assertString(value: unknown, path: string): asserts value is string {
	if (typeof value !== "string") {
		throw new Error(`${path} 期望 string，实际 ${typeName(value)}`);
	}
}

function assertBoolean(value: unknown, path: string): asserts value is boolean {
	if (typeof value !== "boolean") {
		throw new Error(`${path} 期望 boolean，实际 ${typeName(value)}`);
	}
}

function assertNumber(value: unknown, path: string): asserts value is number {
	if (typeof value !== "number" || Number.isNaN(value)) {
		throw new Error(`${path} 期望 number，实际 ${typeName(value)}`);
	}
}

function assertArray<T>(
	value: unknown,
	path: string,
	assertItem: (value: unknown, path: string) => asserts value is T,
): asserts value is T[] {
	if (!Array.isArray(value)) {
		throw new Error(`${path} 期望 array，实际 ${typeName(value)}`);
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
		throw new Error(`${path} 期望 ${allowed.join(" | ")}，实际 ${value}`);
	}
}

function getRequired(obj: JsonRecord, key: string, path: string): unknown {
	const value = obj[key];
	if (value === undefined) {
		throw new Error(`${path}.${key} 缺失`);
	}
	return value;
}

function getOptional(obj: JsonRecord, key: string): unknown {
	return obj[key];
}

export function assertUser(value: unknown, path = "user"): asserts value is User {
	assertRecord(value, path);

	const id = getRequired(value, "id", path);
	assertString(id, `${path}.id`);

	const email = getRequired(value, "email", path);
	assertString(email, `${path}.email`);

	const displayName = getRequired(value, "display_name", path);
	assertNullable(displayName, `${path}.display_name`, assertString);

	const avatarUrl = getRequired(value, "avatar_url", path);
	assertNullable(avatarUrl, `${path}.avatar_url`, assertString);

	const isActive = getRequired(value, "is_active", path);
	assertBoolean(isActive, `${path}.is_active`);

	const lastLogin = getOptional(value, "last_login");
	assertOptional(lastLogin, `${path}.last_login`, (v, p) =>
		assertNullable(v, p, assertString),
	);

	const createdAt = getOptional(value, "created_at");
	assertOptional(createdAt, `${path}.created_at`, assertString);
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
}

export function assertArticle(value: unknown, path = "article"): asserts value is Article {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "source_id", path), `${path}.source_id`);
	assertNullable(getRequired(value, "category_id", path), `${path}.category_id`, assertString);
	assertString(getRequired(value, "title", path), `${path}.title`);
	assertString(getRequired(value, "link", path), `${path}.link`);
	assertNullable(getRequired(value, "content", path), `${path}.content`, assertString);
	assertNullable(getRequired(value, "summary", path), `${path}.summary`, assertString);
	assertNullable(getRequired(value, "author", path), `${path}.author`, assertString);
	assertNullable(getRequired(value, "published_at", path), `${path}.published_at`, assertString);
	assertNullable(getRequired(value, "risk_score", path), `${path}.risk_score`, assertNumber);
	assertNullable(getRequired(value, "importance", path), `${path}.importance`, assertNumber);

	const sentiment = getRequired(value, "sentiment", path);
	if (sentiment !== null) {
		assertOneOf(sentiment, `${path}.sentiment`, SENTIMENTS);
	}

	const aiMetadata = getOptional(value, "ai_metadata");
	if (aiMetadata !== undefined) {
		assertRecord(aiMetadata, `${path}.ai_metadata`);
	}

	assertOneOf(getRequired(value, "status", path), `${path}.status`, ARTICLE_STATUSES);
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
	assertNumber(getRequired(value, "total_articles", path), `${path}.total_articles`);
	assertNumber(getRequired(value, "pending_count", path), `${path}.pending_count`);
	assertNumber(getRequired(value, "published_count", path), `${path}.published_count`);
	assertNumber(getRequired(value, "high_risk_count", path), `${path}.high_risk_count`);
	assertNumber(getRequired(value, "today_count", path), `${path}.today_count`);
}

export function assertDeleteResponse(
	value: unknown,
	path = "deleteResponse",
): asserts value is DeleteResponse {
	assertRecord(value, path);
	assertBoolean(getRequired(value, "success", path), `${path}.success`);
	assertString(getRequired(value, "message", path), `${path}.message`);
}

export function assertCategory(
	value: unknown,
	path = "category",
): asserts value is Category {
	assertRecord(value, path);
	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "slug", path), `${path}.slug`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertNullable(getRequired(value, "description", path), `${path}.description`, assertString);
	assertNullable(getRequired(value, "parent_id", path), `${path}.parent_id`, assertString);
	assertNumber(getRequired(value, "sort_order", path), `${path}.sort_order`);
	assertNullable(getRequired(value, "icon", path), `${path}.icon`, assertString);
	assertNullable(getRequired(value, "color", path), `${path}.color`, assertString);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
}

export function assertCategoryList(
	value: unknown,
	path = "categories",
): asserts value is Category[] {
	assertArray(value, path, assertCategory);
}

export function assertSource(value: unknown, path = "source"): asserts value is Source {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertString(getRequired(value, "name", path), `${path}.name`);
	assertString(getRequired(value, "url", path), `${path}.url`);
	assertOneOf(getRequired(value, "source_type", path), `${path}.source_type`, [
		"rss",
		"spider",
		"api",
	]);

	const config = getRequired(value, "config", path);
	assertRecord(config, `${path}.config`);

	assertNullable(getRequired(value, "schedule", path), `${path}.schedule`, assertString);
	assertNumber(getRequired(value, "priority", path), `${path}.priority`);
	assertBoolean(getRequired(value, "is_active", path), `${path}.is_active`);
	assertNullable(getRequired(value, "last_fetch", path), `${path}.last_fetch`, assertString);
	assertNullable(getRequired(value, "last_error", path), `${path}.last_error`, assertString);
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertSourceList(
	value: unknown,
	path = "sources",
): asserts value is Source[] {
	assertArray(value, path, assertSource);
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

export function assertFeedback(
	value: unknown,
	path = "feedback",
): asserts value is Feedback {
	assertRecord(value, path);

	assertString(getRequired(value, "id", path), `${path}.id`);
	assertNullable(getRequired(value, "user_id", path), `${path}.user_id`, assertString);
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
	assertString(getRequired(value, "created_at", path), `${path}.created_at`);
	assertString(getRequired(value, "updated_at", path), `${path}.updated_at`);
}

export function assertFeedbackList(
	value: unknown,
	path = "feedbacks",
): asserts value is Feedback[] {
	assertArray(value, path, assertFeedback);
}
