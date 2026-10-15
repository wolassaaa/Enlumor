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
- [x] Desktop and runtime
- [x] Document identity and reading
- [x] Coordinates and selection
- [x] Transactions and undo
- [x] Export and note
- [x] Automated acceptance and portable build

## Observed review and fixes
- Independent final review identified undo/redo retries losing action kind; a real SQLite trigger failure reproduced the disabled-redo bug. Pending operations now retain their action kind; regression passed.
- PDF.js search wraps matches in nested spans; selecting searched text duplicated quote/quads. A failing real Electron regression now passes with unique text-node traversal.
- Windows legacy stdin encoding corrupted Chinese file paths. JSON requests now decode from UTF-8 bytes, with a GBK-environment subprocess regression.
- Windows fsync requires a writable file handle. Export temp-file fsync uses r+b.
- Runtime verified inside the packaged application: Electron 44.7.2 / Node 24.21.0 / SQLite 3.53.4.
- 11 Vitest checks, 3 Python unittest cases and 9 real Electron scenarios pass.
- Packaged application opened/annotated/exported a PDF. Edge displayed the exported native highlight correctly; screenshots inspected.
- Actual portable EXE was separately launched through its extraction wrapper; renderer and SQLite workspace initialized successfully and the window closed.
- Standalone Adobe Acrobat Reader is not installed, so its separate compatibility gate remains unverified. Edge's Adobe-powered PDF engine was visually verified, not treated as a standalone Acrobat test.
- macOS/iPad, arbitrary tilted glyphs and bundled Python remain later work, not implemented.
- Packaging compression changed from maximum to store after maximum compression consumed several minutes on this machine; portable executable trades size for fast reproducible local builds.
- npm audit reports 8 moderate development-toolchain advisories (electron-builder -> sprintf-js); production dependency audit reports 0. No automated breaking downgrade applied.

## Completion / handoff
First-stage application code is implemented. Keep feat/foundation in place; no remote was added and no changes were pushed. Original PDFs and personal userData are not touched by code rollback. Next product milestone is reader completion, not AI.

## 0.1.1 — UI and self-contained PDF runtime
- User confirmed direct EXE open -> add PDF failed with duplicate PYTHON_MISSING. Reproduced in a real packaged application with ENLUMOR_PYTHON unset.
- Root cause: portable Electron extracts to a temporary directory, where the old resolver looked for a development .venv. The 0.1.0 package did not include an interpreter/worker.
- Choice: keep TypeScript/Electron and Python/PyMuPDF. Package a PyInstaller onedir worker including the interpreter and libraries; prefer it in packaged builds. Do not rewrite a working document/annotation pipeline in Rust to solve a missing build resource.
- Worker build dependencies pinned in requirements-build.txt. Windows worker is built on Windows; future macOS needs its own build. iPad still requires a separate client.
- User approved warm-paper/dark-ink UI. Implemented collapsible document/annotation panels, contextual selection tools, lighter chrome, clearer typography, revised empty state and inline SVG icons without a new UI framework.
- Error formatting avoids duplicate codes. Child close event waits for complete stdout before parsing JSON.
- Independent review identified stale floating-toolbar placement after scroll/layout changes. Regression failed first; fixed by dismissing the contextual toolbar on scroll, scale, rotation, resize and sidebar changes.
- Selection toolbar prefers space above selected text rather than covering the following sentence; placement regression passed.
- Rotation regression also caught a toolbar that escaped the PDF viewport and intercepted the annotation-sidebar button. Its position is now clamped to the reader bounds; scale tests assert that both toolbar edges stay inside the reader.
- Existing workspace schema and persisted document/annotation models unchanged. No personal database modifications or migrations.
- Release is Enlumor 0.1.1.exe; old 0.1.0.exe retained, not promoted as the fixed build.
- Fresh results and guarded copy-only rollback: evidence/ui-runtime/VERIFICATION.txt.

## Pre-flight
Document fingerprint and canonical quads are shared by renderer, store and exporter; one TypeScript model and explicit Python request schema.
SQLite operations return committed state; renderer updates saved status only after acknowledgement.

## Execution prompt
Implement Enlumor phase 1 in order. Keep original PDFs read-only, canonical PDF coordinates and SQLite as the only workspace authority. Test coordinate round trips, durable commits and native annotation export before adding later stages. Report observed tests and remaining gaps.
