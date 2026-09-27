import io
import json

from recipe_ingestion import bridge
from recipe_ingestion.llm.gemma import OllamaConnectionError, RecipeExtractionError
from recipe_ingestion.pipeline import ScrapedPage
from recipe_ingestion.schema import ExtractionMetadata, Recipe, RecipeRecord, utc_now


def _record():
    return RecipeRecord(
        metadata=ExtractionMetadata(
            source_type="text",
            extraction_method="pasted_text",
            extracted_at=utc_now(),
            llm_model="test",
            raw_source_text="x",
        ),
        recipe=Recipe(name="Tofu Rice Bowl", meal_types=["rice"], ingredients=[], instructions=[]),
    )


def _run(monkeypatch, capsys, request):
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(request)))
    code = bridge.main()
    events = [json.loads(line) for line in capsys.readouterr().out.splitlines()]
    return code, events


def test_text_request_streams_progress_then_result(monkeypatch, capsys):
    seen = {}

    def fake_ingest_text(text, reference=None, on_progress=None):
        seen.update(text=text, reference=reference)
        on_progress("structure")
        on_progress("check")
        return _record()

    monkeypatch.setattr(bridge, "ingest_text", fake_ingest_text)
    code, events = _run(monkeypatch, capsys, {"source": "text", "text": "some recipe", "reference": "https://x"})

    assert code == 0
    assert [e.get("stage") for e in events[:-1]] == ["structure", "check"]
    assert events[-1]["type"] == "result"
    assert events[-1]["record"]["recipe"]["name"] == "Tofu Rice Bowl"
    assert seen == {"text": "some recipe", "reference": "https://x"}


def test_url_request_emits_scraped_page_before_llm_failure(monkeypatch, capsys):
    page = ScrapedPage("https://example.com", "Ingredients: tofu", "website_structured", 1)
    monkeypatch.setattr(bridge, "scrape_website", lambda url, on_progress: page)

    def fail(page, on_progress):
        raise RecipeExtractionError("bad json", raw_outputs=[])

    monkeypatch.setattr(bridge, "structure_scraped_page", fail)
    code, events = _run(monkeypatch, capsys, {"source": "url", "url": "https://example.com"})

    assert code == 1
    assert events[0] == {
        "type": "scraped",
        "scraped": {
            "url": "https://example.com",
            "raw_text": "Ingredients: tofu",
            "extraction_method": "website_structured",
            "expected_ingredient_count": 1,
        },
    }
    assert events[-1] == {"type": "error", "error": "bad json", "code": "EXTRACTION_FAILED"}


def test_scraped_request_retries_llm_step_without_fetching(monkeypatch, capsys):
    received = {}

    def fake_structure(page, on_progress):
        received["page"] = page
        return _record()

    monkeypatch.setattr(bridge, "structure_scraped_page", fake_structure)
    monkeypatch.setattr(bridge, "scrape_website", lambda *a: (_ for _ in ()).throw(AssertionError("fetched")))
    scraped = {"url": "https://x", "raw_text": "t", "extraction_method": "website_raw_fallback", "expected_ingredient_count": None}
    code, events = _run(monkeypatch, capsys, {"source": "scraped", "scraped": scraped})

    assert code == 0
    assert received["page"] == ScrapedPage(**scraped)
    assert events[-1]["type"] == "result"


def test_known_error_maps_to_code(monkeypatch, capsys):
    def boom(text, reference=None, on_progress=None):
        raise OllamaConnectionError("Ollama is not running")

    monkeypatch.setattr(bridge, "ingest_text", boom)
    code, events = _run(monkeypatch, capsys, {"source": "text", "text": "x"})

    assert code == 1
    assert events == [{"type": "error", "error": "Ollama is not running", "code": "LLM_UNAVAILABLE"}]


def test_unknown_source_is_bad_request(monkeypatch, capsys):
    code, events = _run(monkeypatch, capsys, {"source": "fax"})
    assert code == 1
    assert events[-1]["code"] == "BAD_REQUEST"
