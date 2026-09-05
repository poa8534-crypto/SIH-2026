# Multi-stage Dockerfile for NAVIS EPC Platform (SIH 2026 / Problem Statement SIH26122)
# Stage 1: Build the React + Vite frontend
FROM node:20-alpine AS frontend-builder
WORKDIR /app/frontend

COPY frontend/package*.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

# Stage 2: Python 3.12 Backend with PyMuPDF, SQLite, & ML dependencies
FROM python:3.12-slim

# System utilities for PyMuPDF, curl, health checks
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    build-essential \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install pinned Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy codebase and datasets
COPY . .

# Copy built frontend distribution into /app/frontend/dist for unified static serving
COPY --from=frontend-builder /app/frontend/dist ./frontend/dist

# Expose unified port
EXPOSE 8000

ENV PORT=8000
ENV HOST=0.0.0.0
ENV PYTHONUNBUFFERED=1
ENV SERVE_FRONTEND=1

# Health check verifies that the server responds with 200 OK
HEALTHCHECK --interval=30s --timeout=10s --retries=3 \
  CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "server.main:app", "--host", "0.0.0.0", "--port", "8000"]
