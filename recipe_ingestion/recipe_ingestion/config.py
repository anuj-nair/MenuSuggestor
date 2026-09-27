import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

_PACKAGE_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PACKAGE_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    ollama_host: str
    ollama_model: str
    output_dir: Path
    max_new_tokens: int
    llm_temperature: float
    ollama_think: bool


def _load_settings() -> Settings:
    output_dir_raw = os.environ.get("OUTPUT_DIR", "./output")
    output_dir = Path(output_dir_raw)
    if not output_dir.is_absolute():
        output_dir = _PACKAGE_ROOT / output_dir
    return Settings(
        ollama_host=os.environ.get("OLLAMA_HOST", "http://localhost:11434"),
        ollama_model=os.environ.get("OLLAMA_MODEL", "gemma4:e2b"),
        output_dir=output_dir,
        max_new_tokens=int(os.environ.get("MAX_NEW_TOKENS", "4096")),
        llm_temperature=float(os.environ.get("LLM_TEMPERATURE", "0.2")),
        # Thinking models (gemma4) otherwise spend part of MAX_NEW_TOKENS on hidden
        # reasoning, which can cut the JSON off mid-object; extraction doesn't need it.
        ollama_think=os.environ.get("OLLAMA_THINK", "false").lower() in ("1", "true", "yes"),
    )


settings = _load_settings()
