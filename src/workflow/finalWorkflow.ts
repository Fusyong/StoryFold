import { Logger } from '../utils';
import { getFinalJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface FinalInput {
  briefText: string;
  outlineText: string;
  samplesText?: string;
}

export interface FinalResult {
  finalText: string;
}

const SYSTEM_PROMPT_FINAL = `你是一位面向少年儿童的创作者。请根据用户提供的「写作要点」和「提纲及其备注」，创作一篇完整的最终作品（故事或知识普及文章）。要求：
- 主线明确，情节清晰，详略得当；
- 人物有特点，细节具体可感；
- 保持知识与逻辑严谨，符合目标读者年龄；
- 直接输出正文，不要加「最终作品」等标题或多余说明。`;

/**
 * 根据写作要点与备注版大纲（及可选样段）生成最终作品。
 * 若已配置 LLM 则调用大模型生成；否则使用占位草稿。
 */
export async function runFinalDraft(input: FinalInput): Promise<FinalResult> {
  const logger = Logger.getInstance();

  let finalText: string;

  const client = getLlmClient();
  if (client) {
    logger.info('runFinalDraft: 使用 LLM 生成最终作品');
    const parts: string[] = [
      '【写作要点】\n',
      input.briefText || '（暂无）',
      '\n\n【提纲及其备注】\n',
      input.outlineText || '（暂无）',
    ];
    if (input.samplesText && input.samplesText.trim().length > 0) {
      parts.push('\n\n【样张样段（供参考）】\n');
      parts.push(input.samplesText.trim());
    }
    const userContent = `请根据以下材料创作最终作品：\n\n${parts.join('')}`;
    const result = await client.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT_FINAL },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.7 },
    );
    if (result && result.length > 0) {
      finalText = `【最终作品】\n\n${result}`;
    } else {
      logger.info('LLM 未返回有效内容，使用占位草稿');
      finalText = buildFallbackFinal(input);
    }
  } else {
    void vscode.window.showInformationMessage(
      '未配置 LLM，已使用占位最终作品。',
    );
    finalText = buildFallbackFinal(input);
  }

  const finalPath = getFinalJsonPath();
  if (finalPath) {
    try {
      fs.writeFileSync(
        finalPath,
        JSON.stringify({ text: finalText }, null, 2),
        'utf8',
      );
      logger.info(`final.json written at ${finalPath}`);
    } catch (err) {
      logger.error('Failed to write final.json', err);
    }
  }

  return { finalText };
}

function buildFallbackFinal(input: FinalInput): string {
  const parts: string[] = [
    '【最终作品（占位草稿）】\n\n',
    '（根据提纲及其备注生成完整作品需配置 LLM。）\n',
    '\n=== 写作要点（供参考） ===\n',
    input.briefText || '（暂无）',
    '\n\n=== 提纲及其备注（供参考） ===\n',
    input.outlineText || '（暂无）',
  ];
  if (input.samplesText && input.samplesText.trim().length > 0) {
    parts.push('\n\n=== 样张样段（供参考） ===\n');
    parts.push(input.samplesText.trim());
  }
  return parts.join('');
}
