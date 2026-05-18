# kinntai — 介護事業所向け勤怠管理アプリ

介護事業所の **勤怠管理・勤務表作成・有給管理・従業員情報管理** を、現場スタッフが迷わず使えるシンプルなUIで提供するWebアプリです。

## 想定規模（初期）

| 項目     | 想定値                           |
| -------- | -------------------------------- |
| 拠点数   | 3拠点                            |
| 従業員数 | 約40名（全拠点合計）             |
| 運用形態 | 単一インスタンスで複数拠点を管理 |

## 主な機能（MVP）

- 管理者 / 従業員ログイン
- 出勤・退勤・休憩開始・休憩終了の打刻
  - 共有タブレット（暗証番号で本人選択）
  - 個人スマホ（ログイン後に打刻）
- 月別勤怠の閲覧と管理者承認
- シフトパターン（早番・日勤・遅番・夜勤・明け など）の管理
- 月次勤務表の作成・編集
- 従業員情報管理（雇用形態、雇い入れ日、所属拠点 など）
- 雇い入れ日をもとにした有給自動付与・残数管理
- 年5日取得義務のチェック（取得不足者を管理者画面でアラート）

Phase 2 以降の機能（打刻修正申請、希望休、給与CSV出力、ICカード打刻、雇用契約書、労働条件通知書、キャリアアップ助成金対応、社労士確認用PDF出力）については [`docs/requirements.md`](docs/requirements.md) と [`docs/mvp-scope.md`](docs/mvp-scope.md) を参照してください。

## 技術スタック

| 領域           | 採用技術                                         |
| -------------- | ------------------------------------------------ |
| フロントエンド | Next.js (App Router) + TypeScript + Tailwind CSS |
| バックエンド   | Next.js Route Handlers / Server Actions          |
| ORM            | Prisma                                           |
| データベース   | PostgreSQL 15+                                   |
| 認証           | Auth.js (NextAuth)                               |
| テスト         | Vitest（ユニット） / Playwright（E2E、後期）     |
| デプロイ想定   | Vercel + Supabase、または社内サーバー上の Docker |

## ディレクトリ構成（予定）

```
.
├── docs/                 # 設計ドキュメント
├── prisma/               # schema.prisma とマイグレーション
├── src/
│   ├── app/              # Next.js App Router（画面・APIルート）
│   ├── components/       # UIコンポーネント
│   ├── lib/              # ドメインロジック・ユーティリティ
│   └── server/           # サーバー専用処理（認証・ジョブなど）
├── tests/
├── .env.example
├── CLAUDE.md
└── README.md
```

## セットアップ手順（実装開始後に確定）

```bash
# 1. 依存インストール
pnpm install

# 2. 環境変数を設定
cp .env.example .env
# .env を編集して DB 接続情報などを記入

# 3. DB を起動（Docker 例）
docker compose up -d db

# 4. マイグレーション適用
pnpm prisma migrate dev

# 5. 開発サーバー起動
pnpm dev
```

## ドキュメント一覧

| ドキュメント                                         | 内容                                  |
| ---------------------------------------------------- | ------------------------------------- |
| [docs/requirements.md](docs/requirements.md)         | 機能要件・MVPスコープ・非機能要件     |
| [docs/screen-list.md](docs/screen-list.md)           | 画面一覧と画面遷移                    |
| [docs/database-design.md](docs/database-design.md)   | ER概要・テーブル定義                  |
| [docs/development-plan.md](docs/development-plan.md) | 開発フェーズと優先順位                |
| [docs/user-roles.md](docs/user-roles.md)             | ユーザーロールと権限マトリクス        |
| [docs/mvp-scope.md](docs/mvp-scope.md)               | MVP / Phase 2 / Future のスコープ詳細 |
| [CLAUDE.md](CLAUDE.md)                               | Claude Code 向けプロジェクトガイド    |

## 現在のステータス

**設計フェーズ。** 実装は未着手。設計ドキュメントを固めた後に、Phase 1（基盤構築）から着手します。詳細は [`docs/development-plan.md`](docs/development-plan.md) を参照。
