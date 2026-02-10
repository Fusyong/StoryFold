import * as vscode from 'vscode';

export interface Prompt {
  name: string;
  content: string;
}

/**
 * PromptManager: 管理 StoryFold 的提示词配置。
 * 第一阶段只提供最基本的读取功能，后续可扩展增删改 UI。
 */
export class PromptManager {
  static readonly CONFIG_KEY = 'prompts';

  static getPrompts(): Prompt[] {
    const config = vscode.workspace.getConfiguration('storyfold');
    const list = config.get<Prompt[]>(this.CONFIG_KEY, []);
    return Array.isArray(list) ? list : [];
  }
}

