import json
from pathlib import Path

from .config import settings
from .schema import RecipeRecord, RecipeSummary


class RecipeNotFoundError(Exception):
    pass


class AmbiguousRecipeIdError(Exception):
    pass


def _recipes_dir(output_dir: Path) -> Path:
    d = output_dir / "recipes"
    d.mkdir(parents=True, exist_ok=True)
    return d


def save_recipe(record: RecipeRecord, output_dir: Path = settings.output_dir) -> Path:
    path = _recipes_dir(output_dir) / f"{record.id}.json"
    path.write_text(
        json.dumps(record.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    return path


def load_recipe(recipe_id: str, output_dir: Path = settings.output_dir) -> RecipeRecord:
    d = _recipes_dir(output_dir)
    exact = d / f"{recipe_id}.json"
    if exact.exists():
        return RecipeRecord.model_validate_json(exact.read_text(encoding="utf-8"))

    matches = sorted(d.glob(f"{recipe_id}*.json"))
    if not matches:
        raise RecipeNotFoundError(f"No stored recipe matches id {recipe_id!r}")
    if len(matches) > 1:
        ids = ", ".join(m.stem for m in matches)
        raise AmbiguousRecipeIdError(f"Id prefix {recipe_id!r} matches multiple recipes: {ids}")
    return RecipeRecord.model_validate_json(matches[0].read_text(encoding="utf-8"))


def list_recipes(output_dir: Path = settings.output_dir) -> list[RecipeSummary]:
    d = _recipes_dir(output_dir)
    summaries: list[RecipeSummary] = []
    for path in sorted(d.glob("*.json")):
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            summaries.append(
                RecipeSummary(
                    id=raw["id"],
                    name=raw["recipe"]["name"],
                    source_type=raw["metadata"]["source_type"],
                    extracted_at=raw["metadata"]["extracted_at"],
                )
            )
        except (json.JSONDecodeError, KeyError):
            continue
    summaries.sort(key=lambda s: s.extracted_at, reverse=True)
    return summaries
