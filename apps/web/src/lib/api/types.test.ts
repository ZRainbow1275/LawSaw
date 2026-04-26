import { describe, expect, it } from "vitest";

import type { Article } from "./types";
import { normalizeArticleAiInsights } from "./types";

describe("normalizeArticleAiInsights", () => {
	it("normalizes backend ai_metadata into reader insights", () => {
		const article: Pick<Article, "ai_metadata" | "keywords" | "risk_score" | "tags"> = {
			ai_metadata: {
				abstract: "DSA 全面执行将平台合规义务推进到系统性治理层。",
				key_points: ["建立 notice-and-action 流程", "披露推荐系统主要参数"],
				entities: [
					{
						name: "欧盟委员会",
						entity_type: "organization",
						context: "执法机构",
					},
					{
						name: "DSA",
						entity_type: "regulation",
						context: "Digital Services Act",
					},
				],
				risk_dimensions: [
					{
						name: "content_moderation",
						score: 78,
						description: "内容审核负担持续上升",
					},
				],
				recommendations: ["补齐透明度报告模板", "建立内部申诉闭环"],
				risk_level: "high",
			},
			keywords: ["DSA", "平台治理"],
			risk_score: 78,
			tags: ["欧盟", "合规"],
		};

		expect(normalizeArticleAiInsights(article)).toEqual({
			summary: "DSA 全面执行将平台合规义务推进到系统性治理层。",
			abstract_text: "DSA 全面执行将平台合规义务推进到系统性治理层。",
			key_points: ["建立 notice-and-action 流程", "披露推荐系统主要参数"],
			entities: [
				{
					name: "欧盟委员会",
					entity_type: "organization",
					context: "执法机构",
				},
				{
					name: "DSA",
					entity_type: "regulation",
					context: "Digital Services Act",
				},
			],
			risk_score: 78,
			risk_level: "high",
			risk_dimensions: [
				{
					name: "content_moderation",
					score: 78,
					description: "内容审核负担持续上升",
				},
			],
			recommendations: ["补齐透明度报告模板", "建立内部申诉闭环"],
			tags: ["欧盟", "合规"],
			keywords: ["DSA", "平台治理"],
		});
	});

	it("falls back to article risk_score when ai_metadata omits risk_level", () => {
		const article: Pick<Article, "ai_metadata" | "keywords" | "risk_score" | "tags"> = {
			ai_metadata: {
				abstract: "回退到 article.risk_score 也能推导风险等级。",
				key_points: ["保留摘要"],
			},
			keywords: [],
			risk_score: 46,
			tags: ["回退"],
		};

		expect(normalizeArticleAiInsights(article)).toMatchObject({
			risk_level: "medium",
			risk_score: 46,
		});
	});

	it("returns null when ai_metadata has summary content but no derivable risk signal", () => {
		const article: Pick<Article, "ai_metadata" | "keywords" | "risk_score" | "tags"> = {
			ai_metadata: {
				abstract: "只有摘要，没有风险等级也没有风险分。",
				key_points: ["这条数据不应该被 reader AI 卡片直接渲染。"],
			},
			keywords: ["reader"],
			risk_score: null,
			tags: ["ai"],
		};

		expect(normalizeArticleAiInsights(article)).toBeNull();
	});

	it("returns null when ai_metadata does not contain usable reader content", () => {
		const article: Pick<Article, "ai_metadata" | "keywords" | "risk_score" | "tags"> = {
			ai_metadata: {
				random: "value",
			},
			keywords: [],
			risk_score: null,
			tags: [],
		};

		expect(normalizeArticleAiInsights(article)).toBeNull();
	});
});
