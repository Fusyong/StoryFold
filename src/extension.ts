import * as vscode from 'vscode';
import * as fs from 'fs';
import { Logger } from './utils';
import { WebviewManager } from './ui/webviewManager';
import { getBriefJsonPath, getFinalJsonPath, getOutlineJsonPath, getSamplesJsonPath, getReviewJsonPath, getAgeCheckJsonPath } from './storage/projectLayout';
import { openJsonFieldInTempEditor, registerJsonFieldSaveHook } from './storage/jsonFieldEditor';
import { saveArchive, listArchives, cloneArchive, getArchivesRootUri } from './storage/archiveManager';

/**
 * StoryFold VS Code extension entry point (MVP).
 *
 * 第一阶段提供一个简单的「创作工作台」命令，
 * 通过输入框/临时文档串起：需求 → 写作要点 → 提纲与备注版大纲 → 最终作品。
 * 后续会在此基础上接入 Webview 与完整 workflow。
 */

export function activate(context: vscode.ExtensionContext) {
  const logger = Logger.getInstance();
  logger.info('StoryFold extension activated (MVP).');

  // 注册 JSON 字段编辑临时文件的保存钩子
  registerJsonFieldSaveHook(context);

  const openWorkbenchCmd = vscode.commands.registerCommand(
    'storyfold.openWorkbench',
    async () => {
      WebviewManager.getInstance().openWorkbench(context);
    },
  );

  const refreshWorkbenchCmd = vscode.commands.registerCommand(
    'storyfold.refreshWorkbench',
    async () => {
      WebviewManager.getInstance().refreshFromJson();
    },
  );

  const editBriefCmd = vscode.commands.registerCommand(
    'storyfold.editBriefField',
    async () => {
      const briefPath = getBriefJsonPath();
      if (!briefPath) {
        await vscode.window.showErrorMessage('无法确定 brief.json 路径（没有 workspaceFolder？）。');
        return;
      }
      await openJsonFieldInTempEditor(
        { jsonPath: briefPath, field: 'text' },
        { language: 'markdown', defaultText: '' },
      );
    },
  );

  const editOutlineCmd = vscode.commands.registerCommand(
    'storyfold.editOutlineField',
    async () => {
      const outlinePath = getOutlineJsonPath();
      if (!outlinePath) {
        await vscode.window.showErrorMessage('无法确定 outline.json 路径（没有 workspaceFolder？）。');
        return;
      }
      let defaultText = '';
      if (fs.existsSync(outlinePath)) {
        try {
          const obj = JSON.parse(fs.readFileSync(outlinePath, 'utf8')) as { text?: string; outlineText?: string; annotatedOutlineText?: string };
          if (obj.text !== undefined && obj.text !== '') {
            defaultText = obj.text;
          } else {
            const o = obj.outlineText ?? '';
            const a = obj.annotatedOutlineText ?? '';
            defaultText = o && a ? `${o}\n\n${a}` : o || a;
          }
        } catch {
          // ignore
        }
      }
      await openJsonFieldInTempEditor(
        { jsonPath: outlinePath, field: 'text' },
        { language: 'markdown', defaultText },
      );
    },
  );

  const editFinalCmd = vscode.commands.registerCommand(
    'storyfold.editFinalField',
    async () => {
      const finalPath = getFinalJsonPath();
      if (!finalPath) {
        await vscode.window.showErrorMessage('无法确定 final.json 路径（没有 workspaceFolder？）。');
        return;
      }
      await openJsonFieldInTempEditor(
        { jsonPath: finalPath, field: 'text' },
        { language: 'markdown', defaultText: '' },
      );
    },
  );

  const editSampleCmd = vscode.commands.registerCommand(
    'storyfold.editSampleField',
    async () => {
      const samplesPath = getSamplesJsonPath();
      if (!samplesPath) {
        await vscode.window.showErrorMessage('无法确定 samples.json 路径（没有 workspaceFolder？）。');
        return;
      }
      await openJsonFieldInTempEditor(
        { jsonPath: samplesPath, field: 'text' },
        { language: 'markdown', defaultText: '' },
      );
    },
  );

  const openReviewCmd = vscode.commands.registerCommand(
    'storyfold.openReview',
    async () => {
      const reviewPath = getReviewJsonPath();
      if (!reviewPath) {
        await vscode.window.showErrorMessage('无法确定 review.json 路径（没有 workspaceFolder？）。');
        return;
      }
      await openJsonFieldInTempEditor(
        { jsonPath: reviewPath, field: 'text' },
        { language: 'markdown', defaultText: '' },
      );
    },
  );

  const openAgeCheckCmd = vscode.commands.registerCommand(
    'storyfold.openAgeCheck',
    async () => {
      const ageCheckPath = getAgeCheckJsonPath();
      if (!ageCheckPath) {
        await vscode.window.showErrorMessage('无法确定 ageCheck.json 路径（没有 workspaceFolder？）。');
        return;
      }
      await openJsonFieldInTempEditor(
        { jsonPath: ageCheckPath, field: 'text' },
        { language: 'markdown', defaultText: '' },
      );
    },
  );

  const openArchiveFolderCmd = vscode.commands.registerCommand(
    'storyfold.openArchiveFolder',
    async () => {
      const uri = getArchivesRootUri(context);
      await vscode.env.openExternal(uri);
    },
  );

  const saveArchiveCmd = vscode.commands.registerCommand(
    'storyfold.saveArchive',
    async () => {
      const name = await vscode.window.showInputBox({
        title: '创作档案',
        prompt: '为当前项目保存一份档案（可选输入名称，用于列表展示）',
        placeHolder: '例如：小红帽 v1',
      });
      if (name === undefined) return; // 用户取消
      const id = await saveArchive(context, name || undefined);
      if (id) {
        await vscode.window.showInformationMessage(`已保存创作档案：${id}`);
      }
    },
  );

  const cloneFromArchiveCmd = vscode.commands.registerCommand(
    'storyfold.cloneFromArchive',
    async () => {
      const archives = await listArchives(context);
      if (archives.length === 0) {
        await vscode.window.showInformationMessage('暂无创作档案，请先使用「保存为创作档案」保存当前项目。');
        return;
      }
      const items = archives.map((a) => ({
        label: a.name || a.id,
        description: new Date(a.createdAt).toLocaleString(),
        archiveId: a.id,
      }));
      const picked = await vscode.window.showQuickPick(items, {
        title: '选择要克隆的档案',
        matchOnDescription: true,
      });
      if (!picked) return;
      const ok = await cloneArchive(context, picked.archiveId);
      if (ok) {
        WebviewManager.getInstance().refreshFromJson();
        await vscode.window.showInformationMessage(`已从档案「${picked.label}」克隆到当前项目。`);
      }
    },
  );

  context.subscriptions.push(
    openWorkbenchCmd,
    refreshWorkbenchCmd,
    editBriefCmd,
    editOutlineCmd,
    editFinalCmd,
    editSampleCmd,
    openReviewCmd,
    openAgeCheckCmd,
    openArchiveFolderCmd,
    saveArchiveCmd,
    cloneFromArchiveCmd,
    logger,
  );
}

export function deactivate() {
  // Logger 在 subscriptions 中，会随扩展停用而被释放。
}

