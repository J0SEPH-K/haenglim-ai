"""IP allowlist middleware.

When `app_settings.ip_restriction_enabled = True`, requests are blocked unless their
client IP falls inside an enabled `ip_allowlist` CIDR. Admin endpoints under
`/api/admin/*` are exempt so an admin can always reach the allowlist config from
anywhere — admin auth is the gate on those paths.

State is held in module-level variables behind a lock and refreshed on a short TTL
(so the DB isn't queried every request). Mutating endpoints call `invalidate()`
right after committing, which forces the next request to re-read state.
"""
import ipaddress
import os
import threading
import time
from typing import Optional

from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Receive, Scope, Send

from app.database import SessionLocal
from app.models.models import AppSettings, IPAllowlistEntry


_CACHE_TTL_SECONDS = 5

# Paths that bypass IP restriction even when it's on.
_EXEMPT_PREFIXES = (
    "/api/admin",  # admin endpoints already require admin auth and need to be reachable
                   # from anywhere so the allowlist itself can be managed remotely
)

# Module-level cache so write endpoints can invalidate it directly.
_cache_lock = threading.Lock()
_cache_ts: float = 0.0
_enabled: bool = False
_networks: list = []


def invalidate() -> None:
    """Force the next request to re-read settings + entries from the DB."""
    global _cache_ts
    with _cache_lock:
        _cache_ts = 0.0


def _trust_proxy() -> bool:
    return os.environ.get("TRUST_PROXY", "0").lower() in ("1", "true", "yes")


def _client_ip_from_scope(scope: Scope) -> Optional[str]:
    """Resolve the client IP from a raw ASGI scope, preferring X-Forwarded-For when TRUST_PROXY is set."""
    if _trust_proxy():
        for k, v in scope.get("headers", []):
            if k == b"x-forwarded-for" and v:
                return v.decode("latin-1").split(",")[0].strip()
    client = scope.get("client")
    if client:
        return client[0]
    return None


def _client_ip_from_request(request) -> Optional[str]:
    """Request-based convenience wrapper used by the allowlist router's 'your_ip' endpoint."""
    return _client_ip_from_scope(request.scope)


def _refresh_if_stale() -> None:
    global _cache_ts, _enabled, _networks
    now = time.time()
    with _cache_lock:
        if now - _cache_ts < _CACHE_TTL_SECONDS:
            return
        try:
            db = SessionLocal()
            try:
                settings = db.query(AppSettings).filter(AppSettings.id == 1).first()
                _enabled = bool(settings and settings.ip_restriction_enabled)
                entries = db.query(IPAllowlistEntry).filter(IPAllowlistEntry.enabled == True).all()
                nets = []
                for e in entries:
                    try:
                        nets.append(ipaddress.ip_network(e.cidr, strict=False))
                    except ValueError:
                        continue
                _networks = nets
            finally:
                db.close()
        except Exception:
            # Fail open if the DB is unreachable so an infra blip doesn't lock everyone out.
            _enabled = False
            _networks = []
        _cache_ts = now


class IPRestrictionMiddleware:
    """Pure-ASGI IP allowlist.

    Implemented as raw ASGI (not BaseHTTPMiddleware) on purpose: BaseHTTPMiddleware
    buffers the whole response body before forwarding it, which breaks streaming
    responses (token-by-token chat). A pure-ASGI middleware passes `send` straight
    through, so streamed bodies are untouched. We only ever short-circuit *before*
    calling the inner app, so blocking a request never needs to wrap the response.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        method = scope.get("method", "")

        if method == "OPTIONS" or any(path.startswith(p) for p in _EXEMPT_PREFIXES):
            await self.app(scope, receive, send)
            return

        _refresh_if_stale()
        if not _enabled:
            await self.app(scope, receive, send)
            return

        blocked: Optional[JSONResponse] = None
        client_ip = _client_ip_from_scope(scope)
        if client_ip is None:
            blocked = JSONResponse(status_code=403, content={"detail": "Cannot determine client IP"})
        else:
            try:
                addr = ipaddress.ip_address(client_ip)
                allowed = any(addr.version == net.version and addr in net for net in _networks)
            except ValueError:
                allowed = False
                blocked = JSONResponse(status_code=403, content={"detail": f"Invalid client IP: {client_ip}"})
            if blocked is None and not allowed:
                blocked = JSONResponse(
                    status_code=403,
                    content={"detail": "Access blocked by IP restriction. Contact your administrator."},
                )

        if blocked is not None:
            await blocked(scope, receive, send)
            return

        await self.app(scope, receive, send)
