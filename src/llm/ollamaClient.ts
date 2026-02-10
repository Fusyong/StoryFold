/**
 * Ollama 本地 API 客户端（无需 API Key）。
 * 默认请求 http://localhost:11434/api/chat。
 */

import axios from 'axios';
import { Logger } from '../utils';
import { ConfigManager } from '../utils';
import type { ChatMessage, ChatOptions, ILlmClient } from './llmClient';

export class OllamaClient implements ILlmClient {
  private readonly baseUrl: string;
  private readonly model: string;

  constructor(baseUrl: string, model: string) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.model = model;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | null> {
    const config = ConfigManager.getInstance();
    const timeoutMs = config.getTimeoutSeconds() * 1000;
    const retryAttempts = config.getRetryAttempts();
    const logger = Logger.getInstance();

    const body = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      stream: false,
      options: {
        temperature: options?.temperature ?? config.getTemperature(),
      },
    };

    for (let attempt = 1; attempt <= retryAttempts; attempt++) {
      try {
        const response = await axios.post<{
          message?: { content?: string };
        }>(`${this.baseUrl}/api/chat`, body, {
          timeout: timeoutMs,
        });

        const content = response.data?.message?.content;
        if (typeof content === 'string') {
          return content.trim();
        }
        logger.error('Ollama 返回格式异常', response.data);
        return null;
      } catch (err) {
        logger.error(`Ollama API 请求失败（第 ${attempt} 次）`, err);
        if (attempt === retryAttempts) {
          return null;
        }
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    return null;
  }
}
