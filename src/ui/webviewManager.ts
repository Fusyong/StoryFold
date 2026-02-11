import * as vscode from 'vscode';
import { Logger } from '../utils';
import { runOutlineDraft } from '../workflow/outlineWorkflow';
import { runSampleDraft } from '../workflow/sampleWorkflow';
import { runFinalDraft } from '../workflow/finalWorkflow';
import { runReview } from '../workflow/reviewWorkflow';
import { runAssess } from '../workflow/refinementAssessWorkflow';
import { runRevise } from '../workflow/refinementReviseWorkflow';
import {
  getBriefJsonPath,
  getFinalJsonPath,
  getOutlineJsonPath,
  getSamplesJsonPath,
  getReviewJsonPath,
} from '../storage/projectLayout';
import {
  getOrInitState,
  updateAfterAssess,
  updateAfterRevise,
  endRefinement,
  readRefinementState,
} from '../storage/refinementState';
import * as fs from 'fs';
import { BRIEF_TEMPLATE } from '../constants';

/**
 * WebviewManager（MVP）：
 * 管理一个简单的「StoryFold 创作工作台」面板，
 * 在单一 Webview 中展示四个阶段，并触发占位 workflow。
 */
export class WebviewManager {
  private static instance: WebviewManager | undefined;
  private panel: vscode.WebviewPanel | undefined;
  private extensionUri: vscode.Uri | undefined;

  private constructor() {}

  public static getInstance(): WebviewManager {
    if (!this.instance) {
      this.instance = new WebviewManager();
    }
    return this.instance;
  }

