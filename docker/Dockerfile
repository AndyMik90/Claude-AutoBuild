# Auto-Claude Docker Container
# All-in-one container with web UI for remote access

# Stage 1: Build React frontend
FROM node:20-slim AS frontend-builder

WORKDIR /frontend

# Copy package files first for better caching
COPY docker/frontend/package*.json ./

# Install dependencies
RUN npm ci --silent

# Copy frontend source
COPY docker/frontend/ ./

# Build the frontend
RUN npm run build

# Stage 2: Python runtime
FROM python:3.11-slim AS base

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    curl \
    bubblewrap \
    gnupg \
    && rm -rf /var/lib/apt/lists/*

# Install Node.js for Claude Code CLI
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Install Claude Code CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user for security
RUN useradd --create-home --shell /bin/bash autoclaude

# Set working directories
WORKDIR /opt/auto-claude

# Copy Auto-Claude source code (read-only reference)
COPY auto-claude/ /opt/auto-claude/

# Install Auto-Claude dependencies
RUN pip install --no-cache-dir -r /opt/auto-claude/requirements.txt

# Set up web UI application
WORKDIR /app

# Copy web UI requirements and install
COPY docker/requirements.txt /app/
RUN pip install --no-cache-dir -r /app/requirements.txt

# Copy web UI application code
COPY docker/app/ /app/

# Copy Alembic configuration and migrations
COPY docker/alembic.ini /app/
COPY docker/alembic/ /app/alembic/

# Copy built frontend static files from builder stage
# Vite outputs to ../static relative to frontend/, so it's at /static in the builder
COPY --from=frontend-builder /static /static

# Copy entrypoint and scripts
COPY --chmod=755 docker/entrypoint.sh /entrypoint.sh
COPY --chmod=755 docker/scripts/ /scripts/

# Create directories for data and repos (per-user project repositories)
RUN mkdir -p /repos /data/logs /static && \
    chown -R autoclaude:autoclaude /repos /data /app /opt/auto-claude /entrypoint.sh /scripts /static

# Switch to non-root user
USER autoclaude

# Set environment defaults
ENV AUTO_CLAUDE_PATH=/opt/auto-claude \
    REPOS_DIR=/repos \
    DATA_DIR=/data \
    WEB_PORT=8080

# Expose web UI port
EXPOSE 8080

# Declare volumes for persistence
VOLUME ["/repos", "/data"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

# Entrypoint handles initialization
ENTRYPOINT ["/entrypoint.sh"]

# Default command: start web server
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8080"]
