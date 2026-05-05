import { type NextRequest, NextResponse } from "next/server";

/**
 * Inject the original request pathname into a custom header so Server
 * Components can read it via `headers().get('x-pathname')`. Without this,
 * Next.js does not expose the request pathname to RSC at render time,
 * which means `[locale]/admin/layout.tsx` cannot build a faithful
 * `?next=<original-path>` redirect.
 *
 * The middleware is intentionally minimal: it never rewrites or redirects,
 * it only clones request headers and forwards them onwards.
 */
export function middleware(request: NextRequest) {
	const pathname =
		request.nextUrl.pathname + (request.nextUrl.search ?? "");
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-pathname", pathname);

	return NextResponse.next({
		request: { headers: requestHeaders },
	});
}

export const config = {
	matcher: [
		/*
		 * Match all request paths except:
		 *  - /_next/* (Next internals + static assets + RSC)
		 *  - /api/* (proxied to backend)
		 *  - file requests with an extension (images, fonts, manifest, sw, etc.)
		 *  - favicon
		 */
		"/((?!api/|_next/|favicon\\.ico|.*\\..*).*)",
	],
};
