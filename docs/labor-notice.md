# 労働条件通知書 新フォーマット (3 枚構成) 設計

> 株式会社クロスハート様の「労働条件通知書機能 仕様書 v0.2」(2026-10-08) を kinntai の構成に合わせて読み替えた設計。
> 帳票ロジックの原型は仕様書に添付の `labor-notice-prototype.html` の `render()` (実在の氏名を含むためリポジトリには入れていない)。
> 既存の [employment-contract-printable.md](employment-contract-printable.md) (Phase 1-I、2 区分・1 枚書式) の後継。旧書式の PDF 出力は当面残す。

---

## 1. 目的と方針

- 社長が **5 項目 (雇用形態・契約期間・勤務先・賃金・労働時間)** を入れるだけで、労働条件通知書 (2 枚) と雇用契約 同意書 兼 受領書 (1 枚) の **A4 3 枚** を作れるようにする。
- **社長の入力は 1 回だけ**にする。通知書を発行すると、同じ内容で雇用契約 (`employment_contracts`) と従業員の現在の条件 (`employees` の雇用形態・賃金・週所定) も更新する。契約を別画面で入れ直す必要はない。
- 法定の明示事項が抜けていたら **発行できない (エラー)**。最低賃金・社会保険・本業との合算などの金額まわりは **警告 + 社長の確認 (理由入力) で発行できる**。
- 対象外: 電子署名、給与計算との連携、就業規則の管理。

### 1.1 仕様書 v0.2 からの読み替え

| 仕様書                                                     | kinntai                                                                                                                                               | 理由                                                                                  |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Supabase (SQL・RLS) / `staff` / `facilities`               | Prisma / `employees` / `offices`。権限はアプリ側の `requireAdmin()`                                                                                   | 既存構成                                                                              |
| `company_settings` 新設                                    | 既存 `company_profile` に列を追加                                                                                                                     | 会社マスタを 2 つにしない                                                             |
| `shift_codes` に時刻・休憩を追加                           | 通知書用の勤務パターンを `labor_notice_work_patterns` で持つ (§2.1)                                                                                   | 勤務表は夜勤を `夜入` / `夜明` の 2 記号に分けており、書面の「夜勤 1 回」と単位が違う |
| `employment_presets` / `allowances` / `min_wages` テーブル | `labor_notice_presets` (区分ごとの文言・手当を 1 行に) / `labor_notice_work_patterns` / `min_wages` を S-A-34 で編集 (§2.1)。社保しきい値は定数のまま | 2026-10-08 追加要望: 社長が画面から初期値を変えたい。社保しきい値は法令値なので定数   |
| `notice_acknowledgements` テーブル                         | `labor_notices.acknowledgements` (jsonb)                                                                                                              | 通知書と 1 対多で、単独で検索しない                                                   |
| Fly.io の Chromium ワーカー + Storage に PDF 保存          | 既存 `src/lib/employment-contract/pdf.ts` (Vercel は @sparticuz/chromium) を流用。PDF は保存せず `snapshot` から毎回再生成                            | 追加インフラ不要。snapshot と `template_version` があれば同じ PDF を再現できる        |
| 区分「夜勤専従」                                           | 通知書側の区分 `NIGHT_ONLY`。従業員側は既存の `employees.night_shift_only` を立てる。`EmploymentType` enum は増やさない                               | 勤務表の自動作成が既にこのフラグで夜勤専従を扱っている                                |

## 2. 雇用区分とプリセット

区分を選ぶと下記が初期値として入り、個別に上書きできる。初期値は S-A-34 (§2.1) で変更でき、未設定なら `constants.ts` の既定値を使う。

