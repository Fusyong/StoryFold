import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '../utils';
import { WebviewManager } from '../ui/webviewManager';

interface JsonFieldTarget {
  jsonPath: string;
  field: string;
}

const tempTargets = new Map<string, JsonFieldTarget>();

/**
 * 打开某个 JSON 文件中的字符串字段到一个临时文件中编辑。
 * 保存该临时文件时，会自动回写到原来的 JSON 字段。
 */
export async function openJsonFieldInTempEditor(
  target: JsonFieldTarget,
  options?: { language?: string; defaultText?: string },
): Promise<void> {
  const logger = Logger.getInstance();
  const { jsonPath, field } = target;

  let current = options?.defaultText ?? '';

  if (fs.existsSync(jsonPath)) {
    try {
      const raw = fs.readFileSync(jsonPath, 'utf8');
      const obj = JSON.parse(raw) as Record<string, unknown>;
      const val = obj[field];
      if (typeof val === 'string') {
        current = val;
      }
    } catch (err) {
      logger.error(`解析 JSON 失败：${jsonPath}`, err);
    }
  }

  const tmpPath = path.join(
    os.tmpdir(),
    `storyfold-${field}-${Date.now()}-${Math.random().toString(36).slice(2)}.md`,
  );
  fs.writeFileSync(tmpPath, current, 'utf8');

  const doc = await vscode.workspace.openTextDocument(tmpPath);
  tempTargets.set(doc.fileName, target);
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
}

/**
 * 注册保存钩子：当保存某个临时文件时，自动把内容写回对应 JSON 字段。
 */
export function registerJsonFieldSaveHook(context: vscode.ExtensionContext) {
  const logger = Logger.getInstance();
  const sub = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    const key = doc.fileName;
    const target = tempTargets.get(key);
    if (!target) {
      return;
    }
    const { jsonPath, field } = target;
    const text = doc.getText();

    let obj: Record<string, unknown> = {};
    if (fs.existsSync(jsonPath)) {
      try {
        const raw = fs.readFileSync(jsonPath, 'utf8');
        obj = JSON.parse(raw) as Record<string, unknown>;
      } catch (err) {
        logger.error(`解析 JSON 失败：${jsonPath}，将覆盖为仅包含该字段`, err);
        obj = {};
      }
    }

    obj[field] = text;

    try {
      fs.writeFileSync(jsonPath, JSON.stringify(obj, null, 2), 'utf8');
      logger.info(`已将临时文件内容写回 ${jsonPath} 字段 ${field}`);
      await vscode.window.showInformationMessage(
        `已将当前文档内容保存回 ${path.basename(jsonPath)} 的字段 ${field}`,
      );
      // 延迟刷新，确保文件写入完成且 webview 能接收消息（后台 tab 时可能需短暂延迟）
      setTimeout(() => {
        WebviewManager.getInstance().refreshFromJson();
      }, 100);
    } catch (err) {
      logger.error(`写入 JSON 失败：${jsonPath}`, err);
      await vscode.window.showErrorMessage(`写入 ${jsonPath} 失败，请查看输出面板。`);
    }
  });

  context.subscriptions.push(sub);
}

