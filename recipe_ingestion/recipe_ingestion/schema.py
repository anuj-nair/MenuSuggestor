from datetime import datetime, timezone
from typing import Any, Literal
from uuid import uuid4

from pydantic import BaseModel, Field

MealType = Literal["salad", "rice", "roti", "pasta", "noodle", "soup", "grain", "free"]
SourceType = Literal["website", "text"]
ExtractionMethod = Literal["website_structured", "website_raw_fallback", "pasted_text"]


class ExtractionMetadata(BaseModel):
    source_type: SourceType
    source_url: str | None = None
    resolved_url: str | None = None
    extraction_method: ExtractionMethod
    extracted_at: datetime
    llm_model: str
    llm_generation_params: dict[str, Any] = Field(default_factory=dict)
    repair_attempted: bool = False
    raw_source_text: str
    raw_source_text_truncated: bool = False
    validation_warnings: list[str] = Field(default_factory=list)


class RecipeIngredient(BaseModel):
    name: str
    quantity: float | None = None
    unit: str | None = None
    tags: list[str] = Field(default_factory=list)
    group: str | None = None
    raw_text: str


class Recipe(BaseModel):
    name: str
    notes: str | None = None
    meal_types: list[MealType]
    cuisines: list[str] = Field(default_factory=list)
    servings: int | None = None
    ingredients: list[RecipeIngredient]
    instructions: list[str]
    total_time_minutes: int | None = None
    confidence_notes: str | None = None


class RecipeRecord(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid4()))
    metadata: ExtractionMetadata
    recipe: Recipe


class RecipeSummary(BaseModel):
    id: str
    name: str
    source_type: SourceType
    extracted_at: datetime


def utc_now() -> datetime:
    return datetime.now(timezone.utc)
