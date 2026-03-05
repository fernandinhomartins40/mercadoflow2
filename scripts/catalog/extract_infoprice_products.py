#!/usr/bin/env python3
"""Extract all products from InfoPrice ISA product picker.

Usage example:
python scripts/catalog/extract_infoprice_products.py \
  --email you@example.com \
  --password "secret" \
  --output data/catalog/infoprice_products.json
"""

import argparse
import csv
import json
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, List

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright

LOGIN_URL = "https://app.infoprice.co/isa/painel-geral-free"
PRODUCT_REGEX = re.compile(r"^\s*(\d{4,14})\s*-\s*(.+?)\s*$")

REMOVE_OVERLAYS_JS = """
() => {
  const selectors = [
    '#hs-web-interactives-top-anchor',
    '#hs-web-interactives-bottom-anchor',
    'iframe[title*="Popup"]',
    'iframe[src*="hs-sites"]',
    '.stream-form',
    '.stream-box',
    '.modal-backdrop'
  ];
  selectors.forEach((sel) => document.querySelectorAll(sel).forEach((el) => el.remove()));

  document.querySelectorAll('*').forEach((el) => {
    const style = window.getComputedStyle(el);
    const text = (el.textContent || '').toLowerCase();
    if (
      style.position === 'fixed' &&
      Number.parseInt(style.zIndex || '0', 10) >= 1000 &&
      (text.includes('inscri') || text.includes('material gratis') || text.includes('ebook') || text.includes('pricing conectado'))
    ) {
      el.remove();
    }
  });
}
"""


@dataclass
class ProductRow:
    code: str
    name: str
    raw: str


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Extract product list from InfoPrice ISA picker")
    parser.add_argument("--email", required=True, help="InfoPrice login email")
    parser.add_argument("--password", required=True, help="InfoPrice login password")
    parser.add_argument("--output", default="data/catalog/infoprice_products.json", help="JSON output path")
    parser.add_argument("--headless", action="store_true", default=True, help="Run browser headless (default true)")
    parser.add_argument("--headed", action="store_true", help="Force headed browser")
    parser.add_argument("--max-clicks", type=int, default=400, help="Max number of CARREGAR MAIS clicks")
    parser.add_argument("--screenshot", default="", help="Optional screenshot output path")
    return parser.parse_args()


def ensure_logged_in(page, email: str, password: str) -> None:
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=120000)
    page.wait_for_timeout(2000)
    page.evaluate(REMOVE_OVERLAYS_JS)

    email_locator = page.locator('input[type="email"], input[name="email"]')
    password_locator = page.locator('input[type="password"], input[name="password"]')

    if email_locator.count() == 0 or password_locator.count() == 0:
        return

    email_locator.first.fill(email)
    password_locator.first.fill(password)

    submit = page.locator('button:has-text("Entrar"), button[type="submit"], input[type="submit"]')
    if submit.count() == 0:
        raise RuntimeError("Login button not found in InfoPrice page")

    submit.first.click(force=True)
    page.wait_for_timeout(5000)
    page.evaluate(REMOVE_OVERLAYS_JS)


def open_product_picker(page) -> None:
    trigger = page.locator("#product-filter-desktop")
    if trigger.count() == 0:
        raise RuntimeError("Product picker trigger #product-filter-desktop not found")

    trigger.first.click(force=True)
    page.wait_for_timeout(1200)


def collect_visible_rows(page) -> List[str]:
    return page.eval_on_selector_all(
        ".rs-picker-check-menu .rs-checkbox-checker label, "
        ".rs-picker-check-menu .rs-picker-check-menu-item label, "
        ".rs-picker-check-menu .rs-picker-check-menu-item",
        "nodes => nodes.map(n => (n.innerText || n.textContent || '').trim()).filter(Boolean)",
    )


def is_load_more_available(page) -> bool:
    btn = page.locator('.rs-picker-check-menu button:has-text("CARREGAR MAIS")')
    if btn.count() == 0:
        return False

    classes = btn.first.get_attribute("class") or ""
    if "disabled" in classes.lower():
        return False

    if btn.first.get_attribute("disabled") is not None:
        return False

    return True


def click_load_more(page) -> bool:
    btn = page.locator('.rs-picker-check-menu button:has-text("CARREGAR MAIS")')
    if btn.count() == 0:
        return False
    try:
        btn.first.click(force=True, timeout=5000)
        page.wait_for_timeout(1200)
        page.evaluate(REMOVE_OVERLAYS_JS)
        return True
    except PlaywrightTimeoutError:
        return False


def extract_products(page, max_clicks: int) -> Dict[str, ProductRow]:
    products: Dict[str, ProductRow] = {}
    clicks = 0
    stable_rounds = 0

    while True:
        visible_rows = collect_visible_rows(page)
        before_count = len(products)

        for raw in visible_rows:
            match = PRODUCT_REGEX.match(raw)
            if not match:
                continue
            code = match.group(1).strip()
            name = match.group(2).strip()
            if code and name and code not in products:
                products[code] = ProductRow(code=code, name=name, raw=raw)

        after_count = len(products)
        added = after_count - before_count
        print(f"visible={len(visible_rows)} added={added} total={after_count}")

        if not is_load_more_available(page):
            break

        if clicks >= max_clicks:
            print(f"max-clicks reached ({max_clicks}), stopping")
            break

        if added == 0:
            stable_rounds += 1
        else:
            stable_rounds = 0

        if stable_rounds >= 3:
            print("no new products after 3 rounds, stopping")
            break

        if not click_load_more(page):
            print("could not click CARREGAR MAIS, stopping")
            break

        clicks += 1

    return products


def write_outputs(output_json: Path, rows: List[ProductRow]) -> None:
    output_json.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "source": "INFOPRICE_ISA",
        "capturedAt": datetime.now(timezone.utc).isoformat(),
        "count": len(rows),
        "items": [
            {
                "code": row.code,
                "name": row.name,
                "raw": row.raw,
            }
            for row in rows
        ],
    }

    output_json.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")

    output_csv = output_json.with_suffix(".csv")
    with output_csv.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(["code", "name", "raw"])
        for row in rows:
            writer.writerow([row.code, row.name, row.raw])

    print(f"saved JSON: {output_json}")
    print(f"saved CSV:  {output_csv}")


def main() -> int:
    args = parse_args()
    output_json = Path(args.output).resolve()
    headless = not args.headed

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=headless)
        context = browser.new_context(viewport={"width": 1600, "height": 2200})
        page = context.new_page()

        try:
            ensure_logged_in(page, args.email, args.password)
            open_product_picker(page)
            rows_map = extract_products(page, args.max_clicks)
            rows = sorted(rows_map.values(), key=lambda item: (len(item.code), item.code, item.name.lower()))
            write_outputs(output_json, rows)

            if args.screenshot:
                screenshot_path = Path(args.screenshot).resolve()
                screenshot_path.parent.mkdir(parents=True, exist_ok=True)
                page.screenshot(path=str(screenshot_path), full_page=True)
                print(f"saved screenshot: {screenshot_path}")

            print(f"extracted products: {len(rows)}")
            return 0
        except Exception as exc:
            print(f"error: {exc}", file=sys.stderr)
            return 1
        finally:
            browser.close()


if __name__ == "__main__":
    raise SystemExit(main())
