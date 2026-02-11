/**
 * 循环改进状态读写。持久化到 .storyfold/refinementState.json。
 */

import * as fs from 'fs';
import { getRefinementStatePath } from './projectLayout';
import type {
  RefinementState,
  RefinementStateFile,
  RefinementRound,
  RefinementPhase,
} from '../types/refinement';

const DEFAULT_MAX_ROUNDS = 3;

function defaultState(phase: RefinementPhase): RefinementState {
  return {
    phase,
    round: 0,
    maxRounds: DEFAULT_MAX_ROUNDS,
    mode: 'manual',
  };
}

/**
 * 读取当前改进状态与本轮建议；文件不存在或解析失败时返回 null。
 */
export function readRefinementState(): RefinementStateFile | null {
  const path = getRefinementStatePath();
  if (!path || !fs.existsSync(path)) return null;
  try {
    const raw = fs.readFileSync(path, 'utf8');
    return JSON.parse(raw) as RefinementStateFile;
  } catch {
    return null;
  }
}

/**
 * 写入状态与当前轮建议。
 */
export function writeRefinementState(data: RefinementStateFile): void {
  const path = getRefinementStatePath();
  if (!path) return;
  fs.writeFileSync(path, JSON.stringify(data, null, 2), 'utf8');
}

/**
 * 开始或进入某阶段的改进：若该阶段无状态则初始化，并返回当前状态（round 未变）。
 */
export function getOrInitState(phase: RefinementPhase): RefinementStateFile {
  const existing = readRefinementState();
  if (existing && existing.state.phase === phase) {
    return existing;
  }
  const state = defaultState(phase);
  const data: RefinementStateFile = { state, currentRound: undefined };
  writeRefinementState(data);
  return data;
}

/**
 * 完成一次「判断」后更新：round+1，写入 currentRound，更新 lastAssessedAt。
 */
export function updateAfterAssess(
  phase: RefinementPhase,
  suggestions: RefinementRound['suggestions'],
): RefinementStateFile {
  const data = getOrInitState(phase);
  const state = data.state;
  const nextRound = state.round + 1;
  const currentRound: RefinementRound = {
    round: nextRound,
    assessedAt: Date.now(),
    suggestions,
  };
  state.round = nextRound;
  state.lastAssessedAt = currentRound.assessedAt;
  const next: RefinementStateFile = { state, currentRound };
  writeRefinementState(next);
  return next;
}

/**
 * 完成一次「修订」后：清空 currentRound（本轮已处理），更新 lastRevisedAt。
 */
export function updateAfterRevise(phase: RefinementPhase): RefinementStateFile {
  const data = readRefinementState();
  if (!data || data.state.phase !== phase) return getOrInitState(phase);
  data.state.lastRevisedAt = Date.now();
  data.currentRound = undefined;
  writeRefinementState(data);
  return data;
}

/**
 * 用户结束改进：清空 currentRound，保留 state 供查看 round 等。
 */
export function endRefinement(phase: RefinementPhase): void {
  const data = readRefinementState();
  if (!data || data.state.phase !== phase) return;
  data.currentRound = undefined;
  writeRefinementState(data);
}
