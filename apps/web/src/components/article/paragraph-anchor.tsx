"use client";

/**
 * Paragraph anchor injector.
 *
 * Mounted as a sibling of the rendered article content. On mount (and when
 * the container's child list changes), it walks the content container, gives
 * every `<p>` / `<li>` / `<blockquote>` a stable id, and appends a hover-only
 * "copy deep link" button so readers can share specific paragraphs.
 *
 * The consumer passes the ref to the scroll/prose container via
 * `containerRef`; the component itself renders nothing into the DOM tree
 * of the article — it only decorates existing nodes.
 */

import { useT } from "@/lib/i18n-client";
import { useToast } from "@/stores/toast-store";
import { type RefObject, useEffect } from "react";

export interface ParagraphAnchorProps {
	/**
	 * Ref to the element that contains the rendered article body. The
	 * component only scans descendants of this element, which keeps it
	 * isolated from layout chrome / sidebars that happen to share the page.
	 */
	containerRef?: RefObject<HTMLElement | null>;
}

const ANCHOR_ATTR = "data-paragraph-anchor";
const ANCHOR_ID_PREFIX = "p-";
const ANCHOR_SELECTOR = "p, li, blockquote";

function slugify(input: string, fallback: string): string {
	const trimmed = input.trim().toLowerCase();
	if (!trimmed) return fallback;
	const slug = trimmed
		.replace(/[^\p{Letter}\p{Number}\s-]+/gu, "")
		.replace(/\s+/g, "-")
		.slice(0, 48);
	return slug.length > 0 ? slug : fallback;
}

export function ParagraphAnchor({ containerRef }: ParagraphAnchorProps) {
	const t = useT();
	const { success } = useToast();

	useEffect(() => {
		const container = containerRef?.current;
		if (!container) return;

		const copyLabel = t("Copy paragraph link");
		const toastTitle = t("Link copied");
		const toastDescription = t("Paragraph link copied to clipboard.");

		const copyLink = async (id: string) => {
			const url = `${window.location.origin}${window.location.pathname}#${id}`;
			try {
				await navigator.clipboard.writeText(url);
			} catch {
				const textArea = document.createElement("textarea");
				textArea.value = url;
				document.body.appendChild(textArea);
				textArea.select();
				try {
					document.execCommand("copy");
				} finally {
					document.body.removeChild(textArea);
				}
			}
			success(toastTitle, toastDescription);
		};

		const decorate = () => {
			const nodes = container.querySelectorAll<HTMLElement>(ANCHOR_SELECTOR);
			let index = 0;
			for (const node of Array.from(nodes)) {
				const currentIndex = index;
				index += 1;
				if (node.hasAttribute(ANCHOR_ATTR)) continue;
				if (!node.id) {
					node.id = slugify(
						node.textContent ?? "",
						`${ANCHOR_ID_PREFIX}${currentIndex}`,
					);
				}
				node.setAttribute(ANCHOR_ATTR, "true");
				node.classList.add("group", "relative");

				const anchor = document.createElement("button");
				anchor.type = "button";
				anchor.setAttribute("aria-label", copyLabel);
				anchor.title = copyLabel;
				anchor.className =
					"paragraph-anchor-button absolute -left-7 top-1 flex h-5 w-5 items-center justify-center rounded text-neutral-300 opacity-0 transition-all duration-200 hover:bg-primary-50 hover:text-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 group-hover:opacity-100";
				anchor.innerHTML =
					'<svg aria-hidden="true" focusable="false" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="h-3 w-3"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>';
				anchor.addEventListener("click", (event) => {
					event.preventDefault();
					event.stopPropagation();
					void copyLink(node.id);
				});

				node.appendChild(anchor);
			}
		};

		decorate();

		const observer = new MutationObserver(() => decorate());
		observer.observe(container, { childList: true, subtree: true });

		return () => {
			observer.disconnect();
			const decorated = container.querySelectorAll<HTMLElement>(
				`[${ANCHOR_ATTR}]`,
			);
			for (const node of Array.from(decorated)) {
				node.removeAttribute(ANCHOR_ATTR);
				const buttons = node.querySelectorAll(".paragraph-anchor-button");
				for (const button of Array.from(buttons)) {
					button.remove();
				}
			}
		};
	}, [containerRef, t, success]);

	return null;
}
