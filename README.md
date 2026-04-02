# CollabWrite Midterm Project

`CollabWrite` is a collaborative document editor proof of concept built for the midterm brief. The repository includes:

- a React frontend for document editing, sharing, version history, and AI suggestions
- an Express + WebSocket backend for auth, documents, realtime collaboration, and AI orchestration
- a shared contract package using Zod for end-to-end schema alignment
- architecture diagrams, ADRs, requirements, project-management artifacts, and a full report in `docs/report`

## Repository Layout

```text
apps/
  api/        Express API + WebSocket collaboration hub
  web/        React frontend
packages/
  shared/     Shared Zod schemas and TypeScript contracts
docs/
  diagrams/   Mermaid source and rendered assets
  report/     Submission report and supporting material
```

## What the PoC Demonstrates

- login with seeded users
- document list and document creation
- realtime presence and content propagation over WebSocket
- role-aware sharing with `owner`, `editor`, `commenter`, and `viewer`
- document version history and revert
- AI suggestion flow for rewrite, summarize, translate, and restructure
- explicit shared request/response contracts across web and API

## What It Intentionally Does Not Implement Yet

- production identity provider integration
- persistent database or cache
- OT/CRDT-grade concurrent merge logic
- real export jobs and production LLM provider integration

## Prerequisites

- Node.js 24+
- npm 11+

## Setup

```bash
npm install
cp .env.example .env
```

## Run the PoC

```bash
npm run dev
```

Services:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`

## Verification

```bash
npm run typecheck
npm test
npm run build
```

## Key Demo Flow

1. Open the frontend and log in as `Layla Hassan`.
2. Open `Launch Plan Draft`.
3. Edit the document and observe live save propagation.
4. Select text and request `Summarize` or `Rewrite`.
5. Apply or reject the returned AI suggestion.
6. Open version history and revert to a previous version.
7. Update sharing for another seeded user and verify role behavior.

See [docs/demo-script.md](docs/demo-script.md) for a tighter 3-minute demo outline.

## Submission Artifacts

- Report: [docs/report/report.md](docs/report/report.md)
- Editable diagrams: `docs/diagrams/*.mmd`
- Source code: this repository

## Notes on Implementation Alignment

The PoC uses an in-memory repository and mock AI provider, but the code boundaries match the documented production architecture: shared contracts, route/service/repository layers, realtime collaboration hub, and an asynchronous AI suggestion workflow.
