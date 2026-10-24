# Current development snapshot — 24 October 2026

This source snapshot synchronises the editing integration and Surfing repair work from the local development workspace. It is not a new stable binary release; the formal Windows release remains0.1.15. No installer, user workspace or candidate executable is uploaded by this source sync.

## Implemented in this development source
- Editing command persistence, IPC/controller integration, receipt-aware history, legacy import/source checks and preview rendering. The new editing path remains opt-in via `--editing-preview` with a validated isolated profile. New-mark PDF export remains unavailable; default legacy behaviour and preview acceptance are separate.
- Surfing whole-document questions and optional exploration routes, beside the PDF; current-page context, page/source navigation, cancellation and recent successful in-session dialogue. Full-document sending requires explicit confirmation. Conversation history is bounded and not persistent across opening sessions.
- Token budgeting runs off the foreground thread where supported. Known OpenAI models and supported DeepSeek Chat-compatible profiles have separate budgeting paths; budget estimates are not universal exact token counts.

## Fresh checks for this source publication
On24 October2026, `npm run typecheck`, `npm test`, `npm run test:python` and `npm run build` exited0. The unit suite passed39 files /619 tests; Python passed21 tests. The build reported its existing large-chunk advisory; it completed successfully.

These checks do not establish real-provider reading quality, full packaged acceptance or universal responsiveness. No paid provider request was made for this publication.

## Acceptance still outstanding
- Real model service and two-paper reading feedback; source-ID validity is not semantic correctness.
- Full end-to-end/package/performance suites were not rerun for this upload. Previous full candidate regression recorded164/165 passing, with the dense1000 editing-preview latency/long-task gate failing. The repair package's earlier15 Surfing-specific mock tests do not supersede that full-suite limitation.
- macOS/iPad, cross-paper memory, conversation persistence and new editing-mark export are not delivered by this snapshot.

## Development use
Install with `setup.ps1`; use `npm run build` before `npm start` to include the Surfing token worker. Rebuild after source changes. Use a disposable, separate user-data profile for experimental work; do not use an older executable to open a newer preview database. No personal profile or credential is bundled.

The code-only fixture archive under `evidence/editing-production-integration/originals/` supports the existing isolated rollback script. Runtime evidence directories, private papers, browser storage, databases and binaries are deliberately excluded from this source publication.