| 区分     | 契約期間                         | 賃金                          | 労働時間制度                 | 既定パターン           | 試用期間 | 昇給       | 賞与                       | 退職金                  |
| -------- | -------------------------------- | ----------------------------- | ---------------------------- | ---------------------- | -------- | ---------- | -------------------------- | ----------------------- |
| 正社員   | 期間の定めなし                   | 月給                          | 1 か月単位の変形労働時間制   | 早番・日勤・遅番・夜勤 | 3 か月 ※ | 有 年 1 回 | 有 年 2 回                 | 有 (中退共・3 年経過後) |
| パート   | 当初 6 か月有期 → 満了後に無期   | 時給                          | シフト制                     | 日勤・短日勤・半日勤務 | なし     | 有 年 1 回 | 有 年 2 回・5〜10 万円程度 | 無                      |
| 夜勤専従 | 6 か月ごとの有期更新・上限なし ※ | 日給 20,000 円 (深夜割増込み) | 1 か月単位の変形労働時間制 ※ | 夜勤・短縮夜勤         | なし     | 無         | 無                         | 無                      |

※ は先方確認待ち (§10)。コード上は `TODO(要確認 §10-n)` を付けてある。

### 2.1 通知書の設定マスター (S-A-34、2026-10-08 追加)

設定 → 「労働条件通知書の設定」で、社長が次を変更できる。DB に行が無い項目は `constants.ts` の既定値を表示・使用し、保存した時点で DB に書く。

| 対象             | テーブル                     | 変えられるもの                                                                                                                                                |
| ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 区分ごとの初期値 | `labor_notice_presets`       | 文言 (休日・試用期間・昇給・賞与・退職金・残業・休日出勤・制度・変更の範囲)、既定の契約月数と無期切替、既定の勤務パターン、書面に載せる手当行、資格手当の月額 |
| 勤務パターン     | `labor_notice_work_patterns` | 名前・始業・終業 (翌日)・休憩・並び順、追加、使わないものを非表示                                                                                             |
| 最低賃金         | `min_wages`                  | 都道府県・金額・発効日の行の追加・削除                                                                                                                        |

- 割増率は法定の値なのでマスター固定のまま (§4)。
- 発行済みの通知書は snapshot から描画するので、マスターを変えても変わらない。
- 下書きは保存時の入力をそのまま持つため、文言の初期値を変えても下書きには反映しない (区分を選び直すと反映)。

## 3. 入力と自動決定

| #   | 項目     | 入力                                                      | 自動で決まるもの                                                                   |
| --- | -------- | --------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 0   | 従業員   | 一覧から選択                                              | 氏名、職種 (業務内容の初期値)、過去の通知書、副業の届出                            |
| 1   | 雇用形態 | 正社員 / パート / 夜勤専従                                | プリセット一式、根拠法令の文言、09 欄の有無                                        |
| 2   | 契約期間 | 開始日 (有期は月数、既定 6)                               | 終了日 = 開始日の n か月後の応当日の前日 (民法 143 条)、無期切替日、無期転換の判定 |
| 3   | 勤務先   | 事業所を選択                                              | 就業場所・住所、相談窓口 (事業所の管理者・電話)、最低賃金の都道府県                |
| 4   | 賃金     | 区分ごとのフォーム                                        | 手当行、割増率表、最低賃金チェック                                                 |
| 5   | 労働時間 | 勤務パターン (複数) + 週の日数・時間 (正社員は月平均時間) | パターン表、年休の付与日数、社会保険・雇用保険の判定                               |

### 3.1 計算 (`src/lib/labor-notice/`)

- 実働時間 = 終業 (翌日は +24h) − 始業 − 休憩。夜勤 16:30〜翌 8:30・休憩 120 分 → 14 時間。
- 夜勤専従の内訳: `基本日給 = floor(総額 / (1 + 0.25 × 深夜時間 / 実働))`、深夜割増 = 総額 − 基本日給。20,000 円・14h・深夜 7h → 17,777 円 + 2,223 円 (時間単価 1,269.8 円)。
- 最低賃金と比べる時給換算: `総額 / (実働 + 0.25 × 時間外時間 + 0.25 × 深夜時間)`。変形制が夜勤専従に及ばない場合は 8 時間超を時間外として数える。
- 年休 (6 か月時点): 既存の `src/lib/leave/grant-table.ts` の `computeGrantDays` を使う (週 5 日以上 or 週 30h 以上 = 10 日、比例付与 4→7 / 3→5 / 2→3 / 1→1)。
- 無期切替 (パート): 終了日の翌日に無期へ。09 欄に「◯年◯月◯日から無期契約に切替」。
- 無期転換 (夜勤専従など有期更新): 同じ従業員の過去の有期契約月数 + 今回の月数 が 60 か月を超えたら 09 欄に「申込みができる旨」と「転換後の労働条件」を出す。定年後再雇用で第二種計画認定がない場合は警告。

