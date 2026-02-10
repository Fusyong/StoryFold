import { Logger } from '../utils';
import { getAgeCheckJsonPath } from '../storage/projectLayout';
import { getLlmClient } from '../llm/llmClient';
import * as fs from 'fs';
import * as vscode from 'vscode';

export interface AgeCheckInput {
  finalText: string;
}

export interface AgeCheckResult {
  reportText: string;
}

const SYSTEM_PROMPT_AGE = `你是一位面向少年儿童内容的适龄与安全审读专家。请对用户提供的「最终作品」做适龄自检，从以下角度给出简明结论与建议（每条 1～2 句）：

1. **目标读者匹配**：是否适合文档中约定的目标年龄段（若未约定则按常见少儿读者假设）；语言难度、认知负荷是否合适。
2. **内容安全**：是否有暴力、恐惧、不当情感描写等需注意或修改之处。
3. **价值观与逻辑**：信息是否准确、价值观是否得当、有无明显逻辑或常识问题。

请用「通过 / 待改进」等简明结论，并列出具体建议（若有）。不要复述全文。`;

/**
 * 对最终作品做适龄自检，结果写入 ageCheck.json。
 */
export async function runAgeCheck(input: AgeCheckInput): Promise<AgeCheckResult> {
  const logger = Logger.getInstance();

  let reportText: string;

  const client = getLlmClient();
  if (client) {
    logger.info('runAgeCheck: 使用 LLM 进行适龄自检');
    const userContent = `请对以下最终作品做适龄自检：\n\n${input.finalText || '（暂无正文）'}`;
    const result = await client.chat(
      [
        { role: 'system', content: SYSTEM_PROMPT_AGE },
        { role: 'user', content: userContent },
      ],
      { temperature: 0.2 },
    );
    if (result && result.length > 0) {
      reportText = result;
    } else {
      logger.info('LLM 未返回有效内容，使用占位报告');
      reportText = '【适龄自检（占位）】\n未配置 LLM 或未返回内容，请配置后重试。';
    }
  } else {
    void vscode.window.showInformationMessage(
      '未配置 LLM，无法进行适龄自检。',
    );
    reportText = '【适龄自检（占位）】\n请先配置 LLM 后再进行适龄自检。';
  }

  const ageCheckPath = getAgeCheckJsonPath();
  if (ageCheckPath) {
    try {
      fs.writeFileSync(
        ageCheckPath,
        JSON.stringify({ text: reportText }, null, 2),
        'utf8',
      );
      logger.info(`ageCheck.json written at ${ageCheckPath}`);
    } catch (err) {
      logger.error('Failed to write ageCheck.json', err);
    }
  }

  return { reportText };
}
