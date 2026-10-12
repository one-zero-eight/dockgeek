<div align="center">
    <img src="./frontend/public/icon.svg" width="128" alt="Dockgeek" />
</div>

# Dockgeek v2.0.0

[![Version](https://img.shields.io/badge/version-2.0.0-green.svg)](./package.json)
[![Build Docker image](https://github.com/one-zero-eight/dockgeek/actions/workflows/docker-image.yml/badge.svg)](https://github.com/one-zero-eight/dockgeek/actions/workflows/docker-image.yml)

Dockgeek is a self-hosted manager for Docker Compose projects. Your Compose files stay on your host, so you can keep using the `docker compose` CLI alongside the web interface.

<div align="center">
    
[screencast.webm](https://github.com/user-attachments/assets/f801d307-48d8-4367-8832-2c3a89994c60)

</div>


## Features

- **Your existing Compose projects, all in one place:** Discover projects from the projects directory and see what's running. Start, stop, restart, update, and delete projects from the browser.
- **Edit Compose and project files:** Create or edit `compose.yaml` and `.env` together, and add files such as `settings.yaml` from the project page. YAML and JSON files support schema-powered typing suggestions, validation, and formatting, including schemas hosted on GitHub.
- **Sync project files to Git:** Use a repository in the projects root or a project folder, preview editor changes before committing and pushing, and keep ignored files local.
- **Health and live logs:** Inspect services and containers, see healthcheck status, and follow container logs.
- **Interactive Web Terminal:** Open a shell in a running container and execute commands without leaving your browser.
- **Manage on mobile:** Responsive project and container views let you inspect and control services from your phone.
- **Multiple hosts:** Connect Dockgeek agents to manage Compose projects on other Docker hosts.

See the [GitHub wiki](https://github.com/one-zero-eight/dockgeek/wiki) for project editing and Git sync, the file manager, and administrator setup and recovery.

## Installation

Requirements: Docker Engine with Compose V2 and access to a Docker socket.

### Rootless setup (recommended)

**[Rootless Docker](https://github.com/one-zero-eight/dockgeek/wiki/Rootless-Docker) with a dedicated user are needed.** Mounting the rootful socket (`/var/run/docker.sock`) gives Dockgeek root-equivalent control of the host. Rootless mode limits Dockgeek to that user’s privileges. On startup, Dockgeek logs whether the connected daemon is rootless or rootful.

> **Note:** Rootful Docker is supported but not recommended. See [Rootful install](https://github.com/one-zero-eight/dockgeek/wiki/How-to-Install#rootful-install-not-recommended).

Create a dedicated user, install rootless Docker, then point Dockgeek at that user’s socket.

```bash
# After rootless Docker is running as user `dockgeek` (uid typically 1000):
mkdir -p /opt/dockgeek /opt/projects
chown -R dockgeek:dockgeek /opt/dockgeek /opt/projects
```

Create `/opt/dockgeek/compose.yaml`:

```yaml
services:
  dockgeek:
    image: ghcr.io/one-zero-eight/dockgeek:2.0.0
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      # Rootless daemon socket for the dedicated user (not /var/run/docker.sock).
      # DOCKER_UID defaults to 1000; override with that user's id (`id -u`).
      - /run/user/${DOCKER_UID:-1000}/docker.sock:/var/run/docker.sock
      - ./data:/app/dockgeek-data
      # Projects Directory
      # ⚠️ READ IT CAREFULLY. If you did it wrong, your data could end up writing into a WRONG PATH.
      # ⚠️ 1. FULL path only. No relative path (MUST)
      # ⚠️ 2. Left Projects Path === Right Projects Path (MUST)
      - /opt/projects:/opt/projects
    environment:
      DOCKGEEK_DATA_DIR: /app/dockgeek-data
      DOCKGEEK_PROJECTS_DIR: /opt/projects
```

```bash
sudo -u dockgeek -H bash -lc '
  export XDG_RUNTIME_DIR=/run/user/$(id -u)
  export DOCKER_HOST=unix:///run/user/$(id -u)/docker.sock
  export DOCKER_UID=$(id -u)
  cd /opt/dockgeek && docker compose up -d
'
```

Open <http://localhost:5001>. On first start, the logs contain an administrator claim URL valid for 15 minutes. If it expires before anyone claims the instance, restart the service and check the logs again. Startup also logs whether Docker is rootless or rootful.

## What's next?

See the [GitHub wiki](https://github.com/one-zero-eight/dockgeek/wiki) for updates, configuration, and more.

## FAQ

### Can I use my existing Compose files?

Yes. Put each project in a subdirectory of the configured projects directory, then use **Scan Projects Folder** in Dockgeek. Keep any host paths referenced by Compose available inside the Dockgeek container.

### Can I manage a container without a Compose file?

Dockgeek manages Compose projects. It can inspect containers belonging to those projects, but it is not a general-purpose manager for standalone containers.

## Community and contribution

Use [issues](https://github.com/one-zero-eight/dockgeek/issues) for bug reports and [CONTRIBUTING.md](./CONTRIBUTING.md) for development instructions. Security issues should be reported as described in [SECURITY.md](./SECURITY.md).

## Attribution

Dockgeek is a fork of [louislam/dockge](https://github.com/louislam/dockge), created by Louis Lam and its contributors.
