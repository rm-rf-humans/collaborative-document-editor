# Demo Script

Target length: 3 minutes maximum

## 1. Opening

- Show the repo root and mention the monorepo structure: `apps/web`, `apps/api`, `packages/shared`, `docs`.
- Run `npm run dev`.
- Open `http://localhost:5173`.

## 2. Authentication and Document Load

- Log in as `Layla Hassan`.
- Point out the document list and select `Launch Plan Draft`.
- Mention that the frontend loaded the document through the documented REST contract.

## 3. Collaboration Flow

- Open a second browser tab or window with another seeded user such as `Omar Nabil`.
- Show both users present in the same document.
- Type in one window and show the update appearing in the other.

## 4. AI Flow

- Select a paragraph.
- Click `Summarize` or `Rewrite`.
- Wait for the queued request to complete.
- Show the AI proposal in the right panel.
- Apply the suggestion and mention that it becomes a new document version instead of silently mutating content.

## 5. Sharing and Versioning

- In the sharing panel, update another user’s role or AI permission.
- Open version history.
- Revert to an earlier version and show that the document changes and the version history persists.

## 6. Close

- Mention the validation commands:
  - `npm run typecheck`
  - `npm test`
  - `npm run build`
- Point to `docs/report/report.tex`, `docs/report/report.pdf`, and `docs/diagrams/*.mmd` as the architecture deliverables.
