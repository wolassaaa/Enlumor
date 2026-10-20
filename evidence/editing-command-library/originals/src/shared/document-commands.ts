import type { CruiseBlock } from './cruise';

/** Revision belongs to the host reading context, not a second session engine. */
export type CommandContext = { documentId: string; fingerprint: string; revision: number };
export type DocumentCommand =
  | { type: 'read_page'; pageIndex: number }
  | { type: 'go_to_page'; pageIndex: number }
  | { type: 'show_evidence'; pageIndex: number; passageId: string }
  | { type: 'clear_focus' }
  | { type: 'pause' };
export type CommandRequest = { requestId: string; context: CommandContext; command: DocumentCommand };
export type CommandErrorCode = 'COMMAND_INVALID' | 'COMMAND_STALE' | 'COMMAND_CANCELED' | 'PAGE_OUT_OF_RANGE' | 'EVIDENCE_NOT_FOUND' | 'COMMAND_FAILED';
export type CommandResult =
  | { requestId: string; ok: true; result:
      | { kind: 'page'; blocks: CruiseBlock[] }
      | { kind: 'navigated'; pageIndex: number }
      | { kind: 'focused'; passageId: string; pageIndex: number }
      | { kind: 'cleared' | 'paused' } }
  | { requestId: string; ok: false; error: { code: CommandErrorCode; message: string } };
export type DocumentCommandPorts = {
  getContext(): CommandContext | null;
  getPageCount(): number;
  readPage(pageIndex: number): Promise<CruiseBlock[]>;
  /** The adapter checks isCurrent immediately before its actual viewport effect. */
  navigate(pageIndex: number, isCurrent: () => boolean): Promise<void>;
  focus(block: CruiseBlock, isCurrent: () => boolean): Promise<void>;
  clearFocus(): void;
  pause(): void;
};
