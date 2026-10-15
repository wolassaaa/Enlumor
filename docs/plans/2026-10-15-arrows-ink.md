# Enlumor arrows and ink implementation plan
Spec: docs/FEATURES.md; user-approved reading/annotation roadmap and two-task review cadence.
Baseline: 48ab539. Release target: 0.1.8.
## Global Constraints
Keep original PDF read-only, SQLite authoritative, native unrotated PDF coordinates.
Reuse page-scoped gesture guards, atomic save, session undo/redo, export verification.
One valid drag/stroke creates one annotation and exits to selection, matching existing line tool.
Arrow points start to end; exported standard Line with ClosedArrow end. Ink stores ordered native path (one stroke per annotation) exported as standard Ink. No pressure simulation or smoothing that changes saved geometry.
Cancel on Escape, scrolling, scale/rotation, document/layout change; clamp to starting page.
Bound ink sampling to 4096 points, skip subpixel duplicate moves. Imperative SVG draft, no React per move.
## Task 1: Arrow annotation
Interfaces: Annotation.type arrow; points[4]; existing quads bbox; UI draw mode; export line endings.
1. Add failing validator, Python crop/rotation export, real Electron arrow persistence/export tests.
2. Implement arrow mode via existing line gesture, render head at terminal endpoint, persist/undo/recolor/delete through existing transaction.
3. Verify whole unit/Python suites plus new arrow E2E.
Expected: standard Line subtype3 ending (None,ClosedArrow); endpoints match native coordinates.
## Task 2: Ink annotation
Interfaces: Annotation.type ink; points flat ordered pairs length4..8192; shared page-scoped tool and export.
1. Add failing ordered path/invalid geometry tests; Python Ink export; Electron cancel/persistence/undo/export tests.
2. Implement bounded sampled native path, SVG polyline, standard Ink subtype15.
3. Verify whole suites, two-task independent final review and fixes red-to-green, then release:verified.
Expected: order preserved (including closed strokes); short clicks do not persist, one stroke one annotation.
## Review Focus
Check native endpoint/path transforms under four rotations, cropped origins and display scaling.
Check same-turn cancel, pending-save guards, page clamp, secondary pointers, tool state and color.
Check bounded sampling preserves terminal point, annotation shape/export consistency, old types and cached pages.
Check no per-move React work, source PDF unchanged, old data retained; no DB schema bump.
