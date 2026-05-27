import csv
import io
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
import httpx

from app.database import get_db
from app.models.models import User, Group, AIProvider, Message, Conversation
from app.schemas.users import UserCreate, UserUpdate, UserOut
from app.schemas.groups import GroupCreate, GroupUpdate, GroupOut
from app.schemas.providers import AIProviderCreate, AIProviderUpdate, AIProviderOut
from app.services.auth import hash_password
from app.utils.dependencies import require_admin
from app.utils.encryption import encrypt_api_key
from app.utils.pricing import resolve_prices, compute_cost_usd

router = APIRouter()


# ── Groups ──────────────────────────────────────────────────────────


def _group_out(g: Group) -> GroupOut:
    return GroupOut(
        id=g.id,
        name=g.name,
        created_at=g.created_at,
        user_count=len(g.users),
        token_limit=g.token_limit,
        price_limit_usd=g.price_limit_usd,
    )


@router.post("/groups", response_model=GroupOut, status_code=status.HTTP_201_CREATED)
def create_group(body: GroupCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(Group).filter(Group.name == body.name).first():
        raise HTTPException(status_code=400, detail="Group name already exists")
    group = Group(
        name=body.name,
        token_limit=body.token_limit if (body.token_limit or 0) > 0 else None,
        price_limit_usd=body.price_limit_usd if (body.price_limit_usd or 0) > 0 else None,
    )
    db.add(group)
    db.commit()
    db.refresh(group)
    return _group_out(group)


@router.get("/groups", response_model=list[GroupOut])
def list_groups(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    groups = db.query(Group).order_by(Group.name).all()
    return [_group_out(g) for g in groups]


@router.put("/groups/{group_id}", response_model=GroupOut)
def update_group(group_id: int, body: GroupUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if body.name is not None:
        if db.query(Group).filter(Group.name == body.name, Group.id != group_id).first():
            raise HTTPException(status_code=400, detail="Group name already exists")
        group.name = body.name
    if body.token_limit is not None:
        group.token_limit = body.token_limit if body.token_limit > 0 else None
    if body.price_limit_usd is not None:
        group.price_limit_usd = body.price_limit_usd if body.price_limit_usd > 0 else None
    db.commit()
    db.refresh(group)
    return _group_out(group)


@router.delete("/groups/{group_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_group(group_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    if group.users:
        raise HTTPException(status_code=400, detail="Cannot delete group with users")
    db.delete(group)
    db.commit()


# ── Users ───────────────────────────────────────────────────────────


def _user_out(u: User) -> UserOut:
    return UserOut(
        id=u.id,
        email=u.email,
        name=u.name,
        role=u.role,
        group_id=u.group_id,
        group_name=u.group.name if u.group else None,
        is_active=u.is_active,
        token_limit=u.token_limit,
        price_limit_usd=u.price_limit_usd,
        created_at=u.created_at,
    )


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_user(body: UserCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    if db.query(User).filter(User.email == body.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    if body.group_id:
        if not db.query(Group).filter(Group.id == body.group_id).first():
            raise HTTPException(status_code=400, detail="Group not found")
    user = User(
        email=body.email,
        password_hash=hash_password(body.password),
        name=body.name,
        role=body.role,
        group_id=body.group_id,
        token_limit=body.token_limit if (body.token_limit or 0) > 0 else None,
        price_limit_usd=body.price_limit_usd if (body.price_limit_usd or 0) > 0 else None,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.get("/users", response_model=list[UserOut])
def list_users(group_id: int | None = None, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    query = db.query(User)
    if group_id is not None:
        query = query.filter(User.group_id == group_id)
    users = query.order_by(User.created_at.desc()).all()
    return [_user_out(u) for u in users]


@router.put("/users/{user_id}", response_model=UserOut)
def update_user(user_id: int, body: UserUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if body.name is not None:
        user.name = body.name
    if body.password is not None:
        user.password_hash = hash_password(body.password)
    if body.role is not None:
        user.role = body.role
    if body.group_id is not None:
        if not db.query(Group).filter(Group.id == body.group_id).first():
            raise HTTPException(status_code=400, detail="Group not found")
        user.group_id = body.group_id
    if body.is_active is not None:
        user.is_active = body.is_active
    if body.token_limit is not None:
        user.token_limit = body.token_limit if body.token_limit > 0 else None
    if body.price_limit_usd is not None:
        user.price_limit_usd = body.price_limit_usd if body.price_limit_usd > 0 else None
    db.commit()
    db.refresh(user)
    return _user_out(user)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(user_id: int, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    user.is_active = False
    db.commit()


_REQUIRED_CSV_COLS = {"email", "name", "password"}
_OPTIONAL_CSV_COLS = {"group_name", "token_limit", "price_limit_usd", "role"}


@router.post("/users/bulk-csv")
async def bulk_create_users(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Bulk-create users from a CSV file.

    Required columns: email, name, password.
    Optional: group_name (must already exist), token_limit, price_limit_usd, role (user/admin).
    Returns per-row results so the admin can see which rows failed and why.
    """
    raw = await file.read()
    try:
        text = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        raise HTTPException(status_code=400, detail="CSV must be UTF-8 encoded")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV has no header row")
    fieldnames = {f.strip() for f in reader.fieldnames}
    missing = _REQUIRED_CSV_COLS - fieldnames
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required columns: {sorted(missing)}")

    # Pre-load groups so we can resolve names without N queries.
    groups_by_name = {g.name: g for g in db.query(Group).all()}
    existing_emails = {e for (e,) in db.query(User.email).all()}

    created = 0
    errors: list[dict] = []
    for line_num, row in enumerate(reader, start=2):  # row 1 is the header
        email = (row.get("email") or "").strip().lower()
        name = (row.get("name") or "").strip()
        password = (row.get("password") or "").strip()
        group_name = (row.get("group_name") or "").strip()
        token_limit_raw = (row.get("token_limit") or "").strip()
        price_limit_raw = (row.get("price_limit_usd") or "").strip()
        role = (row.get("role") or "user").strip().lower() or "user"

        if not email or not name or not password:
            errors.append({"line": line_num, "email": email, "error": "email, name, and password are required"})
            continue
        if email in existing_emails:
            errors.append({"line": line_num, "email": email, "error": "email already exists"})
            continue
        if role not in ("user", "admin"):
            errors.append({"line": line_num, "email": email, "error": f"invalid role: {role}"})
            continue
        group_id = None
        if group_name:
            g = groups_by_name.get(group_name)
            if not g:
                errors.append({"line": line_num, "email": email, "error": f"group not found: {group_name}"})
                continue
            group_id = g.id

        token_limit = None
        if token_limit_raw:
            try:
                v = int(token_limit_raw)
                if v > 0:
                    token_limit = v
            except ValueError:
                errors.append({"line": line_num, "email": email, "error": f"invalid token_limit: {token_limit_raw}"})
                continue
        price_limit = None
        if price_limit_raw:
            try:
                v = float(price_limit_raw)
                if v > 0:
                    price_limit = v
            except ValueError:
                errors.append({"line": line_num, "email": email, "error": f"invalid price_limit_usd: {price_limit_raw}"})
                continue

        u = User(
            email=email,
            password_hash=hash_password(password),
            name=name,
            role=role,
            group_id=group_id,
            token_limit=token_limit,
            price_limit_usd=price_limit,
        )
        db.add(u)
        existing_emails.add(email)  # so duplicates within the same CSV also error out cleanly
        created += 1

    db.commit()
    return {"created": created, "errors": errors}


# ── AI Providers ────────────────────────────────────────────────────


class ListModelsRequest(BaseModel):
    provider_type: str
    api_key: str


@router.post("/providers/list-models")
async def list_models(body: ListModelsRequest, _: User = Depends(require_admin)):
    """Fetch available models from a provider using the given API key."""
    try:
        if body.provider_type == "openai":
            models = await _fetch_openai_models(body.api_key)
        elif body.provider_type == "anthropic":
            models = await _fetch_anthropic_models(body.api_key)
        elif body.provider_type == "gemini":
            models = await _fetch_gemini_models(body.api_key)
        elif body.provider_type == "groq":
            models = await _fetch_groq_models(body.api_key)
        else:
            raise HTTPException(status_code=400, detail=f"Unknown provider type: {body.provider_type}")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to fetch models: {str(e)}")
    return {"models": models}


async def _fetch_openai_models(api_key: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.openai.com/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    return sorted(
        [{"id": m["id"], "name": m["id"]} for m in data["data"]],
        key=lambda m: m["id"],
    )


async def _fetch_anthropic_models(api_key: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.anthropic.com/v1/models",
            headers={
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    return sorted(
        [{"id": m["id"], "name": m.get("display_name", m["id"])} for m in data["data"]],
        key=lambda m: m["id"],
    )


async def _fetch_gemini_models(api_key: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"https://generativelanguage.googleapis.com/v1beta/models?key={api_key}",
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    models = []
    for m in data.get("models", []):
        model_id = m["name"].removeprefix("models/")
        if "generateContent" in m.get("supportedGenerationMethods", []):
            models.append({"id": model_id, "name": m.get("displayName", model_id)})
    return sorted(models, key=lambda m: m["id"])


async def _fetch_groq_models(api_key: str) -> list[dict]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            "https://api.groq.com/openai/v1/models",
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=15,
        )
        resp.raise_for_status()
        data = resp.json()
    return sorted(
        [{"id": m["id"], "name": m["id"]} for m in data["data"]],
        key=lambda m: m["id"],
    )


def _provider_out(p: AIProvider) -> AIProviderOut:
    return AIProviderOut(
        id=p.id,
        name=p.name,
        provider_type=p.provider_type,
        model_id=p.model_id,
        enabled=p.enabled,
        token_quota=p.token_quota,
        input_price_per_1m=p.input_price_per_1m,
        output_price_per_1m=p.output_price_per_1m,
        created_at=p.created_at,
    )


@router.post("/providers", response_model=AIProviderOut, status_code=status.HTTP_201_CREATED)
def create_provider(body: AIProviderCreate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    provider = AIProvider(
        name=body.name,
        provider_type=body.provider_type,
        api_key_encrypted=encrypt_api_key(body.api_key),
        # Admin no longer sets a specific model — users pick one at chat time,
        # and the messages router falls back to a per-provider-type default if nothing is picked.
        model_id=body.model_id or "",
        enabled=body.enabled,
        token_quota=body.token_quota,
        input_price_per_1m=body.input_price_per_1m,
        output_price_per_1m=body.output_price_per_1m,
    )
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return _provider_out(provider)


@router.get("/providers", response_model=list[AIProviderOut])
def list_providers(db: Session = Depends(get_db), _: User = Depends(require_admin)):
    providers = db.query(AIProvider).order_by(AIProvider.name).all()
    return [_provider_out(p) for p in providers]


@router.put("/providers/{provider_id}", response_model=AIProviderOut)
def update_provider(provider_id: int, body: AIProviderUpdate, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    provider = db.query(AIProvider).filter(AIProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    if body.name is not None:
        provider.name = body.name
    if body.api_key is not None:
        provider.api_key_encrypted = encrypt_api_key(body.api_key)
    if body.model_id is not None:
        provider.model_id = body.model_id
    if body.enabled is not None:
        provider.enabled = body.enabled
    if body.token_quota is not None:
        # Allow clearing via 0 or negative -> store None for "unlimited"
        provider.token_quota = body.token_quota if body.token_quota > 0 else None
    # Prices: negative means "clear override", 0 is a legitimate free tier.
    if body.input_price_per_1m is not None:
        provider.input_price_per_1m = body.input_price_per_1m if body.input_price_per_1m >= 0 else None
    if body.output_price_per_1m is not None:
        provider.output_price_per_1m = body.output_price_per_1m if body.output_price_per_1m >= 0 else None
    db.commit()
    db.refresh(provider)
    return _provider_out(provider)


@router.delete("/providers/{provider_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_provider(provider_id: int, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    provider = db.query(AIProvider).filter(AIProvider.id == provider_id).first()
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    db.delete(provider)
    db.commit()


# ── Dashboard ───────────────────────────────────────────────────────


@router.get("/dashboard")
def dashboard(days: int = 30, db: Session = Depends(get_db), _: User = Depends(require_admin)):
    """Return admin dashboard metrics: daily usage timeline, per-provider quota, and summary.

    - days: size of the rolling window (default 30).
    - timeline: one row per (date, provider_id, group_id) with prompt/completion/total tokens.
    - providers: each provider with tokens_used (all-time) + tokens_remaining relative to quota.
    - summary: counts and top lists computed over the window.
    """
    days = max(1, min(days, 365))
    now = datetime.now(timezone.utc)
    # start of the day, `days-1` days ago so the window is inclusive of today
    today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    window_start = today_start - timedelta(days=days - 1)

    # Per-provider × model lifetime totals. We price per model (not per provider default) because
    # users can override model_id per message.
    lifetime_rows = (
        db.query(
            Message.ai_provider_id,
            Message.model_id,
            func.coalesce(func.sum(Message.prompt_tokens), 0),
            func.coalesce(func.sum(Message.completion_tokens), 0),
        )
        .filter(Message.role == "assistant", Message.ai_provider_id.isnot(None))
        .group_by(Message.ai_provider_id, Message.model_id)
        .all()
    )

    # Resolve each provider's default-model prices once — for display on the provider tile.
    all_providers = db.query(AIProvider).order_by(AIProvider.name).all()
    provider_by_id: dict[int, AIProvider] = {p.id: p for p in all_providers}

    # Roll per-model rows up into per-provider aggregates: total tokens and sum-of-priced costs.
    provider_prompt: dict[int, int] = {}
    provider_completion: dict[int, int] = {}
    provider_cost: dict[int, float] = {}
    provider_cost_known: dict[int, bool] = {}
    for pid, mid, pp, cc in lifetime_rows:
        pp = int(pp or 0); cc = int(cc or 0)
        provider_prompt[pid] = provider_prompt.get(pid, 0) + pp
        provider_completion[pid] = provider_completion.get(pid, 0) + cc
        p = provider_by_id.get(pid)
        if not p:
            continue
        in_price, out_price, _ = resolve_prices(
            p.provider_type, mid or p.model_id, p.input_price_per_1m, p.output_price_per_1m
        )
        c = compute_cost_usd(pp, cc, in_price, out_price)
        if c is not None:
            provider_cost[pid] = provider_cost.get(pid, 0.0) + c
            provider_cost_known[pid] = True

    providers_out = []
    for p in all_providers:
        prompt_used = provider_prompt.get(p.id, 0)
        completion_used = provider_completion.get(p.id, 0)
        used = prompt_used + completion_used
        remaining = (p.token_quota - used) if p.token_quota is not None else None
        # Default-model prices are what the UI displays as the "current rate card"
        in_price, out_price, source = resolve_prices(
            p.provider_type, p.model_id, p.input_price_per_1m, p.output_price_per_1m
        )
        cost = round(provider_cost.get(p.id, 0.0), 4) if provider_cost_known.get(p.id) else None
        providers_out.append({
            "id": p.id,
            "name": p.name,
            "provider_type": p.provider_type,
            "model_id": p.model_id,
            "enabled": p.enabled,
            "token_quota": p.token_quota,
            "tokens_used": used,
            "tokens_remaining": remaining,
            "percent_used": (used / p.token_quota * 100.0) if p.token_quota else None,
            "input_price_per_1m": in_price,
            "output_price_per_1m": out_price,
            "price_source": source,  # "override" | "default" | "unknown"
            "cost_usd": cost,
            "input_price_override": p.input_price_per_1m,
            "output_price_override": p.output_price_per_1m,
        })

    # Daily timeline rows joined with conversation → user → group.
    date_expr = func.date(Message.created_at)
    rows = (
        db.query(
            date_expr.label("day"),
            Message.ai_provider_id,
            Message.model_id,
            User.group_id,
            func.coalesce(func.sum(Message.prompt_tokens), 0).label("prompt_tokens"),
            func.coalesce(func.sum(Message.completion_tokens), 0).label("completion_tokens"),
            func.count(Message.id).label("message_count"),
        )
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(User, Conversation.user_id == User.id)
        .filter(
            Message.role == "assistant",
            Message.created_at >= window_start,
        )
        .group_by(date_expr, Message.ai_provider_id, Message.model_id, User.group_id)
        .all()
    )

    # Build provider and group name lookups so the frontend doesn't need extra requests
    provider_names = {p.id: p.name for p in all_providers}
    group_names = {g.id: g.name for g in db.query(Group).all()}

    timeline = []
    window_cost_total = 0.0
    window_cost_known = False  # flip true once any row yields a price
    for r in rows:
        prompt_t = int(r.prompt_tokens or 0)
        completion_t = int(r.completion_tokens or 0)
        # Row-level cost: prefer the row's provider — but the row's model_id may differ from the
        # provider's default (model_override), so resolve per-row using the row's model + the
        # provider's overrides.
        row_cost = None
        if r.ai_provider_id and r.ai_provider_id in provider_by_id:
            p = provider_by_id[r.ai_provider_id]
            in_price, out_price, _ = resolve_prices(
                p.provider_type, r.model_id or p.model_id, p.input_price_per_1m, p.output_price_per_1m
            )
            row_cost = compute_cost_usd(prompt_t, completion_t, in_price, out_price)
        if row_cost is not None:
            window_cost_total += row_cost
            window_cost_known = True
        timeline.append({
            "date": r.day,  # "YYYY-MM-DD" string from sqlite's date()
            "provider_id": r.ai_provider_id,
            "provider_name": provider_names.get(r.ai_provider_id) or "—",
            "model_id": r.model_id,
            "group_id": r.group_id,
            "group_name": group_names.get(r.group_id) or "미지정",
            "prompt_tokens": prompt_t,
            "completion_tokens": completion_t,
            "total_tokens": prompt_t + completion_t,
            "message_count": int(r.message_count or 0),
            "cost_usd": row_cost,
        })

    # Summary
    window_totals = db.query(
        func.coalesce(func.sum(Message.prompt_tokens), 0),
        func.coalesce(func.sum(Message.completion_tokens), 0),
        func.count(Message.id),
    ).filter(
        Message.role == "assistant",
        Message.created_at >= window_start,
    ).one()

    today_totals = db.query(
        func.coalesce(func.sum(Message.prompt_tokens), 0) + func.coalesce(func.sum(Message.completion_tokens), 0),
        func.count(Message.id),
    ).filter(
        Message.role == "assistant",
        Message.created_at >= today_start,
    ).one()

    active_users_in_window = db.query(func.count(func.distinct(Conversation.user_id))).filter(
        Conversation.updated_at >= window_start,
    ).scalar() or 0

    total_conversations = db.query(func.count(Conversation.id)).scalar() or 0

    # Per-(group, provider, model) breakdown so we can apply correct prices, then roll into per-group.
    group_breakdown = (
        db.query(
            User.group_id,
            Message.ai_provider_id,
            Message.model_id,
            func.coalesce(func.sum(Message.prompt_tokens), 0).label("prompt_tokens"),
            func.coalesce(func.sum(Message.completion_tokens), 0).label("completion_tokens"),
        )
        .join(Conversation, Message.conversation_id == Conversation.id)
        .join(User, Conversation.user_id == User.id)
        .filter(Message.role == "assistant", Message.created_at >= window_start)
        .group_by(User.group_id, Message.ai_provider_id, Message.model_id)
        .all()
    )

    group_tokens: dict = {}
    group_cost: dict = {}
    group_cost_known: dict = {}
    for gid, pid, mid, pp, cc in group_breakdown:
        pp = int(pp or 0); cc = int(cc or 0)
        group_tokens[gid] = group_tokens.get(gid, 0) + pp + cc
        if pid in provider_by_id:
            p = provider_by_id[pid]
            in_price, out_price, _ = resolve_prices(
                p.provider_type, mid or p.model_id, p.input_price_per_1m, p.output_price_per_1m
            )
            c = compute_cost_usd(pp, cc, in_price, out_price)
            if c is not None:
                group_cost[gid] = group_cost.get(gid, 0.0) + c
                group_cost_known[gid] = True

    all_groups = db.query(Group).all()
    groups_usage = []
    for g in all_groups:
        used = group_tokens.get(g.id, 0)
        cost = round(group_cost.get(g.id, 0.0), 4) if group_cost_known.get(g.id) else None
        groups_usage.append({
            "group_id": g.id,
            "group_name": g.name,
            "tokens_used": used,
            "cost_usd": cost,
            "token_limit": g.token_limit,
            "price_limit_usd": g.price_limit_usd,
            "token_percent": (used / g.token_limit * 100.0) if g.token_limit else None,
            "price_percent": (cost / g.price_limit_usd * 100.0) if (g.price_limit_usd and cost is not None) else None,
        })
    groups_usage.sort(key=lambda x: x["tokens_used"], reverse=True)

    # Per-(user, provider, model) breakdown
    user_breakdown = (
        db.query(
            Conversation.user_id,
            Message.ai_provider_id,
            Message.model_id,
            func.coalesce(func.sum(Message.prompt_tokens), 0).label("prompt_tokens"),
            func.coalesce(func.sum(Message.completion_tokens), 0).label("completion_tokens"),
        )
        .join(Conversation, Message.conversation_id == Conversation.id)
        .filter(Message.role == "assistant", Message.created_at >= window_start)
        .group_by(Conversation.user_id, Message.ai_provider_id, Message.model_id)
        .all()
    )
    user_tokens: dict = {}
    user_cost: dict = {}
    user_cost_known: dict = {}
    for uid, pid, mid, pp, cc in user_breakdown:
        pp = int(pp or 0); cc = int(cc or 0)
        user_tokens[uid] = user_tokens.get(uid, 0) + pp + cc
        if pid in provider_by_id:
            p = provider_by_id[pid]
            in_price, out_price, _ = resolve_prices(
                p.provider_type, mid or p.model_id, p.input_price_per_1m, p.output_price_per_1m
            )
            c = compute_cost_usd(pp, cc, in_price, out_price)
            if c is not None:
                user_cost[uid] = user_cost.get(uid, 0.0) + c
                user_cost_known[uid] = True

    # Only return users who used something OR have a limit configured (so admins can see cap status).
    relevant_user_ids = set(user_tokens.keys())
    relevant_user_ids.update(uid for uid, in db.query(User.id).filter(
        (User.token_limit.isnot(None)) | (User.price_limit_usd.isnot(None))
    ).all())
    users_usage = []
    if relevant_user_ids:
        for u in db.query(User).filter(User.id.in_(relevant_user_ids)).all():
            used = user_tokens.get(u.id, 0)
            cost = round(user_cost.get(u.id, 0.0), 4) if user_cost_known.get(u.id) else None
            users_usage.append({
                "user_id": u.id,
                "name": u.name,
                "email": u.email,
                "group_id": u.group_id,
                "group_name": group_names.get(u.group_id) or None,
                "tokens_used": used,
                "cost_usd": cost,
                "token_limit": u.token_limit,
                "price_limit_usd": u.price_limit_usd,
                "token_percent": (used / u.token_limit * 100.0) if u.token_limit else None,
                "price_percent": (cost / u.price_limit_usd * 100.0) if (u.price_limit_usd and cost is not None) else None,
            })
        users_usage.sort(key=lambda x: x["tokens_used"], reverse=True)

    # Today's cost: re-derive from the already-costed timeline rows for consistency
    today_str = today_start.date().isoformat()
    today_cost_total = 0.0
    today_cost_known = False
    for t in timeline:
        if t["date"] == today_str and t["cost_usd"] is not None:
            today_cost_total += t["cost_usd"]
            today_cost_known = True

    summary = {
        "window_days": days,
        "window_prompt_tokens": int(window_totals[0] or 0),
        "window_completion_tokens": int(window_totals[1] or 0),
        "window_total_tokens": int((window_totals[0] or 0) + (window_totals[1] or 0)),
        "window_assistant_messages": int(window_totals[2] or 0),
        "window_cost_usd": round(window_cost_total, 4) if window_cost_known else None,
        "today_total_tokens": int(today_totals[0] or 0),
        "today_assistant_messages": int(today_totals[1] or 0),
        "today_cost_usd": round(today_cost_total, 4) if today_cost_known else None,
        "active_users_in_window": int(active_users_in_window),
        "total_conversations": int(total_conversations),
        # top_groups kept for backwards-compat with older clients; same data lives in `groups`.
        "top_groups": [
            {"group_id": g["group_id"], "group_name": g["group_name"], "total_tokens": g["tokens_used"]}
            for g in groups_usage[:5]
        ],
    }

    return {
        "window_start": window_start.date().isoformat(),
        "window_end": today_start.date().isoformat(),
        "timeline": timeline,
        "providers": providers_out,
        "groups": groups_usage,
        "users": users_usage,
        "summary": summary,
    }
