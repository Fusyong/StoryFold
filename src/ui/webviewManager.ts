import * as vscode from 'vscode';
import { Logger } from '../utils';
import { runRequirementsDraft } from '../workflow/requirementsWorkflow';
import { runOutlineDraft } from '../workflow/outlineWorkflow';
import { runSampleDraft } from '../workflow/sampleWorkflow';
import { runFinalDraft } from '../workflow/finalWorkflow';
import { runReview } from '../workflow/reviewWorkflow';
import { runAgeCheck } from '../workflow/ageCheckWorkflow';
import { getBriefJsonPath, getFinalJsonPath, getOutlineJsonPath, getSamplesJsonPath, getReviewJsonPath, getAgeCheckJsonPath } from '../storage/projectLayout';
import * as fs from 'fs';

/**
 * WebviewManager（MVP）：
 * 管理一个简单的「StoryFold 创作工作台」面板，
 * 在单一 Webview 中展示四个阶段，并触发占位 workflow。
 */
export class WebviewManager {
  private static instance: WebviewManager | undefined;
  private panel: vscode.WebviewPanel | undefined;

  private constructor() {}

  public static getInstance(): WebviewManager {
    if (!this.instance) {
      this.instance = new WebviewManager();
    }
    return this.instance;
  }

  openWorkbench(context: vscode.ExtensionContext) {
    const logger = Logger.getInstance();

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

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(async (message) => {
      if (!this.panel) {
        return;
      }
      if (message.type === 'runFlow') {
        const raw: string = String(message.payload ?? '');
        logger.info('Webview requested flow run (MVP).');
        try {
          const brief = await runRequirementsDraft({ rawText: raw });
          const outline = await runOutlineDraft({ briefText: brief.briefText });
          const sample = await runSampleDraft({
            briefText: brief.briefText,
            outlineText: outline.outlineText,
          });
          const final = await runFinalDraft({
            briefText: brief.briefText,
            outlineText: outline.outlineText,
            samplesText: sample.sampleText,
          });

          this.panel.webview.postMessage({
            type: 'flowResult',
            payload: {
              briefText: brief.briefText,
              outlineText: outline.outlineText,
              sampleText: sample.sampleText,
              finalText: final.finalText,
              reviewText: '',
              ageCheckText: '',
            },
          });
        } catch (err) {
          logger.error('Error while running StoryFold flow (MVP).', err);
          vscode.window.showErrorMessage('运行 StoryFold 占位流程时出错，请查看输出面板。');
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
      } else if (message.type === 'runAgeCheck') {
        logger.info('Webview requested age-appropriateness check.');
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
          vscode.window.showWarningMessage('请先生成最终作品后再进行适龄自检。');
          return;
        }
        try {
          const result = await runAgeCheck({ finalText });
          this.panel.webview.postMessage({
            type: 'ageCheckResult',
            payload: { reportText: result.reportText },
          });
          this.refreshFromJson();
        } catch (err) {
          logger.error('Error while running age check.', err);
          vscode.window.showErrorMessage('适龄自检时出错，请查看输出面板。');
        }
      }
    });

    // 打开工作台时，如果已有 JSON 数据，则先从 JSON 里加载一次
    this.refreshFromJson();
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

  private getHtml(): string {
    const nonce = String(Date.now());
    // 非常简化的 HTML，用于演示单 Webview 流程。
    return /* html */ `<!DOCTYPE html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline' ${
      this.getWebviewCspSource()
    }; script-src 'nonce-${nonce}';" />
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
      button {
        margin-top: 8px;
      }
      .linkBtn {
        margin-right: 8px;
        margin-bottom: 4px;
      }
    </style>
  </head>
  <body>
    <div class="section">
      <h2>1. 需求（初步设想）</h2>
      <p>在下方输入本次创作的初步需求（题材、读者、主题等），然后点击「运行占位流程」。</p>
      <textarea id="input"></textarea>
      <button id="runButton">运行占位流程（MVP）</button>
    </div>

    <div class="section">
      <h2>2. 写作要点（占位草稿）</h2>
      <pre id="brief"></pre>
      <button class="linkBtn" data-command="storyfold.editBriefField">在编辑器中编辑写作要点</button>
    </div>

    <div class="section">
      <h2>3. 提纲及其备注</h2>
      <pre id="outline"></pre>
      <button class="linkBtn" data-command="storyfold.openOutlineFromJson">打开提纲及其备注（只读）</button>
      <button class="linkBtn" data-command="storyfold.editOutlineField">在编辑器中编辑提纲及其备注</button>
    </div>

    <div class="section">
      <h2>4. 样段（试写样章/样段）</h2>
      <pre id="sample"></pre>
      <button class="linkBtn" data-command="storyfold.editSampleField">在编辑器中编辑样段</button>
    </div>

    <div class="section">
      <h2>5. 最终作品（占位草稿）</h2>
      <pre id="final"></pre>
      <button class="linkBtn" data-command="storyfold.editFinalField">在编辑器中编辑最终作品</button>
      <button class="linkBtn" id="reviewBtn">多角色审读</button>
    </div>

    <div class="section">
      <h2>6. 多角色审读意见</h2>
      <pre id="review"></pre>
      <button class="linkBtn" data-command="storyfold.openReview">在编辑器中打开审读意见</button>
    </div>

    <div class="section">
      <h2>7. 适龄自检</h2>
      <pre id="ageCheck"></pre>
      <button class="linkBtn" id="ageCheckBtn">适龄自检</button>
      <button class="linkBtn" data-command="storyfold.openAgeCheck">在编辑器中打开适龄自检报告</button>
    </div>

    <script nonce="${nonce}">
      const vscode = acquireVsCodeApi();
      const inputEl = document.getElementById('input');
      const briefEl = document.getElementById('brief');
      const outlineEl = document.getElementById('outline');
      const sampleEl = document.getElementById('sample');
      const finalEl = document.getElementById('final');
      const reviewEl = document.getElementById('review');
      const ageCheckEl = document.getElementById('ageCheck');
      const runButton = document.getElementById('runButton');
      const reviewBtn = document.getElementById('reviewBtn');
      const ageCheckBtn = document.getElementById('ageCheckBtn');

      runButton.addEventListener('click', () => {
        vscode.postMessage({
          type: 'runFlow',
          payload: inputEl.value || '',
        });
      });

      reviewBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runReview' });
      });

      ageCheckBtn.addEventListener('click', () => {
        vscode.postMessage({ type: 'runAgeCheck' });
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
          briefEl.textContent = p.briefText || '';
          outlineEl.textContent = p.outlineText || '';
          sampleEl.textContent = p.sampleText || '';
          finalEl.textContent = p.finalText || '';
          reviewEl.textContent = p.reviewText || '';
          ageCheckEl.textContent = p.ageCheckText || '';
        } else if (msg.type === 'reviewResult') {
          reviewEl.textContent = (msg.payload && msg.payload.reviewText) || '';
        } else if (msg.type === 'ageCheckResult') {
          ageCheckEl.textContent = (msg.payload && msg.payload.reportText) || '';
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
    ageCheckText: string;
  } {
    const logger = Logger.getInstance();
    let briefText = '';
    let outlineText = '';
    let sampleText = '';
    let finalText = '';
    let reviewText = '';
    let ageCheckText = '';

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

    const ageCheckPath = getAgeCheckJsonPath();
    if (ageCheckPath && fs.existsSync(ageCheckPath)) {
      try {
        const raw = fs.readFileSync(ageCheckPath, 'utf8');
        const obj = JSON.parse(raw) as { text?: string };
        ageCheckText = obj.text ?? '';
      } catch (err) {
        logger.error(`解析 ageCheck.json 失败：${ageCheckPath}`, err);
      }
    }

    return { briefText, outlineText, sampleText, finalText, reviewText, ageCheckText };
  }
}

