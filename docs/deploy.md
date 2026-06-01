# デプロイ手順 (Vercel + Supabase)

本番運用のため、Vercel (アプリ) と Supabase (PostgreSQL) を Marketplace Integration で接続して使う。
初回投入で「拠点 / シフトパターン / 会社情報雛形 / 管理者 1 名」だけを入れ、
従業員・契約情報はクライアントが本番 UI から手入力する。

> 書類アップロード機能は本ドキュメントの範囲外。
> 本番でファイルストレージを使うときは `src/lib/storage/` を Supabase Storage 実装に
> 差し替える必要がある (Phase 1 未対応)。

---

## 1. 前提

- Supabase プロジェクト作成済み
- Vercel プロジェクト作成済み
- ローカルで `pnpm install && pnpm typecheck` が通る

---

## 2. Vercel ⇄ Supabase を Integration で接続

1. Vercel ダッシュボード → 対象プロジェクト → **Storage** → **Connect Store** → Supabase を選択
2. 既存の Supabase プロジェクトを選んで接続
3. 接続完了後、Vercel の Environment Variables に以下が自動で入る (`Production` / `Preview` / `Development` の 3 環境ぶん)
   - `POSTGRES_PRISMA_URL` — pgBouncer 経由 (port 6543, pooling=true)
   - `POSTGRES_URL_NON_POOLING` — 直結 (port 5432)
   - `POSTGRES_URL` / `POSTGRES_USER` / 他

### 2.1 DATABASE_URL / DIRECT_URL にマッピング

Prisma は `DATABASE_URL` と `DIRECT_URL` を読むため、Vercel 側で「Shared Variables」または「Reference」を使い、以下の名前で同じ値が引けるようにする。

| アプリ側変数   | Supabase Integration 由来の値 |
| -------------- | ----------------------------- |
| `DATABASE_URL` | `${POSTGRES_PRISMA_URL}`      |
| `DIRECT_URL`   | `${POSTGRES_URL_NON_POOLING}` |

> Vercel UI で個別に新しい変数を作り、値欄に上記を貼り付ければよい。
> Vercel は `${...}` を Build/Runtime に展開する。
> もし置換が効かない環境では、`POSTGRES_PRISMA_URL` の値をそのままコピーして `DATABASE_URL` に入れる。

---

## 3. その他の環境変数 (Vercel に手で登録)

| Key                      | Production 値                          | 備考                                                                          |
| ------------------------ | -------------------------------------- | ----------------------------------------------------------------------------- |
| `NODE_ENV`               | `production`                           | Vercel が自動付与するので通常は不要                                           |
| `APP_BASE_URL`           | `https://<your-domain>`                | Vercel 割当てドメイン or カスタムドメイン                                     |
| `APP_TIMEZONE`           | `Asia/Tokyo`                           |                                                                               |
| `AUTH_SECRET`            | `openssl rand -base64 32` の結果       | 32 文字以上。本番値は dev と分ける。                                          |
| `AUTH_COOKIE_SECURE`     | `true`                                 | 本番 (HTTPS) では必ず true                                                    |
| `AUTH_SESSION_MAX_AGE`   | `2592000`                              | 30 日                                                                         |
| `TABLET_PIN_LENGTH`      | `4`                                    |                                                                               |
| `TABLET_SESSION_MAX_AGE` | `31536000`                             |                                                                               |
| `MAIL_DRIVER`            | `console` (当面) / `smtp` (本番運用時) | パスワードリセットメール送信用                                                |
| `LOG_LEVEL`              | `info`                                 |                                                                               |
| `SEED_ADMIN_EMAIL`       | 管理者の本物メールアドレス             | 初回シードでのみ使用                                                          |
| `SEED_ADMIN_PASSWORD`    | 10 文字以上の強いパスワード            | 初回シードでのみ使用。投入後はログインしてすぐ変更し、Vercel 側からも削除推奨 |

> 機能フラグ (`FEATURE_*`) は実装側で false がデフォルトなので未設定でよい。

---

## 4. 初回マイグレーション + シード投入

Vercel 上では migrate コマンドを動かさず、**ローカルから Supabase に直接マイグレーション**する。

### 4.1 ローカル `.env` を一時的に本番接続に向ける

`.env.production-bootstrap` のような別ファイルを作って退避する:

```env
DATABASE_URL=<POSTGRES_PRISMA_URL の値>
DIRECT_URL=<POSTGRES_URL_NON_POOLING の値>
SEED_ADMIN_EMAIL=<上記と同じ>
SEED_ADMIN_PASSWORD=<上記と同じ>
```

### 4.2 マイグレーション適用

```bash
# dotenv で本番接続を読ませる (例)
DATABASE_URL=...  DIRECT_URL=...  pnpm prisma migrate deploy
```

Supabase 側に 10 件のマイグレーションが流れる (`_prisma_migrations` テーブルが作られる)。

### 4.3 マスターデータと管理者を投入

