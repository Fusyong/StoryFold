/**
 * 循环改进：修订步骤（Revise）。根据采纳的建议修改内容并写回。MVP 仅支持 phase='final'。
 */

import { Logger } from '../utils';
import { getFinalJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
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

const SYSTEM_PROMPT_REVISE_FINAL = `你是一位面向少年儿童内容的编辑。用户将提供一篇「最终作品」和若干条修改建议。请**仅根据这些建议**对正文进行修改，输出修订后的完整正文。要求：
- 逐条落实建议，不要遗漏；
- 保持原文风格与结构，仅改建议涉及之处；
- 直接输出修订后的全文，不要加「修订版」等标题或解释。`;

/**
 * 按采纳的建议修订内容；修订后写回 final.json（仅 final 阶段）。
 */
export async function runRevise(input: ReviseInput): Promise<ReviseResult> {
  const logger = Logger.getInstance();

  if (input.phase !== 'final') {
    logger.info('runRevise: MVP 仅支持 final 阶段');
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

  const userContent = `【当前正文】\n\n${input.content || '（空）'}\n\n【修改建议（请逐条落实）】\n\n${suggestionsText}`;

  try {
    const result = await client.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT_REVISE_FINAL },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.3 },
    );
    const revisedContent = result && result.trim() ? result.trim() : input.content;

    const finalPath = getFinalJsonPath();
    if (finalPath) {
      fs.writeFileSync(finalPath, JSON.stringify({ text: revisedContent }, null, 2), 'utf8');
      logger.info('refinementRevise: final.json 已更新');
    }

    return { revisedContent };
  } catch (err) {
    logger.error('runRevise failed', err);
    void vscode.window.showErrorMessage('修订失败，请查看输出面板。');
    return { revisedContent: input.content };
  }
}
