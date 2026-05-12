# Sentinel-G FastAPI — production image for Fly.io
# Python 3.11 base; uv for fast dependency installs.

FROM python:3.11-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    poppler-utils \
    tesseract-ocr \
    ghostscript \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

RUN pip install --upgrade pip uv

WORKDIR /app

COPY pyproject.toml ./
RUN uv pip install --system --no-deps .

COPY backend ./backend
COPY ml ./ml

EXPOSE 8000

CMD ["uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8000"]
