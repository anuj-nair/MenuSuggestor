import sys
from pathlib import Path
from typing import Optional

import typer
from rich.console import Console
from rich.table import Table

from .llm.gemma import OllamaConnectionError, RecipeExtractionError
from .pipeline import EmptyRecipeTextError, ingest_text, ingest_website
from .sources.website import WebsiteScrapeError
from .storage import AmbiguousRecipeIdError, RecipeNotFoundError, list_recipes, load_recipe

app = typer.Typer(help="Experimental recipe ingestion CLI")
console = Console()


def _print_recipe(record) -> None:
    recipe = record.recipe
    console.print(f"\n[bold]{recipe.name}[/bold]  [dim]({record.id})[/dim]")
    meta = record.metadata
    console.print(f"[dim]{meta.source_url or 'pasted text'} · {meta.extraction_method}[/dim]")
    if recipe.cuisines:
        console.print(f"Cuisines: {', '.join(recipe.cuisines)}")
    if recipe.meal_types:
        console.print(f"Meal types: {', '.join(recipe.meal_types)}")
    if recipe.servings:
        console.print(f"Servings: {recipe.servings}")
    if recipe.total_time_minutes:
        console.print(f"Total time: {recipe.total_time_minutes} min")

    has_groups = any(ing.group for ing in recipe.ingredients)
    table = Table(title="Ingredients")
    if has_groups:
        table.add_column("Group")
    table.add_column("Ingredient")
    table.add_column("Qty")
    table.add_column("Unit")
    for ing in recipe.ingredients:
        row = [ing.name, f"{ing.quantity:g}" if ing.quantity is not None else "", ing.unit or ""]
        table.add_row(*([ing.group or ""] if has_groups else []), *row)
    console.print(table)

    console.print("[bold]Instructions[/bold]")
    if not recipe.instructions:
        console.print("  [dim](none in source)[/dim]")
    for i, step in enumerate(recipe.instructions, start=1):
        console.print(f"  {i}. {step}")

    if recipe.notes:
        console.print(f"\n[dim]Notes: {recipe.notes}[/dim]")
    if recipe.confidence_notes:
        console.print(f"[yellow]Confidence notes: {recipe.confidence_notes}[/yellow]")


@app.command("ingest-website")
def ingest_website_cmd(url: str) -> None:
    """Extract a structured recipe from a recipe website URL."""
    _run_ingest(lambda: ingest_website(url))


@app.command("ingest-text")
def ingest_text_cmd(
    file: Optional[Path] = typer.Argument(
        None, help="Text file containing the recipe. Reads stdin if omitted (e.g. `pbpaste | recipe-ingest ingest-text`)."
    ),
    reference: Optional[str] = typer.Option(None, "--reference", "-r", help="Optional URL the text came from."),
) -> None:
    """Extract a structured recipe from pasted, unstructured recipe text."""
    if file is not None:
        text = file.read_text(encoding="utf-8")
    else:
        if sys.stdin.isatty():
            console.print("[dim]Paste the recipe text, then press Ctrl-D:[/dim]")
        text = sys.stdin.read()
    _run_ingest(lambda: ingest_text(text, reference=reference))


def _run_ingest(ingest) -> None:
    try:
        record = ingest()
    except WebsiteScrapeError as exc:
        console.print(f"[red]Could not scrape website:[/red] {exc}")
        raise typer.Exit(code=1)
    except EmptyRecipeTextError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(code=1)
    except OllamaConnectionError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(code=1)
    except RecipeExtractionError as exc:
        console.print(f"[red]Gemma failed to produce valid structured output:[/red] {exc}")
        raise typer.Exit(code=1)

    console.print(f"[green]Saved recipe {record.id}[/green]")
    _print_recipe(record)


@app.command("show")
def show_cmd(recipe_id: str) -> None:
    """Pretty-print a stored recipe by id (or unambiguous id prefix)."""
    try:
        record = load_recipe(recipe_id)
    except RecipeNotFoundError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(code=1)
    except AmbiguousRecipeIdError as exc:
        console.print(f"[red]{exc}[/red]")
        raise typer.Exit(code=1)

    _print_recipe(record)


@app.command("list")
def list_cmd() -> None:
    """List all stored recipes."""
    summaries = list_recipes()
    if not summaries:
        console.print("[dim]No recipes stored yet.[/dim]")
        return

    table = Table(title="Stored recipes")
    table.add_column("ID")
    table.add_column("Name")
    table.add_column("Source")
    table.add_column("Extracted at")
    for s in summaries:
        table.add_row(s.id[:8], s.name, s.source_type, s.extracted_at.isoformat())
    console.print(table)


if __name__ == "__main__":
    app()
