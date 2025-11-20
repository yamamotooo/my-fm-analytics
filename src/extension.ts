// VS Code 拡張機能 API の読み込み
import * as vscode from 'vscode';
// ファイルパス操作ユーティリティ
import * as path from 'path';
// 非同期ファイル操作（Promise 版）
import { promises as fs } from 'fs';
// XML 解析用 DOM パーサ
import { DOMParser } from '@xmldom/xmldom';

// 1 インデント分のスペース（4 つ）
const indentUnit = '    ';
// インデントを増やす開始ステップ
const startSteps = new Set(['Loop', 'If']);
// インデントを減らす終了ステップ
const endSteps = new Set(['End Loop', 'End If']);
// ブロック途中の Else / Else If は出力前後でインデントが変動する
const middleSteps = new Set(['Else', 'Else If']);

// コマンド ID（日本語 / 英語）
const EXPORT_COMMAND = 'my-fm-analytics.exportScriptCatalog';
const EXPORT_COMMAND_EN = 'my-fm-analytics.exportScriptCatalog.en';

/**
 * 拡張機能が有効化されたときに呼ばれるエントリポイント。
 * コマンド登録などの初期化を行う。
 */
export function activate(context: vscode.ExtensionContext) {
  const helloDisposable = vscode.commands.registerCommand('my-fm-analytics.helloWorld', () => {
    vscode.window.showInformationMessage('Hello World from my-fm-analytics!');
  });

  // エクスポート処理を実行するコマンドを登録するヘルパー
  const registerExport = (commandId: string) =>
    vscode.commands.registerCommand(commandId, async () => {
      await runExportScriptCatalog();
    });

  // 日本語/英語それぞれのコマンドを登録
  const exportDisposableJa = registerExport(EXPORT_COMMAND);
  const exportDisposableEn = registerExport(EXPORT_COMMAND_EN);

  // 破棄対象として登録
  context.subscriptions.push(helloDisposable, exportDisposableJa, exportDisposableEn);
}

// 無効化時フック（特に後処理なし）
export function deactivate() {}

/**
 * アクティブな XML エディタを対象に、ScriptCatalog を解析して
 * 各スクリプトをテキストとしてディレクトリに書き出す。
 */
async function runExportScriptCatalog(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    // アクティブなエディタがない場合は中断
    vscode.window.showErrorMessage('No XML file is currently open.');
    return;
  }

  if (editor.document.uri.scheme !== 'file') {
    // 保存済みファイル以外（untitled 等）は対象外
    vscode.window.showErrorMessage('Export is available only for files stored on disk.');
    return;
  }

  const xmlText = editor.document.getText();
  if (!xmlText.trim()) {
    // 空文書は中断
    vscode.window.showErrorMessage('The XML document is empty.');
    return;
  }

  // XML パース時のエラーを収集
  const parserErrors: string[] = [];
  const parser = new DOMParser({
    errorHandler: {
      warning: (msg: string) => parserErrors.push(msg),
      error: (msg: string) => parserErrors.push(msg),
      fatalError: (msg: string) => parserErrors.push(msg)
    }
  });

  // XML を DOM に変換
  const documentRoot = parser.parseFromString(xmlText, 'text/xml');
  if (parserErrors.length > 0) {
    // パース失敗時は最初のエラーを表示
    vscode.window.showErrorMessage(`Failed to parse XML: ${parserErrors[0]}`);
    return;
  }

  // ルート直下の ScriptCatalog 要素を取得
  const scriptCatalog = documentRoot.getElementsByTagName('ScriptCatalog').item(0);
  if (!scriptCatalog) {
    vscode.window.showErrorMessage('No ScriptCatalog element found in the XML.');
    return;
  }

  // 出力先（XML と同階層に ScriptCatalog フォルダを作成）
  const xmlFilePath = editor.document.uri.fsPath;
  const outputRoot = path.join(path.dirname(xmlFilePath), 'ScriptCatalog');

  try {
    // 出力フォルダを作成（既存でも OK）
    await fs.mkdir(outputRoot, { recursive: true });
  } catch (error) {
    vscode.window.showErrorMessage(`Could not create the output folder: ${mapErrorMessage(error)}`);
    return;
  }

  try {
    // 進捗表示付きでエクスポート処理を実行
    const summary = await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Exporting FM scripts'
    }, async progress => {
      progress.report({ message: 'Parsing scripts...' });
      // グループを再帰的に辿ってスクリプトを出力
      const scriptCount = await processGroup(scriptCatalog, outputRoot);
      return { scriptCount };
    });

    // 成果を通知
    const message = summary.scriptCount === 0
      ? 'No scripts found to export.'
      : `Exported ${summary.scriptCount} scripts to ${outputRoot}.`;
    vscode.window.showInformationMessage(message);
  } catch (error) {
    vscode.window.showErrorMessage(`Failed to export scripts: ${mapErrorMessage(error)}`);
  }
}

