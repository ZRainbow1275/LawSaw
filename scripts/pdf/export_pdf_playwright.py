import argparse
import pathlib
import sys

from playwright.sync_api import sync_playwright


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--html", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--format", default="A4")
    parser.add_argument("--margin-top", default="20mm")
    parser.add_argument("--margin-bottom", default="20mm")
    parser.add_argument("--margin-left", default="15mm")
    parser.add_argument("--margin-right", default="15mm")
    parser.add_argument("--landscape", default="0")
    args = parser.parse_args()

    html_path = pathlib.Path(args.html)
    out_path = pathlib.Path(args.out)

    if not html_path.exists():
        print(f"html file not found: {html_path}", file=sys.stderr)
        return 2

    html = html_path.read_text(encoding="utf-8")
    out_path.parent.mkdir(parents=True, exist_ok=True)

    landscape = str(args.landscape).strip() in {"1", "true", "True", "yes", "on"}

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        try:
            page = browser.new_page()
            page.set_content(html, wait_until="networkidle")
            page.pdf(
                path=str(out_path),
                format=args.format,
                print_background=True,
                landscape=landscape,
                margin={
                    "top": args.margin_top,
                    "bottom": args.margin_bottom,
                    "left": args.margin_left,
                    "right": args.margin_right,
                },
            )
        finally:
            browser.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
