/**
 * 循环改进：判断步骤（Assess）。支持 brief 与 final 阶段。
 */

import { Logger } from '../utils';
import { getLlmClient } from '../llm/llmClient';
import { PROMPT_ASSESS_BRIEF, PROMPT_ASSESS_FINAL } from '../prompts/llmPrompts';
import * as vscode from 'vscode';
import type { RefinementPhase, RefinementSuggestion } from '../types/refinement';

export interface AssessInput {
  phase: RefinementPhase;
  content: string;
  /** 可选：已有审读文本，作为上下文 */
  reviewContext?: string;
}

export interface AssessResult {
  suggestions: RefinementSuggestion[];
}

/**
 * 对当前阶段内容做一次判断，返回建议列表。支持 brief 与 final。
 */
export async function runAssess(input: AssessInput): Promise<AssessResult> {
  const logger = Logger.getInstance();

  if (input.phase !== 'brief' && input.phase !== 'final') {
    logger.info('runAssess: 仅支持 brief 与 final 阶段');
    return { suggestions: [] };
  }

  const client = getLlmClient();
  if (!client) {
    void vscode.window.showInformationMessage('未配置 LLM，无法进行改进判断。');
    return { suggestions: [] };
  }

  const isBrief = input.phase === 'brief';
  const systemPrompt = isBrief ? PROMPT_ASSESS_BRIEF : PROMPT_ASSESS_FINAL;
  let text: string;
  if (isBrief) {
    text = `请对以下「写作要点」做改进评估，输出 JSON 数组格式的建议列表：\n\n${input.content || '（暂无内容）'}`;
  } else {
    text = `请对以下「最终作品」做改进评估，输出 JSON 数组格式的建议列表：\n\n${input.content || '（暂无正文）'}`;
    if (input.reviewContext && input.reviewContext.trim()) {
      text += `\n\n【参考：已有审读意见】\n${input.reviewContext.slice(0, 2000)}`;
    }
  }

  try {
    const result = await client.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: text },
      ],
      { temperature: 0.2 },
    );
    if (!result || !result.trim()) return { suggestions: [] };
    const parsed = parseSuggestions(result);
    return { suggestions: parsed };
  } catch (err) {
    logger.error('runAssess failed', err);
    return { suggestions: [] };
  }
}

/** 从 LLM 输出中解析 JSON 数组，失败返回空数组 */
function parseSuggestions(raw: string): RefinementSuggestion[] {
  const trimmed = raw.trim();
  let jsonStr = trimmed;
  const m = trimmed.match(/\[[\s\S]*\]/);
  if (m) jsonStr = m[0];
  try {
    const arr = JSON.parse(jsonStr) as unknown[];
    if (!Array.isArray(arr)) return [];
    const out: RefinementSuggestion[] = [];
    arr.forEach((item, i) => {
      if (item && typeof item === 'object' && typeof (item as Record<string, unknown>).summary === 'string') {
        const o = item as Record<string, unknown>;
        out.push({
          id: String(o.id ?? i + 1),
          type: validType(String(o.type ?? 'other')),
          summary: String(o.summary),
          detail: o.detail != null ? String(o.detail) : undefined,
          anchor: o.anchor != null ? String(o.anchor) : undefined,
          severity: validSeverity(o.severity),
        });
      }
    });
    return out;
  } catch {
    return [];
  }
}

function validType(s: string): RefinementSuggestion['type'] {
  const allowed: RefinementSuggestion['type'][] = ['consistency', 'completeness', 'style', 'safety', 'logic', 'other'];
  return allowed.includes(s as RefinementSuggestion['type']) ? (s as RefinementSuggestion['type']) : 'other';
}

function validSeverity(v: unknown): RefinementSuggestion['severity'] {
  if (v === 'info' || v === 'suggestion' || v === 'should_fix') return v;
  return undefined;
}
