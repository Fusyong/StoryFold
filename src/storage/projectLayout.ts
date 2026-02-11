import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

/**
 * ProjectLayout / flowStore（MVP 版）：
 * 约定当前创作项目的数据存放位置，并提供常用路径。
 * 第一阶段简单使用第一个 workspaceFolder 作为项目根。
 */

function getWorkspaceRoot(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  return folders[0].uri.fsPath;
}

export function getStoryFoldDir(): string | undefined {
  const root = getWorkspaceRoot();
  if (!root) return undefined;
  const dir = path.join(root, '.storyfold');
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

export function getBriefJsonPath(): string | undefined {
  const base = getStoryFoldDir();
  return base ? path.join(base, 'brief.json') : undefined;
}

export function getOutlineJsonPath(): string | undefined {
  const base = getStoryFoldDir();
  return base ? path.join(base, 'outline.json') : undefined;
}

export function getSamplesJsonPath(): string | undefined {
  const base = getStoryFoldDir();
  return base ? path.join(base, 'samples.json') : undefined;
}

export function getFinalJsonPath(): string | undefined {
  const base = getStoryFoldDir();
  return base ? path.join(base, 'final.json') : undefined;
}

export function getReviewJsonPath(): string | undefined {
  const base = getStoryFoldDir();
  return base ? path.join(base, 'review.json') : undefined;
}

export function getRefinementStatePath(): string | undefined {
  const base = getStoryFoldDir();
  return base ? path.join(base, 'refinementState.json') : undefined;
}

