# Single-container build for the home-server deploy.
#
# Stage 1: build the React frontend with Vite.
# Stage 2: copy the built assets into a Python image, install backend deps,
#          run gunicorn. Flask serves both the API at /api/v1 and the static
#          assets at / (with SPA fallback for client-side routes).
#
# Build:    docker compose build
# Run:      docker compose up -d
# Logs:     docker compose logs -f ao5

# ─────────────────────────── Stage 1: frontend build ───────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /build

# Install deps with deterministic install based on the lockfile.
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

# Copy source and build. Vite outputs to /build/build (per vite.config.ts).
COPY frontend/ ./
RUN npm run build


# ─────────────────────────── Stage 2: Python runtime ───────────────────────────
FROM python:3.11-slim AS runtime

# Don't write .pyc files; flush stdout/stderr immediately so logs surface.
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

WORKDIR /app

# Install backend deps first so Docker can cache this layer when only
# application code (not requirements) changes.
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt

# Copy backend source.
COPY backend/ ./

# Bring in the built frontend from stage 1. The path matches what Flask
# expects via the SERVE_FRONTEND_DIR env var below.
COPY --from=frontend-build /build/build /app/frontend

# Tell Flask to serve the built frontend.
ENV SERVE_FRONTEND_DIR=/app/frontend \
    LOG_LEVEL=INFO

# Run as a non-root user for safety.
RUN useradd --create-home --shell /bin/bash app && chown -R app:app /app
USER app

EXPOSE 5000

# 2 worker processes is plenty for a single-user home deploy. The
# --access-logfile - flag would duplicate our existing structured access
# log, so it's disabled. gunicorn's error log still goes to stderr.
CMD ["gunicorn", \
     "--bind", "0.0.0.0:5000", \
     "--workers", "2", \
     "--timeout", "30", \
     "--graceful-timeout", "10", \
     "--access-logfile", "-", \
     "--access-logformat", "%(h)s %(r)s %(s)s %(b)s %(L)s", \
     "run:app"]
