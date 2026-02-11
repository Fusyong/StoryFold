/**
 * 循环改进模块：状态与建议数据模型。
 * 参见 docs/refinement-loop-design.md。
 */

export type RefinementPhase = 'brief' | 'outline' | 'sample' | 'final';

export type RefinementSuggestionType =
  | 'consistency'
  | 'completeness'
  | 'style'
  | 'safety'
  | 'logic'
  | 'other';

export type RefinementSeverity = 'info' | 'suggestion' | 'should_fix';

export interface RefinementSuggestion {
  id: string;
  type: RefinementSuggestionType;
  summary: string;
  detail?: string;
  anchor?: string;
  severity?: RefinementSeverity;
}

export interface RefinementRound {
  round: number;
  assessedAt: number;
  suggestions: RefinementSuggestion[];
  userDecision?: 'accept_all' | 'accept_selected' | 'reject' | 'edit_then_retry' | 'done';
  acceptedIds?: string[];
}

export interface RefinementState {
  phase: RefinementPhase;
  round: number;
  maxRounds?: number;
  mode: 'manual' | 'auto';
  lastAssessedAt?: number;
  lastRevisedAt?: number;
  focus?: string;
  scope?: 'full' | 'section';
}

export interface RefinementStateFile {
  state: RefinementState;
  currentRound?: RefinementRound;
}
