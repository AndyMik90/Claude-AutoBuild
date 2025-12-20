#!/bin/bash

# Auto Claude Launcher - Start everything with one command
# Usage: auto-claude
# The app will launch in the background, terminal can be closed

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_DIR="$( dirname "$SCRIPT_DIR" )"
LOG_FILE="$PROJECT_DIR/.auto-claude-startup.log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log function
log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" | tee -a "$LOG_FILE"
}

log "🚀 Auto Claude Launcher started"

# Step 1: Check Docker is running
log "${YELLOW}Checking Docker...${NC}"
if ! command -v docker &> /dev/null; then
  log "${RED}❌ Docker not found. Please install Docker Desktop.${NC}"
  exit 1
fi

if ! docker info > /dev/null 2>&1; then
  log "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
  exit 1
fi
log "${GREEN}✓ Docker is running${NC}"

# Step 2: Start Memory Layer (FalkorDB) in background
log "${YELLOW}Starting Memory Layer (FalkorDB)...${NC}"
cd "$PROJECT_DIR"

if ! docker-compose ps falkordb 2>/dev/null | grep -q "running"; then
  docker-compose up -d falkordb >> "$LOG_FILE" 2>&1
  log "  Waiting for FalkorDB to be healthy..."
  sleep 5
fi
log "${GREEN}✓ Memory Layer ready${NC}"

# Step 3: Set up Python backend (if needed)
if [ ! -d "auto-claude/.venv" ]; then
  log "${YELLOW}Setting up Python backend...${NC}"
  cd auto-claude
  python3 -m venv .venv >> "$LOG_FILE" 2>&1
  source .venv/bin/activate
  pip install -q -r requirements.txt >> "$LOG_FILE" 2>&1
  cd ..
  log "${GREEN}✓ Python backend ready${NC}"
fi

# Step 4: Install UI dependencies (if needed)
if [ ! -d "auto-claude-ui/node_modules" ]; then
  log "${YELLOW}Installing UI dependencies (this may take a minute)...${NC}"
  cd "$PROJECT_DIR/auto-claude-ui"
  npm install -q >> "$LOG_FILE" 2>&1
  log "${GREEN}✓ UI dependencies installed${NC}"
fi

# Step 5: Build the UI
log "${YELLOW}Building UI...${NC}"
cd "$PROJECT_DIR/auto-claude-ui"
npm run build >> "$LOG_FILE" 2>&1
log "${GREEN}✓ UI built successfully${NC}"

# Step 6: Launch the application in background
log "${YELLOW}Launching Auto Claude...${NC}"

# Start in background, detached from terminal
nohup npm start >> "$LOG_FILE" 2>&1 &

# Give it a moment to start
sleep 2

log "${GREEN}✓ Auto Claude is starting!${NC}"
log ""
log "📋 Application is launching in the background"
log "🖥️  Look for the Auto Claude window to appear"
log "📝 Logs saved to: $LOG_FILE"
log ""
log "✓ You can now close this terminal window"

