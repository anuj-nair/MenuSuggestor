import pytest

from recipe_ingestion.llm import gemma


class _Resp:
    def __init__(self, body):
        self._body = body

    def raise_for_status(self):
        pass

    def json(self):
        return self._body


def test_chat_disables_thinking_and_requests_json(monkeypatch):
    sent = {}

    def fake_post(url, json, timeout):
        sent.update(json)
        return _Resp({"done_reason": "stop", "message": {"content": "{}"}})

    monkeypatch.setattr(gemma.requests, "post", fake_post)
    assert gemma._chat([], {"temperature": 0.2, "max_new_tokens": 100}) == "{}"
    assert sent["think"] is False
    assert sent["format"] == "json"


def test_chat_truncated_output_fails_fast_with_clear_message(monkeypatch):
    monkeypatch.setattr(
        gemma.requests,
        "post",
        lambda url, json, timeout: _Resp({"done_reason": "length", "message": {"content": '{"name": "x", "ingr'}}),
    )
    with pytest.raises(gemma.RecipeExtractionError, match="ran out of output space"):
        gemma._chat([], {"temperature": 0.2, "max_new_tokens": 100})


def _valid_output(notes):
    import json

    return json.dumps(
        {
            "name": "Tofu Rice",
            "notes": notes,
            "meal_types": ["rice"],
            "ingredients": [{"name": "tofu", "quantity": 200, "unit": "g", "raw_text": "200 g tofu"}],
            "instructions": [],
        }
    )


def test_altered_reference_line_is_fixed_without_repair_pass(monkeypatch):
    calls = []

    def fake_chat(messages, params):
        calls.append(messages)
        return _valid_output("Reference: https://example.com/tofu\nTasty.")

    monkeypatch.setattr(gemma, "_chat", fake_chat)
    recipe, meta = gemma.extract_recipe("200 g tofu", "hint", "Reference: https://example.com/tofu/")

    assert len(calls) == 1
    assert recipe.notes == "Reference: https://example.com/tofu/\nTasty."
    assert meta["repair_attempted"] is False


def test_truncated_repair_pass_keeps_first_recipe_with_warnings(monkeypatch):
    outputs = iter([_valid_output("Reference: pasted text")])

    def fake_chat(messages, params):
        try:
            return next(outputs)
        except StopIteration:
            raise gemma.RecipeExtractionError("ran out of output space", raw_outputs=[])

    monkeypatch.setattr(gemma, "_chat", fake_chat)
    # "200 g tofu" isn't in this source text, so validation fails and a repair runs.
    recipe, meta = gemma.extract_recipe("some other text", "hint", "Reference: pasted text")

    assert recipe.name == "Tofu Rice"
    assert meta["repair_attempted"] is True
    assert meta["validation_warnings"]
