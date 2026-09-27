from recipe_ingestion.llm.gemma import validate_recipe
from recipe_ingestion.schema import Recipe, RecipeIngredient

SOURCE = """Chicken
1 large chicken breast (about 250–300 g), sliced horizontally into 2 fillets
½ tsp cayenne pepper
Sauce
1 ½ tbsp salt"""
REFERENCE = "Reference: pasted text"


def _recipe(*raw_lines: str, notes: str = REFERENCE) -> Recipe:
    return Recipe(
        name="Cajun Chicken Pasta",
        notes=notes,
        meal_types=["pasta"],
        ingredients=[RecipeIngredient(name="x", raw_text=line) for line in raw_lines],
        instructions=[],
    )


def test_grounded_recipe_has_no_problems():
    recipe = _recipe(
        "1 large chicken breast (about 250–300 g), sliced horizontally into 2 fillets",
        "½ tsp cayenne pepper",
        "1 ½ tbsp salt",
    )
    assert validate_recipe(recipe, SOURCE, REFERENCE, expected_ingredient_count=3) == []


def test_fraction_and_whitespace_differences_still_match():
    recipe = _recipe("1/2 tsp  cayenne pepper", "1½ TBSP salt")
    assert validate_recipe(recipe, SOURCE, REFERENCE) == []


def test_invented_ingredient_is_flagged():
    problems = validate_recipe(_recipe("½ tsp cayenne pepper", "2 cups heavy cream"), SOURCE, REFERENCE)
    assert len(problems) == 1
    assert "2 cups heavy cream" in problems[0]


def test_ingredient_count_mismatch_is_flagged():
    problems = validate_recipe(_recipe("½ tsp cayenne pepper"), SOURCE, REFERENCE, expected_ingredient_count=3)
    assert any("3 ingredient lines" in p for p in problems)


def test_missing_reference_line_is_flagged():
    problems = validate_recipe(_recipe("½ tsp cayenne pepper", notes="Tasty."), SOURCE, REFERENCE)
    assert any("Reference: pasted text" in p for p in problems)