### 3.2 副業・兼業の届出 (`side_jobs`)

- 従業員詳細に「副業」タブを置き、勤務先名・曜日・1 日の時間・週の時間・契約が当社より先か後か・有効期間を登録する。
- 通知書の 08 欄には全区分で「副業・兼業の届出義務」と「通算で時間外になる分は別途割増を払う」旨を印字する。

## 4. 発行前チェック

| 種別   | コード                          | 内容                                                                                                       |
| ------ | ------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| エラー | (field 名)                      | 明示事項の空欄: 開始日、有期の月数、勤務先、業務、変更の範囲、勤務パターン、休日、賃金、締切・支払日、定年 |
| 固定   | —                               | 割増率 (60h 以内 25% / 60h 超 50% / 休日 35% / 深夜 25%) は定数で編集不可                                  |
| 警告   | `MIN_WAGE`                      | 時給 / (基本給 + 資格・管理者・相談員手当) ÷ 月平均時間 / 夜勤の時給換算 が開始日時点の最低賃金未満        |
| 警告   | `NIGHT_VARIABLE_HOURS`          | 会社設定で夜勤専従が変形制の労使協定の対象になっていない                                                   |
| 警告   | `INSURANCE_MISMATCH`            | 社会保険等の手入力が自動判定と違う                                                                         |
| 警告   | `JOB_POSTING_TERM`              | 有期なのに、会社設定で求人票が「期間の定めなし」の区分                                                     |
| 警告   | `POST_RETIREMENT_CERTIFICATION` | 定年後再雇用の有期が通算 5 年超・第二種計画認定なし                                                        |

- 警告はそれぞれ「確認した」チェック + 理由の入力が必須。`labor_notices.acknowledgements` に `{code, reason, acknowledgedBy, acknowledgedAt}` を保存する。
- 資格手当の既定額は介護福祉士 (正社員) の 10,000 円だけ確定。他の資格は金額の手入力がないとエラー (根拠資料が来たら定数に入れる)。

### 4.1 社会保険・雇用保険の判定

- 健保・厚年: 正社員 → 加入。それ以外は ①4 分の 3 基準 (週所定 ≥ 正社員の週所定 × 3/4 かつ 月所定日数 ≥ 正社員の月所定日数 × 3/4) → 加入。② 被保険者数が適用拡大のしきい値以上 (51 人 → 2027-10: 36 人 → 2029-10: 21 人 → 2032-10: 11 人 → 2035-10: 撤廃) かつ週 20h 以上・月額 8.8 万円以上・学生でない → 加入。賃金要件の撤廃日は未確定のため設定値 `null`。
- 雇用保険: 週 20h 以上 (2028-10 から 10h 以上) かつ 31 日以上の雇用見込み → 加入。
- 労災: 常に加入。
- `company_profile.employee_count` が未設定なら ② は判定しない。

### 4.2 シフト確定時の本業との合算チェック (勤務表側)

- 副業の届出があり、**本業の契約が当社より先**の人について、週ごとに本業の時間を先に積んでから当社の勤務を足し、1 日 8 時間・週 40 時間を超えた分を時間外として数える (変形制の人はシフトで定めた時間までは日の時間外にしない)。
- 超えたら **警告のみ** (確定は止めない)。例:「架空さん 11/12 夜勤: 本業と合わせて 1 日 22 時間。時間外割増 約 4,444 円。短縮夜勤なら時給換算 1,290 円で最低賃金内」。
- 「確認した」で確定でき、`shift_acknowledgements` に記録。短縮夜勤への差し替えボタンを付ける。
- ロジックは `src/lib/labor-notice/side-job.ts` (`checkSideJobOvertime`)。

## 5. 帳票

