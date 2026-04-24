import { describe, expect, it } from "vitest";
import {
	appendRecentCommandId,
	builtinCommands,
	COMMAND_PALETTE_RECENT_KEY,
	COMMAND_PALETTE_RECENT_MAX,
	filterAndRankCommands,
	groupedShortcuts,
	matchCommand,
	readRecentCommandIds,
	REGISTERED_SHORTCUTS,
	shortcutGroupTitle,
	writeRecentCommandIds,
	type Command,
} from "./commands";

function findCommand(id: string, commands: Command[]): Command {
	const found = commands.find((cmd) => cmd.id === id);
	if (!found) throw new Error(`command ${id} not registered`);
	return found;
}

describe("builtinCommands", () => {
	it("registers navigation, action, settings and help categories", () => {
		const commands = builtinCommands();
		const categories = new Set(commands.map((cmd) => cmd.category));
		expect(categories.has("navigate")).toBe(true);
		expect(categories.has("action")).toBe(true);
		expect(categories.has("settings")).toBe(true);
		expect(categories.has("help")).toBe(true);
	});

	it("defines the core navigation shortcuts to primary pages", () => {
		const commands = builtinCommands();
		expect(findCommand("navigate.dashboard", commands)).toBeDefined();
		expect(findCommand("navigate.articles", commands)).toBeDefined();
		expect(findCommand("navigate.reports", commands)).toBeDefined();
		expect(findCommand("navigate.analytics", commands)).toBeDefined();
		expect(findCommand("navigate.knowledge", commands)).toBeDefined();
		expect(findCommand("navigate.feedback", commands)).toBeDefined();
		expect(findCommand("navigate.settings", commands)).toBeDefined();
		expect(findCommand("navigate.search", commands)).toBeDefined();
		expect(findCommand("navigate.feed", commands)).toBeDefined();
	});

	it("registers theme toggle, locale switch, sidebar toggle and logout actions", () => {
		const commands = builtinCommands();
		expect(findCommand("action.theme.toggle", commands)).toBeDefined();
		expect(findCommand("action.locale.switch", commands)).toBeDefined();
		expect(findCommand("action.sidebar.toggle", commands)).toBeDefined();
		expect(findCommand("action.logout", commands)).toBeDefined();
		expect(findCommand("action.shortcuts.help", commands)).toBeDefined();
	});

	it("registers jumps into settings tabs including api keys and system info", () => {
		const commands = builtinCommands();
		expect(findCommand("settings.api", commands)).toBeDefined();
		expect(findCommand("settings.system", commands)).toBeDefined();
		expect(findCommand("settings.notifications", commands)).toBeDefined();
		expect(findCommand("settings.security", commands)).toBeDefined();
		expect(findCommand("settings.appearance", commands)).toBeDefined();
	});
});

describe("matchCommand", () => {
	const commands = builtinCommands();
	const settings = findCommand("navigate.settings", commands);
	const dashboard = findCommand("navigate.dashboard", commands);

	it("returns 1 for empty query (all match)", () => {
		expect(matchCommand(settings, "")).toBe(1);
	});

	it("scores prefix title matches higher than mid-string matches", () => {
		const prefix = matchCommand(dashboard, "dashboard");
		const midstring = matchCommand(dashboard, "看板");
		expect(prefix).toBeGreaterThan(midstring);
	});

	it("matches against English title (titleEn)", () => {
		expect(matchCommand(dashboard, "dashboard")).toBeGreaterThan(0);
	});

	it("matches against Chinese title", () => {
		expect(matchCommand(dashboard, "数据看板")).toBeGreaterThan(0);
	});

	it("returns 0 for unrelated queries", () => {
		expect(matchCommand(dashboard, "zzzzzzzzz")).toBe(0);
	});
});

