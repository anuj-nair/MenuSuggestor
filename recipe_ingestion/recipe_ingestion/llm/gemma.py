import json
import re
from typing import Callable

import requests

from ..config import settings
from ..schema import Recipe
from .prompts import SYSTEM_INSTRUCTION, build_extraction_prompt, build_repair_prompt


class RecipeExtractionError(Exception):
    def __init__(self, message: str, raw_outputs: list[str]):
        super().__init__(message)
        self.raw_outputs = raw_outputs


class OllamaConnectionError(Exception):
    pass


ProgressCallback = Callable[[str], None]


def _chat(messages: list[dict], generation_params: dict) -> str:
    """Call a local Ollama server's chat endpoint. Ollama handles model
    loading/warm-keeping itself -- there's no separate load step."""
    try:
        resp = requests.post(
            f"{settings.ollama_host}/api/chat",
            json={
                "model": settings.ollama_model,
                "messages": messages,
                "stream": False,
                "think": settings.ollama_think,
                # Constrains decoding to valid JSON, so the output is never prose or fenced.
                "format": "json",
                "options": {
                    "temperature": generation_params["temperature"],
                    "num_predict": generation_params["max_new_tokens"],
                },
            },
            timeout=300,
        )
        resp.raise_for_status()
    except requests.RequestException as exc:
        raise OllamaConnectionError(
            f"Could not reach Ollama at {settings.ollama_host} "
            f"(is `ollama serve` running, and is model {settings.ollama_model!r} pulled?): {exc}"
        ) from exc
    body = resp.json()
    if body.get("done_reason") == "length":
        # A repair pass would hit the same limit, so fail fast with the fix.
        raise RecipeExtractionError(
            f"The model ran out of output space ({generation_params['max_new_tokens']} tokens) before finishing "
            "the recipe. Increase MAX_NEW_TOKENS in recipe_ingestion/.env and retry.",
            raw_outputs=[body["message"]["content"]],
        )
    return body["message"]["content"]


def extract_recipe(
    raw_text: str,
    source_hint: str,
    reference_line: str,
    expected_ingredient_count: int | None = None,
    on_progress: ProgressCallback | None = None,
) -> tuple[Recipe, dict]:
    """Build the extraction prompt, generate via Ollama, and validate the
    model's JSON output against the Recipe schema plus the content checks in
    validate_recipe(). On any failure, run one repair pass feeding the
    problems back to the model.

    Hard failures (unparseable JSON / schema violations) on both passes raise
    RecipeExtractionError with both raw outputs attached. If only the content
    checks still fail after the repair pass, the recipe is kept and the
    problems are reported as warnings, so a nearly-right recipe isn't lost.

    Returns (Recipe, generation_metadata) where generation_metadata includes
    the generation params used, whether the repair pass was needed, and any
    remaining validation warnings.

    on_progress, if given, is called with "structure" before generating,
    "check" before validating, and "repair" before the repair pass.
    """
    progress = on_progress or (lambda stage: None)
    generation_params = {
        "max_new_tokens": settings.max_new_tokens,
        "temperature": settings.llm_temperature,
    }

    def attempt(output: str) -> tuple[Recipe | None, list[str]]:
        try:
            recipe = Recipe.model_validate(_extract_json_block(output))
        except (json.JSONDecodeError, ValueError) as exc:
            return None, [str(exc)]
        _set_reference_line(recipe, reference_line)
        return recipe, validate_recipe(recipe, raw_text, reference_line, expected_ingredient_count)

    messages = [
        {"role": "system", "content": SYSTEM_INSTRUCTION},
        {"role": "user", "content": build_extraction_prompt(raw_text, source_hint, reference_line)},
    ]
    progress("structure")
    first_output = _chat(messages, generation_params)
    progress("check")
    first_recipe, first_problems = attempt(first_output)
    if first_recipe is not None and not first_problems:
        return first_recipe, {**generation_params, "repair_attempted": False, "validation_warnings": []}

    repair_messages = messages + [
        {"role": "assistant", "content": first_output},
        {
            "role": "user",
            "content": build_repair_prompt(
                first_output, "\n".join(f"- {p}" for p in first_problems), reference_line
            ),
        },
    ]
    progress("repair")
    try:
        second_output = _chat(repair_messages, generation_params)
    except RecipeExtractionError:
        # e.g. the repair ran out of output space; a parsed first attempt is
        # still worth keeping (with its problems as warnings) over nothing.
        if first_recipe is None:
            raise
        second_output = ""
    second_recipe, second_problems = attempt(second_output) if second_output else (None, first_problems)

    if second_recipe is not None:
        recipe, warnings = second_recipe, second_problems
    elif first_recipe is not None:
        recipe, warnings = first_recipe, first_problems
    else:
        raise RecipeExtractionError(
            f"Ollama output failed schema validation twice: {second_problems[0]}",
            raw_outputs=[first_output, second_output],
        )

    if warnings:
        extra = "Automatic checks flagged: " + "; ".join(warnings)
        recipe.confidence_notes = f"{recipe.confidence_notes}\n{extra}" if recipe.confidence_notes else extra
    return recipe, {**generation_params, "repair_attempted": True, "validation_warnings": warnings}