- A4 縦 3 枚固定。1〜2 枚目が通知書、3 枚目が同意書 兼 受領書 (署名欄はここだけ)。全ページに通知書番号。
- 通知書番号: `CH-{発行年}-{連番4桁}` (年ごとにリセット、void も欠番として残す)。下書きには番号を振らない。
- 選んだ内容だけを印字する (選択肢に○を付ける方式は使わない)。「2024 改正」バッジは画面のプレビューだけに出し、PDF には出さない。
- 根拠法令: 正社員は「労働基準法第 15 条」、パート・夜勤専従は「労働基準法第 15 条およびパートタイム・有期雇用労働法第 6 条」。
- フォント: BIZ UDPゴシック / BIZ UDP明朝 (Google Fonts、SIL OFL)。印刷 CSS はプロトタイプの `@media print` を流用。

## 6. データモデル

### 6.1 既存テーブルへの列追加

`company_profile`

| 列                                    | 型      | 既定  | 用途                                       |
| ------------------------------------- | ------- | ----- | ------------------------------------------ |
| employee_count                        | int?    | null  | 社保の適用拡大判定                         |
| has_second_type_certification         | boolean | false | 定年後再雇用の無期転換特例                 |
| fulltime_weekly_hours                 | numeric | 37    | 4 分の 3 基準                              |
| fulltime_monthly_days                 | numeric | 21    | 4 分の 3 基準                              |
| variable_hours_agreement_covers_night | boolean | false | 夜勤専従に変形制が及ぶか                   |
| rehire_continue_after_65              | boolean | true  | 65 歳以降の継続                            |
| job_posting_indefinite_types          | text[]  | {}    | 求人票で「期間の定めなし」と書いている区分 |
| notice_number_prefix                  | text    | 'CH'  | 通知書番号の接頭辞                         |

既存列の対応: 法人名 `legal_name`、代表者 `representative_title` + `representative_name`、電話 `phone`、締切 `wage_cutoff_day`、支払日 `wage_payment_day`、定年 `retirement_age`、再雇用上限 `continued_employment_age`。

`offices`: `manager_name text?`、`phone text?`、`prefecture text default '埼玉県'` (最低賃金の都道府県)。住所は既存 `address`。

`wage_type` enum: `daily` (日給) を追加。

### 6.2 新規テーブル

```
labor_notice_presets              -- 区分ごとの初期値 (S-A-34)。行が無い区分は constants.ts の既定値
  notice_type              enum labor_notice_type PK
  texts                    jsonb   -- PresetTexts
  default_fixed_term_months int null
  converts_to_indefinite   boolean
  default_pattern_codes    text[]
  allowance_rows           jsonb   -- [{label, body, onlyIfWorksNight?}]
  qualification_allowances jsonb   -- {CARE_WORKER: 10000 | null, ...}
  updated_at

labor_notice_work_patterns        -- 通知書に載せる勤務パターン (S-A-34)。0 行なら constants.ts の既定値
  id uuid PK, code text unique, label, start_time text 'HH:MM', end_time text 'HH:MM',
  ends_next_day boolean, break_minutes int, sort_order int, is_active boolean, created_at, updated_at

min_wages                         -- 最低賃金 (S-A-34)。0 行なら constants.ts の既定値
  id uuid PK, prefecture text, yen int, effective_from date, unique (prefecture, effective_from)

labor_notices                     -- 発行の記録 (契約の中身は employment_contracts が正)
  id                uuid PK
  notice_no         text unique null   -- 発行時に採番。下書きは null
  employee_id       uuid FK employees
  office_id         uuid FK offices
  contract_id       uuid FK employment_contracts null  -- 発行時に作成/更新した契約
  notice_type       enum labor_notice_type (full_time / part_time / night_only)
  status            enum labor_notice_status (draft / issued / signed / void)
  input             jsonb      -- 入力 (NoticeInput)
  snapshot          jsonb null -- 発行時の表示値 (NoticeView)。マスタが変わっても同じ PDF を再生成できる
  acknowledgements  jsonb default '[]'
  template_version  text
  contract_start_on date, contract_end_on date null
  issued_at, signed_at, voided_at  timestamptz null
  signed_document_id uuid FK employee_documents null  -- 署名済み 3 枚目のスキャン
  created_by, issued_by uuid FK users
  created_at, updated_at
  -- tenant_id: マルチテナント化時に追加 (CLAUDE.md §3.3)

side_jobs
  id, employee_id FK, employer_name, weekdays int[], daily_hours numeric, weekly_hours numeric,
  contracted_before_us boolean default true, valid_from date null, valid_to date null, created_at, updated_at

shift_acknowledgements
  id, employee_id FK, office_id FK, work_date date, code text, detail jsonb,
  acknowledged_by FK users, acknowledged_at timestamptz
```

