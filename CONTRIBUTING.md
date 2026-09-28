# Contributing to Dockgeek

Open issues and pull requests at [one-zero-eight/dockgeek](https://github.com/one-zero-eight/dockgeek). Discuss large features or breaking changes in an issue first, and keep pull requests focused.

## Before opening a pull request

- Add user-facing English text to `frontend/src/lang/en.json`; avoid unrelated translation changes.
- Include GitHub-hosted screenshots for visible UI changes.
- Describe manual coverage for affected UI, Socket.IO, database, and Docker Compose behavior.
- Update the [README](./README.md) or [wiki](https://github.com/one-zero-eight/dockgeek/wiki) when user-facing behavior changes.

## Local development

Use Node.js 24.14 or newer, npm, Git, and Docker Engine with Compose V2 for integration testing.

```bash
npm install
npm run dev
```

The frontend runs at <http://localhost:5000> and the backend at <http://localhost:5001>. Start them separately with `npm run dev:frontend` and `npm run dev:backend`. Both use the root `package.json`; frontend-only packages belong in `devDependencies`, runtime backend packages in `dependencies`.

## Project layout

- `backend/`: server, models, migrations, and Socket.IO handlers
- `common/`: shared utilities
- `frontend/src/`: Vue components, styles, and translations
- `frontend/public/`: frontend assets
- `docker/`: production image definitions
- `dev-projects/`: Docker Compose project fixtures for development
- `extra/`: maintenance and release scripts

## Code style and checks

Use four-space indentation for TypeScript and Vue and two spaces for YAML. Use double quotes and semicolons in TypeScript, `camelCase` identifiers, `snake_case` SQLite fields, and `kebab-case` CSS classes. Add JSDoc to methods and functions, and preserve existing behavior unless the change requires otherwise.

Before submitting, run:

```bash
npm run lint
npm run check-ts
npm run build:frontend
npm test
```

Document manual tests for behavior that automated tests do not cover. Publishing the `ghcr.io/one-zero-eight/dockgeek:2.0.0` and `:2` images is a maintainer operation; keep release versions in `package.json` and `package-lock.json` synchronized.
