import { describe, expect, it } from "vitest";

import { applyOptimisticReaction } from "./use-reaction";

describe("applyOptimisticReaction", () => {
	it("seeds an empty summary when called with undefined", () => {
		const next = applyOptimisticReaction(undefined, "like");
		expect(next).toEqual({
			likes: 1,
			dislikes: 0,
			score: 1,
			my_kind: "like",
		});
	});

	it("returns base unchanged when the new kind matches the current one", () => {
		const base = {
			likes: 5,
			dislikes: 1,
			score: 4,
			my_kind: "like" as const,
		};
		const next = applyOptimisticReaction(base, "like");
		expect(next).toBe(base);
	});

	it("flips like -> dislike and adjusts both counters", () => {
		const next = applyOptimisticReaction(
			{ likes: 5, dislikes: 1, score: 4, my_kind: "like" },
			"dislike",
		);
		expect(next).toEqual({
			likes: 4,
			dislikes: 2,
			score: 2,
			my_kind: "dislike",
		});
	});

	it("clears a like with kind=null", () => {
		const next = applyOptimisticReaction(
			{ likes: 3, dislikes: 0, score: 3, my_kind: "like" },
			null,
		);
		expect(next).toEqual({
			likes: 2,
			dislikes: 0,
			score: 2,
			my_kind: undefined,
		});
	});

	it("never produces negative counts", () => {
		const next = applyOptimisticReaction(
			{ likes: 0, dislikes: 0, score: 0, my_kind: "like" },
			null,
		);
		expect(next.likes).toBeGreaterThanOrEqual(0);
		expect(next.dislikes).toBeGreaterThanOrEqual(0);
	});

	it("toggles dislike off cleanly", () => {
		const next = applyOptimisticReaction(
			{ likes: 0, dislikes: 7, score: -7, my_kind: "dislike" },
			null,
		);
		expect(next).toEqual({
			likes: 0,
			dislikes: 6,
			score: -6,
			my_kind: undefined,
		});
	});
});
