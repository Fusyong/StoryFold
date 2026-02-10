import { Logger } from '../utils';
import { getReviewJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface ReviewInput {
  finalText: string;
}

export interface ReviewResult {
  reviewText: string;
}

const SYSTEM_PROMPT_REVIEW = `你是一位面向少年儿童内容的审读专家。请从以下多个角色视角对用户提供的「最终作品」给出审读意见，用清晰的小标题区分各角色，每个角色 2～4 条简明意见（逻辑、知识、适龄性、文风、可读性等）。角色与格式要求：

## 读者视角（目标儿童）
（从目标年龄段孩子的阅读感受：是否有趣、是否好懂、是否有困惑或不适）

## 教师/家长视角
（从教育性与适龄性：知识是否准确、价值观是否得当、是否有敏感或需注意之处）

## 文风与结构
（主线是否清晰、详略是否得当、人物是否鲜明、有无明显逻辑或衔接问题）

只输出上述审读内容，不要复述全文。`;

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
        { role: 'system', content: SYSTEM_PROMPT_REVIEW },
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
