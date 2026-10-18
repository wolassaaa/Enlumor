# Task 1 fresh spec + quality review

- Candidate: `7b87bdb..dc9f231a3934111bd27461961e2d387d6eace88f` (HEAD verified).
- Review basis: task-1-brief.md, task-1-report.md and task-1-review.diff; then direct inspection of candidate main/renderer code, unchanged reducer/IPC integration, tests, acceptance document and raw TASK1 evidence. The completed-follow-up screenshot was opened.
- **Spec verdict: PASS for Task 1 implementation and local automated acceptance preparation.**
- **Quality verdict: PASS. No actionable P0/P1/P2/P3 findings identified in the candidate diff.**
- **Wave A real-service gate: NOT EXECUTED / NOT PASSED.** Local fixtures do not complete that gate.

## Code-backed checks

| Requirement | Inspected proof |
| --- | --- |
| Optional bounded follow-up, unchanged normal payload | `src/main/cruise-requests.ts:4,11-15,22`: only optional followUp is added; malformed/null/array/non-string/blank/1001-character questions and non-string/8193-character previousAnswer fail before profile/verify/generate. Inclusive 1000/8192 boundaries are permitted. Normal request still serializes exactly `{blockId,text}` and preserves the original static prompt. Explicit undefined follows the optional normal branch. |
| Current evidence and prompt boundaries | `src/main/cruise-requests.ts:15,20-22`: existing annotation validation and verify-block path remain; prompt serializes only current block ID/text plus question and optional bounded previousAnswer. It distinguishes model explanation from source evidence and declines treating question/document data as operational instructions. The main IPC integration remains unchanged in `src/main/index.ts:61-70`. |
| Shared registry and cancellation | `src/main/cruise-requests.ts:7-9,16-21,24`: both routes use the same active job/controller, current-job guard and event channel; replacing or canceling a job suppresses late callbacks, including validation completing after cancellation. Invalid follow-up is rejected before it replaces an active valid request. |
| Independent ephemeral UI, no normal-cache contamination | `src/renderer/CruisePanel.tsx:7-8,15-16,22-24,30-33,45,73`: separate followUp state/job; terminal events clear follow ownership; normal reducer only accepts its own explaining request ID (`src/shared/cruise.ts:18`). The persisted session contains only ordinary `state.results`; no follow-up text/question or annotation writes were added. Input editing clears its old answer/status. |
| Completed explanation excerpt only | `src/renderer/CruisePanel.tsx:31`: previousAnswer comes from the current block's completed results entry only when displayed normal text matches it and normal state is not error, then slices to 8192. No previous follow-up answer participates. Failed ordinary partial fixture asserts omission of previousAnswer. |
| Ownership and transition controls | `src/renderer/CruisePanel.tsx:16,21-25,30-33,36-50,60,64`: request ID, reader, epoch, block, profile and document all gate follow-up events. Cancellation clears ownership synchronously before IPC. Block/page navigation clears follow-up; service changes pause/cancel then clear; settings, background, takeover and unmount cancel; paused/canceled questions are retained for manual retry. Ordinary explain/resume and follow-up submission are mutually guarded. Parent mounts CruisePanel keyed by document ID (`src/renderer/main.tsx:293`). |
| Acceptance stays honest | `docs/acceptance/wave-a-real-api.md`: new follow-up outbound scope and pending live checks are documented; real DeepSeek connection/model ID/current-paper explanation/follow-up/pause/retry remain NOT EXECUTED. No protocol/schema/dependency or Surfing implementation is introduced. |

## Evidence audit (recorded executions, not rerun by reviewer)

All paths below are under `D:/codex project/Enlumor/.worktrees/v04-wave-ab/evidence/v051-wave-a/`. I inspected their raw command/input/result/exit records and compared their coverage to the actual tests rather than accepting the report alone.

| Evidence | Exact recorded command | Literal result | Exit |
| --- | --- | --- | --- |
| TASK1-unit-RED.txt | `npx vitest run tests/cruise-requests.test.ts` | `Test Files  1 failed (1)`; `Tests  12 failed \| 12 passed (24)` | 1 |
| TASK1-electron-RED.txt | `npx playwright test tests/e2e/cruise.spec.ts -g 'current-block follow-up streams separately'` | `Error: element(s) not found` for current follow-up input; `1 failed` | 1 |
| TASK1-unit-GREEN.txt | `npx vitest run tests/cruise-requests.test.ts` | `Test Files  1 passed (1)`; `Tests  24 passed (24)` | 0 |
| TASK1-electron-focused.txt | `npx playwright test tests/e2e/cruise.spec.ts -g 'current-block follow-up\|failed normal partial\|invalidates ownership'` | `12 passed (33.3s)` | 0 |
| TASK1-electron-GREEN.txt | `npx playwright test tests/e2e/cruise.spec.ts` | `21 passed (1.4m)` | 0 |
| TASK1-unit-FULL.txt | `npm test` | `Test Files  21 passed (21)`; `Tests  152 passed (152)` | 0 |
| TASK1-build.txt | `npm run build` | `✓ 36 modules transformed.`; `✓ built in 313ms` | 0 |
| TASK1-diff-check.txt | `git diff --check` | No diff error recorded | 0 |

Inputs are local request fixtures / generated PDFs / temporary isolated userData / localhost SSE, not a real provider. Initial build evidence records two actual TS7031 failures; focused and final build logs record the subsequent successful type fix. Electron code checks separate streaming, retry after cancel/429/truncation/timeout, immutable normal cache/annotations/source hash, cleared session-only follow-up after unmount, and direct injection of old request-ID delta/done/error after pause/block/profile/settings/background/unmount/document changes. The 1000/8192 and malformed input cases are genuinely tested in request unit tests; the renderer integration checks completed excerpt truncation at 8192.

## Review boundary and disposition

No whole suite was rerun, no active UI or real credentials/API were used, and no product/index/branch change was made by this review. No concrete unresolved doubt required an extra focused execution. Existing SQLite experimental, Vite size, color and line-ending warnings are not new failures. Parent-owned staged/unstaged state and original rollback snapshots are outside this implementation review and were left untouched.

Task 1 may pass the implementation review checkpoint. Task 2 remains controller-owned. Current Wave A must still complete its genuine required gate before the user's conditional shared Cruise/Surfing foundation and UIUX Pro Max future direction begins; this review neither starts Surfing nor certifies that future work.
