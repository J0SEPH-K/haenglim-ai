import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager

from app.config import get_settings
from app.database import Base, engine
from app.routers import auth, admin, conversations, messages, files, providers, ip_allowlist
from app.utils.ip_restriction import IPRestrictionMiddleware
from app.utils.migrate import run_migrations


@asynccontextmanager
async def lifespan(app: FastAPI):
    settings = get_settings()
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    # Create any new tables introduced since this DB was provisioned (no-op for existing tables).
    # Must import models module here so SQLAlchemy registers them on Base.metadata.
    import app.models.models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    run_migrations()
    yield


app = FastAPI(title="AI Chat Platform", version="1.0.0", lifespan=lifespan)

settings = get_settings()
os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
# IP restriction is added AFTER CORS so the CORS middleware (added last) wraps it on the outside —
# in Starlette/FastAPI, middleware added later runs first on the request. CORS preflights and
# headers must be applied even when IP restriction blocks the request, otherwise browsers swallow
# the 403 with a misleading CORS error instead of showing the real status.
app.add_middleware(IPRestrictionMiddleware)

app.mount("/uploads", StaticFiles(directory=settings.UPLOAD_DIR), name="uploads")

app.include_router(auth.router, prefix="/api/auth", tags=["Auth"])
app.include_router(providers.router, prefix="/api/providers", tags=["Providers"])
app.include_router(conversations.router, prefix="/api/conversations", tags=["Conversations"])
app.include_router(messages.router, prefix="/api/conversations", tags=["Messages"])
app.include_router(files.router, prefix="/api/files", tags=["Files"])
app.include_router(admin.router, prefix="/api/admin", tags=["Admin"])
app.include_router(ip_allowlist.router, prefix="/api/admin/ip-allowlist", tags=["Admin"])
