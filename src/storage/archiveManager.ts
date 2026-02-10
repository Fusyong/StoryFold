/**
 * 创作档案（MVP）：将当前 .storyfold 快照保存到扩展全局存储，支持列出与克隆。
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { Logger } from '../utils';
import {
  getStoryFoldDir,
  getBriefJsonPath,
  getOutlineJsonPath,
  getSamplesJsonPath,
  getFinalJsonPath,
  getReviewJsonPath,
} from './projectLayout';

const ARCHIVES_DIR = 'archives';
const META_FILE = 'meta.json';

export interface ArchiveMeta {
  id: string;
  createdAt: number;
  name?: string;
}

/**
 * 获取档案根目录（globalStorage/archives），供「打开创作档案目录」等使用。
 */
export function getArchivesRootUri(context: vscode.ExtensionContext): vscode.Uri {
  return vscode.Uri.joinPath(context.globalStorageUri, ARCHIVES_DIR);
}

function getArchivesRoot(context: vscode.ExtensionContext): vscode.Uri {
  return getArchivesRootUri(context);
}

/**
 * 保存当前项目为创作档案。可选输入档案名称（用于展示）。
 */
export async function saveArchive(
  context: vscode.ExtensionContext,
  name?: string,
): Promise<string | null> {
  const logger = Logger.getInstance();
  const storyfoldDir = getStoryFoldDir();
  if (!storyfoldDir) {
    await vscode.window.showErrorMessage('无法确定当前项目路径（请先打开工作区）。');
    return null;
  }

  const id = `${Date.now()}${name ? `-${name.replace(/[^a-zA-Z0-9\u4e00-\u9fa5_-]/g, '_')}` : ''}`;
  const archivesRoot = getArchivesRoot(context);
  const archiveUri = vscode.Uri.joinPath(archivesRoot, id);

  await vscode.workspace.fs.createDirectory(archivesRoot);
  await vscode.workspace.fs.createDirectory(archiveUri);

  const files = [
    { path: getBriefJsonPath(), name: 'brief.json' },
    { path: getOutlineJsonPath(), name: 'outline.json' },
    { path: getSamplesJsonPath(), name: 'samples.json' },
    { path: getFinalJsonPath(), name: 'final.json' },
    { path: getReviewJsonPath(), name: 'review.json' },
  ];

  for (const { path: filePath, name: fileName } of files) {
    if (!filePath) continue;
    try {
      const data = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      await vscode.workspace.fs.writeFile(
        vscode.Uri.joinPath(archiveUri, fileName),
        data,
      );
    } catch (e) {
      logger.info(`Archive: skip ${fileName} (not found or read error)`);
    }
  }

  const meta: ArchiveMeta = { id, createdAt: Date.now(), name };
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(archiveUri, META_FILE),
    Buffer.from(JSON.stringify(meta, null, 2), 'utf8'),
  );

  logger.info(`Archive saved: ${id}`);
  return id;
}

/**
 * 列出所有档案（按创建时间倒序）。
 */
export async function listArchives(
  context: vscode.ExtensionContext,
): Promise<ArchiveMeta[]> {
  const archivesRoot = getArchivesRoot(context);
  let entries: [string, vscode.FileType][];
  try {
    entries = await vscode.workspace.fs.readDirectory(archivesRoot);
  } catch {
    return [];
  }

  const metas: ArchiveMeta[] = [];
  for (const [dirName, type] of entries) {
    if (type !== vscode.FileType.Directory) continue;
    const metaUri = vscode.Uri.joinPath(archivesRoot, dirName, META_FILE);
    try {
      const data = await vscode.workspace.fs.readFile(metaUri);
      const meta = JSON.parse(Buffer.from(data).toString('utf8')) as ArchiveMeta;
      meta.id = dirName;
      metas.push(meta);
    } catch {
      metas.push({ id: dirName, createdAt: 0, name: dirName });
    }
  }

  metas.sort((a, b) => b.createdAt - a.createdAt);
  return metas;
}

/**
 * 将指定档案克隆到当前工作区的 .storyfold，覆盖现有文件。
 */
export async function cloneArchive(
  context: vscode.ExtensionContext,
  archiveId: string,
): Promise<boolean> {
  const logger = Logger.getInstance();
  const storyfoldDir = getStoryFoldDir();
  if (!storyfoldDir) {
    await vscode.window.showErrorMessage('无法确定当前项目路径（请先打开工作区）。');
    return false;
  }

  const archivesRoot = getArchivesRoot(context);
  const archiveUri = vscode.Uri.joinPath(archivesRoot, archiveId);

  const files = ['brief.json', 'outline.json', 'samples.json', 'final.json', 'review.json'];
  for (const fileName of files) {
    const src = vscode.Uri.joinPath(archiveUri, fileName);
    try {
      const data = await vscode.workspace.fs.readFile(src);
      const dest = vscode.Uri.file(path.join(storyfoldDir, fileName));
      await vscode.workspace.fs.writeFile(dest, data);
    } catch (e) {
      logger.info(`Clone: skip ${fileName}`);
    }
  }

  logger.info(`Archive cloned: ${archiveId}`);
  return true;
}
