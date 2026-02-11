import { Logger } from '../utils';
import { getSamplesJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import { PROMPT_SAMPLE } from '../prompts/llmPrompts';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface SampleInput {
  briefText: string;
  outlineText: string;
}

export interface SampleResult {
  sampleText: string;
}

/**
 * 根据写作要点与备注版大纲生成样段。
 * 若已配置 LLM 则调用大模型生成；否则使用占位草稿。
 */
export async function runSampleDraft(input: SampleInput): Promise<SampleResult> {
  const logger = Logger.getInstance();

  let sampleText: string;

  const client = getLlmClient();
  if (client) {
    logger.info('runSampleDraft: 使用 LLM 生成样段');
    const userContent = [
      '【写作要点】',
      input.briefText || '（暂无）',
      '',
      '【提纲及其备注】',
      input.outlineText || '（暂无）',
    ].join('\n');
    const result = await client.chat(
      [
        { role: 'system', content: PROMPT_SAMPLE },
        { role: 'user', content: `请根据以下材料试写一段样章/样段：\n\n${userContent}` },
      ],
      { temperature: 0.7 },
    );
    if (result && result.length > 0) {
      sampleText = result;
    } else {
      logger.info('LLM 未返回有效内容，使用占位样段');
      sampleText = buildFallbackSample(input);
    }
  } else {
    void vscode.window.showInformationMessage(
      '未配置 LLM，已使用占位样段。',
    );
    sampleText = buildFallbackSample(input);
  }

  const samplesPath = getSamplesJsonPath();
  if (samplesPath) {
    try {
      fs.writeFileSync(
        samplesPath,
        JSON.stringify({ text: sampleText }, null, 2),
        'utf8',
      );
      logger.info(`samples.json written at ${samplesPath}`);
    } catch (err) {
      logger.error('Failed to write samples.json', err);
    }
  }

  return { sampleText };
}

function buildFallbackSample(input: SampleInput): string {
  return [
    '【样段（占位草稿）】',
    '',
    '（根据写作要点与提纲及其备注生成样段需配置 LLM。）',
    '',
    '=== 写作要点（供参考） ===',
    input.briefText || '（暂无）',
    '',
    '=== 提纲及其备注（供参考） ===',
    (input.outlineText || '（暂无）').slice(0, 500) + (input.outlineText && input.outlineText.length > 500 ? '…' : ''),
  ].join('\n');
}
