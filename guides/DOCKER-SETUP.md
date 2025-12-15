# Docker & FalkorDB Setup Guide

This guide covers installing and troubleshooting Docker for Auto Claude's Memory Layer. The Memory Layer uses FalkorDB (a graph database) to provide persistent cross-session memory for AI agents.

> **Good news!** If you're using the Desktop UI, it automatically detects Docker and FalkorDB status and offers one-click setup. This guide is for manual setup or troubleshooting.

## Table of Contents

- [Quick Start](#quick-start)
- [What is Docker?](#what-is-docker)
- [Installing Docker Desktop](#installing-docker-desktop)
  - [macOS](#macos)
  - [Windows](#windows)
  - [Linux](#linux)
- [Starting FalkorDB](#starting-falkordb)
- [Verifying Your Setup](#verifying-your-setup)
- [Troubleshooting](#troubleshooting)
- [Advanced Configuration](#advanced-configuration)
- [Uninstalling](#uninstalling)

---

## Quick Start

If Docker Desktop is already installed and running:

```bash
# Start FalkorDB
docker run -d --name auto-claude-falkordb -p 6380:6379 falkordb/falkordb:latest

# Verify it's running
docker ps | grep falkordb
```

---

## What is Docker?

Docker is a tool that runs applications in isolated "containers". Think of it as a lightweight virtual machine that:

- **Keeps things contained** - FalkorDB runs inside Docker without affecting your system
- **Makes setup easy** - One command to start, no complex installation
- **Works everywhere** - Same setup on Mac, Windows, and Linux

**You don't need to understand Docker** - just install Docker Desktop and Auto Claude handles the rest.

---

## Installing Docker Desktop

### macOS

#### Step 1: Download

| Mac Type | Download Link |
|----------|---------------|
| **Apple Silicon (M1/M2/M3/M4)** | [Download for Apple Chip](https://desktop.docker.com/mac/main/arm64/Docker.dmg) |
| **Intel** | [Download for Intel Chip](https://desktop.docker.com/mac/main/amd64/Docker.dmg) |

> **Which do I have?** Click the Apple logo () → "About This Mac". Look for "Chip" - if it says Apple M1/M2/M3/M4, use Apple Silicon. If it says Intel, use Intel.

#### Step 2: Install

1. Open the downloaded `.dmg` file
2. Drag the Docker icon to your Applications folder
3. Open Docker from Applications (or Spotlight: ⌘+Space, type "Docker")
4. Click "Open" if you see a security warning
5. **Wait** - Docker takes 1-2 minutes to start the first time

#### Step 3: Verify

Look for the whale icon (🐳) in your menu bar. When it stops animating, Docker is ready.

Open Terminal and run:

```bash
docker --version
# Expected: Docker version 24.x.x or higher
```

### Windows

#### Prerequisites

- Windows 10 (version 2004 or higher) or Windows 11
- WSL 2 enabled (Docker will prompt you to install it)

#### Step 1: Download

[Download Docker Desktop for Windows](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe)

#### Step 2: Install

1. Run the downloaded installer
2. **Keep "Use WSL 2" checked** (recommended)
3. Follow the installation wizard with default settings
4. **Restart your computer** when prompted
5. After restart, Docker Desktop will start automatically

#### Step 3: WSL 2 Setup (if prompted)

If Docker shows a WSL 2 warning:

1. Open PowerShell as Administrator
2. Run:
   ```powershell
   wsl --install
   ```
3. Restart your computer
4. Open Docker Desktop again

#### Step 4: Verify

Look for the whale icon (🐳) in your system tray. When it stops animating, Docker is ready.

Open PowerShell or Command Prompt and run:

```bash
docker --version
# Expected: Docker version 24.x.x or higher
```

### Linux

#### Ubuntu/Debian

```bash
# Update package index
sudo apt-get update

# Install prerequisites
sudo apt-get install ca-certificates curl gnupg

# Add Docker's official GPG key
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg

# Add the repository
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Install Docker
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Add your user to the docker group (to run without sudo)
sudo usermod -aG docker $USER

# Log out and back in, then verify
docker --version
```

#### Fedora

```bash
# Install Docker
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager --add-repo https://download.docker.com/linux/fedora/docker-ce.repo
sudo dnf install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Start Docker
sudo systemctl start docker
sudo systemctl enable docker

# Add your user to the docker group
sudo usermod -aG docker $USER
```

---

## Starting FalkorDB

### Option 1: Using Docker Compose (Recommended)

From the Auto Claude root directory:

```bash
docker-compose up -d falkordb
```

This uses the project's `docker-compose.yml` which is pre-configured.

### Option 2: Using Docker Run

```bash
docker run -d \
  --name auto-claude-falkordb \
  -p 6380:6379 \
  --restart unless-stopped \
  falkordb/falkordb:latest
```

### Option 3: Let the Desktop UI Handle It

If you're using the Auto Claude Desktop UI:

1. Go to Project Settings → Memory Backend
2. Enable "Use Graphiti"
3. The UI will show Docker/FalkorDB status
4. Click "Start" to launch FalkorDB automatically

---

## Verifying Your Setup

### Check Docker is Running

```bash
docker info
# Should show Docker system information without errors
```

### Check FalkorDB is Running

```bash
docker ps | grep falkordb
# Should show the running container
```

### Test FalkorDB Connection

```bash
docker exec auto-claude-falkordb redis-cli PING
# Expected response: PONG
```

### Check Logs (if something seems wrong)

```bash
docker logs auto-claude-falkordb
```

---

## Troubleshooting

### Docker Issues

| Problem | Solution |
|---------|----------|
| **"docker: command not found"** | Docker Desktop isn't installed or isn't in PATH. Reinstall Docker Desktop. |
| **"Cannot connect to Docker daemon"** | Docker Desktop isn't running. Open Docker Desktop and wait for it to start. |
| **"permission denied"** | On Linux, add your user to the docker group: `sudo usermod -aG docker $USER` then log out and back in. |
| **Docker Desktop won't start** | Try restarting your computer. On Mac, check System Preferences → Security for blocked apps. |
| **"Docker Desktop requires macOS 12"** | Update macOS in System Preferences → Software Update. |
| **"WSL 2 installation incomplete"** | Run `wsl --install` in PowerShell (as Admin) and restart. |

### FalkorDB Issues

| Problem | Solution |
|---------|----------|
| **Container won't start** | Check if port 6380 is in use: `lsof -i :6380` (Mac/Linux) or `netstat -ano | findstr 6380` (Windows) |
| **"port is already allocated"** | Stop conflicting container: `docker stop auto-claude-falkordb && docker rm auto-claude-falkordb` |
| **Connection refused** | Verify container is running: `docker ps`. If not listed, start it again. |
| **Container crashes immediately** | Check logs: `docker logs auto-claude-falkordb`. May need more memory. |

### Memory/Performance Issues

| Problem | Solution |
|---------|----------|
| **Docker using too much memory** | Open Docker Desktop → Settings → Resources → Memory. Reduce to 2-4GB. |
| **Docker using too much disk** | Run `docker system prune -a` to clean unused images and containers. |
| **Computer running slow** | Quit Docker Desktop when not using Auto Claude. FalkorDB only needs to run during active sessions. |

### Network Issues

| Problem | Solution |
|---------|----------|
| **"network not found"** | Run `docker network create auto-claude-network` or use `docker-compose up` |
| **Can't connect from app** | Ensure port 6380 is exposed. Check firewall isn't blocking localhost connections. |

---

## Advanced Configuration

### Custom Port

If port 6380 is in use, change it:

```bash
# Using docker run
docker run -d --name auto-claude-falkordb -p 6381:6379 falkordb/falkordb:latest
```

Then update Auto Claude settings to use port 6381.

### Persistent Data

To persist FalkorDB data between container restarts:

```bash
docker run -d \
  --name auto-claude-falkordb \
  -p 6380:6379 \
  -v auto-claude-falkordb-data:/data \
  --restart unless-stopped \
  falkordb/falkordb:latest
```

### Memory Limits

To limit FalkorDB memory usage:

```bash
docker run -d \
  --name auto-claude-falkordb \
  -p 6380:6379 \
  --memory=2g \
  --restart unless-stopped \
  falkordb/falkordb:latest
```

### Running on a Remote Server

If running Docker on a different machine:

1. Expose the port on the server:
   ```bash
   docker run -d -p 0.0.0.0:6380:6379 falkordb/falkordb:latest
   ```

2. Update Auto Claude settings:
   - Set `GRAPHITI_FALKORDB_HOST=your-server-ip`
   - Set `GRAPHITI_FALKORDB_PORT=6380`

---

## Uninstalling

### Stop and Remove FalkorDB

```bash
docker stop auto-claude-falkordb
docker rm auto-claude-falkordb
```

### Remove FalkorDB Image

```bash
docker rmi falkordb/falkordb:latest
```

### Remove All Docker Data

```bash
docker system prune -a --volumes
```

### Uninstall Docker Desktop

- **Mac**: Drag Docker from Applications to Trash, then empty Trash
- **Windows**: Control Panel → Programs → Uninstall Docker Desktop
- **Linux**: `sudo apt-get remove docker-ce docker-ce-cli containerd.io`

---

## Getting Help

If you're still having issues:

1. Check the [Auto Claude GitHub Issues](https://github.com/auto-claude/auto-claude/issues)
2. Search for your error message
3. Create a new issue with:
   - Your operating system and version
   - Docker version (`docker --version`)
   - Error message or logs
   - Steps you've already tried
