# A2 independent spec and quality review

## Verdict
**PASS for the A2 automated implementation. No Critical, Important, or other actionable findings identified in 836ae3e..eda05b2.** This is not the combined Wave A release verdict.

## Review scope and method
Read task-2-brief.md, task-2-report.md and the supplied task-2-review.diff; inspected targeted current implementations and recorded test output. No source changes, full suites, competing builds, credentials or live provider calls were performed. Parent-owned untracked acceptance scripts/evidence are excluded and remain for Wave review.

## Contract and quality checks
- `src/renderer/CruisePanel.tsx:10-18,38-52`: auto mode/pace controls, countdown and advancing timers are removed. Newly serialized sessions are explicitly manual. The finite local command closure preserves original reader operations, pause cancellation/request identity, takeover/background pause and cleanup. Existing save acknowledgement/retry remains intact.
- `src/renderer/reading-commands.ts:1-11`: exact three-member typed union, exhaustive switch and runtime rejection of unknown/null/missing-block inputs; no generic IPC, network/model entry point or annotation-framework migration.
- `src/renderer/pdf-reader.ts:134-150`: actual active document/fingerprint, readiness and live PDF checks precede focus; existing annotation geometry validation checks page bounds and quads before navigation. Real reader methods are exercised by the new dispatcher tests rather than replaced with successful locate mocks.
- `src/main/cruise-sessions.ts:5-14` and `src/shared/cruise.ts:10`: legacy auto records normalize to manual/paused on main read/write, including finished records; raw reducer restore independently pauses auto records. Results and original source metadata survive; manual-finished remains finished; annotations stay on their existing chain.
- `tests/e2e/cruise.spec.ts:9-45`: 21,050 ms hold checks stable quote/status and exactly one request after saved explanation, with auto controls absent. Always-on-top fixture stabilization ends before a distinct real cover-window focus-loss check verifies visible-but-unfocused and paused. Explicit next, raw SQLite auto/finished restart, cached back navigation, nonempty annotation preservation and unchanged PDF hash are checked.
- `tests/e2e/cruise.spec.ts:7,48-96`: invalid source anchor fails before network; manual takeover, cancellation/late success, exit, incomplete answer handling and retry retain coverage.
- `tests/e2e/native-apis.spec.ts:1-4`: generated two-page local fixture replaces an absent benchmark dependency; native protocol execution still asserts page-1 evidence present and page-2 evidence absent. No product protocol changes were added.

## Evidence audited (recorded runs, not rerun by reviewer)
- `npm test`: `Test Files 21 passed (21)`; `Tests 139 passed (139)`; exit 0.
- `npm run build`: `36 modules transformed`; `built in 320ms`; exit 0.
- `ENLUMOR_EVIDENCE_DIR=evidence/v04-wave-a npx playwright test tests/e2e/cruise.spec.ts tests/e2e/native-apis.spec.ts`: `10 passed (49.1s)`; exit 0.
- `npm run typecheck` after native fixture correction: `tsc --noEmit`; exit 0.
Existing SQLite, Vite chunk and color notices do not establish new product regressions.

## Remaining gates
The parent reports a local Attention Is All You Need paper/title-anchor smoke check with unchanged source hash; that is reader evidence, not live AI-provider acceptance. Real DeepSeek connection/API acceptance remains NOT TESTED. Combined A1+A2 Wave review, real-provider acceptance, verified release and packaged acceptance must precede full Wave A completion or Wave B.
