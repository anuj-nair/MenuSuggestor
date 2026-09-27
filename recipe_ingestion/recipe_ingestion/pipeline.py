from dataclasses import dataclass

from .config import settings
from .llm.gemma import ProgressCallback, extract_recipe
from .llm.prompts import build_reference_line
from .schema import ExtractionMetadata, ExtractionMethod, RecipeRecord, SourceType, utc_now
from .sources.website import WebsiteScrapeError, fetch_html, scrape_raw_fallback, scrape_structured
from .storage import save_recipe

MAX_RAW_TEXT_CHARS = 20_000
MIN_PASTED_TEXT_CHARS = 30


class EmptyRecipeTextError(Exception):
    pass


@dataclass
class ScrapedPage:
    """The recipe text pulled from a webpage, before the LLM step. Kept
    separate so a failed LLM step can be retried without re-fetching."""

    url: str
    raw_text: str
    extraction_method: ExtractionMethod
    expected_ingredient_count: int | None = None


def scrape_website(url: str, on_progress: ProgressCallback | None = None) -> ScrapedPage:
    """Fetch the page once, then use its structured recipe data (schema.org
    JSON-LD / known recipe sites) if present, otherwise fall back to the
    cleaned visible page text. Reports "fetch" then "extract" progress."""
    progress = on_progress or (lambda stage: None)
    progress("fetch")
    html = fetch_html(url)
    progress("extract")
    try:
        scraped = scrape_structured(html, url)
        return ScrapedPage(url, scraped.raw_text, "website_structured", len(scraped.ingredients))
    except WebsiteScrapeError:
        return ScrapedPage(url, scrape_raw_fallback(html, url), "website_raw_fallback")


def structure_scraped_page(page: ScrapedPage, on_progress: ProgressCallback | None = None) -> RecipeRecord:
    """Run the LLM step on an already-scraped page."""
    return _structure_and_save(
        raw_text=page.raw_text,
        source_hint="a scraped recipe webpage",
        source_type="website",
        source_url=page.url,
        extraction_method=page.extraction_method,
        expected_ingredient_count=page.expected_ingredient_count,
        on_progress=on_progress,
    )


def ingest_website(url: str, on_progress: ProgressCallback | None = None) -> RecipeRecord:
    """Extract a structured recipe from a recipe website URL."""
    return structure_scraped_page(scrape_website(url, on_progress), on_progress)


def ingest_text(text: str, reference: str | None = None, on_progress: ProgressCallback | None = None) -> RecipeRecord:
    """Extract a structured recipe from unstructured text the user pasted in
    (e.g. an ingredient list copied from anywhere). `reference` is an optional
    URL to record as the recipe's origin."""
    text = text.strip()
    if len(text) < MIN_PASTED_TEXT_CHARS:
        raise EmptyRecipeTextError(
            f"Recipe text is too short ({len(text)} chars); paste the full ingredient list/steps."
        )
    return _structure_and_save(
        raw_text=text,
        source_hint="user-pasted unstructured recipe text",
        source_type="text",
        source_url=reference,
        extraction_method="pasted_text",
        on_progress=on_progress,
    )


def _structure_and_save(
    *,
    raw_text: str,
    source_hint: str,
    source_type: SourceType,
    source_url: str | None,
    extraction_method: ExtractionMethod,
    expected_ingredient_count: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> RecipeRecord:
    truncated = len(raw_text) > MAX_RAW_TEXT_CHARS
    text_for_llm = raw_text[:MAX_RAW_TEXT_CHARS] if truncated else raw_text

    recipe, generation_meta = extract_recipe(
        text_for_llm,
        source_hint,
        build_reference_line(source_url),
        expected_ingredient_count=expected_ingredient_count,
        on_progress=on_progress,
    )
    repair_attempted = generation_meta.pop("repair_attempted")
    validation_warnings = generation_meta.pop("validation_warnings")

    record = RecipeRecord(
        metadata=ExtractionMetadata(
            source_type=source_type,
            source_url=source_url,
            resolved_url=source_url,
            extraction_method=extraction_method,
            extracted_at=utc_now(),
            llm_model=settings.ollama_model,
            llm_generation_params=generation_meta,
            repair_attempted=repair_attempted,
            raw_source_text=text_for_llm,
            raw_source_text_truncated=truncated,
            validation_warnings=validation_warnings,
        ),
        recipe=recipe,
    )
    save_recipe(record)
    return record
