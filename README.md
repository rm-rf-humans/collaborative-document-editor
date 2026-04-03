# CollabWrite Midterm Project

`CollabWrite` is a collaborative document editor proof of concept built for the midterm brief. The repository includes:

- a React frontend for document editing, sharing, version history, and AI suggestions
- an Express + WebSocket backend for auth, documents, realtime collaboration, and AI orchestration
- a shared contract package using Zod for end-to-end schema alignment
- architecture diagrams, ADRs, requirements, project-management artifacts, and a full LaTeX report in `docs/report`


https://github.com/user-attachments/assets/bdf277a1-e5bf-4419-be5e-17b61e9fefd3




## Repository Layout

```text
apps/
  api/        Express API + WebSocket collaboration hub
  web/        React frontend
packages/
  shared/     Shared Zod schemas and TypeScript contracts
services/
  export-api/ FastAPI export worker for PDF, DOCX, and Markdown snapshots
docs/
  diagrams/   Mermaid source and rendered PDF/SVG assets
  report/     LaTeX source, compiled PDF, and supporting material
```

## What the PoC Demonstrates

- login with seeded users
- document list and document creation
- realtime presence and content propagation over WebSocket
- role-aware sharing with `owner`, `editor`, `commenter`, and `viewer`
- document version history and revert
- live OpenAI-backed AI workflows for rewrite, summarize, translate, restructure, proofread, and inline continuation, with structured-output parsing and a mock fallback when no API key is configured
- document export to PDF, DOCX, and Markdown through a dedicated FastAPI rendering worker, with an optional AI-history appendix
- explicit shared request/response contracts across web and API

## What It Intentionally Does Not Implement Yet

- production identity provider integration
- persistent database or cache
- OT/CRDT-grade concurrent merge logic
- tenant billing, enterprise governance, and provider-level evaluation infrastructure

## Prerequisites

- Node.js 24+
- npm 11+

## Setup

```bash
npm install
cp .env.example .env
python3 -m venv .venv-export
source .venv-export/bin/activate
python3 -m pip install -r services/export-api/requirements.txt
```

## Run the PoC

```bash
npm run dev
```

Run the export worker in a second terminal after activating the export virtualenv:

```bash
source .venv-export/bin/activate
npm run dev:export
```

Services:

- frontend: `http://localhost:5173`
- backend: `http://localhost:4000`
- export worker: `http://127.0.0.1:8000`

## Verification

```bash
npm run typecheck
npm test
npm run build
npm run render:report
```

If the FastAPI export worker is installed in the active virtualenv, you can also verify it with:

```bash
source .venv-export/bin/activate
npm run test:export
```

For a live end-to-end smoke test against running services, start `npm run dev` and `npm run dev:export`, then run:

```bash
npm run smoke:runtime
```

`npm test` now runs shared contract tests, backend integration/unit tests, and frontend component/unit tests.

## Demo Recording

To generate a polished browser walkthrough video that covers login, collaboration, AI, sharing, version history, export, and document creation, run:

```bash
npm run record:demo
```

The recorder uses Playwright, saves raw WebM plus MP4 output under `artifacts/demo-recordings/`, and starts or reuses the local app/export services automatically.

Committed demo video for submission/reference:

- [collabwrite-demo-1.5x.mp4](docs/demo/collabwrite-demo-1.5x.mp4)

## Real AI Integration

The backend can now use the OpenAI Responses API for production-style writing assistance instead of only the mock provider.

Environment variables:

- `EXPORT_SERVICE_URL=http://127.0.0.1:8000`
- `AI_PROVIDER=auto|openai|mock`
- `OPENAI_API_KEY=...`
- `OPENAI_FAST_MODEL=gpt-4.1-mini`
- `OPENAI_QUALITY_MODEL=gpt-4.1`
- `OPENAI_BASE_URL=https://api.openai.com/v1` for standard OpenAI, or a compatible gateway if your deployment requires one

If no `OPENAI_API_KEY` is present, the app stays runnable by falling back to the mock AI provider.

AI suggestions are version-scoped. If the document changes after a suggestion is generated, the server rejects blind apply requests and forces the client to reload or request a fresh suggestion.

Cloud-based inline completion is intentionally user-triggered rather than always-on. The provider sees only the document title plus bounded context around the cursor, the UI exposes whether the live or fallback provider is active, and the returned continuation remains a reviewable proposal until the user applies it.

## Key Demo Flow

1. Open the frontend and log in as `Layla Hassan`.
2. Open `Launch Plan Draft`.
3. Edit the document and observe live save propagation.
4. Select text and request `Summarize` or `Rewrite`.
5. Apply or reject the returned AI suggestion, or place the cursor and use `Continue Writing`.
6. Export the document as PDF, DOCX, or Markdown and include the AI history appendix.
7. Open version history and revert to a previous version.
8. Update sharing for another seeded user and verify role behavior.

See [docs/demo-script.md](docs/demo-script.md) for a tighter 3-minute demo outline.

## Submission Artifacts

- Report source: [docs/report/report.tex](docs/report/report.tex)
- Compiled report: [docs/report/report.pdf](docs/report/report.pdf)
- Editable diagrams: `docs/diagrams/*.mmd`
- Source code: this repository

## Notes on Implementation Alignment

The PoC still uses an in-memory repository, but the AI layer now supports a real provider integration through the OpenAI Responses API, structured-output parsing, route/service/provider separation, realtime completion broadcasts, and a mock fallback for local development. Export rendering is now delegated to a small FastAPI worker so the Node API can stay focused on collaboration and orchestration while Python handles document-format generation cleanly.
