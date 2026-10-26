# Current development snapshot — 27 October 2026 (code freeze)

This is the source state at the 08:00 code freeze on 27 October 2026. It is development code, not a new stable binary release; the formal Windows release remains 0.1.15. Work after the freeze is listed in the [roadmap](ROADMAP.md).

The work sits on three stacked branches:

| Branch | Pull request | What it adds |
| :--- | :--- | :--- |
| `feat/agent-harness` | #3 → `main` | Surfing that works with thinking models, each model's own output limit, a real-model benchmark (QR-tagged test PDFs, an acceptance harness and an in-app test mode), the Enlumor mark and taskbar icon, and the redesigned reader. |
| `feat/surfing-tour` | #4 → `feat/agent-harness` | Surfing walks the reader through an answer step by step, gliding and zooming to each place in the paper, automatically or with Space and the arrow keys. The composer offers the model's own thinking levels. |
| `feat/editing-default` | stacked on `feat/surfing-tour` | The editing library becomes the default annotation path, its marks export to PDF, and `--legacy-editing` starts the old path. |

## Implemented in this source

- **Surfing** answers questions about the whole paper beside the PDF. Full-document sending still needs explicit confirmation. The model can look at pages, read page text and search before it answers; answers are validated JSON, and one repair turn handles malformed replies. When an answer uses several places in the paper it comes with numbered steps, and an invalid step is dropped rather than failing the answer.
- **Thinking levels** come from the model's own API: DeepSeek offers off, low, high (default) and max; OpenAI reasoning models offer low, medium (default) and high. Other models get no thinking parameter, and the selector is disabled.
- **The editing library is the default.** Opening an older workspace upgrades it from schema v4 to v5 after an integrity-checked backup; older annotations convert when their page is opened. PDF export writes the marks as the reader sees them plus any annotation not yet converted. If the library cannot open, the app logs why and falls back to the old path. See [EDITING.md](EDITING.md) for the upgrade, the switch and how to roll back.

## Measured

Real-model results use DeepSeek V4.1 Flash (`deepseek-flash`) with the project owner's key; no other provider was run with a real key.

| Question set | Default thinking (high) | Thinking off |
| :--- | :--- | :--- |
| Lumen, 6 items | 6/6 | 5/6 — answered a figure question without opening the figure |
| Attention, 8 items | 8/8 | 7/8 — same failure, flagged for manual check |
| Hard set, 14 items | 13/14, plus 1 needing manual check | 12/14 — skipped both figure questions |
| Model time, three sets | about 207 s | about 110 s |
| In-app test mode, 22 items | 22/22 | 22/22 |

The item needing manual check is a figure the model answered from memory of a well-known paper; it is a limit of the question set, not of the tour.

Editing with 1000 strokes of 256 points each:

| Measure | Before | Now | Budget |
| :--- | :--- | :--- | :--- |
| Erase and undo, end to end | — | 858–1103 ms across runs | 1000 ms — **borderline** |
| Longest renderer task after an edit | — | 79–120 ms | 50 ms — **fails** |
| Main-process erase | 691 ms | about 110 ms | — |
| Main-process undo | 756 ms | about 260 ms | — |

These runs shared the machine with other applications using about half the CPU, so the end-to-end numbers move by a few hundred milliseconds between runs; the main-process numbers were stable.

The v4→v5 upgrade was rehearsed on a copy of a real workspace: every row survived, the backup was written and the export check passed.

Unit tests: 683 passed. Full end-to-end run: 178 of 183 passed. Of the five failures:

- One was a real regression from the editing performance work: editing an arrow's end points failed because copied marks came back frozen. It is fixed, it has a unit test, and the editing specs pass again.
- Two Cruise tests (`cruise.spec.ts:109` and `:192`) passed when run alone, twice each.
- Two are the 1000-stroke budgets: the old path's long task and the new path's end-to-end time.

## Known gaps

- The renderer still rebuilds its whole mark view after an edit. At 1000 strokes this breaks the long-task budget and leaves the end-to-end time at the edge of its budget. The fix is an incremental view (roadmap).
- End-to-end specs that test the old annotation internals run with `--legacy-editing`; the new path is covered by `editing-workflow` and `editing-geometry`.
- Some end-to-end tests are intermittent on a loaded machine: `surfing.spec.ts:54` (retry after a failed save), a few Cruise timing tests and the dense-ink performance budgets.
- Longer tour answers occasionally start as invalid JSON. The repair turn rescued every case seen so far; DeepSeek's JSON mode could remove the problem but is untested.
- macOS and iPad clients, cross-paper memory and persistent conversations are not delivered.

## Development use

Install with `setup.ps1`, then `npm run build` and `npm start`. Rebuild after source changes. Use a separate user-data profile for experiments. Older executables such as 0.1.15 refuse to open an upgraded (v5) workspace; to go back, restore the pre-v5 backup as [EDITING.md](EDITING.md) describes. No personal profile, credential or private paper is part of this source.