/**
 * Group 要素を再帰的に処理し、配下の Group/Script を出力する。
 * 戻り値は出力したスクリプト数。
 */
async function processGroup(groupElement: Element, basePath: string): Promise<number> {
  // グループ名でサブフォルダを作成（ファイル名に使えない文字は置換）
  const groupName = escapeFilename(groupElement.getAttribute('name') ?? 'UnnamedGroup');
  const groupPath = path.join(basePath, groupName);
  await fs.mkdir(groupPath, { recursive: true });

  let scriptCount = 0;
  for (const child of getChildElements(groupElement)) {
    if (child.tagName === 'Group') {
      // サブグループを再帰処理
      scriptCount += await processGroup(child, groupPath);
    } else if (child.tagName === 'Script') {
      // スクリプトをテキストに書き出し
      await writeScriptFile(child, groupPath);
      scriptCount += 1;
    }
  }

  return scriptCount;
}

/**
 * Script 要素から Step を走査し、インデント・コメント除去を行って
 * 行単位のテキストに整形し、.txt として保存する。
 */
async function writeScriptFile(scriptElement: Element, targetDir: string): Promise<void> {
  // スクリプト名でファイルを作成（無効文字は置換）
  const scriptName = escapeFilename(scriptElement.getAttribute('name') ?? 'UnnamedScript');
  const scriptPath = path.join(targetDir, `${scriptName}.txt`);

  // Step 要素を取得
  const steps = scriptElement.getElementsByTagName('Step');
  const lines: string[] = [];
  let indentLevel = 0;

  for (let i = 0; i < steps.length; i++) {
    const step = steps.item(i);
    if (!step) {
      continue;
    }

    // enable="false" のステップは無視
    const enable = step.getAttribute('enable');
    if (typeof enable === 'string' && enable.toLowerCase() === 'false') {
      continue;
    }

    const stepName = step.getAttribute('name') ?? '';
    if (stepName === '# (コメント)') {
      // FileMaker のコメントステップは出力しない
      continue;
    }

    // 終了/途中のステップは出力前にインデントを 1 段下げる
    if (endSteps.has(stepName) || middleSteps.has(stepName)) {
      indentLevel = Math.max(indentLevel - 1, 0);
    }

    // StepText を抽出し、行コメント/ブロックコメントを除去
    const stepTextElement = getFirstElementByTagName(step, 'StepText');
    const rawText = stepTextElement?.textContent ?? '';
    const cleanText = removeScriptComments(rawText);

    if (!cleanText) {
      continue;
    }

    // 複数行は行ごとにインデントを付与して出力
    for (const line of cleanText.split(/\r?\n/)) {
      lines.push(`${indentUnit.repeat(indentLevel)}${line}`);
    }

    // 開始/途中のステップは出力後にインデントを 1 段上げる
    if (startSteps.has(stepName) || middleSteps.has(stepName)) {
      indentLevel += 1;
    }
  }

  // 末尾に改行を 1 つ付与してファイルへ書き出し
  const fileContent = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  await fs.writeFile(scriptPath, fileContent, { encoding: 'utf8' });
}

/** 子要素ノードのうち Element ノードのみを配列で返す。*/
function getChildElements(element: Element): Element[] {
  const children: Element[] = [];
  for (let node = element.firstChild; node; node = node.nextSibling) {
    if (node.nodeType === 1) {
      children.push(node as Element);
    }
  }
  return children;
}

/** 指定タグ名の最初の子孫要素を返す（なければ null）。*/
function getFirstElementByTagName(element: Element, tagName: string): Element | null {
  const nodes = element.getElementsByTagName(tagName);
  return nodes.length > 0 ? nodes.item(0) : null;
}

/** Windows で使えない文字を全角に置換する */
function escapeFilename(name: string): string {
  const map: Record<string, string> = {
    '/': '／',
    '\\': '＼',
    ':': '：',
    '*': '＊',
    '?': '？',
    '"': '”',
    '<': '＜',
    '>': '＞',
    '|': '｜'
  };

  return name.replace(/[\/\\:\*\?"<>|]/g, (c) => map[c] ?? c);
}

/**
 * スクリプトテキストからコメントを除去する。
 * - ブロックコメント: /* ... * / を削除
 * - 行コメント: // 以降を削除（現在は一時的に無効化）
 * - 空行は出力しない（行末の余分な空白も削除）
 */
function removeScriptComments(text: string): string {
  if (!text) {
    return '';
  }

  const noBlockComments = text.replace(/\/\*[\s\S]*?\*\//g, '');
  const cleanedLines: string[] = [];
  for (const line of noBlockComments.split(/\r?\n/)) {
    // 行コメント除去は一時的に無効化する
    const withoutLineComment = line;
    if (withoutLineComment.trim()) {
      cleanedLines.push(withoutLineComment.replace(/\s+$/, ''));
    }
  }
  return cleanedLines.join('\n');
}

/** 例外オブジェクトからエラーメッセージ文字列を抽出する。*/
function mapErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
