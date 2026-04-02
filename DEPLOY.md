# Writing Lab — Vercel デプロイ手順

## 事前準備（3つのアカウント）

| サービス | 用途 | URL |
|---------|------|-----|
| GitHub | コード管理 + Gistデータ保存 | https://github.com |
| Anthropic | AI API | https://console.anthropic.com |
| Vercel | ホスティング（無料） | https://vercel.com |

---

## STEP 1 — Anthropic API キーを取得

1. https://console.anthropic.com にログイン
2. 「API Keys」→「Create Key」
3. 生成されたキー（`sk-ant-...`）をメモ帳に保存

---

## STEP 2 — GitHub にリポジトリを作成

1. https://github.com/new を開く
2. リポジトリ名を `writing-lab` に設定（Private でも OK）
3. 「Create repository」をクリック

ターミナルでこのフォルダ内から実行：

```bash
cd writing-lab
git init
git add .
git commit -m "first commit"
git remote add origin https://github.com/あなたのユーザー名/writing-lab.git
git push -u origin main
```

---

## STEP 3 — Vercel にデプロイ

1. https://vercel.com にログイン（GitHubアカウントで可）
2. 「Add New Project」→ GitHubから `writing-lab` を選択
3. **「Environment Variables」に以下を追加**：

   | Key | Value |
   |-----|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-xxxxxxxxxx`（STEP 1 で取得） |

4. 「Deploy」をクリック
5. デプロイ完了後、`https://writing-lab-xxx.vercel.app` のURLが生成されます

---

## STEP 4 — アプリの初回セットアップ（GitHub Gist）

1. デプロイされたURLをPC・スマホのブラウザで開く
2. 右上の「⚙」（設定）をタップ
3. **GitHub Personal Access Token を取得**：
   - https://github.com/settings/tokens/new?scopes=gist を開く
   - Note に「Writing Lab」と入力
   - Expiration を「No expiration」に設定
   - 「gist」にチェックが入っていることを確認
   - 「Generate token」→ 生成されたトークン（`ghp_xxx`）をコピー
4. 設定画面の「Personal Access Token」欄に貼り付け
5. 「新規 Gist 作成」をタップ → Gist ID が自動生成されます
6. 「保存して同期」をタップ

---

## STEP 5 — スマホでも使えるようにする

### ホーム画面に追加（iOS Safari）
1. Safariでアプリのページを開く
2. 共有ボタン（□↑）をタップ
3. 「ホーム画面に追加」をタップ

### ホーム画面に追加（Android Chrome）
1. Chromeでアプリのページを開く
2. 右上のメニュー（…）をタップ
3. 「ホーム画面に追加」をタップ

---

## 同期のしくみ

```
スマホ ──┐
          ├──→ GitHub Gist（クラウド）──→ PC・スマホ両方から読み書き
PC     ──┘

AI分析  ──→ /api/ai（Vercelサーバー）──→ Anthropic API
```

- データは GitHub Gist（非公開）に JSON で保存
- 文章を追加・削除するたびに自動保存
- 設定画面の「今すぐ同期」で手動リフレッシュも可能
- Anthropic API キーはサーバーサイドにのみ存在（フロントに露出なし）

---

## トラブルシューティング

**「ANTHROPIC_API_KEY が設定されていません」と表示される**
→ Vercel ダッシュボード → プロジェクト → Settings → Environment Variables で設定後、再デプロイ

**「Gist読み込み失敗」と表示される**
→ GitHub トークンの scope に `gist` が含まれているか確認

**PC とスマホでデータが違う**
→ 設定画面の「今すぐ同期（読み込み）」を押して最新データを取得

**デプロイ後に変更を反映したい**
→ `git push` するだけで Vercel が自動で再デプロイします