## 7. 画面

| ID     | 画面                 | 内容                                                                                                                              |
| ------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S-A-30 | 労働条件通知書 一覧  | 従業員・区分・状態・契約終了日で絞り込み。終了 30 日前の有期をハイライトし「更新版を作成」(パートは「無期の通知書を作成」) ボタン |
| S-A-31 | 労働条件通知書 作成  | 左に 5 項目フォーム、右に A4 ライブプレビュー、上部にエラー・警告。警告は確認チェック + 理由。下書き保存 / 発行                   |
| S-A-32 | 労働条件通知書 詳細  | PDF ダウンロード、署名済み 3 枚目のアップロード (→ signed)、無効化 (→ void、作り直し)                                             |
| S-A-33 | 副業の届出           | 従業員詳細のタブ                                                                                                                  |
| S-A-34 | 労働条件通知書の設定 | 区分ごとの初期値・手当・資格手当、勤務パターン、最低賃金 (§2.1)                                                                   |

## 8. 業務フロー

作成 (社長) → プレビュー確認 → 発行 (= 承認。番号採番・snapshot 確定・契約データ更新) → 印刷して説明・交付 → 3 枚目に本人が署名 → アップロード (signed)。
発行後は修正不可。誤りは void にして作り直す (番号は欠番)。

## 9. 法改正への備え

- 文言は `TEMPLATE_VERSION` で世代管理し、snapshot と一緒に保存する。
- 最低賃金は `min_wages` (S-A-34 で行を足す)。社保の企業規模しきい値・雇用保険の時間要件は適用開始日つきの定数配列。いずれも判定は契約開始日で切り替わる。

## 10. 先方確認待ち (確定したらプリセットへ反映)

1. 夜勤専従も「6 か月後に無期」か (現状は 6 か月ごとの有期更新)
2. 1 か月単位の変形労働時間制の労使協定が夜勤専従も対象か (会社設定 `variable_hours_agreement_covers_night`)
3. 正社員の試用期間を 3 か月で統一してよいか (看護の求人は「なし」)
4. 65 歳以降の継続雇用について、第二種計画認定の有無
5. 求人の「契約期間の定めなし」の表記修正 (パートは当初 6 か月有期)
6. 従業員数が 36 人以上か (2027 年 10 月からの社会保険適用拡大の対象になるか)
7. 介護福祉士 (正社員) 以外の資格手当の金額

## 11. 実装ステップ

1. **計算モジュール** `src/lib/labor-notice/` + 受け入れテスト (`tests/labor-notice/`) ← 完了
2. スキーマ (§6.1・`labor_notices`) とマイグレーション、拠点・会社情報の画面に新項目 ← 完了
3. 帳票 HTML (3 枚、`html.ts`) と PDF 出力 (`/admin/labor-notices/[id]/pdf`) ← 完了
4. 作成画面 (S-A-31) と発行処理 (契約・従業員の更新を含む) ← 完了
5. 一覧 (S-A-30)・詳細 (S-A-32)・パートの無期切替・夜勤専従の更新・署名済みアップロード・無効化と作り直し ← 完了
6. 通知書の設定マスター (S-A-34、§2.1) ← 完了
7. 副業の届出 (S-A-33、`side_jobs`) とシフト確定時の合算チェック (§4.2、`shift_acknowledgements`) ← 未着手 (判定ロジック `side-job.ts` とテストのみ完了)
