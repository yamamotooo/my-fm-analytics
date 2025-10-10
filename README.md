# My FM Analytics

VS Code 上で FileMaker スクリプトの解析とエクスポートを支援する拡張機能です。FileMaker から出力した DDR（Database Design Report）の XML を読み取り、スクリプト階層を保ったままテキストとして書き出します。コードレビューやバージョン管理にスクリプトを取り込む際に活用できます。

## 主な機能

- ScriptCatalog 内のすべてのスクリプトを一括でテキストにエクスポート
- Group 要素ごとにディレクトリを作成し、階層構造をそのまま再現
- FileMaker のコメントステップや無効化されたステップを自動的に除外
- （オプション）処理の各段階で進捗通知を表示

## 使い方

1. FileMaker Pro から DDR（XML）を出力し、VS Code で該当 XML ファイルを開きます。
2. コマンドパレット（`Ctrl+Shift+P` / `Cmd+Shift+P`）を開き、`My FM Analytics: Export Script Catalog` または `My FM Analytics: Export Script Catalog (English)` を実行します。
3. 同じディレクトリ配下に `ScriptCatalog/` フォルダが生成され、各スクリプトが `<スクリプト名>.txt` として保存されます。
4. 必要に応じて Git 等のバージョン管理ツールでテキストファイルを追跡できます。

## コマンド一覧

| コマンド ID | 説明 |
| --- | --- |
| `my-fm-analytics.exportScriptCatalog` | ScriptCatalog を日本語メッセージでエクスポートします。 |
| `my-fm-analytics.exportScriptCatalog.en` | ScriptCatalog を英語メッセージでエクスポートします。 |
| `my-fm-analytics.helloWorld` | 動作確認用の簡易メッセージを表示します。 |

## 動作環境

- Visual Studio Code 1.82 以降を推奨
- FileMaker DDR の XML（`ScriptCatalog` 要素を含むもの）

## 既知の問題

- FileMaker 特有のステップ名に依存しているため、ロケールによってはインデント処理が崩れる可能性があります。
- 行コメント (`// ...`) の除去は一時的に無効化しており、そのまま出力されます。

## リリースノート

### 0.0.1

- 初回リリース。
