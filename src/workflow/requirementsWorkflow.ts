import { Logger } from '../utils';
import { getBriefJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import { PROMPT_BRIEF } from '../prompts/llmPrompts';
import * as fs from 'fs';
import * as vscode from 'vscode';

interface BriefJson {
  text: string;
}

export interface RequirementsInput {
  rawText: string;
}

export interface RequirementsResult {
  briefText: string;
}

/**
 * 根据用户初步需求生成写作要点。
 * 若已配置 LLM（如 DeepSeek）且 API Key 有效，则调用大模型生成；否则使用占位草稿并写入 brief.json。
 */
export async function runRequirementsDraft(
  input: RequirementsInput,
): Promise<RequirementsResult> {
  const logger = Logger.getInstance();
  const trimmed = input.rawText.trim();

  let briefText: string;

  const client = getLlmClient();
  if (client && trimmed.length > 0) {
    logger.info('runRequirementsDraft: 使用 LLM 生成写作要点');
    const userContent = `请根据以下初步需求，整理成一份写作要点：\n\n${trimmed}`;
    const result = await client.chat(
      [
        { role: 'system', content: PROMPT_BRIEF },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.7 },
    );
    if (result && result.length > 0) {
      briefText = `【写作要点】\n\n${result}`;
    } else {
      logger.info('LLM 未返回有效内容，使用占位草稿');
      briefText =
        trimmed.length === 0
          ? '（尚未提供需求内容）'
          : `【写作要点（占位草稿）】\n\n${trimmed}`;
    }
  } else {
    if (!client && trimmed.length > 0) {
      void vscode.window.showInformationMessage(
        '未配置 LLM API 密钥（如 DeepSeek），已使用占位草稿。请在设置中配置 storyfold.llm.apiKeys.deepseek 后重新运行流程。',
      );
    }
    logger.info('runRequirementsDraft: 使用占位草稿');
    briefText =
      trimmed.length === 0
        ? '（尚未提供需求内容）'
        : `【写作要点（占位草稿）】\n\n${trimmed}`;
  }

  const briefPath = getBriefJsonPath();
  if (briefPath) {
    const payload: BriefJson = { text: briefText };
    try {
      fs.writeFileSync(briefPath, JSON.stringify(payload, null, 2), 'utf8');
      logger.info(`brief.json written at ${briefPath}`);
    } catch (err) {
      logger.error('Failed to write brief.json', err);
    }
  }

  return { briefText };
}
