import type { CommandContext } from './document-commands';
import type { Annotation } from './model';

export type EditActor = { kind: 'user'; id: string } | { kind: 'ai'; id: string; sessionId: string };
export type EditMark = Omit<Annotation, 'author'> & {
  origin: EditActor; retained: boolean; visible: boolean; version: number;
  anchorId: string | null; placement: { dx: number; dy: number };
};
export type VerifiedAnchor = { id: string; documentId: string; fingerprint: string; pageIndex: number; quote: string; quads: number[][] };
export type EditSnapshot = { context: CommandContext; marks: EditMark[]; versions: Record<string, number> };
export type EditEnvironment = { actor: EditActor; pageBounds: readonly [number, number, number, number][]; anchors: readonly VerifiedAnchor[]; newIds: readonly string[] };
export type EditGeometry = { quads: number[][]; points?: number[] };
export type EditTarget = { id: string; expectedVersion: number };
export type EditMutation =
  | { type: 'create_mark'; markType: EditMark['type']; pageIndex: number; color: string; note: string; anchorId?: string; geometry?: EditGeometry }
  | ({ type: 'update_mark'; patch: { color?: string; note?: string } } & EditTarget)
  | ({ type: 'set_mark_geometry'; geometry: EditGeometry } & EditTarget)
  | ({ type: 'set_mark_placement'; placement: { dx: number; dy: number } } & EditTarget)
  | ({ type: 'replace_mark_anchor'; anchorId: string } & EditTarget)
  | { type: 'delete_marks'; targets: EditTarget[] }
  | { type: 'set_marks_visibility'; targets: EditTarget[]; visible: boolean }
  | { type: 'set_marks_retention'; targets: EditTarget[]; retained: boolean }
  | { type: 'erase_ink'; pageIndex: number; from: [number, number]; to: [number, number]; radius: number };
export type ExportSelection = { origins: ('user' | 'ai')[]; ids: string[] | null; includeHidden: boolean };
export type EditCommand = EditMutation
  | { type: 'list_marks' } | { type: 'get_mark'; id: string }
  | { type: 'apply_edit_batch'; operations: EditMutation[] }
  | { type: 'undo_edit' | 'redo_edit'; operationId: string }
  | { type: 'prepare_mark_export'; selection: ExportSelection }
  | { type: 'export_marked_pdf'; snapshotId: string };
export type EditRequest = { requestId: string; context: CommandContext; command: EditCommand };
export type EditDelta = { id: string; expectedVersion: number; before: EditMark | null; after: EditMark | null };
export type EditErrorCode = 'EDIT_INVALID' | 'EDIT_STALE' | 'MARK_NOT_FOUND' | 'VERSION_CONFLICT' | 'ANCHOR_NOT_FOUND' | 'UNSUPPORTED_PLACEMENT' | 'BATCH_CONFLICT' | 'EDIT_TOO_LARGE';
export type EditExportSnapshot = { context: CommandContext; marks: EditMark[]; versions: Record<string, number>; digest: string };
export type PreparedEditBase = {
  ok: true; requestId: string; context: CommandContext; actor: EditActor;
  command: EditCommand; digest: string; dependencies: Record<string, number>; requiresConfirmation: boolean;
};
/** Prepared content is not a commit. The executor increments versions when applying inverse content. */
export type PreparedEdit = { ok: false; error: { code: EditErrorCode; message: string } } | (PreparedEditBase & (
  | { kind: 'read'; read: EditMark | EditMark[] }
  | { kind: 'prepared'; deltas: EditDelta[]; inverse: EditDelta[] }
  | { kind: 'history'; history: { type: 'undo_edit' | 'redo_edit'; operationId: string } }
  | { kind: 'export_snapshot'; exportSnapshot: EditExportSnapshot }
  | { kind: 'export_request'; exportRequest: { snapshotId: string } }
));
