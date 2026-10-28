from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.v1.router import api_router
from app.core.config import settings
from app.db.init_db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


def create_application() -> FastAPI:
    app = FastAPI(
        title=settings.project_name,
        version=settings.version,
        openapi_url=f"{settings.api_v1_prefix}/openapi.json",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_origin_regex=settings.cors_origin_regex,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    def frontend_index_file():
        index_file = settings.web_dist_dir / "index.html"
        if settings.serve_frontend and index_file.exists():
            return index_file
        return None

    @app.get("/", tags=["root"])
    def read_root():
        index_file = frontend_index_file()
        if index_file is not None:
            return FileResponse(index_file)
        return {
            "code": "OK",
            "message": "OW³教学评AI平台 API is running",
            "data": {
                "project": settings.project_name,
                "docs": "/docs",
                "api_prefix": settings.api_v1_prefix,
            },
        }

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    if settings.serve_frontend and settings.web_dist_dir.exists():
        assets_dir = settings.web_dist_dir / "assets"
        if assets_dir.exists():
            app.mount("/assets", StaticFiles(directory=assets_dir), name="web-assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        def serve_frontend(full_path: str):
            api_prefix = settings.api_v1_prefix.strip("/")
            if full_path == api_prefix or full_path.startswith(f"{api_prefix}/"):
                raise HTTPException(status_code=404, detail="Not Found")

            dist_root = settings.web_dist_dir.resolve()
            requested_path = (dist_root / full_path).resolve()
            if requested_path.is_file() and requested_path.is_relative_to(dist_root):
                return FileResponse(requested_path)

            index_file = frontend_index_file()
            if index_file is None:
                raise HTTPException(status_code=404, detail="Not Found")
            return FileResponse(index_file)

    return app


app = create_application()