```bash
DATABASE_URL=...  DIRECT_URL=...  SEED_ADMIN_EMAIL=...  SEED_ADMIN_PASSWORD=...  pnpm db:seed:prod
```

ログに以下が出れば成功:

```
seeding offices...        5 offices upserted
seeding shift patterns... 34 patterns upserted
seeding company profile.. created
ensuring admin user...    created
```

---

## 5. Vercel デプロイ

### 5.1 push 直前チェックリスト

`git push origin main` の前にローカルで以下を全て通す。1 つでも落ちたら push しない。

```bash
pnpm typecheck      # 型エラーなし
pnpm lint           # warning 込みでも error は 0
pnpm test           # 234+ 件全 pass
pnpm build          # prisma generate && next build がエラーなく完走
```

加えて以下を目視確認:

- [ ] `.env.example` に追加した変数があれば、Vercel の Environment Variables にも反映済み
- [ ] §3 の `AUTH_COOKIE_SECURE=true` / `APP_BASE_URL` が本番 URL になっている
- [ ] §4 のマイグレーション + シードを本番 DB に投入済み (`_prisma_migrations` に最新行が入っているか Supabase ダッシュボードで確認)
- [ ] 新しい Prisma migration を足した場合は、本番 DB 側でも `prisma migrate deploy` を流したか

### 5.2 push と自動ビルド

```bash
git push origin main
```

Vercel は自動でビルドする。`package.json` の `build` スクリプトは
`prisma generate && next build` なので、Prisma Client が必ず再生成される。

ビルド完了後、`APP_BASE_URL` の URL でログイン画面が出る。

### 5.3 PDF 出力 (労働条件通知書 / 雇用契約書) の挙動

`src/lib/employment-contract/pdf.ts` は環境で Chromium を切り替える:

- **Vercel / Lambda** (`VERCEL` または `AWS_LAMBDA_FUNCTION_NAME` がセット): `@sparticuz/chromium` + `puppeteer-core` で軽量 Chromium を起動
- **ローカル / Codespaces / 自前サーバ**: Playwright の Chromium を起動 (システムフォント込み)

日本語フォントは Google Fonts (Noto Sans JP) を `@import` で読み込み、`document.fonts.ready` を待ってから `page.pdf()` を実行する。Lambda 側にフォントが入っていなくても豆腐化しない。

---

## 6. 初回ログイン → 入力の流れ

1. `SEED_ADMIN_EMAIL` でログイン
2. 右上メニューから **パスワード変更** (必須)
3. **S-A-28 会社情報**: クライアントと一緒に値を確認し、必要なら編集
4. **S-A-02 拠点設定**: シード済み 5 拠点を確認し、不要なものを非表示化 (今回は全件残す想定)
5. **S-A-03 → S-A-05 従業員 新規登録**: クライアントが入力
6. (任意) **S-A-21 雇用契約** を 1 名分入力し、**労働条件通知書 PDF 出力** までの一連の流れを確認

---

## 7. 投入後のセキュリティ後始末

- Vercel から `SEED_ADMIN_PASSWORD` を削除 (Production 環境変数)
- 管理者の本番パスワードは Vercel の Environment Variables には保管しない (ログイン管理に任せる)
- Supabase ダッシュボードで Database → Roles の `service_role` キーが漏れていないか確認

---

## 8. トラブルシュート

### 8.1 Login で 500 / "Invalid Server Actions request"

`AUTH_COOKIE_SECURE` を `true` にしているか確認。HTTP では Cookie が降らない。

### 8.2 Prisma "Can't reach database server"

- `DATABASE_URL` が `POSTGRES_PRISMA_URL` (port 6543) になっているか
- IP 制限を Supabase 側でかけていないか (Vercel の Egress IP は固定でない)

### 8.3 マイグレーション中に `P3009 migrate found failed migrations`

ローカル開発 DB の状態と差分があるため。本番初回ならまず
`prisma migrate deploy` を使う (`migrate dev` は使わない)。

### 8.4 シード中に "Unique constraint failed on `code`"

`db:seed:prod` は upsert なので通常起きない。schema 更新を本番に流す前に
ローカルマイグレーションを掛けた状態か確認する。

### 8.5 労働条件通知書 PDF が 500 / 文字化け

- 500: Vercel のサーバレス関数タイムアウト (デフォルト 10s) に引っかかる可能性。`vercel.json` で `functions["src/app/admin/employees/[id]/contracts/[contractId]/pdf/route.ts"].maxDuration` を 30〜60 秒に上げる
- 文字化け (豆腐): Google Fonts への egress が遮断されている。`VERCEL` 環境変数下で動いているか確認し、必要なら `chromium.args` で Web 通信用のフラグを追加
- バイナリ展開エラー: `@sparticuz/chromium` のメジャー更新後は `puppeteer-core` 側もバージョン整合を確認 (149 系 ⇄ 25 系で動作確認済)
