/**
 * LLM 统一接口与工厂。
 * 根据 storyfold.llm.platform 返回对应实现；未配置 API Key 时返回 null。
 */

import { ConfigManager } from '../utils';
import { DeepSeekClient } from './deepseekClient';
import { OllamaClient } from './ollamaClient';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ChatOptions {
  temperature?: number;
}

export interface ILlmClient {
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string | null>;
}

/**
 * 获取当前配置下的 LLM 客户端；无 API Key 或平台不支持时返回 null。
 */
export function getLlmClient(): ILlmClient | null {
  const config = ConfigManager.getInstance();
  const platform = config.getPlatform();

  if (platform === 'deepseek') {
    const apiKey = config.getApiKey('deepseek');
    if (!apiKey || apiKey.trim() === '') {
      return null;
    }
    const model = config.getModel('deepseek');
    return new DeepSeekClient(apiKey, model);
  }

  if (platform === 'ollama') {
    const baseUrl = config.getBaseUrl('ollama');
    const model = config.getModel('ollama');
    if (!baseUrl || !model) {
      return null;
    }
    return new OllamaClient(baseUrl, model);
  }

  // aliyun、google 等后续可在此扩展
  return null;
}
