"""Adaptive chat-model routing.

The admin only supplies an API key + provider type. Users may optionally pick a
specific variant at chat time; otherwise we fall back to DEFAULT_CHAT_MODEL. On
each chat turn we inspect the user's text for intents (e.g. "needs web search")
and pass them to the adapter as options — the adapter either swaps to a capable
sibling model (OpenAI `*-search-preview`) or attaches a native tool (Anthropic
`web_search_20250305`, Gemini `google_search`).
"""
from __future__ import annotations

import re


# Per-provider-type default for chat when neither admin nor user chose a model.
DEFAULT_CHAT_MODEL: dict[str, str] = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-5",
    "gemini": "gemini-2.5-flash",
    "groq": "llama-3.3-70b-versatile",
}


# Per-provider-type default for image generation / editing.
DEFAULT_IMAGE_MODEL: dict[str, str] = {
    "openai": "gpt-image-1",
    "gemini": "imagen-4.0-generate-001",
}


def resolve_chat_model(provider_type: str, preferred: str | None) -> str:
    """Pick the model to send with a chat request.

    Precedence: user's per-message override → admin-stored default → per-type fallback.
    """
    if preferred:
        return preferred
    return DEFAULT_CHAT_MODEL.get(provider_type, "")


def resolve_image_model(provider_type: str, preferred: str | None) -> str:
    if preferred:
        return preferred
    return DEFAULT_IMAGE_MODEL.get(provider_type, "")


# English + Korean cues. Matched case-insensitively against the user's prompt
# to decide if we should enable a web-search tool / swap to a search-capable
# model. Kept short on purpose — false positives are cheap (the search model
# still answers normal questions), false negatives are what hurt.
_WEB_SEARCH_PATTERNS = [
    r"\bsearch (the )?web\b",
    r"\bweb search\b",
    r"\bgoogle\b",
    r"\blook (it |this )?up\b",
    r"\bfind (out |me )?(online|on the web)\b",
    r"\blatest\b",
    r"\brecent (news|events|updates)\b",
    r"\bcurrent (news|events|price|weather)\b",
    r"\btoday'?s?\b.*\b(news|price|weather|score|rate)\b",
    r"\bbreaking news\b",
    r"\bnews about\b",
    r"\bcite sources?\b",
    r"\bwith (sources|citations|references)\b",
    # Korean
    r"검색해",
    r"웹\s*검색",
    r"인터넷\s*(에서|으로|검색)",
    r"찾아\s*(줘|봐|주세요)",
    r"최신\s*(뉴스|소식|정보|기사|동향)",
    r"오늘\s*(의|)\s*(뉴스|날씨|환율|주가|시세)",
    r"실시간",
    r"구글링",
]

_WEB_SEARCH_RE = re.compile("|".join(_WEB_SEARCH_PATTERNS), re.IGNORECASE)


def detect_chat_options(user_text: str | None) -> dict:
    """Return a dict of adaptive options inferred from the user's message.

    Currently detects {"web_search": True} when the user seems to want fresh or
    external information. Extend here — not in each adapter — when adding new
    intent categories (e.g. "long_context", "code_execution").
    """
    opts: dict = {}
    if not user_text:
        return opts
    if _WEB_SEARCH_RE.search(user_text):
        opts["web_search"] = True
    return opts
