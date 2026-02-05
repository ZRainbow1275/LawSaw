import { defineConfig } from "vitest/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
	resolve: {
		alias: {
			"@": resolve(here, "./src"),
		},
	},
	test: {
		environment: "node",
		include: ["src/**/*.{test,spec}.{ts,tsx}"],
		coverage: {
			provider: "istanbul",
			reportsDirectory: "coverage",
			reporter: ["text", "lcov", "html"],
			exclude: [
				"**/*.d.ts",
				"**/*.{test,spec}.{ts,tsx}",
				"src/app/**",
				"src/components/**",
				"src/messages/**",
				"src/middleware.ts",
			],
		},
	},
});

