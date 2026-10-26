import type { Plan } from './plan.ts';

export interface RefreshRequest {
  /** On browser start every list is re-checked; otherwise only expired ones. */
  checkAll: boolean;
  /** Skip the merge when nothing changed since this signature. */
  lastSignature?: string;
  maxDynamicRules: number;
  maxDisabledStaticRules: number;
}

export interface SourceStatus {
  id: string;
  name: string;
  /** fresh: a newer copy than the bundle is in use. bundled: the packaged copy is. */
  state: 'fresh' | 'bundled' | 'failed';
  updatedAt?: number;
  error?: string;
}

export type RefreshResult =
  | { status: 'unchanged'; signature: string; sources: SourceStatus[] }
  | { status: 'planned'; signature: string; sources: SourceStatus[]; plan: Plan }
  | { status: 'error'; error: string };

export interface PopupState {
  enabled: boolean;
  host?: string;
  paused: boolean;
  lastRefresh?: LastRefresh;
}

export interface LastRefresh {
  at: number;
  ok: boolean;
  error?: string;
  sources: SourceStatus[];
  added: number;
  removed: number;
}

export type Message =
  | { type: 'cosmetic:page' }
  | { type: 'cosmetic:tokens'; tokens: string[] }
  | { type: 'popup:state'; url?: string | undefined }
  | { type: 'popup:set-enabled'; enabled: boolean }
  | { type: 'popup:set-paused'; host: string; paused: boolean }
  | { type: 'refresh:now' }
  | { type: 'refresh:start'; target: 'offscreen'; request: RefreshRequest }
  | { type: 'refresh:result'; result: RefreshResult };