describe("filterAndRankCommands", () => {
	const commands = builtinCommands();

	it("returns all commands for empty query", () => {
		expect(filterAndRankCommands(commands, "").length).toBe(commands.length);
	});

	it("ranks matching commands first and excludes non-matches", () => {
		const ranked = filterAndRankCommands(commands, "theme");
		expect(ranked.length).toBeGreaterThan(0);
		expect(ranked[0]?.id.startsWith("action.theme") || ranked[0]?.id === "settings.appearance").toBe(true);
		expect(ranked.every((cmd) => cmd.id !== "action.logout")).toBe(true);
	});

	it("supports Chinese keyword matching", () => {
		const ranked = filterAndRankCommands(commands, "设置");
		expect(ranked.some((cmd) => cmd.id === "navigate.settings")).toBe(true);
	});

	it("returns empty array for totally unrelated queries", () => {
		expect(filterAndRankCommands(commands, "zzzzzzzzzzz")).toEqual([]);
	});
});

describe("recent commands persistence", () => {
	function makeMemoryStorage(): Pick<Storage, "getItem" | "setItem"> {
		const store = new Map<string, string>();
		return {
			getItem: (key: string) => store.get(key) ?? null,
			setItem: (key: string, value: string) => {
				store.set(key, value);
			},
		};
	}

	it("returns empty array when nothing stored", () => {
		const storage = makeMemoryStorage();
		expect(readRecentCommandIds(storage)).toEqual([]);
	});

	it("round-trips ids up to the max limit", () => {
		const storage = makeMemoryStorage();
		const ids = Array.from({ length: 20 }, (_, i) => `cmd.${i}`);
		writeRecentCommandIds(storage, ids);
		const read = readRecentCommandIds(storage);
		expect(read.length).toBe(COMMAND_PALETTE_RECENT_MAX);
		expect(read).toEqual(ids.slice(0, COMMAND_PALETTE_RECENT_MAX));
	});

	it("handles malformed JSON gracefully", () => {
		const storage: Pick<Storage, "getItem"> = {
			getItem: () => "not-json",
		};
		expect(readRecentCommandIds(storage)).toEqual([]);
	});

	it("persists under the documented key", () => {
		const storage = makeMemoryStorage();
		writeRecentCommandIds(storage, ["a", "b"]);
		expect(storage.getItem(COMMAND_PALETTE_RECENT_KEY)).toBeTypeOf("string");
	});
});

describe("appendRecentCommandId", () => {
	it("adds a new id at the head", () => {
		expect(appendRecentCommandId([], "a")).toEqual(["a"]);
		expect(appendRecentCommandId(["b"], "a")).toEqual(["a", "b"]);
	});

	it("deduplicates existing entries, moving them to the head", () => {
		expect(appendRecentCommandId(["a", "b", "c"], "c")).toEqual(["c", "a", "b"]);
	});

	it("enforces the max cap", () => {
		const ids = Array.from({ length: COMMAND_PALETTE_RECENT_MAX }, (_, i) => `cmd-${i}`);
		const next = appendRecentCommandId(ids, "new");
		expect(next.length).toBe(COMMAND_PALETTE_RECENT_MAX);
		expect(next[0]).toBe("new");
	});
});

describe("shortcut descriptors", () => {
	it("exposes Ctrl+K, Ctrl+Shift+P and Ctrl+/ as first-class entries", () => {
		const combos = REGISTERED_SHORTCUTS.map((entry) => entry.combo.join("+"));
		expect(combos).toContain("Ctrl+K");
		expect(combos).toContain("Ctrl+Shift+P");
		expect(combos).toContain("Ctrl+/");
	});

	it("groups shortcuts by area and produces stable group titles", () => {
		const groups = groupedShortcuts("zh");
		expect(groups.length).toBeGreaterThan(0);
		for (const group of groups) {
			expect(group.items.length).toBeGreaterThan(0);
		}
		expect(shortcutGroupTitle("search", "en")).toBe("Search");
		expect(shortcutGroupTitle("search", "zh")).toBe("搜索");
	});
});
