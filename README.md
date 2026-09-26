<div align="center" width="100%">
    <img src="./frontend/public/icon.svg" width="128" alt="Dockge" />
</div>

# Dockge — Lorwell Fork

[![Version](https://img.shields.io/badge/version-1.8.2-green.svg)](./package.json)
[![Docker pulls](https://img.shields.io/docker/pulls/moailaozi/dockge.svg)](https://hub.docker.com/r/moailaozi/dockge)
[![Build Docker image](https://github.com/Lorwell/dockge/actions/workflows/docker-image.yml/badge.svg)](https://github.com/Lorwell/dockge/actions/workflows/docker-image.yml)

This repository is an independently maintained fork of
[Dockge](https://github.com/louislam/dockge). It has its own Docker images, release workflow, documentation, and
upgrade path. Use this repository and the `moailaozi/dockge` image when installing or upgrading this fork.

Dockge is a responsive, self-hosted manager for Docker Compose stacks. Compose files remain ordinary files on the
host and can still be managed with the Docker Compose CLI.

## What is different in this fork

- Container instance details generated from the live Compose state, including stacks that use `include`
- Dedicated Overview, Logs, and Terminal views for each created container
- Large, viewport-aware log panels with follow, clear, copy, and in-page fullscreen controls
- Container-level start, stop, and restart actions with stack ownership validation
- Fully interactive Bash/sh terminals with Tab, control-key, resize, and paste support
- The original Compose editor, stack lifecycle controls, multi-agent support, and responsive UI

## Quick start

Requirements:

- Docker Engine 20+ with Docker Compose V2, or a compatible Podman installation
- A Linux host capable of mounting the Docker socket
- `amd64`, `arm64`, or `arm/v7`

Create the directories and save the following as `/opt/dockge/compose.yaml`:

```bash
mkdir -p /opt/dockge /opt/stacks
cd /opt/dockge
```

```yaml
services:
  dockge:
    image: docker.io/moailaozi/dockge:1.8.2
    restart: unless-stopped
    ports:
      - "5001:5001"
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock
      - ./data:/app/data
      # The host and container paths must be identical.
      - /opt/stacks:/opt/stacks
    environment:
      - DOCKGE_STACKS_DIR=/opt/stacks
      # Set both values when stack files should be owned by a non-root user.
      - PUID=1000
      - PGID=1000
```

Start Dockge:

```bash
docker compose up -d
```

Open <http://localhost:5001>. For production, pin a full version such as `1.8.2`; the `latest` tag follows the
newest stable release of this fork.

## Stack directory and imports

The default stacks directory in the example is `/opt/stacks`. Each stack has its own directory and Compose file:

```text
/opt/stacks/
└── example-stack/
    └── compose.yaml
```

Existing Compose projects can also be represented with an include-only stack file:

```yaml
name: nginx-proxy-manager
include:
  - path: /data/nginx-proxy-manager/docker-compose.yaml
    project_directory: /data/nginx-proxy-manager
services: {}
```

After adding files outside the UI, use **Scan Stacks Folder** in Dockge. Paths referenced by Compose must be
available to the Dockge container at the same absolute path.

## Restricted file manager

The optional file manager is disabled unless a root directory is explicitly configured. In Docker, mount only
the directory that Dockge should be allowed to manage and set:

```yaml
volumes:
  - /host/managed-files:/managed-files
environment:
  - DOCKGE_FILE_MANAGER_ROOT=/managed-files
  - DOCKGE_FILE_MANAGER_MAX_FILE_SIZE=104857600
```

Each Dockge Agent has its own independent root. File operations cannot access parent directories or traverse
symbolic links outside the configured root.

## Authentication

Dockge runs Better Auth in the same container. By default, it generates a secret once at
`/app/data/better-auth-secret` (inside the existing persistent data mount), with restrictive file
permissions. Keep this file with your database backups; losing it invalidates existing auth sessions.
`BETTER_AUTH_SECRET` is optional and takes precedence over the stored secret. A custom `auth.ts` that sets
`secret` explicitly controls its own secret instead. Set `BETTER_AUTH_URL` to the externally reachable origin
(HTTPS behind a reverse proxy). The default provider is email/password. A separate `/app/data/auth.db` stores
Better Auth data alongside Dockge's existing data.
On the first run, read the **single-use, 15-minute admin claim URL** in the container logs; open it to create
and claim your administrator account. Existing Dockge usernames, passwords, JWTs, and remote-agent passwords
are **not migrated**; keep a backup of your data and reconfigure connected instances with new agent keys.
If a claim expires before it is used, restart the server to issue a fresh URL. An administrator
can recover access offline with `npm run reset-password` (this resets the admin claim, not the Better Auth password). Stop Dockge before running the command, then use its printed URL within 15 minutes.

For a custom Better Auth configuration, mount a TypeScript module and set `BETTER_AUTH_CONFIG`:

```yaml
volumes:
  - ./auth.ts:/app/config/auth.ts:ro
environment:
  BETTER_AUTH_CONFIG: /app/config/auth.ts
  BETTER_AUTH_URL: https://dockge.example.com
  # Optional: BETTER_AUTH_SECRET: ${BETTER_AUTH_SECRET}
```

Export your `betterAuth(...)` instance as the default export; import `appDatabase` from
`/app/backend/auth.ts` and call `appDatabase()` for Dockge's persistent Better Auth SQLite database. This database is required
so Dockge can initialize and migrate auth schemas at startup. Only packages included in the
image resolve from a config mounted under `/app`; build a derived image for third-party plugins. Better Auth
and official SSO, OAuth-provider, and API-key packages are included. Schema changes for the built-in adapter
are applied at startup. The native CLI also supports `npx auth migrate --config /app/config/auth.ts` and
`npx auth info --config /app/config/auth.ts`. Custom configs must use the exported SQLite database connector; additional plugins must be installed
in the image before mounting the config. Changing the config file requires a container restart.

Create an agent key on the **target** Dockge instance under Settings → Security, specifying the target URL's
hostname and port. Enter that key instead of a username/password on the source instance. Revoke it from the
target instance to terminate access; use HTTPS for remote connections. Access to Dockge requires a claimed
administrator account, even if a custom Better Auth provider permits other people to sign in.

## Upgrade

Back up `/opt/dockge/data` and the stack directory, update the pinned image version, then run:

```bash
cd /opt/dockge
docker compose pull
docker compose up -d
```

Database migrations run automatically at startup. Restore a pre-upgrade backup if a downgrade is required.

## Local development

Dockge requires Node.js 22.14 or newer. Install dependencies and start both development servers:

```bash
npm install
npm run dev
```

- Frontend: <http://localhost:5000>
- Backend: <http://localhost:5001>
- `npm run dev:frontend` and `npm run dev:backend` can be run separately.

Before submitting changes, run:

```bash
npm run lint
npm run check-ts
npm run build:frontend
```

## Docker image publishing

The `Build and push Docker image` GitHub Actions workflow publishes multi-platform images for `amd64`, `arm64`,
and `arm/v7`. It can only publish stable images from `master`, and derives the release version from `package.json`.
For version `1.8.2`, it publishes `1.8.2`, `1.8`, `1`, and `latest` tags.

Configure these GitHub Actions secrets before running the workflow:

- `DOCKER_HUB_USERNAME`: Docker Hub account name
- `DOCKER_HUB_TOKEN`: Docker Hub access token with permission to push `moailaozi/dockge`

Then open **Actions → Build and push Docker image → Run workflow** on the `master` branch.

## Support and contribution

- [Issues](https://github.com/Lorwell/dockge/issues)
- [Actions](https://github.com/Lorwell/dockge/actions)
- [Docker image tags](https://hub.docker.com/r/moailaozi/dockge/tags)
- [Development guidelines](./CONTRIBUTING.md)

This fork is maintained independently. Do not report fork-specific problems or request its features in the
upstream Dockge repository.

## Attribution

Dockge is licensed under the MIT License and builds on the work of Louis Lam and the upstream Dockge contributors.
