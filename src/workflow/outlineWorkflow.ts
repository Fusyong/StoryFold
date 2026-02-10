import { Logger } from '../utils';
import { getOutlineJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface OutlineInput {
  briefText: string;
}

export interface OutlineResult {
  outlineText: string;
}

const SYSTEM_PROMPT_OUTLINE = `你是一位面向少年儿童的内容创作顾问。请根据用户提供的「写作要点」，生成一份「提纲及其备注」，即：在同一个文档中既有结构化的提纲（章节、场景或要点列表），又在每个节点下直接补充设定与场景备注（须遵守的设定与时间线、本段须达成的结果/情绪节拍、可选的细节或对白建议等；可标注「待定」「方案A/B」）。参照影视设定集+分镜备注的做法，以条目与要点为主，不写完整段落。

请用清晰的小标题区分层级（如 ## 第一章、### 场景一），在每个节点下用简短条目写出备注。只输出这一份提纲及其备注，不要其他解释。`;

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
        { role: 'system', content: SYSTEM_PROMPT_OUTLINE },
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