  openWorkbench(context: vscode.ExtensionContext) {
    const logger = Logger.getInstance();
    this.extensionUri = context.extensionUri;

    if (this.panel) {
      this.panel.reveal(vscode.ViewColumn.One);
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'storyfoldWorkbench',
      'StoryFold 创作工作台（MVP）',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.onDidDispose(() => {
      this.panel = undefined;
    });

    // 延迟注入 HTML，避免「Could not register service worker: document is in an invalid state」
    setImmediate(() => {
      if (this.panel) {
        this.panel.webview.html = this.getHtml();
        setTimeout(() => {
          if (this.panel) {
            this.refreshFromJson();
            this.sendRefinementState();
          }
        }, 50);
      }
    });

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!this.panel) {
        return;
      }
      if (message.type === 'runOutline') {
        logger.info('Webview requested outline generation.');
        let briefText = '';
        const briefPath = getBriefJsonPath();
        if (briefPath && fs.existsSync(briefPath)) {
          try {
            const raw = fs.readFileSync(briefPath, 'utf8');
            const obj = JSON.parse(raw) as { text?: string };
            briefText = obj.text ?? '';
          } catch { /* ignore */ }
        }
        if (!briefText.trim() || briefText.trim().startsWith('请填写以下写作要点')) {
          vscode.window.showWarningMessage('请先填写写作要点后再生成提纲。');
          return;
        }
        try {
          await runOutlineDraft({ briefText });
          this.refreshFromJson();
        } catch (err) {
          logger.error('Error while running outline.', err);
          vscode.window.showErrorMessage('生成提纲时出错，请查看输出面板。');
        }
      } else if (message.type === 'runSample') {
        logger.info('Webview requested sample generation.');
        let briefText = '';
        let outlineText = '';
        const briefPath = getBriefJsonPath();
        const outlinePath = getOutlineJsonPath();
        if (briefPath && fs.existsSync(briefPath)) {
          try {
            const obj = JSON.parse(fs.readFileSync(briefPath, 'utf8')) as { text?: string };
            briefText = obj.text ?? '';
          } catch { /* ignore */ }
        }
        if (outlinePath && fs.existsSync(outlinePath)) {
          try {
            const obj = JSON.parse(fs.readFileSync(outlinePath, 'utf8')) as { text?: string; outlineText?: string; annotatedOutlineText?: string };
            outlineText = obj.text ?? '';
            if (!outlineText) {
              const o = obj.outlineText ?? '';
              const a = obj.annotatedOutlineText ?? '';
              outlineText = o && a ? `${o}\n\n${a}` : o || a;
            }
          } catch { /* ignore */ }
        }
        if (!outlineText.trim()) {
          vscode.window.showWarningMessage('请先生成提纲后再生成样段。');
          return;
        }
        try {
          await runSampleDraft({ briefText, outlineText });
          this.refreshFromJson();
        } catch (err) {
          logger.error('Error while running sample.', err);
          vscode.window.showErrorMessage('生成样段时出错，请查看输出面板。');
        }
      } else if (message.type === 'runFinal') {
        logger.info('Webview requested final generation.');
        let briefText = '';
        let outlineText = '';
        let samplesText = '';
        const briefPath = getBriefJsonPath();
        const outlinePath = getOutlineJsonPath();
        const samplesPath = getSamplesJsonPath();
        if (briefPath && fs.existsSync(briefPath)) {
          try {
            const obj = JSON.parse(fs.readFileSync(briefPath, 'utf8')) as { text?: string };
            briefText = obj.text ?? '';
          } catch { /* ignore */ }
        }
        if (outlinePath && fs.existsSync(outlinePath)) {
          try {
            const obj = JSON.parse(fs.readFileSync(outlinePath, 'utf8')) as { text?: string; outlineText?: string; annotatedOutlineText?: string };
            outlineText = obj.text ?? '';
            if (!outlineText) {
              const o = obj.outlineText ?? '';
              const a = obj.annotatedOutlineText ?? '';
              outlineText = o && a ? `${o}\n\n${a}` : o || a;
            }
          } catch { /* ignore */ }
        }
        if (samplesPath && fs.existsSync(samplesPath)) {
          try {
            const obj = JSON.parse(fs.readFileSync(samplesPath, 'utf8')) as { text?: string };
            samplesText = obj.text ?? '';
          } catch { /* ignore */ }
        }
        if (!samplesText.trim()) {
          vscode.window.showWarningMessage('请先生成样段后再生成最终作品。');
          return;
        }
        try {
          await runFinalDraft({ briefText, outlineText, samplesText });
          this.refreshFromJson();
        } catch (err) {
          logger.error('Error while running final.', err);
          vscode.window.showErrorMessage('生成最终作品时出错，请查看输出面板。');
        }
      } else if (message.type === 'runCommand') {
        const cmd = message.payload?.command;
        if (typeof cmd === 'string') {
          await vscode.commands.executeCommand(cmd);
        }
      } else if (message.type === 'runReview') {
        logger.info('Webview requested multi-role review.');
        let finalText = '';
        const finalPath = getFinalJsonPath();
        if (finalPath && fs.existsSync(finalPath)) {
          try {
            const raw = fs.readFileSync(finalPath, 'utf8');
            const obj = JSON.parse(raw) as { text?: string };
            finalText = obj.text ?? '';
          } catch {
            // ignore
          }
        }
        if (!finalText.trim()) {
          vscode.window.showWarningMessage('请先生成最终作品后再进行多角色审读。');
          return;
        }
        try {
          const review = await runReview({ finalText });
          this.panel.webview.postMessage({
            type: 'reviewResult',
            payload: { reviewText: review.reviewText },
          });
          this.refreshFromJson();
        } catch (err) {
          logger.error('Error while running review.', err);
          vscode.window.showErrorMessage('多角色审读时出错，请查看输出面板。');
        }
      } else if (message.type === 'startRefinement') {
        const phase = (message.payload?.phase as 'brief' | 'final') || 'final';
        if (phase !== 'brief' && phase !== 'final') return;
        logger.info(`Webview requested refinement assess (${phase}).`);
        let content = '';
        if (phase === 'brief') {
          const briefPath = getBriefJsonPath();
          if (briefPath && fs.existsSync(briefPath)) {
            try {
              const raw = fs.readFileSync(briefPath, 'utf8');
              const obj = JSON.parse(raw) as { text?: string };
              content = obj.text ?? '';
            } catch { /* ignore */ }
            }
          if (!content.trim()) {
            vscode.window.showWarningMessage('请先填写或编辑写作要点后再做循环改进。');
            return;
          }
        } else {
          const finalPath = getFinalJsonPath();
          if (finalPath && fs.existsSync(finalPath)) {
            try {
              const raw = fs.readFileSync(finalPath, 'utf8');
              const obj = JSON.parse(raw) as { text?: string };
              content = obj.text ?? '';
            } catch { /* ignore */ }
          }
          if (!content.trim()) {
            vscode.window.showWarningMessage('请先生成最终作品后再做循环改进。');
            return;
          }
        }
        let reviewContext = '';
        if (phase === 'final') {
          const reviewPath = getReviewJsonPath();
          if (reviewPath && fs.existsSync(reviewPath)) {
            try {
              const r = JSON.parse(fs.readFileSync(reviewPath, 'utf8')) as { text?: string };
              reviewContext = r.text ?? '';
            } catch { /* ignore */ }
          }
        }
        try {
          const { suggestions } = await runAssess({
            phase,
            content,
            reviewContext: reviewContext || undefined,
          });
          const data = updateAfterAssess(phase, suggestions);
          this.panel.webview.postMessage({
            type: 'refinementResult',
            payload: {
              phase,
              round: data.state.round,
              suggestions: data.currentRound?.suggestions ?? [],
            },
          });
        } catch (err) {
          logger.error('Error in refinement assess.', err);
          vscode.window.showErrorMessage('改进判断时出错，请查看输出面板。');
        }
      } else if (message.type === 'applyRefinement') {
        const phase = (message.payload?.phase as 'brief' | 'final') || 'final';
        if (phase !== 'brief' && phase !== 'final') return;
        const data = readRefinementState();
        if (!data || data.state.phase !== phase || !data.currentRound?.suggestions?.length) {
          vscode.window.showInformationMessage('当前没有可采纳的建议。');
          return;
        }
        let content = '';
        if (phase === 'brief') {
          const briefPath = getBriefJsonPath();
          if (briefPath && fs.existsSync(briefPath)) {
            try {
              const raw = fs.readFileSync(briefPath, 'utf8');
              const obj = JSON.parse(raw) as { text?: string };
              content = obj.text ?? '';
            } catch { /* ignore */ }
          }
        } else {
          const finalPath = getFinalJsonPath();
          if (finalPath && fs.existsSync(finalPath)) {
            try {
              const raw = fs.readFileSync(finalPath, 'utf8');
              const obj = JSON.parse(raw) as { text?: string };
              content = obj.text ?? '';
            } catch { /* ignore */ }
          }
        }
        try {
          await runRevise({
            phase,
            content,
            suggestions: data.currentRound.suggestions,
          });
          updateAfterRevise(phase);
          this.panel.webview.postMessage({
            type: 'refinementResult',
            payload: { phase, round: 0, suggestions: [] },
          });
          this.refreshFromJson();
        } catch (err) {
          logger.error('Error in refinement revise.', err);
          vscode.window.showErrorMessage('修订时出错，请查看输出面板。');
        }
      } else if (message.type === 'endRefinement') {
        const phase = (message.payload?.phase as 'brief' | 'final') || 'final';
        endRefinement(phase);
        this.panel.webview.postMessage({
          type: 'refinementResult',
          payload: { phase, round: 0, suggestions: [] },
        });
      }
    });

    // 初始数据在 setImmediate 内注入 HTML 后由 refreshFromJson() 加载
  }

  /**
   * 供外部命令调用：从 JSON 文件中读取当前项目数据并刷新 Webview。
   */
  public refreshFromJson() {
    if (!this.panel) {
      return;
    }
    const payload = this.readFlowResultFromJson();
    this.panel.webview.postMessage({
      type: 'flowResult',
      payload,
    });
  }

  /**
   * 向 Webview 发送当前循环改进状态（若有未处理建议则展示）。
   */
  public sendRefinementState() {
    if (!this.panel) return;
    const data = readRefinementState();
    if (data?.currentRound?.suggestions?.length) {
      this.panel.webview.postMessage({
        type: 'refinementResult',
        payload: {
          phase: data.state.phase,
          round: data.state.round,
          suggestions: data.currentRound.suggestions,
        },
      });
    }
  }

  private getHtml(): string {
    const nonce = String(Date.now());
    const markedUri = this.extensionUri && this.panel
      ? this.panel.webview.asWebviewUri(
          vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'marked', 'lib', 'marked.umd.js'),
        )
      : '';
    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; worker-src 'self'; style-src 'unsafe-inline' ${
      this.getWebviewCspSource()
    }; script-src 'nonce-${nonce}' ${this.getWebviewCspSource()};" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>StoryFold 创作工作台（MVP）</title>
    <style>
      body {
        font-family: var(--vscode-font-family);
        font-size: var(--vscode-font-size);
        padding: 12px;
      }
      textarea {
        width: 100%;
        min-height: 80px;
        font-family: var(--vscode-editor-font-family, monospace);
        font-size: var(--vscode-editor-font-size, 12px);
      }
      .section {
        margin-bottom: 16px;
        border: 1px solid var(--vscode-editorWidget-border, #555);
        padding: 8px;
        border-radius: 4px;
      }
      .section h2 {
        margin-top: 0;
        font-size: 14px;
      }
      pre {
        white-space: pre-wrap;
      }
      .md-content {
        white-space: normal;
        line-height: 1.6;
      }
      .md-content h1, .md-content h2, .md-content h3 { margin: 0.6em 0 0.3em 0; font-weight: 600; }
      .md-content h1 { font-size: 1.3em; }
      .md-content h2 { font-size: 1.15em; }
      .md-content h3 { font-size: 1.05em; }
      .md-content p { margin: 0.4em 0; }
      .md-content ul, .md-content ol { margin: 0.4em 0; padding-left: 1.5em; }
      .md-content code { background: var(--vscode-textCodeBlock-background); padding: 0.1em 0.3em; border-radius: 3px; }
      .md-content pre { margin: 0.5em 0; padding: 8px; background: var(--vscode-textCodeBlock-background); border-radius: 4px; overflow-x: auto; }
      .md-content pre code { padding: 0; background: none; }
      button {
        margin-top: 8px;
      }
      .linkBtn {
        margin-right: 8px;
        margin-bottom: 4px;
      }
      .section .subsection {
        margin-top: 12px;
        padding-top: 8px;
        border-top: 1px solid var(--vscode-editorWidget-border, #333);
      }
      .section .subsection h3 {
        margin: 0 0 4px 0;
        font-size: 12px;
        font-weight: 600;
      }
      .section .group-actions {
        margin: 0 0 8px 0;
        font-size: 12px;
        color: var(--vscode-descriptionForeground);
      }
    </style>
  </head>
  <body>
    <div class="section">
      <h2>1. 写作要点</h2>
      <div class="subsection">
        <div id="brief" class="md-content"></div>
        <button class="linkBtn" data-command="storyfold.editBriefField">在编辑器中编辑写作要点</button>
      </div>
      <div class="subsection refinement-block">
        <h3>循环改进</h3>
        <p class="group-actions">填写后点击「做一轮改进」由 AI 优化写作要点。</p>
        <button class="linkBtn" id="startRefinementBriefBtn">做一轮改进</button>
        <div id="refinementBriefSuggestions" style="display:none; margin-top:8px">
          <p id="refinementBriefRoundInfo"></p>
          <ul id="refinementBriefList" style="margin:4px 0; padding-left:20px"></ul>
          <button class="linkBtn" id="applyRefinementBriefBtn">全部采纳并修订</button>
          <button class="linkBtn" id="endRefinementBriefBtn">结束改进</button>
        </div>
      </div>
    </div>

    <div class="section">
      <h2>2. 提纲及其备注</h2>
      <div class="subsection">
        <div id="outline" class="md-content"></div>
        <button class="linkBtn" id="runOutlineBtn">生成提纲</button>
        <button class="linkBtn" data-command="storyfold.editOutlineField">在编辑器中编辑提纲及其备注</button>
      </div>
    </div>

    <div class="section">
      <h2>3. 样段</h2>
      <div class="subsection">
        <div id="sample" class="md-content"></div>
        <button class="linkBtn" id="runSampleBtn">生成样段</button>
        <button class="linkBtn" data-command="storyfold.editSampleField">在编辑器中编辑样段</button>
      </div>
    </div>

    <div class="section">
      <h2>4. 最终作品</h2>
      <div class="subsection">
        <h3>最终作品</h3>
        <div id="final" class="md-content"></div>
        <button class="linkBtn" id="runFinalBtn">生成最终作品</button>
        <button class="linkBtn" data-command="storyfold.editFinalField">在编辑器中编辑最终作品</button>
      </div>
      <div class="subsection">
        <h3>多角色审读意见</h3>
        <div id="review" class="md-content"></div>
        <button class="linkBtn" id="reviewBtn">多角色审读</button>
        <button class="linkBtn" data-command="storyfold.openReview">在编辑器中打开审读意见</button>
      </div>

      <div class="subsection refinement-block">
        <h3>循环改进</h3>
        <p class="group-actions">基于上方「最终作品」与「审读」意见做多轮修订。</p>
        <button class="linkBtn" id="startRefinementBtn">做一轮改进</button>
        <div id="refinementSuggestions" style="display:none; margin-top:8px">
          <p id="refinementRoundInfo"></p>
          <ul id="refinementList" style="margin:4px 0; padding-left:20px"></ul>
          <button class="linkBtn" id="applyRefinementBtn">全部采纳并修订</button>
          <button class="linkBtn" id="endRefinementBtn">结束改进</button>
        </div>
      </div>
    </div>

    ${markedUri ? `<script src="${markedUri}"></script>` : ''}
    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const briefEl = document.getElementById('brief');
      const outlineEl = document.getElementById('outline');
      const sampleEl = document.getElementById('sample');
      const finalEl = document.getElementById('final');
      const reviewEl = document.getElementById('review');
      function renderMd(el, text) {
        if (!el) return;
        const t = (text || '').trim();
        if (typeof marked !== 'undefined' && t) {
          el.innerHTML = marked.parse(t);
        } else {
          el.textContent = text || '';
        }
      }
      const reviewBtn = document.getElementById('reviewBtn');
      const runOutlineBtn = document.getElementById('runOutlineBtn');
      const startRefinementBriefBtn = document.getElementById('startRefinementBriefBtn');
      const applyRefinementBriefBtn = document.getElementById('applyRefinementBriefBtn');
      const endRefinementBriefBtn = document.getElementById('endRefinementBriefBtn');
      const refinementBriefSuggestions = document.getElementById('refinementBriefSuggestions');
      const refinementBriefRoundInfo = document.getElementById('refinementBriefRoundInfo');
      const refinementBriefList = document.getElementById('refinementBriefList');
      const startRefinementBtn = document.getElementById('startRefinementBtn');
      const applyRefinementBtn = document.getElementById('applyRefinementBtn');
      const endRefinementBtn = document.getElementById('endRefinementBtn');
      const refinementSuggestions = document.getElementById('refinementSuggestions');
      const refinementRoundInfo = document.getElementById('refinementRoundInfo');
      const refinementList = document.getElementById('refinementList');

      reviewBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runReview' });
      });
      runOutlineBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runOutline' });
      });
      const runSampleBtn = document.getElementById('runSampleBtn');
      const runFinalBtn = document.getElementById('runFinalBtn');
      runSampleBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runSample' });
      });
      runFinalBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runFinal' });
      });
      startRefinementBriefBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'startRefinement', payload: { phase: 'brief' } });
      });
      applyRefinementBriefBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'applyRefinement', payload: { phase: 'brief' } });
      });
      endRefinementBriefBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'endRefinement', payload: { phase: 'brief' } });
      });
      startRefinementBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'startRefinement', payload: { phase: 'final' } });
      });
      applyRefinementBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'applyRefinement', payload: { phase: 'final' } });
      });
      endRefinementBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'endRefinement', payload: { phase: 'final' } });
      });

      document.querySelectorAll('.linkBtn[data-command]').forEach(btn => {
        btn.addEventListener('click', () => {
          vscode.postMessage({
            type: 'runCommand',
            payload: { command: btn.getAttribute('data-command') },
          });
        });
      });

      window.addEventListener('message', event => {
        const msg = event.data;
        if (!msg || !msg.type) return;
        if (msg.type === 'flowResult') {
          const p = msg.payload || {};
          renderMd(briefEl, p.briefText || '');
          renderMd(outlineEl, p.outlineText || '');
          renderMd(sampleEl, p.sampleText || '');
          renderMd(finalEl, p.finalText || '');
          renderMd(reviewEl, p.reviewText || '');
        } else if (msg.type === 'reviewResult') {
          renderMd(reviewEl, (msg.payload && msg.payload.reviewText) || '');
        } else if (msg.type === 'refinementResult') {
          const p = msg.payload || {};
          const phase = p.phase || 'final';
          const suggestions = p.suggestions || [];
          const round = p.round || 0;
          const listHtml = suggestions.map(s =>
            '<li><strong>[' + (s.type || '') + ']</strong> ' + (s.summary || '') + (s.detail ? ' — ' + s.detail : '') + '</li>'
          ).join('');
          if (phase === 'brief') {
            if (suggestions.length > 0) {
              refinementBriefSuggestions.style.display = 'block';
              refinementBriefRoundInfo.textContent = '第 ' + round + ' 轮改进，共 ' + suggestions.length + ' 条建议：';
              refinementBriefList.innerHTML = listHtml;
            } else {
              refinementBriefSuggestions.style.display = 'none';
              refinementBriefRoundInfo.textContent = '';
              refinementBriefList.innerHTML = '';
            }
          } else {
            if (suggestions.length > 0) {
              refinementSuggestions.style.display = 'block';
              refinementRoundInfo.textContent = '第 ' + round + ' 轮改进，共 ' + suggestions.length + ' 条建议：';
              refinementList.innerHTML = listHtml;
            } else {
              refinementSuggestions.style.display = 'none';
              refinementRoundInfo.textContent = '';
              refinementList.innerHTML = '';
            }
          }
        }
      });
    </script>
  </body>
