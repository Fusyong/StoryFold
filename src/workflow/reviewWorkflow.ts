import { Logger } from '../utils';
import { getReviewJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import { PROMPT_REVIEW } from '../prompts/llmPrompts';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface ReviewInput {
  finalText: string;
}

export interface ReviewResult {
  reviewText: string;
}

/**
 * 对最终作品进行多角色审读，结果写入 review.json。
 */
export async function runReview(input: ReviewInput): Promise<ReviewResult> {
  const logger = Logger.getInstance();

  let reviewText: string;

  const client = getLlmClient();
  if (client) {
    logger.info('runReview: 使用 LLM 进行多角色审读');
    const userContent = `请对以下最终作品进行多角色审读：\n\n${input.finalText || '（暂无正文）'}`;
    const result = await client.chat(
      [
        { role: 'system', content: PROMPT_REVIEW },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.3 },
    );
    if (result && result.length > 0) {
      reviewText = result;
    } else {
      logger.info('LLM 未返回有效内容，使用占位审读');
      reviewText = '【审读（占位）】\n未配置 LLM 或未返回内容，请配置后重试。';
    }
  } else {
    void vscode.window.showInformationMessage(
      '未配置 LLM，无法进行多角色审读。',
    );
    reviewText = '【审读（占位）】\n请先配置 LLM 后再进行多角色审读。';
  }

  const reviewPath = getReviewJsonPath();
  if (reviewPath) {
    try {
      fs.writeFileSync(
        reviewPath,
        JSON.stringify({ text: reviewText }, null, 2),
        'utf8',
      );
      logger.info(`review.json written at ${reviewPath}`);
    } catch (err) {
      logger.error('Failed to write review.json', err);
    }
  }

  return { reviewText };
}
