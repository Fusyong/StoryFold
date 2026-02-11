/**
 * 循环改进：修订步骤（Revise）。根据采纳的建议修改内容并写回。支持 brief 与 final 阶段。
 */

import { Logger } from '../utils';
import { getBriefJsonPath, getFinalJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import { PROMPT_REVISE_BRIEF, PROMPT_REVISE_FINAL } from '../prompts/llmPrompts';
import * as fs from 'fs';
import * as vscode from 'vscode';
import type { RefinementPhase, RefinementSuggestion } from '../types/refinement';

export interface ReviseInput {
  phase: RefinementPhase;
  content: string;
  suggestions: RefinementSuggestion[];
}

export interface ReviseResult {
  revisedContent: string;
}

/**
 * 按采纳的建议修订内容；修订后写回 brief.json 或 final.json。
 */
export async function runRevise(input: ReviseInput): Promise<ReviseResult> {
  const logger = Logger.getInstance();

  if (input.phase !== 'brief' && input.phase !== 'final') {
    logger.info('runRevise: 仅支持 brief 与 final 阶段');
    return { revisedContent: input.content };
  }

  const client = getLlmClient();
  if (!client) {
    void vscode.window.showInformationMessage('未配置 LLM，无法执行修订。');
    return { revisedContent: input.content };
  }

  const suggestionsText = input.suggestions
    .map((s) => `- [${s.type}] ${s.summary}${s.detail ? `\n  ${s.detail}` : ''}`)
    .join('\n');

  const isBrief = input.phase === 'brief';
  const systemPrompt = isBrief ? PROMPT_REVISE_BRIEF : PROMPT_REVISE_FINAL;
  const contentLabel = isBrief ? '当前写作要点' : '当前正文';
  const userContent = `【${contentLabel}】\n\n${input.content || '（空）'}\n\n【修改建议（请逐条落实）】\n\n${suggestionsText}`;

  try {
    const result = await client.chat(
      [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.3 },
    );
    const revisedContent = result && result.trim() ? result.trim() : input.content;

    if (isBrief) {
      const briefPath = getBriefJsonPath();
      if (briefPath) {
        fs.writeFileSync(briefPath, JSON.stringify({ text: revisedContent }, null, 2), 'utf8');
        logger.info('refinementRevise: brief.json 已更新');
      }
    } else {
      const finalPath = getFinalJsonPath();
      if (finalPath) {
        fs.writeFileSync(finalPath, JSON.stringify({ text: revisedContent }, null, 2), 'utf8');
        logger.info('refinementRevise: final.json 已更新');
      }
    }

    return { revisedContent };
  } catch (err) {
    logger.error('runRevise failed', err);
    void vscode.window.showErrorMessage('修订失败，请查看输出面板。');
    return { revisedContent: input.content };
  }
}