</html>`;
  }

  private getWebviewCspSource(): string {
    if (!this.panel) {
      return '';
    }
    return this.panel.webview.cspSource;
  }

  /**
   * 从 .storyfold 下的 JSON 文件读取当前写作要点 / 提纲及其备注 / 样段 / 最终作品。
   * 若某些文件不存在，则返回空字符串。
   */
  private readFlowResultFromJson(): {
    briefText: string;
    outlineText: string;
    sampleText: string;
    finalText: string;
    reviewText: string;
  } {
    const logger = Logger.getInstance();
    let briefText = '';
    let outlineText = '';
    let sampleText = '';
    let finalText = '';
    let reviewText = '';

    const briefPath = getBriefJsonPath();
    if (briefPath && fs.existsSync(briefPath)) {
      try {
        const raw = fs.readFileSync(briefPath, 'utf8');
        const obj = JSON.parse(raw) as { text?: string };
        briefText = obj.text ?? '';
      } catch (err) {
        logger.error(`解析 brief.json 失败：${briefPath}`, err);
      }
    }
    if (!briefText.trim()) {
      briefText = BRIEF_TEMPLATE;
    }

    const outlinePath = getOutlineJsonPath();
    if (outlinePath && fs.existsSync(outlinePath)) {
      try {
        const raw = fs.readFileSync(outlinePath, 'utf8');
        const obj = JSON.parse(raw) as { text?: string; outlineText?: string; annotatedOutlineText?: string };
        if (obj.text !== undefined && obj.text !== '') {
          outlineText = obj.text;
        } else {
          const o = obj.outlineText ?? '';
          const a = obj.annotatedOutlineText ?? '';
          outlineText = o && a ? `${o}\n\n${a}` : o || a;
        }
      } catch (err) {
        logger.error(`解析 outline.json 失败：${outlinePath}`, err);
      }
    }

    const samplesPath = getSamplesJsonPath();
    if (samplesPath && fs.existsSync(samplesPath)) {
      try {
        const raw = fs.readFileSync(samplesPath, 'utf8');
        const obj = JSON.parse(raw) as { text?: string };
        sampleText = obj.text ?? '';
      } catch (err) {
        logger.error(`解析 samples.json 失败：${samplesPath}`, err);
      }
    }

    const finalPath = getFinalJsonPath();
    if (finalPath && fs.existsSync(finalPath)) {
      try {
        const raw = fs.readFileSync(finalPath, 'utf8');
        const obj = JSON.parse(raw) as { text?: string };
        finalText = obj.text ?? '';
      } catch (err) {
        logger.error(`解析 final.json 失败：${finalPath}`, err);
      }
    }

    const reviewPath = getReviewJsonPath();
    if (reviewPath && fs.existsSync(reviewPath)) {
      try {
        const raw = fs.readFileSync(reviewPath, 'utf8');
        const obj = JSON.parse(raw) as { text?: string };
        reviewText = obj.text ?? '';
      } catch (err) {
        logger.error(`解析 review.json 失败：${reviewPath}`, err);
      }
    }

    return { briefText, outlineText, sampleText, finalText, reviewText };
  }
}

