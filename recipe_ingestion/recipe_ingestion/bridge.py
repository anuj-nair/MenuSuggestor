"""JSON-in / JSON-lines-out entry point so the Node server can run an ingest
as a subprocess and relay live progress: `python -m recipe_ingestion.bridge`
reads one request object from stdin and writes one JSON event per line to
stdout.

Requests:
  {"source": "url", "url": "..."}
  {"source": "text", "text": "...", "reference": "..." (optional)}
  {"source": "scraped", "scraped": {<a previous "scraped" event's payload>}}
      -- retries only the LLM step on page text already fetched.

Events, in order:
  {"type": "progress", "stage": "fetch" | "extract" | "structure" | "check" | "repair"}
  {"type": "scraped", "scraped": {"url", "raw_text", "extraction_method", "expected_ingredient_count"}}  (url source only)
  {"type": "result", "record": <RecipeRecord>}                 exit code 0
  {"type": "error", "error": "<message>", "code": "<CODE>"}    exit code 1
"""
import json
import sys
from dataclasses import asdict

from .llm.gemma import OllamaConnectionError, RecipeExtractionError
from .pipeline import EmptyRecipeTextError, ScrapedPage, ingest_text, scrape_website, structure_scraped_page
from .sources.website import WebsiteScrapeError

ERROR_CODES: list[tuple[type[Exception], str]] = [
    (WebsiteScrapeError, "SCRAPE_BLOCKED"),
    (EmptyRecipeTextError, "TEXT_TOO_SHORT"),
    (OllamaConnectionError, "LLM_UNAVAILABLE"),
    (RecipeExtractionError, "EXTRACTION_FAILED"),
]


class BadRequestError(Exception):
    pass


def emit(event: dict) -> None:
    sys.stdout.write(json.dumps(event, ensure_ascii=False) + "\n")
    sys.stdout.flush()


def on_progress(stage: str) -> None:
    emit({"type": "progress", "stage": stage})


def handle(request: dict):
    source = request.get("source")
    if source == "url":
        url = request.get("url")
        if not url:
            raise BadRequestError("url is required")
        page = scrape_website(url, on_progress)
        emit({"type": "scraped", "scraped": asdict(page)})
        return structure_scraped_page(page, on_progress)
    if source == "scraped":
        try:
            page = ScrapedPage(**request["scraped"])
        except (KeyError, TypeError) as exc:
            raise BadRequestError(f"Invalid scraped payload: {exc}") from exc
        return structure_scraped_page(page, on_progress)
    if source == "text":
        return ingest_text(request.get("text") or "", reference=request.get("reference") or None, on_progress=on_progress)
    raise BadRequestError(f"Unknown source {source!r}; expected 'url', 'text' or 'scraped'")


def main() -> int:
    try:
        request = json.loads(sys.stdin.read() or "{}")
        record = handle(request)
    except (json.JSONDecodeError, BadRequestError) as exc:
        emit({"type": "error", "error": str(exc), "code": "BAD_REQUEST"})
        return 1
    except Exception as exc:  # noqa: BLE001 — every failure must come back as an event
        code = next((c for cls, c in ERROR_CODES if isinstance(exc, cls)), "INTERNAL")
        emit({"type": "error", "error": str(exc), "code": code})
        return 1

    emit({"type": "result", "record": record.model_dump(mode="json")})
    return 0


if __name__ == "__main__":
    sys.exit(main())
