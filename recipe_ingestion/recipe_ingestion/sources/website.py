import re
from dataclasses import dataclass, field

import requests
from bs4 import BeautifulSoup
from recipe_scrapers import scrape_html

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
}
_STRIP_TAGS = ("script", "style", "nav", "footer", "header", "noscript", "svg", "form", "iframe", "aside")
# Cookie/consent banners, ads, popups, comment sections and "related recipes"
# widgets -- their text would otherwise pollute what Gemma sees.
_NOISE_PATTERN = re.compile(
    r"cookie|consent|gdpr|\bcmp\b|onetrust|adsbygoogle|advert|\bads?\b|\bad-|newsletter|popup|"
    r"modal|subscribe|comment|related|share|social",
    re.IGNORECASE,
)
# Recipe-card plugins used by most recipe blogs; if one is present its
# contents are the recipe, and everything else on the page is story/ads.
_RECIPE_CONTAINER_SELECTORS = (
    ".wprm-recipe-container",
    ".tasty-recipes",
    ".mv-create-card",
    '[itemtype*="schema.org/Recipe"]',
    ".recipe-card",
)
_BLOCK_MARKERS = ("just a moment...", "cf-challenge", "captcha", "access denied", "are you a robot")
_BLOCKED_HINT = "copy the recipe text from your browser and use `recipe-ingest ingest-text` instead"


class WebsiteScrapeError(Exception):
    pass


@dataclass
class ScrapedWebsiteData:
    title: str
    raw_text: str
    ingredients: list[str] = field(default_factory=list)
    instructions: list[str] = field(default_factory=list)
    yields: str | None = None
    total_time_minutes: int | None = None
    cuisine: str | None = None


def fetch_html(url: str) -> str:
    """GET the page with browser-like headers. Raises WebsiteScrapeError
    (with a hint to use pasted text instead) if the site is unreachable or
    serves a bot-challenge page instead of the recipe."""
    try:
        resp = requests.get(url, headers=_HEADERS, timeout=30)
    except requests.RequestException as exc:
        raise WebsiteScrapeError(f"Could not fetch {url}: {exc}") from exc

    if resp.status_code in (401, 403, 429, 503):
        raise WebsiteScrapeError(
            f"{url} blocked the request (HTTP {resp.status_code}); {_BLOCKED_HINT}"
        )
    try:
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise WebsiteScrapeError(f"Could not fetch {url}: {exc}") from exc

    head = resp.text[:5000].lower()
    if len(resp.text) < 20_000 and any(marker in head for marker in _BLOCK_MARKERS):
        raise WebsiteScrapeError(f"{url} served a bot-challenge page; {_BLOCKED_HINT}")
    return resp.text


def scrape_structured(html: str, url: str) -> ScrapedWebsiteData:
    """Parse the page with recipe-scrapers in wild_mode, which covers both
    its library of known recipe sites and generic schema.org Recipe JSON-LD
    markup on arbitrary sites. Raises WebsiteScrapeError if no structured
    recipe data can be found."""
    try:
        scraper = scrape_html(html=html, org_url=url, wild_mode=True)
        title = scraper.title()
        ingredients = scraper.ingredients()
        instructions_text = scraper.instructions()
        instructions = [line.strip() for line in instructions_text.splitlines() if line.strip()]
    except Exception as exc:
        raise WebsiteScrapeError(f"recipe-scrapers could not parse {url}: {exc}") from exc

    if not ingredients:
        raise WebsiteScrapeError(f"recipe-scrapers found no ingredients at {url}")

    total_time = _optional(scraper.total_time)
    yields = _optional(scraper.yields)
    cuisine = _optional(scraper.cuisine)
    groups = _optional(scraper.ingredient_groups) or []

    raw_text_parts = [title]
    if yields:
        raw_text_parts.append(f"Yields: {yields}")
    if total_time:
        raw_text_parts.append(f"Total time: {total_time} minutes")
    if cuisine:
        raw_text_parts.append(f"Cuisine: {cuisine}")
    raw_text_parts.append("Ingredients:")
    if len(groups) > 1 or (groups and groups[0].purpose):
        for group in groups:
            if group.purpose:
                raw_text_parts.append(f"{group.purpose}:")
            raw_text_parts.extend(group.ingredients)
    else:
        raw_text_parts.extend(ingredients)
    raw_text_parts.append("Instructions:")
    raw_text_parts.extend(instructions)

    return ScrapedWebsiteData(
        title=title,
        raw_text="\n".join(p for p in raw_text_parts if p),
        ingredients=ingredients,
        instructions=instructions,
        yields=str(yields) if yields else None,
        total_time_minutes=int(total_time) if total_time else None,
        cuisine=cuisine,
    )


def scrape_raw_fallback(html: str, url: str) -> str:
    """Best-effort visible page text extraction via BeautifulSoup, for sites
    without structured recipe data. Raises WebsiteScrapeError if the page is
    effectively empty."""
    text = extract_visible_text(html)
    if len(text) < 50:
        raise WebsiteScrapeError(f"Page at {url} yielded effectively no text")
    return text


def extract_visible_text(html: str) -> str:
    """Strip scripts, chrome (nav/header/footer), and noise such as cookie
    banners, ads, popups and comments, then return the page's title plus the
    visible text of the recipe card (or article/main/body if there is no
    recognised recipe card), one line per block."""
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(_STRIP_TAGS):
        tag.decompose()
    for tag in soup.find_all(_is_noise):
        if not tag.decomposed:
            tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""
    root = _find_content_root(soup)
    body_text = root.get_text(separator="\n")
    lines = [line.strip() for line in body_text.splitlines() if line.strip()]
    return "\n".join(([title] if title else []) + lines)


def _is_noise(tag) -> bool:
    if tag.name in ("html", "body", "main", "article"):
        return False
    attrs = getattr(tag, "attrs", None) or {}
    classes = attrs.get("class") or []
    haystack = " ".join([attrs.get("id") or "", *classes])
    if not haystack:
        return False
    if any(c.startswith(("wprm-", "tasty-recipe", "mv-create")) for c in classes):
        return False
    return bool(_NOISE_PATTERN.search(haystack))


def _find_content_root(soup: BeautifulSoup):
    for selector in _RECIPE_CONTAINER_SELECTORS:
        found = soup.select_one(selector)
        if found:
            return found
    return soup.find("article") or soup.find("main") or soup.body or soup


def _optional(getter):
    try:
        return getter()
    except Exception:
        return None
