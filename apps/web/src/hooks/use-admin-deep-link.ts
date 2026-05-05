"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";

export function useAdminDeepLink() {
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	const clearSearchParams = useCallback(
		(paramNames: readonly string[]) => {
			const nextParams = new URLSearchParams(searchParams.toString());
			let changed = false;

			for (const paramName of paramNames) {
				if (nextParams.has(paramName)) {
					changed = true;
				}
				nextParams.delete(paramName);
			}

			if (!changed) return;

			const nextQuery = nextParams.toString();
			router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, {
				scroll: false,
			});
		},
		[pathname, router, searchParams],
	);

	return { searchParams, clearSearchParams };
}
