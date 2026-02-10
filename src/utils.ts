import * as vscode from 'vscode';

/**
 * Logger: 简单的输出通道封装，便于在开发和排错时记录信息。
 */
export class Logger {
  private static instance: Logger | undefined;
  private channel: vscode.OutputChannel;

  private constructor() {
    this.channel = vscode.window.createOutputChannel('StoryFold');
  }

  public static getInstance(): Logger {
    if (!this.instance) {
      this.instance = new Logger();
    }
    return this.instance;
  }

  info(message: string) {
    this.channel.appendLine(`[INFO] ${message}`);
  }

  error(message: string, error?: unknown) {
    this.channel.appendLine(`[ERROR] ${message}`);
    if (error instanceof Error) {
      this.channel.appendLine(error.stack ?? error.message);
    } else if (error) {
      this.channel.appendLine(String(error));
    }
  }

  dispose() {
    this.channel.dispose();
  }
}

/**
 * ConfigManager: 读取 storyfold.* 配置的轻量封装。
 * 第一阶段主要使用 storyfold.llm.platform，后续可逐步扩展。
 */
export class ConfigManager {
  private static instance: ConfigManager | undefined;

  private constructor() {}

  public static getInstance(): ConfigManager {
    if (!this.instance) {
      this.instance = new ConfigManager();
    }
    return this.instance;
  }

  private get config() {
    return vscode.workspace.getConfiguration('storyfold');
  }

  getPlatform(): string {
    return this.config.get<string>('llm.platform', 'deepseek');
  }

  getApiKey(platform: string): string {
    return this.config.get<string>(`llm.apiKeys.${platform}`, '') ?? '';
  }

  getModel(platform: string): string {
    const defaults: Record<string, string> = {
      deepseek: 'deepseek-chat',
      ollama: 'llama2',
    };
    return this.config.get<string>(`llm.models.${platform}`, defaults[platform] ?? '') ?? defaults[platform] ?? '';
  }

  /** Ollama 等本地服务使用；未配置时 Ollama 默认 http://localhost:11434 */
  getBaseUrl(platform: string): string {
    const defaults: Record<string, string> = {
      ollama: 'http://localhost:11434',
    };
    return this.config.get<string>(`llm.baseUrl.${platform}`, defaults[platform] ?? '') ?? defaults[platform] ?? '';
  }

  getTimeoutSeconds(): number {
    return this.config.get<number>('llm.timeout', 60) ?? 60;
  }

  getRetryAttempts(): number {
    return this.config.get<number>('llm.retryAttempts', 2) ?? 2;
  }

  getTemperature(): number {
    return this.config.get<number>('llm.temperature', 0.7) ?? 0.7;
  }
}