def _set_reference_line(recipe: Recipe, reference_line: str) -> None:
    """Put the exact reference line first in notes. We already know it, and
    the model often alters it slightly (e.g. drops a trailing slash), which
    isn't worth a whole repair pass."""
    lines = (recipe.notes or "").splitlines()
    if lines and lines[0].strip().lower().startswith("reference:"):
        lines = lines[1:]
    recipe.notes = "\n".join([reference_line, *lines]).strip()


_UNICODE_FRACTIONS = {
    "½": "1/2", "⅓": "1/3", "⅔": "2/3", "¼": "1/4", "¾": "3/4", "⅕": "1/5",
    "⅛": "1/8", "⅜": "3/8", "⅝": "5/8", "⅞": "7/8", "⁄": "/",
}


def _normalize_for_match(text: str) -> str:
    for glyph, ascii_fraction in _UNICODE_FRACTIONS.items():
        text = text.replace(glyph, ascii_fraction)
    return re.sub(r"[^a-z0-9/]", "", text.lower())


def validate_recipe(
    recipe: Recipe,
    source_text: str,
    reference_line: str,
    expected_ingredient_count: int | None = None,
) -> list[str]:
    """Content checks the JSON schema can't express. Returns a list of
    human-readable problems (empty if the recipe looks right)."""
    problems: list[str] = []
    if not recipe.name.strip():
        problems.append('"name" is empty.')
    if not recipe.ingredients:
        problems.append('"ingredients" is empty; the source text lists ingredients.')
    if not (recipe.notes or "").startswith(reference_line):
        problems.append(f'"notes" must start with the exact line: {reference_line}')

    normalized_source = _normalize_for_match(source_text)
    for ing in recipe.ingredients:
        normalized_line = _normalize_for_match(ing.raw_text)
        if not normalized_line or normalized_line not in normalized_source:
            problems.append(
                f"Ingredient raw_text {ing.raw_text!r} does not appear in the source text "
                "(it must be copied exactly; remove it if it was invented)."
            )

    if expected_ingredient_count is not None and len(recipe.ingredients) != expected_ingredient_count:
        problems.append(
            f"The source lists {expected_ingredient_count} ingredient lines but the output has "
            f"{len(recipe.ingredients)}; include each ingredient line exactly once."
        )
    return problems


def _extract_json_block(text: str) -> dict:
    """Strip stray markdown fences/prose and locate the first balanced
    {...} object in the model's raw output, then json.loads it."""
    stripped = text.strip()
    stripped = re.sub(r"^```(?:json)?", "", stripped).strip()
    stripped = re.sub(r"```$", "", stripped).strip()

    start = stripped.find("{")
    if start == -1:
        raise json.JSONDecodeError("No JSON object found in model output", stripped, 0)

    depth = 0
    for i, ch in enumerate(stripped[start:], start=start):
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return json.loads(stripped[start : i + 1])

    raise json.JSONDecodeError("Unbalanced braces in model output", stripped, start)
