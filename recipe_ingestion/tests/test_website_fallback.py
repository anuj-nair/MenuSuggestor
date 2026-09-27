from pathlib import Path

from recipe_ingestion.sources.website import extract_visible_text

FIXTURE = Path(__file__).parent / "fixtures" / "sample_recipe_page.html"


def test_extract_visible_text_strips_nav_script_and_footer():
    html = FIXTURE.read_text(encoding="utf-8")
    text = extract_visible_text(html)

    assert "Grandma's Weeknight Chili" in text
    assert "1 lb ground beef" in text
    assert "Brown the ground beef with the onion" in text

    assert "tracking" not in text
    assert "Home | Recipes | About" not in text
    assert "Copyright 2026" not in text


NOISY_FIXTURE = Path(__file__).parent / "fixtures" / "noisy_recipe_page.html"


def test_extract_visible_text_keeps_only_recipe_card_on_noisy_page():
    text = extract_visible_text(NOISY_FIXTURE.read_text(encoding="utf-8"))

    assert "Sesame Noodles" in text
    assert "Sauce" in text
    assert "2 tbsp tahini" in text
    assert "Toss with the cooked noodles." in text

    assert "cookies" not in text
    assert "Buy cheap flights" not in text
    assert "Subscribe" not in text
    assert "added more garlic" not in text
    assert "Life story" not in text
