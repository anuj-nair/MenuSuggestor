from datetime import datetime, timezone

from recipe_ingestion.schema import ExtractionMetadata, Recipe, RecipeIngredient, RecipeRecord


def _make_record() -> RecipeRecord:
    return RecipeRecord(
        metadata=ExtractionMetadata(
            source_type="website",
            source_url="https://example.com/recipe",
            resolved_url="https://example.com/recipe",
            extraction_method="website_structured",
            extracted_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
            llm_model="gemma4:e2b",
            llm_generation_params={"max_new_tokens": 1024, "temperature": 0.2},
            raw_source_text="1 lb shrimp\nMelt butter...",
        ),
        recipe=Recipe(
            name="Garlic Butter Shrimp Pasta",
            notes="Reference: https://example.com/recipe",
            meal_types=["pasta"],
            cuisines=["italian"],
            servings=4,
            ingredients=[
                RecipeIngredient(name="shrimp", quantity=1.0, unit="lb", raw_text="1 lb shrimp"),
            ],
            instructions=["Melt butter in a skillet.", "Add shrimp and cook through."],
        ),
    )


def test_record_round_trips_through_json():
    record = _make_record()
    dumped = record.model_dump_json()
    reloaded = RecipeRecord.model_validate_json(dumped)
    assert reloaded == record


def test_invalid_meal_type_is_rejected():
    record = _make_record()
    payload = record.model_dump(mode="json")
    payload["recipe"]["meal_types"] = ["dessert"]
    try:
        RecipeRecord.model_validate(payload)
    except Exception:
        pass
    else:
        raise AssertionError("Expected validation error for an out-of-enum meal_type")


def test_text_record_without_url_and_with_groups_round_trips():
    record = _make_record()
    record.metadata.source_type = "text"
    record.metadata.source_url = None
    record.metadata.resolved_url = None
    record.metadata.extraction_method = "pasted_text"
    record.recipe.ingredients[0].group = "Sauce"
    reloaded = RecipeRecord.model_validate_json(record.model_dump_json())
    assert reloaded == record
    assert reloaded.recipe.ingredients[0].group == "Sauce"
