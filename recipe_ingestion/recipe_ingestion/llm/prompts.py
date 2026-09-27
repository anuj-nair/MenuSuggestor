SYSTEM_INSTRUCTION = """You are a recipe-structuring assistant. You convert messy, unstructured \
text (a scraped recipe webpage, or recipe text a user pasted in) into a single, strict JSON \
object describing ONE recipe.

Output ONLY the JSON object. No markdown code fences, no explanations, no leading or \
trailing text of any kind — your entire response must be valid JSON that can be parsed \
directly by json.loads().

The JSON object must have exactly these top-level keys:
{
  "name": string (the recipe title as written in the source, in Title Case),
  "notes": string,
  "meal_types": array of strings, each one of: "salad", "rice", "roti", "pasta", "noodle", "soup", "grain", "free",
  "cuisines": array of strings (lowercase, e.g. "italian", "indian", "mexican"),
  "servings": integer or null,
  "ingredients": array of objects, each: {"name": string, "quantity": number or null, "unit": string or null, "tags": array of strings, "group": string or null, "raw_text": string},
  "instructions": array of strings, each one discrete step (NEVER a single paragraph blob — split multi-step sentences into separate array entries, in order),
  "total_time_minutes": integer or null,
  "confidence_notes": string or null (note here anything ambiguous or estimated, e.g. unclear quantities)
}

Rules:
- The source text describes ONE recipe. Section headings inside it (e.g. "Chicken", "Sauce", \
"For the dressing") are ingredient groups of that one recipe, NOT separate recipes. Put the \
heading in each ingredient's "group"; use null when the ingredients have no headings.
- Extract ONLY what the source text says. Never invent ingredients or steps. If the source has \
no instructions, return "instructions": [] and say so in "confidence_notes".
- Every ingredient line in the source must appear once in "ingredients" (the same ingredient \
may appear in two groups — keep both). "raw_text" must be the ingredient line copied exactly \
as written in the source.
- Ignore page noise: cookie/consent notices, ads, newsletter prompts, comments, "jump to \
recipe" links, nutrition disclaimers, and other recipes mentioned on the page.
- "quantity" is a plain number: convert fractions (½ -> 0.5, 1 ½ -> 1.5, ¼ -> 0.25). For a \
range like "2-3" use the lower number and mention it in "confidence_notes". Units go in \
"unit" (e.g. "tbsp", "cup", "g"); use null for countable items with no unit (e.g. "3 eggs").
- "name" is the ingredient itself, lowercase, without prep notes (e.g. "garlic", not \
"4 cloves garlic (minced)").
- "notes" MUST begin with the exact reference line given to you, followed by a newline, then \
any other free-text notes (or nothing else if there are none).
- "meal_types" must contain only values from the allowed list above; infer the best fit(s) from the dish.
- If a field is genuinely unknown, use null (for scalars) or an empty array (for lists) — never omit a key."""


def build_reference_line(reference_url: str | None) -> str:
    return f"Reference: {reference_url}" if reference_url else "Reference: pasted text"


_WEBSITE_EXAMPLE = (
    '{"name": "Garlic Butter Shrimp Pasta", "notes": "Reference: '
    'https://example.com/recipe\\nQuick weeknight dinner.", "meal_types": ["pasta"], '
    '"cuisines": ["italian"], "servings": 4, "ingredients": [{"name": "shrimp", '
    '"quantity": 1.0, "unit": "lb", "tags": ["seafood"], "group": null, '
    '"raw_text": "1 lb shrimp, peeled"}], '
    '"instructions": ["Melt butter in a large skillet over medium heat.", '
    '"Add garlic and cook until fragrant, about 30 seconds."], "total_time_minutes": 20, '
    '"confidence_notes": null}'
)

_GROUPED_SOURCE_EXAMPLE = """Rice
1 cup basmati rice
Dal
½ cup red lentils
1 tsp turmeric"""

_GROUPED_EXAMPLE = (
    '{"name": "Dal and Rice", "notes": "Reference: pasted text", "meal_types": ["rice"], '
    '"cuisines": ["indian"], "servings": null, "ingredients": ['
    '{"name": "basmati rice", "quantity": 1.0, "unit": "cup", "tags": ["grain"], '
    '"group": "Rice", "raw_text": "1 cup basmati rice"}, '
    '{"name": "red lentils", "quantity": 0.5, "unit": "cup", "tags": ["legume"], '
    '"group": "Dal", "raw_text": "½ cup red lentils"}, '
    '{"name": "turmeric", "quantity": 1.0, "unit": "tsp", "tags": ["spice"], '
    '"group": "Dal", "raw_text": "1 tsp turmeric"}], '
    '"instructions": [], "total_time_minutes": null, '
    '"confidence_notes": "No instructions were given in the source text."}'
)


def build_extraction_prompt(raw_text: str, source_hint: str, reference_line: str) -> str:
    return f"""Source: {source_hint}
Reference line to use verbatim as the first line of "notes": {reference_line}

--- SOURCE TEXT START ---
{raw_text}
--- SOURCE TEXT END ---

Example 1 of the exact JSON shape expected (values are illustrative only, use the real source text above):
{_WEBSITE_EXAMPLE}

Example 2, for grouped ingredients with no instructions. Given this source text:
{_GROUPED_SOURCE_EXAMPLE}
the output would be:
{_GROUPED_EXAMPLE}

Now produce the JSON object for the ONE recipe described in the source text above."""


def build_repair_prompt(bad_output: str, error_message: str, reference_line: str) -> str:
    return f"""Your previous response was not valid.

Reference line to use verbatim as the first line of "notes": {reference_line}

Your previous output was:
--- PREVIOUS OUTPUT START ---
{bad_output}
--- PREVIOUS OUTPUT END ---

The problems were:
{error_message}

Fix these problems using only information from the original source text, and respond again \
with ONLY the corrected, valid JSON object — no markdown fences, no commentary, nothing else."""
