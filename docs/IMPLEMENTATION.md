# Enlumor / Foundation ledger

Approved scope: phase 1 of the user-supplied implementation plan, 2026-10-15.
Windows first; platform-neutral document models, renderer and coordinate transforms. iPad requires a separate native host later, not Electron.

## Decisions
- New isolated repository on feat/foundation at the user-requested path; no existing checkout to protect.
- Original PDF is read-only. SQLite owns workspace changes. Export always starts from the original.
- Canonical geometry: PDF default user space, unrotated; UI and PyMuPDF transforms are adapters.
- Development/portable export uses a configured Python virtual environment. No bundled Python yet.
- Keep source-native annotations read-only. Cross-page changes form one transaction/undo step.
- Runtime versions and acceptance evidence are recorded in VERIFICATION.txt.

## Milestones
- [ ] Desktop and runtime
- [ ] Document identity and reading
- [ ] Coordinates and selection
- [ ] Transactions and undo
- [ ] Export and note
- [ ] Acceptance and portable build

## Pre-flight
Document fingerprint and canonical quads are shared by renderer, store and exporter; one TypeScript model and explicit Python request schema.
SQLite operations return committed state; renderer updates saved status only after acknowledgement.

## Execution prompt
Implement Enlumor phase 1 in order. Keep original PDFs read-only, canonical PDF coordinates and SQLite as the only workspace authority. Test coordinate round trips, durable commits and native annotation export before adding later stages. Report observed tests and remaining gaps.
