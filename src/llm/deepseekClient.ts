/**
 * DeepSeek 开放平台 API 客户端（OpenAI 兼容接口）。
 */

import axios from 'axios';
import { Logger } from '../utils';
import { ConfigManager } from '../utils';
import type { ChatMessage, ChatOptions, ILlmClient } from './llmClient';

export class DeepSeekClient implements ILlmClient {
  private readonly apiKey: string;
  private readonly model: string;
  private readonly baseUrl = 'https://api.deepseek.com/v1';

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | null> {
    const config = ConfigManager.getInstance();
    const timeoutMs = config.getTimeoutSeconds() * 1000;
    const retryAttempts = config.getRetryAttempts();
    const temperature = options?.temperature ?? config.getTemperature();
    const logger = Logger.getInstance();

    const body = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature,
    };

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await axios.post<{
          choices?: Array<{ message?: { content?: string } }>;
        }>(`${this.baseUrl}/chat/completions`, body, {
          headers: {
            Authorization: `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        });

        const content = response.data?.choices?.[0]?.message?.content;
        if (typeof content === 'string') {
          return content.trim();
        }
        logger.error('DeepSeek 返回格式异常', response.data);
        return null;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        logger.error(`DeepSeek API 请求失败（第 ${attempt} 次）`, err);
        if (attempt === retryAttempts) {
          return null;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return null;
  }
}
