"""Per-token pricing lookup for cost estimation on the admin dashboard.

Prices are USD per 1M tokens, taken from each provider's public rate card. A provider row in
the DB may override these via the `input_price_per_1m` / `output_price_per_1m` columns; the
table below is the fallback when no override is set.

Matching is longest-prefix on the lowercased model id within the provider's own entry, so
"gpt-4o-mini-2024-07-18" matches the "gpt-4o-mini" row. Keep entries in descending specificity
so longer keys appear before their shorter siblings.
"""
from typing import Optional


# provider_type -> list of (model_prefix, input_usd_per_1m, output_usd_per_1m)
# Order matters: longer/more-specific prefixes first.
_FALLBACK: dict[str, list[tuple[str, float, float]]] = {
    "openai": [
        ("gpt-4o-mini", 0.15, 0.60),
        ("gpt-4o", 2.50, 10.00),
        ("gpt-4-turbo", 10.00, 30.00),
        ("gpt-4.1-mini", 0.40, 1.60),
        ("gpt-4.1-nano", 0.10, 0.40),
        ("gpt-4.1", 2.00, 8.00),
        ("gpt-4", 30.00, 60.00),
        ("gpt-3.5", 0.50, 1.50),
        ("gpt-5-search", 2.50, 10.00),
        ("gpt-5-mini", 0.25, 2.00),
        ("gpt-5-nano", 0.05, 0.40),
        ("gpt-5", 1.25, 10.00),
        ("o4-mini", 1.10, 4.40),
        ("o3-mini", 1.10, 4.40),
        ("o3", 2.00, 8.00),
        ("o1-mini", 3.00, 12.00),
        ("o1", 15.00, 60.00),
    ],
    "anthropic": [
        ("claude-3-5-haiku", 0.80, 4.00),
        ("claude-3-5-sonnet", 3.00, 15.00),
        ("claude-3-haiku", 0.25, 1.25),
        ("claude-3-opus", 15.00, 75.00),
        ("claude-3-sonnet", 3.00, 15.00),
        ("claude-haiku-4-5", 1.00, 5.00),
        ("claude-sonnet-4-5", 3.00, 15.00),
        ("claude-sonnet-4-6", 3.00, 15.00),
        ("claude-opus-4-6", 15.00, 75.00),
        ("claude-opus-4-7", 15.00, 75.00),
        ("claude-sonnet-4", 3.00, 15.00),
        ("claude-opus-4", 15.00, 75.00),
    ],
    "gemini": [
        ("gemini-2.5-pro", 1.25, 10.00),
        ("gemini-2.5-flash", 0.15, 0.60),
        ("gemini-2.0-flash", 0.10, 0.40),
        ("gemini-1.5-pro", 1.25, 5.00),
        ("gemini-1.5-flash", 0.075, 0.30),
        ("imagen", 0.0, 0.0),  # image-only, priced per image not per token
    ],
    "groq": [
        ("llama-3.3-70b", 0.59, 0.79),
        ("llama-3.1-70b", 0.59, 0.79),
        ("llama-3.1-8b", 0.05, 0.08),
        ("llama-3-70b", 0.59, 0.79),
        ("llama-3-8b", 0.05, 0.08),
        ("mixtral-8x7b", 0.24, 0.24),
        ("gemma", 0.10, 0.10),
    ],
}


def resolve_prices(
    provider_type: str,
    model_id: Optional[str],
    input_override: Optional[float],
    output_override: Optional[float],
) -> tuple[Optional[float], Optional[float], str]:
    """Return (input_price_per_1m, output_price_per_1m, source).

    source is one of: "override" (admin-set), "default" (matched in fallback table),
    or "unknown" (no match — prices are None).
    """
    if input_override is not None and output_override is not None:
        return input_override, output_override, "override"

    pt = (provider_type or "").lower()
    mid = (model_id or "").lower()
    candidates = _FALLBACK.get(pt, [])
    for prefix, inp, outp in candidates:
        if mid.startswith(prefix):
            # Overrides for one side but not the other: honor the set side, fall back for the missing.
            final_in = input_override if input_override is not None else inp
            final_out = output_override if output_override is not None else outp
            source = "override" if (input_override is not None or output_override is not None) else "default"
            return final_in, final_out, source

    # No match in fallback; if any override is set use it, else unknown.
    if input_override is not None or output_override is not None:
        return input_override, output_override, "override"
    return None, None, "unknown"


def compute_cost_usd(
    prompt_tokens: int,
    completion_tokens: int,
    input_price_per_1m: Optional[float],
    output_price_per_1m: Optional[float],
) -> Optional[float]:
    """Compute cost in USD. Returns None if either price is unknown."""
    if input_price_per_1m is None or output_price_per_1m is None:
        return None
    return (prompt_tokens * input_price_per_1m + completion_tokens * output_price_per_1m) / 1_000_000.0
