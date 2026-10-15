# SDD ledger — plan: docs/plans/2026-10-15-arrows-ink.md
Spec: docs/FEATURES.md and approved user roadmap.
Pre-flight: arrow and ink share Annotation.points and gesture mode; use directed flat points, one bbox quad, type-specific validation.
Pre-flight: export consumes native points; derotation/crop matrix remains shared and Python tested independently.
Task 1: in progress. Arrow unit RED 1 failed; Python RED errors=4 for unsupported annotation.

Task 1: complete 48ab539..4886736; unit31/Python6/arrow E2E1 passed.
Task 2: implementation ready; unit32/Python7/Electron13 passed. Final review and release pending.
Task 2: Ink export initially rejected Point objects; inspected installed PyMuPDF sequence check, adapted to numeric pairs; regression green. Color assertion uses float tolerance for PDF float serialization.

Final: Important layout changes leave a live gesture on moved geometry; fix gate requires arrow/ink, same-turn/after-render RED→GREEN.
Final: minor (deferred): SVG filled arrow head versus exported hollow ClosedArrow and differing proportions. Endpoint/direction behavior correct; aesthetic alignment deferred.
Final: Ruling: pressure/smoothing/multi-stroke grouping/persistent mode remain outside this approved minimal batch — one native stroke/one transaction/one-shot stays predictable — cost if wrong: repeated activation/no pressure-sensitive handwriting.
Final: Ruling: eraser/direct manipulation of saved drawings stay on subsequent roadmap — deletion currently removes entire annotation — cost if wrong: fine-grained editing deferred.
Final: Ruling: standalone Acrobat rendering remains untested — real Edge visual checks and standard structure verification are used — cost if wrong: independent Acrobat-specific appearance issues may remain.
Final: release/runtime/performance judgment withheld until real packaged gate.
Final fix test correction: 12 passed, four hidden-notes cases reached successful draft/count cancellation then failed role lookup because sidebar intentionally hidden; includeHidden checks actual tool state without requiring visibility. No production workaround.
Final: fixed layout drawing geometry — 16 tests RED→GREEN; complete release32+7+58=97 passed; published EXE29 passed; rollback copy passed.

# SDD ledger — plan: docs/plans/2026-10-15-arrows-ink.md
Task 1: complete (commits 48ab539..4886736, tests: npx playwright test arrows-ink.spec.ts →   1 passed (3.1s))
Task 2: complete (commits 4886736..0733495, tests: npx playwright test arrows-ink.spec.ts →   29 passed (49.3s))
