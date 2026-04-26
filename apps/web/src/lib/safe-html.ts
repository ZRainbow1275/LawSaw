import DOMPurify from "dompurify";

const ALLOWED_TAGS = [
	"p",
	"br",
	"h1",
	"h2",
	"h3",
	"h4",
	"h5",
	"h6",
	"strong",
	"b",
	"em",
	"i",
	"u",
	"s",
	"strike",
	"a",
	"img",
	"figure",
	"figcaption",
	"ul",
	"ol",
	"li",
	"blockquote",
	"pre",
	"code",
	"table",
	"thead",
	"tbody",
	"tr",
	"th",
	"td",
	"div",
	"span",
	"hr",
] as const;

const ALLOWED_ATTR = [
	"href",
	"src",
	"alt",
	"title",
	"width",
	"height",
	"class",
	"id",
	"target",
	"rel",
] as const;

const allowedLinkProtocols = new Set(["http:", "https:", "mailto:", "tel:"]);
const allowedImageProtocols = new Set(["http:", "https:"]);

function isSafeUrl(raw: string, allowedProtocols: Set<string>) {
	try {
		const url = new URL(raw, window.location.origin);
		return allowedProtocols.has(url.protocol);
	} catch {
		return false;
	}
}

export function sanitizeRenderedHtml(renderedContent: string): string {
	if (typeof window === "undefined" || !renderedContent.trim()) return "";

	const sanitized = DOMPurify.sanitize(renderedContent, {
		ALLOWED_TAGS: [...ALLOWED_TAGS],
		ALLOWED_ATTR: [...ALLOWED_ATTR],
		ADD_ATTR: ["target"],
		ALLOW_UNKNOWN_PROTOCOLS: false,
		ALLOWED_URI_REGEXP:
			/^(?:(?:https?|mailto|tel):|(?!(?:[a-z][a-z0-9+.-]*):))/i,
		FORBID_TAGS: ["script", "style", "iframe"],
	});

	const doc = new DOMParser().parseFromString(sanitized, "text/html");

	for (const anchor of Array.from(doc.querySelectorAll<HTMLAnchorElement>("a"))) {
		const href = anchor.getAttribute("href")?.trim();
		if (href && !isSafeUrl(href, allowedLinkProtocols)) {
			anchor.removeAttribute("href");
			anchor.removeAttribute("target");
			anchor.removeAttribute("rel");
			continue;
		}

		const target = anchor.getAttribute("target")?.trim();
		if (target && target !== "_blank" && target !== "_self") {
			anchor.removeAttribute("target");
			anchor.removeAttribute("rel");
			continue;
		}

		if (target === "_blank") {
			anchor.setAttribute("rel", "noopener noreferrer");
		} else {
			anchor.removeAttribute("target");
			anchor.removeAttribute("rel");
		}
	}

	for (const img of Array.from(doc.querySelectorAll<HTMLImageElement>("img[src]"))) {
		const src = img.getAttribute("src")?.trim();
		if (!src || !isSafeUrl(src, allowedImageProtocols)) {
			img.remove();
		}
	}

	return doc.body.innerHTML;
}

