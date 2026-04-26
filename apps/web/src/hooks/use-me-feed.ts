"use client";

import { apiClient } from "@/lib/api";
import { assertArticle, type Article } from "@/lib/api/types";
import { useQuery } from "@tanstack/react-query";
import type { BannerRecord } from "./use-banners";
import type { ArticlePinRecord } from "./use-pins";

export interface FeedChannelRecord {
	id: string;
	slug: string;
	name: string;
	description?: string | null;
	linked_category_id?: string | null;
	visibility: string;
	is_active: boolean;
	metadata: Record<string, unknown>;
	created_at: string;
	updated_at: string;
}

export interface MeFeedResponse {
	role_tier: string;
	visible_channels: FeedChannelRecord[];
	banners: BannerRecord[];
	pinned_articles: ArticlePinRecord[];
	articles: Article[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}

function assertChannelRecord(value: unknown, path = "channel"): asserts value is FeedChannelRecord {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.slug !== "string" || typeof value.name !== "string") {
		throw new Error(`${path} is invalid`);
	}
}

function assertBannerRecord(value: unknown, path = "banner"): asserts value is BannerRecord {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.title !== "string" || !Array.isArray(value.targets)) {
		throw new Error(`${path} is invalid`);
	}
}

function assertArticlePinRecord(value: unknown, path = "articlePin"): asserts value is ArticlePinRecord {
	if (!isRecord(value) || typeof value.id !== "string" || typeof value.article_id !== "string" || !isRecord(value.article)) {
		throw new Error(`${path} is invalid`);
	}
	assertArticle(value.article, `${path}.article`);
}

function assertMeFeedResponse(value: unknown, path = "meFeed"): asserts value is MeFeedResponse {
	if (!isRecord(value)) {
		throw new Error(`${path} must be an object`);
	}
	if (typeof value.role_tier !== "string") {
		throw new Error(`${path}.role_tier is invalid`);
	}
	if (!Array.isArray(value.visible_channels) || !Array.isArray(value.banners) || !Array.isArray(value.pinned_articles) || !Array.isArray(value.articles)) {
		throw new Error(`${path} collections are invalid`);
	}
	for (const [index, item] of value.visible_channels.entries()) {
		assertChannelRecord(item, `${path}.visible_channels[${index}]`);
	}
	for (const [index, item] of value.banners.entries()) {
		assertBannerRecord(item, `${path}.banners[${index}]`);
	}
	for (const [index, item] of value.pinned_articles.entries()) {
		assertArticlePinRecord(item, `${path}.pinned_articles[${index}]`);
	}
	for (const [index, item] of value.articles.entries()) {
		assertArticle(item, `${path}.articles[${index}]`);
	}
}

export function useMeFeed(articleLimit = 20, pinLimit = 8) {
	return useQuery({
		queryKey: ["meFeed", articleLimit, pinLimit],
		queryFn: () =>
			apiClient.get<MeFeedResponse>(
				`/api/v1/me/feed?article_limit=${articleLimit}&pin_limit=${pinLimit}`,
				assertMeFeedResponse,
			),
		staleTime: 15_000,
	});
}
