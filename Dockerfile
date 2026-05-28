# ---- Stage 1: build the frontend ----
FROM node:22-slim AS web
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build        # produces /app/dist

# ---- Stage 2: python runtime serving API + static frontend ----
FROM python:3.12-slim AS runtime
WORKDIR /app

# Install backend (only what's needed to install deps first for layer caching).
COPY backend/pyproject.toml backend/pyproject.toml
COPY backend/app backend/app
RUN pip install --no-cache-dir -e ./backend

# Copy the built frontend; FastAPI serves it via StaticFiles + SPA fallback.
COPY --from=web /app/dist ./dist

ENV AURORA_HOST=0.0.0.0 \
    AURORA_PORT=5174 \
    AURORA_DIST_DIR=/app/dist

EXPOSE 5174
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "5174", "--app-dir", "backend"]
