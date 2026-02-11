import { Logger } from '../utils';
import { getOutlineJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import { PROMPT_OUTLINE } from '../prompts/llmPrompts';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface OutlineInput {
  briefText: string;
}

export interface OutlineResult {
  outlineText: string;
}

/**
 * 根据写作要点生成提纲及其备注（合并为一份文档）。
 * 若已配置 LLM 则调用大模型生成；否则使用占位草稿。
 */
export async function runOutlineDraft(
  input: OutlineInput,
): Promise<OutlineResult> {
  const logger = Logger.getInstance();
  const base = input.briefText.trim() || '（尚未提供写作要点）';

  let outlineText: string;

  const client = getLlmClient();
  if (client) {
    logger.info('runOutlineDraft: 使用 LLM 生成提纲及其备注');
    const userContent = `请根据以下写作要点，生成「提纲及其备注」：\n\n${base}`;
    const result = await client.chat(
      [
        { role: 'system', content: PROMPT_OUTLINE },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.6 },
    );
    if (result && result.length > 0) {
      outlineText = result.trim();
    } else {
      logger.info('LLM 未返回有效内容，使用占位草稿');
      outlineText = fallbackOutline(base);
    }
  } else {
    void vscode.window.showInformationMessage(
      '未配置 LLM，已使用占位提纲及其备注。',
    );
    outlineText = fallbackOutline(base);
  }

  const outlinePath = getOutlineJsonPath();
  if (outlinePath) {
    try {
      fs.writeFileSync(
        outlinePath,
        JSON.stringify({ text: outlineText }, null, 2),
        'utf8',
      );
      logger.info(`outline.json written at ${outlinePath}`);
    } catch (err) {
      logger.error('Failed to write outline.json', err);
    }
  }

  return { outlineText };
}

function fallbackOutline(brief: string): string {
  return (
    `【提纲及其备注（占位草稿）】\n\n` +
    `- 基于写作要点：\n${brief}\n\n` +
    `- 请配置 LLM 后重新运行流程，生成带设定与场景备注的提纲。`
  );
}
