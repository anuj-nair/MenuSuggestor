import json

from recipe_ingestion import pipeline
from recipe_ingestion.llm import gemma
from recipe_ingestion.storage import load_recipe, save_recipe

PASTED = """Ingredients:

Pasta
200 g pasta (penne, fettuccine, or rigatoni)
1 ½ tbsp salt

Chicken
1 large chicken breast (about 250–300 g), sliced horizontally into 2 fillets
½ tsp garlic powder

Sauce
1 tsp garlic powder
2 cups (480 mL) heavy cream
"""


def _ing(name, qty, unit, group, raw):
    return {"name": name, "quantity": qty, "unit": unit, "tags": [], "group": group, "raw_text": raw}


GEMMA_OUTPUT = json.dumps(
    {
        "name": "Creamy Cajun Chicken Pasta",
        "notes": "Reference: pasted text",
        "meal_types": ["pasta"],
        "cuisines": ["italian"],
        "servings": None,
        "ingredients": [
            _ing("pasta", 200, "g", "Pasta", "200 g pasta (penne, fettuccine, or rigatoni)"),
            _ing("salt", 1.5, "tbsp", "Pasta", "1 ½ tbsp salt"),
            _ing("chicken breast", 1, None, "Chicken",
                 "1 large chicken breast (about 250–300 g), sliced horizontally into 2 fillets"),
            _ing("garlic powder", 0.5, "tsp", "Chicken", "½ tsp garlic powder"),
            _ing("garlic powder", 1, "tsp", "Sauce", "1 tsp garlic powder"),
            _ing("heavy cream", 2, "cups", "Sauce", "2 cups (480 mL) heavy cream"),
        ],
        "instructions": [],
        "total_time_minutes": None,
        "confidence_notes": "No instructions were given in the source text.",
    }
)


def test_pasted_text_becomes_one_grouped_recipe(monkeypatch, tmp_path):
    calls = []

    def fake_chat(messages, generation_params):
        calls.append(messages)
        return GEMMA_OUTPUT

    monkeypatch.setattr(gemma, "_chat", fake_chat)
    monkeypatch.setattr(pipeline, "save_recipe", lambda record: save_recipe(record, tmp_path))

    record = pipeline.ingest_text(PASTED)

    assert len(calls) == 1, "valid first output should not trigger a repair pass"
    assert record.metadata.source_type == "text"
    assert record.metadata.extraction_method == "pasted_text"
    assert record.metadata.source_url is None
    assert record.metadata.validation_warnings == []
    assert record.recipe.instructions == []
    assert {i.group for i in record.recipe.ingredients} == {"Pasta", "Chicken", "Sauce"}
    assert load_recipe(record.id, tmp_path) == record


def test_invented_ingredient_triggers_repair_then_warning(monkeypatch, tmp_path):
    bad = json.loads(GEMMA_OUTPUT)
    bad["ingredients"].append(_ing("parmesan", 50, "g", "Sauce", "50 g parmesan"))
    outputs = iter([json.dumps(bad), json.dumps(bad)])

    monkeypatch.setattr(gemma, "_chat", lambda messages, params: next(outputs))
    monkeypatch.setattr(pipeline, "save_recipe", lambda record: save_recipe(record, tmp_path))

    record = pipeline.ingest_text(PASTED)

    assert record.metadata.repair_attempted is True
    assert len(record.metadata.validation_warnings) == 1
    assert "50 g parmesan" in record.recipe.confidence_notes
