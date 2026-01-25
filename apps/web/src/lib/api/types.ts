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
	ai_metadata: Record<string, unknown>;
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
	last_login: string | null;
	created_at: string;
}

export interface AuthResponse {
	success: boolean;
	message: string;
	user: User | null;
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
