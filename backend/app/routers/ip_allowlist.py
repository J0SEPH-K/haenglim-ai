"""Admin endpoints for managing the IP allowlist + the master restriction toggle."""
import ipaddress
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import AppSettings, IPAllowlistEntry, User
from app.utils.dependencies import require_admin
from app.utils.ip_restriction import _client_ip_from_request, invalidate as invalidate_cache

router = APIRouter()


class IPAllowlistEntryIn(BaseModel):
    cidr: str
    label: Optional[str] = None
    enabled: bool = True


class IPAllowlistEntryUpdate(BaseModel):
    cidr: Optional[str] = None
    label: Optional[str] = None
    enabled: Optional[bool] = None


class IPAllowlistEntryOut(BaseModel):
    id: int
    cidr: str
    label: Optional[str]
    enabled: bool
    created_at: datetime
    model_config = {"from_attributes": True}


class IPSettingsOut(BaseModel):
    ip_restriction_enabled: bool


class IPSettingsUpdate(BaseModel):
    ip_restriction_enabled: bool


def _validate_cidr(cidr: str) -> str:
    """Parse + canonicalize a CIDR string (or single IP). Raises 400 on invalid input."""
    try:
        # strict=False so 192.168.1.5/24 (host bits set) is accepted and normalized.
        net = ipaddress.ip_network(cidr.strip(), strict=False)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=f"Invalid CIDR: {e}")
    return str(net)


def _get_or_create_settings(db: Session) -> AppSettings:
    s = db.query(AppSettings).filter(AppSettings.id == 1).first()
    if not s:
        s = AppSettings(id=1, ip_restriction_enabled=False)
        db.add(s)
        db.commit()
        db.refresh(s)
    return s


@router.get("")
def list_allowlist(
    request: Request,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    settings = _get_or_create_settings(db)
    entries = db.query(IPAllowlistEntry).order_by(IPAllowlistEntry.created_at.desc()).all()
    return {
        "settings": {"ip_restriction_enabled": settings.ip_restriction_enabled},
        "entries": [
            {
                "id": e.id,
                "cidr": e.cidr,
                "label": e.label,
                "enabled": e.enabled,
                "created_at": e.created_at,
            }
            for e in entries
        ],
        # Surface the caller's IP so admins can see what to add to the allowlist before enabling.
        "your_ip": _client_ip_from_request(request),
    }


@router.put("/settings", response_model=IPSettingsOut)
def update_settings(
    body: IPSettingsUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    settings = _get_or_create_settings(db)
    settings.ip_restriction_enabled = body.ip_restriction_enabled
    db.commit()
    db.refresh(settings)
    invalidate_cache()
    return IPSettingsOut(ip_restriction_enabled=settings.ip_restriction_enabled)


@router.post("", response_model=IPAllowlistEntryOut, status_code=status.HTTP_201_CREATED)
def create_entry(
    body: IPAllowlistEntryIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    cidr = _validate_cidr(body.cidr)
    if db.query(IPAllowlistEntry).filter(IPAllowlistEntry.cidr == cidr).first():
        raise HTTPException(status_code=400, detail="Entry with this CIDR already exists")
    entry = IPAllowlistEntry(cidr=cidr, label=body.label, enabled=body.enabled)
    db.add(entry)
    db.commit()
    db.refresh(entry)
    invalidate_cache()
    return entry


@router.put("/{entry_id}", response_model=IPAllowlistEntryOut)
def update_entry(
    entry_id: int,
    body: IPAllowlistEntryUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = db.query(IPAllowlistEntry).filter(IPAllowlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    if body.cidr is not None:
        new_cidr = _validate_cidr(body.cidr)
        if new_cidr != entry.cidr and db.query(IPAllowlistEntry).filter(IPAllowlistEntry.cidr == new_cidr).first():
            raise HTTPException(status_code=400, detail="Another entry with this CIDR already exists")
        entry.cidr = new_cidr
    if body.label is not None:
        entry.label = body.label
    if body.enabled is not None:
        entry.enabled = body.enabled
    db.commit()
    db.refresh(entry)
    invalidate_cache()
    return entry


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entry(
    entry_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    entry = db.query(IPAllowlistEntry).filter(IPAllowlistEntry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    db.delete(entry)
    db.commit()
    invalidate_cache()
