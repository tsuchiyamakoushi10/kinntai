# データベース設計

PostgreSQL を前提とする。テーブル名・カラム名は `snake_case`、主キーは `id`（UUID または bigserial、Prisma 標準に従う）。

---

## 1. ER 概要（テキスト表現）

```
company_profile (シングルトン)
   ├ 全契約共通の条項を保持 (PDF 出力で参照)

offices ──< employees ──< employment_contracts ──< employment_contract_allowances
   │            │             │
   │            │             └< employee_documents (一部の書類は契約に紐付く)
   │            │
   │            ├< qualifications
   │            ├< employee_documents ──< document_access_logs
   │            ├< training_records
   │            ├< shift_constraints (1:1)
   │            ├< shift_preferences
   │            ├< shifts >── shift_patterns
   │            ├< attendance_records ──< break_records   (Phase 2)
   │            ├< paid_leave_grants                       (Phase 3)
   │            ├< paid_leave_consumptions                 (Phase 3)
   │            ├< leave_requests                          (Phase 3)
   │            └< attendance_corrections                  (Phase 3)
   │
   ├< shift_patterns
   ├< shift_publications                            (拠点×月の公開状態)
   └< shift_generation_runs ──< shifts

users ──── employees   (1:1、users.role で管理者/従業員を区別)
```

`>──` は多対 1、`──<` は 1 対多。`users` と `employees` は分離し、ログイン情報と人事情報を別管理にする。

> **2026-05-20 方針変更**: MVP は人事 / 契約 / 書類 / 退職 / シフト制約 / 自動シフトを優先する。打刻 (`attendance_records` / `break_records`) は Phase 2、有給 (`paid_leave_*`) は Phase 3 に移った。テーブル定義は既に存在するため schema 上は残し、機能実装のフェーズだけ動かす。

---

## 2. テーブル定義（MVP）

### 2.1 `users` — ログインアカウント

| カラム                  | 型                        | 説明                                                  |
| ----------------------- | ------------------------- | ----------------------------------------------------- |
| id                      | uuid                      | PK                                                    |
| email                   | text                      | 一意、ログイン用                                      |
| password_hash           | text                      | bcrypt                                                |
| role                    | enum(`admin`, `employee`) | 権限                                                  |
| employee_id             | uuid (nullable)           | `employees.id` FK。管理者でも従業員情報を持つ場合あり |
| pin_code_hash           | text (nullable)           | 共有タブレット打刻用の4桁暗証番号ハッシュ             |
| is_active               | boolean                   | 無効化フラグ                                          |
| must_change_password    | boolean                   | 初期パスワードのまま。true の間は変更画面に強制誘導   |
| last_login_at           | timestamptz               | 最終ログイン                                          |
| created_at / updated_at | timestamptz               |                                                       |

### 2.2 `offices` — 拠点

| カラム                  | 型          | 説明               |
| ----------------------- | ----------- | ------------------ |
| id                      | uuid        | PK                 |
| name                    | text        | 拠点名             |
| code                    | text        | 拠点コード（一意） |
| address                 | text        | 所在地             |
| timezone                | text        | 既定 `Asia/Tokyo`  |
| is_active               | boolean     |                    |
| created_at / updated_at | timestamptz |                    |

### 2.3 `employees` — 従業員

| カラム                           | 型                                                                                      | 説明                                                                                                                                                                                                             |
| -------------------------------- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                               | uuid                                                                                    | PK                                                                                                                                                                                                               |
| employee_code                    | text                                                                                    | 事業所内で一意（例 `EMP-0001`）                                                                                                                                                                                  |
| last_name / first_name           | text                                                                                    | 漢字氏名                                                                                                                                                                                                         |
| last_name_kana / first_name_kana | text                                                                                    | カナ氏名（50 音検索用）                                                                                                                                                                                          |
| birth_date                       | date                                                                                    |                                                                                                                                                                                                                  |
| gender                           | enum(`male`, `female`, `other`) (nullable)                                              |                                                                                                                                                                                                                  |
| phone                            | text (nullable)                                                                         |                                                                                                                                                                                                                  |
| address                          | text (nullable)                                                                         |                                                                                                                                                                                                                  |
| office_id                        | uuid                                                                                    | `offices.id` FK（主たる所属拠点）                                                                                                                                                                                |
| job_category                     | enum(`care_worker`, `nurse`, `life_counselor`, `care_manager`, `office_staff`, `other`) | 職種（介護職員 / 看護職員 / 生活相談員 / ケアマネ / 事務 / その他）                                                                                                                                              |
| employment_type                  | enum(`full_time`, `contract`, `part_time`)                                              | 雇用形態（**現在有効な契約のスナップショット**。履歴は `employment_contracts` で持つ）                                                                                                                           |
| joined_at                        | date                                                                                    | 入社日（雇用契約上の入社日。通常 `hired_at` と同一だが、再雇用などで分かれる場合に備え別カラム）                                                                                                                 |
| hired_at                         | date                                                                                    | 雇い入れ日（有給付与の基準日）                                                                                                                                                                                   |
| employment_status                | enum(`active`, `on_leave`, `retired`)                                                   | 在籍状況。`retired_at` だけでは休職を表現できないため別カラムで保持                                                                                                                                              |
| retired_at                       | date (nullable)                                                                         | 退職日（`employment_status=retired` のとき必須）                                                                                                                                                                 |
| retirement_reason                | text (nullable)                                                                         | 退職理由（フリーテキスト）                                                                                                                                                                                       |
| emergency_contact_name           | text (nullable)                                                                         | 緊急連絡先 氏名                                                                                                                                                                                                  |
| emergency_contact_relation       | text (nullable)                                                                         | 緊急連絡先 続柄（配偶者・親 など）                                                                                                                                                                               |
| emergency_contact_phone          | text (nullable)                                                                         | 緊急連絡先 電話番号                                                                                                                                                                                              |
| weekly_work_days                 | numeric(3,1)                                                                            | 所定労働日数 / 週（現契約のスナップショット。例 5.0）                                                                                                                                                            |
| daily_work_hours                 | numeric(4,2)                                                                            | 所定労働時間 / 日（現契約のスナップショット。例 8.00）                                                                                                                                                           |
| base_wage_type                   | enum(`hourly`, `monthly`)                                                               | 時給 / 月給（現契約のスナップショット）                                                                                                                                                                          |
| base_wage_amount                 | integer                                                                                 | 円（現契約のスナップショット）                                                                                                                                                                                   |
| desired_night_shifts_per_month   | integer (nullable)                                                                      | 月の夜勤希望回数。自動作成 Phase 2 がこの回数まで夜勤を優先割当（`null` = 希望なし=0 扱い）                                                                                                                      |
| is_manager                       | boolean (default false)                                                                 | 管理者（施設管理者）か。`true` の職員はシフト希望画面で「事務日 / 実績周り日」を指定でき、自動作成でその日を事務・実績周りの勤務で固定配置し公休を入れない。ログイン権限（`users.role`）とは別軸のシフト用フラグ |
| notes                            | text                                                                                    | 備考                                                                                                                                                                                                             |
| created_at / updated_at          | timestamptz                                                                             |                                                                                                                                                                                                                  |

- インデックス: `(office_id, employment_status)`、`employee_code` unique
- 退職時の遷移: `employment_status` を `retired` に変更し、`retired_at` / `retirement_reason` を埋める。物理削除しない
- `desired_night_shifts_per_month`: 自動作成 v2 ([auto-shift-design-v2.md §4.2](auto-shift-design-v2.md) ①) で追加。日付単位の `shift_preferences.preferred_night`（夜勤を入れてよい日）とは別軸で、「月あたり何回夜勤に入りたいか」を保持する。月の夜勤上限 `shift_constraints.max_night_shifts_per_month`（上限）と区別する（希望 ≤ 上限が通常）
- `is_manager`: 管理者（施設管理者）フラグ。`true` の職員は S-E-10 のシフト希望画面で `shift_preferences.office_day`（事務日）/ `record_round`（実績周り日）を月あたり事務日 2 日・実績周り日 1 日まで指定できる。自動作成（デイ / ショート / NRS）はその日を勤務記号「事務」/「実績周り」で固定配置し、公休を入れない（勤務日数・連勤・フロア人数にカウント）。ログイン権限 `users.role` とは別軸

### 2.4 `qualifications` — 保有資格（キャリアアップ助成金 / 加算で参照）

| カラム                  | 型                                                                                                   | 説明     |
| ----------------------- | ---------------------------------------------------------------------------------------------------- | -------- |
| id                      | uuid                                                                                                 | PK       |
| employee_id             | uuid                                                                                                 | FK       |
| qualification_type      | enum(`care_worker`, `initial_training`, `practical_training`, `chief_care_worker`, `nurse`, `other`) | 種別     |
| acquired_on             | date                                                                                                 | 取得日   |
| certificate_number      | text (nullable)                                                                                      | 登録番号 |
| created_at / updated_at | timestamptz                                                                                          |          |

### 2.5 `employment_contracts` — 雇用契約

1 従業員に複数契約を時系列で積む（更新ごとに新規レコード）。`employees` に持つ雇用情報スナップショットの履歴元。

| カラム                        | 型                                         | 説明                                                           |
| ----------------------------- | ------------------------------------------ | -------------------------------------------------------------- |
| id                            | uuid                                       | PK                                                             |
| employee_id                   | uuid                                       | `employees.id` FK                                              |
| contract_start_on             | date                                       | 契約開始日                                                     |
| contract_end_on               | date (nullable)                            | 契約終了日。正社員無期は NULL                                  |
| employment_type               | enum(`full_time`, `contract`, `part_time`) | 契約時点の雇用形態（履歴保持のため `employees` と独立）        |
| working_hours_per_day         | numeric(4,2)                               | 所定労働時間 / 日                                              |
| working_days_per_week         | numeric(3,1)                               | 所定労働日数 / 週                                              |
| wage_type                     | enum(`hourly`, `monthly`)                  |                                                                |
| wage_amount                   | integer                                    | 円                                                             |
| is_renewable                  | boolean                                    | 更新有無                                                       |
| renewal_count                 | integer default 0                          | 既往の更新回数                                                 |
| has_renewal_limit             | boolean default false                      | 更新上限の有無                                                 |
| renewal_limit_count           | integer (nullable)                         | 上限回数                                                       |
| renewal_criteria              | text (nullable)                            | 更新判断基準                                                   |
| has_employment_insurance      | boolean                                    | 雇用保険加入                                                   |
| has_social_insurance          | boolean                                    | 社会保険加入                                                   |
| retirement_allowance_eligible | boolean (nullable)                         | 退職金対象。NULL = 自動判定にまかせる、true/false で手動上書き |
| career_subsidy_target         | boolean default false                      | キャリアアップ助成金 対象として記録                            |
| career_subsidy_notes          | text (nullable)                            | 社労士確認用メモ                                               |
| notes                         | text (nullable)                            |                                                                |
| created_at / updated_at       | timestamptz                                |                                                                |

- インデックス: `(employee_id, contract_start_on DESC)`
- 「現在有効な契約」は `contract_start_on <= today AND (contract_end_on IS NULL OR contract_end_on >= today)` で導出
- 退職金通算判定: `employment_type = full_time` の契約の `contract_start_on` から `contract_end_on or today` の合計日数が 3 年（1095 日）以上で「対象」をサジェスト表示。`retirement_allowance_eligible` が NULL なら自動判定値、非 NULL なら手動値を優先

### 2.6 `employee_documents` — 書類

PII を含むため、ファイル本体は外部オブジェクトストレージに置き、DB には storage_key のみ保持する。

| カラム                  | 型                                                                                                                                  | 説明                                                               |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| id                      | uuid                                                                                                                                | PK                                                                 |
| employee_id             | uuid                                                                                                                                | `employees.id` FK                                                  |
| document_type           | enum(`resume`, `qualification_cert`, `privacy_consent`, `employment_contract`, `labor_conditions_notice`, `training_cert`, `other`) | 書類種別                                                           |
| title                   | text                                                                                                                                | 表示名（例「2026 年度 雇用契約書」）                               |
| storage_key             | text                                                                                                                                | オブジェクトストレージ上のキー（例 `employees/<uuid>/<uuid>.pdf`） |
| file_name               | text                                                                                                                                | アップロード時の元ファイル名                                       |
| mime_type               | text                                                                                                                                |                                                                    |
| file_size               | integer                                                                                                                             | bytes                                                              |
| contract_id             | uuid (nullable)                                                                                                                     | `employment_contracts.id` FK。契約書系のとき紐付け                 |
| training_record_id      | uuid (nullable)                                                                                                                     | `training_records.id` FK。修了証のとき紐付け                       |
| expires_on              | date (nullable)                                                                                                                     | 有効期限（資格証明書など）                                         |
| uploaded_by             | uuid                                                                                                                                | `users.id` FK                                                      |
| uploaded_at             | timestamptz                                                                                                                         |                                                                    |
| deleted_at              | timestamptz (nullable)                                                                                                              | 論理削除                                                           |
| notes                   | text (nullable)                                                                                                                     |                                                                    |
| created_at / updated_at | timestamptz                                                                                                                         |                                                                    |

- インデックス: `(employee_id, document_type)`、`(expires_on)` 部分インデックス（NOT NULL）

### 2.7 `document_access_logs` — 書類アクセス監査ログ

| カラム      | 型                                 | 説明                       |
| ----------- | ---------------------------------- | -------------------------- |
| id          | uuid                               | PK                         |
| document_id | uuid                               | `employee_documents.id` FK |
| user_id     | uuid                               | アクセスしたユーザー       |
| action      | enum(`view`, `download`, `delete`) | 操作種別                   |
| accessed_at | timestamptz                        |                            |
| ip_address  | text (nullable)                    |                            |
| user_agent  | text (nullable)                    |                            |

- 90 日以上経過したログはアーカイブテーブルに移動する想定（運用設計は Phase 2 で詰める）

### 2.8 `training_records` — 研修記録

| カラム                  | 型                                | 説明                       |
| ----------------------- | --------------------------------- | -------------------------- |
| id                      | uuid                              | PK                         |
| employee_id             | uuid                              | `employees.id` FK          |
| training_name           | text                              |                            |
| training_type           | enum(`paid_self`, `company_paid`) | 有料（自己負担）/ 会社負担 |
| cost_yen                | integer (nullable)                | 円                         |
| trained_on              | date                              | 研修日                     |
| notes                   | text (nullable)                   |                            |
| created_at / updated_at | timestamptz                       |                            |

- 修了証ファイルは `employee_documents.training_record_id` で逆引き

### 2.9 `shift_constraints` — 個人別シフト制約

| カラム                     | 型                   | 説明                                              |
| -------------------------- | -------------------- | ------------------------------------------------- |
| id                         | uuid                 | PK                                                |
| employee_id                | uuid                 | `employees.id` FK、**unique**（1 従業員 1 行）    |
| max_monthly_work_minutes   | integer (nullable)   | 月間勤務時間上限                                  |
| max_daily_work_minutes     | integer (nullable)   | 1 日勤務時間上限                                  |
| max_night_shifts_per_month | integer (nullable)   | 月間夜勤上限（正社員既定 5）                      |
| allow_night_shift_override | boolean default true | 人員不足時の上限超過を許可するか                  |
| target_monthly_work_days   | integer (nullable)   | 月間出勤目標日数（正社員既定 21）                 |
| annual_income_cap_yen      | integer (nullable)   | 年収上限（パート 130 万円アラート用）             |
| unavailable_days_of_week   | integer[]            | 勤務不可曜日（PostgreSQL int 配列、0=日 .. 6=土） |
| notes                      | text (nullable)      |                                                   |
| updated_at                 | timestamptz          |                                                   |

- 130 万円アラート計算: 当該年の `shifts` 割当 × `shift_patterns` の労働時間 × `employment_contracts.wage_amount`（時給契約のみ）で見込み年収を算出。`annual_income_cap_yen` の 80% / 100% で段階アラート

### 2.10 `shift_preferences` — シフト希望（希望休 / 希望夜勤 / 不可日）

| カラム                  | 型                                                                                                  | 説明                                                                                                                                                                                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id                      | uuid                                                                                                | PK                                                                                                                                                                                                                                            |
| employee_id             | uuid                                                                                                | `employees.id` FK                                                                                                                                                                                                                             |
| target_date             | date                                                                                                | 対象日                                                                                                                                                                                                                                        |
| preference_type         | enum(`requested_off`, `preferred_night`, `unavailable`, `paid_leave`, `office_day`, `record_round`) | 希望休 / 希望夜勤 / 勤務不可 / 有給 / 事務日 / 実績周り日。`office_day` / `record_round` は `employees.is_manager=true` の職員のみ提出可（月あたり事務日 2 日・実績周り日 1 日まで）で、自動作成が勤務記号「事務」/「実績周り」で固定配置する |
| status                  | enum(`pending`, `accepted`, `rejected`) default `pending`                                           | 管理者承認状態（MVP では `accepted` を既定運用）                                                                                                                                                                                              |
| note                    | text (nullable)                                                                                     |                                                                                                                                                                                                                                               |
| created_by              | uuid                                                                                                | `users.id` FK（本人 or 管理者）                                                                                                                                                                                                               |
| reviewed_by             | uuid (nullable)                                                                                     |                                                                                                                                                                                                                                               |
| reviewed_at             | timestamptz (nullable)                                                                              |                                                                                                                                                                                                                                               |
| created_at / updated_at | timestamptz                                                                                         |                                                                                                                                                                                                                                               |

- ユニーク制約: `(employee_id, target_date, preference_type)`

### 2.11 `office_shift_quotas` — 拠点別 シフト必要人員数（**廃止 2026-06-09**）

> **撤去済み**: パターン×人数で必要人員を持つ v1 モデル。全拠点を案A（午前/午後モデル `office_coverage_demands` §2.23）と拠点専用生成へ移行し終えたため、テーブル・画面（S-A-27 シフト枠）・v1 生成ロジックごと撤去した（migration `drop_office_shift_quota`）。需要は `office_coverage_demands`（デイ/ショート/NRS）または拠点専用 config（厨房=`kitchen/config.ts`、梨花=`rika/config.ts`）に一本化。詳細は [auto-shift-design-v2.md §10.1](auto-shift-design-v2.md)。日種の祝日判定は引き続き `src/lib/calendar/holidays.ts`。

- 休み系パターン (`shift_kind = off / paid_leave / absence / requested_off`) は quota の対象外。S-A-27 の UI からも除外する
- `shift_pattern_id` は `(office_id 一致) OR (shift_patterns.office_id IS NULL)` の組み合わせのみ許可

### 2.12 `shift_generation_runs` — シフト自動作成の実行履歴

| カラム            | 型                         | 説明                                        |
| ----------------- | -------------------------- | ------------------------------------------- |
| id                | uuid                       | PK                                          |
| office_id         | uuid                       | `offices.id` FK                             |
| target_month      | date                       | 対象月の 1 日（例 `2026-06-01`）            |
| status            | enum(`draft`, `confirmed`) | 下書き / 確定                               |
| generated_by      | uuid                       | `users.id` FK                               |
| generated_at      | timestamptz                |                                             |
| algorithm_version | text                       | 後追い検証用（例 `greedy-v1`）              |
| stats             | jsonb                      | 配置統計（充足率、警告数、超過夜勤数 など） |
| created_at        | timestamptz                |                                             |

- ユニーク制約: `(office_id, target_month)` ※同月の自動作成は 1 行に集約（再実行で上書き）
- `shifts.generation_run_id` を追加して run と紐付け、自動作成由来 / 手動入力 を区別
- `status` の遷移は `draft → confirmed`。`confirmed` からは「確定取り消し」操作のみで `draft` に戻せる
- `stats` jsonb のスキーマは [auto-shift-design.md §3.2](auto-shift-design.md#32-shift_generation_runs--自動作成の実行履歴) に固定。`input` / `fill` / `warnings[]` / `elapsedMs` / `seed` を持つ
- 同月再実行時、`generation_run_id` を持ち、かつ `updated_by = generated_by`（= 自動配置直後で未編集）の shifts のみ上書き。それ以外は保護される（[auto-shift-design.md §6.3](auto-shift-design.md#63-手動編集分の保護)）

### 2.12.1 `shift_publications` — 勤務表の公開状態（拠点 × 月）

| カラム       | 型          | 説明                                 |
| ------------ | ----------- | ------------------------------------ |
| id           | uuid        | PK                                   |
| office_id    | uuid        | `offices.id` FK（onDelete: Cascade） |
| target_month | date        | 対象月の 1 日（例 `2026-06-01`）     |
| published_at | timestamptz | 公開日時                             |
| published_by | uuid        | `users.id` FK（公開操作した管理者）  |
| created_at   | timestamptz |                                      |
| updated_at   | timestamptz |                                      |

- ユニーク制約: `(office_id, target_month)`。**行が存在する = その拠点・その月が公開済み**で、職員が S-E-04（月別シフト）で閲覧できる。
- 公開取消は行削除（職員から再び隠す）。シフト本体（`shifts`）には一切触らない。
- 公開フラグは「見せるか」だけを制御するため、公開後の手修正は**再公開不要で即反映**される。
- `shift_generation_runs.status`（自動生成の確定）とは別概念。手動作成の拠点には run が無いので、公開は専用テーブルで持つ。

### 2.13 `shift_patterns` — シフトパターン定義

実際のシフトパターン一覧（約30種）は [`shift-patterns.md`](shift-patterns.md) を参照。

| カラム                  | 型                                                                                     | 説明                                                                                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| id                      | uuid                                                                                   | PK                                                                                                                                                                       |
| office_id               | uuid (nullable)                                                                        | NULL は全拠点共通。拠点固有パターン（梨1〜5、デ短A〜E など）は拠点 ID を入れる                                                                                           |
| code                    | text                                                                                   | 一意（例 `EARLY`, `DAY`, `DAY_CARE`, `DAY_SHORT`, `LATE`, `NIGHT_IN`, `NIGHT_OUT`, `HALF_A`, `DC_A`, `RK_1`, `KT_A`, `OFF`, `PAID_LEAVE`, `ABSENCE`, `AM_LEAVE_PM_DAY`） |
| name                    | text                                                                                   | 表示名（早 / デ日 / 夜入 など）                                                                                                                                          |
| shift_kind              | enum(`work`, `night_in`, `night_out`, `off`, `paid_leave`, `absence`, `requested_off`) | 種別。夜勤は `night_in`（当日）/`night_out`（翌日）に分割                                                                                                                |
| start_time              | time (nullable)                                                                        | 勤務開始（休み系は NULL）                                                                                                                                                |
| end_time                | time (nullable)                                                                        | 勤務終了。`night_in` は 24:00、`night_out` は 00:00 開始など、跨日は別パターンで表現                                                                                     |
| crosses_midnight        | boolean                                                                                | 跨日判定用（`night_in` でも 24:00 終了なら false、深夜帯まで続くフル夜勤の場合 true）                                                                                    |
| break_minutes           | integer                                                                                | 休憩時間（分）                                                                                                                                                           |
| paid_leave_units        | numeric(3,1)                                                                           | 1 シフト割当てで消化される有休日数。通常勤務 0 / 純粋有休 1.0 / 複合（有/日・日/有）0.5                                                                                  |
| color                   | text                                                                                   | カラーコード（勤務表表示用）                                                                                                                                             |
| sort_order              | integer                                                                                | 表示順                                                                                                                                                                   |
| is_active               | boolean                                                                                |                                                                                                                                                                          |
| created_at / updated_at | timestamptz                                                                            |                                                                                                                                                                          |

### 2.14 `shifts` — 月次シフト（勤務表）

| カラム                  | 型              | 説明                                                |
| ----------------------- | --------------- | --------------------------------------------------- |
| id                      | uuid            | PK                                                  |
| employee_id             | uuid            | FK                                                  |
| office_id               | uuid            | FK（応援勤務に備え独立保持）                        |
| work_date               | date            | 業務日（夜勤は出勤日）                              |
| shift_pattern_id        | uuid            | FK                                                  |
| generation_run_id       | uuid (nullable) | `shift_generation_runs.id` FK。自動作成由来かを示す |
| note                    | text (nullable) | 備考                                                |
| created_by              | uuid            | `users.id`                                          |
| updated_by              | uuid            | `users.id`                                          |
| created_at / updated_at | timestamptz     |                                                     |

- ユニーク制約: `(employee_id, work_date)`
- インデックス: `(office_id, work_date)`、`(generation_run_id)`
- `generation_run_id` は `ON DELETE SET NULL`。run を消しても shifts 自体は残る
- 自動由来かつ未編集の判定: `generation_run_id IS NOT NULL AND updated_by = (関連 run の generated_by)`

### 2.15 `attendance_records` — 打刻実績（日次） — Phase 2 で機能実装

1日 1 レコード。打刻は本テーブルにまとめて保持し、休憩は子テーブルに切る。

| カラム                  | 型                                                | 説明                                     |
| ----------------------- | ------------------------------------------------- | ---------------------------------------- |
| id                      | uuid                                              | PK                                       |
| employee_id             | uuid                                              | FK                                       |
| office_id               | uuid                                              | FK（打刻時の拠点）                       |
| work_date               | date                                              | 業務日（夜勤は出勤日基準）               |
| clock_in_at             | timestamptz (nullable)                            | 出勤打刻                                 |
| clock_out_at            | timestamptz (nullable)                            | 退勤打刻（翌日にまたがる場合は翌日時刻） |
| shift_pattern_id        | uuid (nullable)                                   | 紐付くシフト                             |
| total_work_minutes      | integer (nullable)                                | 集計後の実労働分（バッチで計算）         |
| total_break_minutes     | integer (nullable)                                | 休憩合計分                               |
| overtime_minutes        | integer (nullable)                                | 所定外（時間外）                         |
| night_minutes           | integer (nullable)                                | 深夜時間（22:00–翌5:00）                 |
| status                  | enum(`open`, `submitted`, `approved`, `rejected`) | ワークフロー状態                         |
| approved_by             | uuid (nullable)                                   | `users.id`                               |
| approved_at             | timestamptz (nullable)                            |                                          |
| note                    | text (nullable)                                   |                                          |
| created_at / updated_at | timestamptz                                       |                                          |

- ユニーク制約: `(employee_id, work_date)`

### 2.16 `break_records` — 休憩打刻 — Phase 2 で機能実装

| カラム                  | 型                     | 説明          |
| ----------------------- | ---------------------- | ------------- |
| id                      | uuid                   | PK            |
| attendance_record_id    | uuid                   | FK            |
| break_start_at          | timestamptz            |               |
| break_end_at            | timestamptz (nullable) | 進行中は NULL |
| created_at / updated_at | timestamptz            |               |

### 2.17 `paid_leave_grants` — 有給付与履歴 — Phase 3 で機能実装

| カラム                  | 型                                                   | 説明                   |
| ----------------------- | ---------------------------------------------------- | ---------------------- |
| id                      | uuid                                                 | PK                     |
| employee_id             | uuid                                                 | FK                     |
| granted_on              | date                                                 | 付与日                 |
| granted_days            | numeric(4,1)                                         | 付与日数               |
| expires_on              | date                                                 | 失効日（付与日 + 2年） |
| grant_type              | enum(`statutory`, `manual_adjustment`, `carry_over`) | 法定 / 手動 / 繰越     |
| note                    | text (nullable)                                      |                        |
| created_at / updated_at | timestamptz                                          |                        |

### 2.18 `paid_leave_consumptions` — 有給消化記録 — Phase 3 で機能実装

| カラム                  | 型              | 説明                                 |
| ----------------------- | --------------- | ------------------------------------ |
| id                      | uuid            | PK                                   |
| employee_id             | uuid            | FK                                   |
| consumed_on             | date            | 消化日                               |
| consumed_days           | numeric(3,1)    | 消化日数（半休は 0.5）               |
| source_grant_id         | uuid (nullable) | 古い付与から消化するためのトレース用 |
| shift_id                | uuid (nullable) | 紐付くシフト                         |
| created_at / updated_at | timestamptz     |                                      |

### 2.19 `company_profile` — 会社マスタ (Phase 1-I で実装)

労働条件通知書 / 雇用契約書 PDF 出力 ([employment-contract-printable.md](employment-contract-printable.md)) で参照する、全契約共通の条項を保持する単一行テーブル。

| カラム                    | 型          | 説明                                     |
| ------------------------- | ----------- | ---------------------------------------- |
| id                        | uuid        | PK (シングルトン)                        |
| legal_name                | text        | 法人名                                   |
| address                   | text        | 法人所在地                               |
| phone                     | text        | 法人 TEL                                 |
| representative_title      | text        | 代表者役職 (例: 代表取締役)              |
| representative_name       | text        | 代表者氏名                               |
| retirement_age            | integer     | 定年 (例: 60)                            |
| continued_employment_age  | integer     | 継続雇用上限 (例: 65)                    |
| resign_notice_days        | integer     | 自己都合退職の事前申出日数 (例: 30)      |
| wage_cutoff_day           | text        | 賃金締切日 (例: "月末")                  |
| wage_payment_day          | text        | 賃金支払日 (例: "翌月20日")              |
| wage_payment_method       | text        | 賃金支払方法                             |
| salary_raise_period       | text        | 昇給時期 (例: "毎年6月に行う場合がある") |
| overtime_rate_under_60h   | integer     | 法定超 月60h以内の割増率 % (例 25)       |
| overtime_rate_over_60h    | integer     | 法定超 月60h超の割増率 % (例 25)         |
| overtime_rate_within      | integer     | 所定超の割増率 % (例 0)                  |
| holiday_legal_rate        | integer     | 法定休日の割増率 % (例 35)               |
| night_rate                | integer     | 深夜の割増率 % (例 25)                   |
| break_rule_text           | text        | 休憩ルール本文                           |
| work_rules_name           | text        | 就業規則名                               |
| part_time_work_rules_name | text        | パート就業規則名                         |
| contact_department        | text        | 相談窓口部署                             |
| contact_person_title      | text        | 相談窓口担当者の職                       |
| contact_person_name       | text        | 相談窓口担当者氏名                       |
| contact_phone             | text        | 相談窓口 TEL                             |
| created_at / updated_at   | timestamptz |                                          |

- 単一行で運用 (1 法人 = 1 行)。将来マルチテナント化時は `id` を `tenant_id` として再利用。

### 2.20 `employment_contract_allowances` — 諸手当 (Phase 1-I で実装)

雇用契約書「賃金 - 諸手当 イロハニ」相当を正規化したテーブル。

| カラム                  | 型          | 説明                                             |
| ----------------------- | ----------- | ------------------------------------------------ |
| id                      | uuid        | PK                                               |
| contract_id             | uuid        | `employment_contracts.id` FK (ON DELETE CASCADE) |
| sort_order              | integer     | イロハニ の順 (0..3 を既定、上限なし)            |
| name                    | text        | 手当名 (例: 夜勤手当 / 看護師手当 / 休日手当)    |
| amount_yen              | integer     | 金額                                             |
| calculation_method      | text        | 計算方法 (例: "20000円/1回×夜勤回数")            |
| created_at / updated_at | timestamptz |                                                  |

- インデックス: `(contract_id, sort_order)`
- 4 件以上の手当: 帳票では「その他諸手当」備考欄に集約

### 2.21 `employment_contracts` 拡張カラム (Phase 1-I で追加)

PDF 出力に必要な項目を追加する。既存カラムはそのまま維持。

| カラム                          | 型                                                 | 説明                                       |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------ |
| workplace_initial               | text                                               | 雇入直後の就業場所                         |
| workplace_scope                 | text                                               | 就業場所の変更範囲 (2024 年改正で必須)     |
| job_description_initial         | text                                               | 雇入直後の業務内容                         |
| job_description_scope           | text                                               | 業務内容の変更範囲                         |
| weekly_hours_category           | enum(`under_20`, `between_20_30`, `between_30_40`) | 週所定労働時間区分                         |
| shift_based_schedule            | boolean                                            | シフト勤務か (true=シフト, false=固定時刻) |
| has_early_end_possibility       | boolean                                            | 終業時刻の繰り上げの可能性あり             |
| has_overtime                    | boolean                                            | 所定時間外労働の有無                       |
| has_bonus                       | boolean                                            | 賞与の有無                                 |
| bonus_description               | text (nullable)                                    | 賞与本文 (有のとき)                        |
| retirement_allowance_start_text | text (nullable)                                    | 退職金支給開始時期 (有のとき)              |
| special_measure_type            | enum(`none`, `high_skill`, `post_retirement`)      | 有期雇用特別措置法の対象種別               |
| special_measure_business_title  | text (nullable)                                    | 特定有期業務 (高度専門の場合)              |
| special_measure_start_on        | date (nullable)                                    | 特定有期業務の開始日                       |
| special_measure_end_on          | date (nullable)                                    | 特定有期業務の完了日                       |

### 2.22 `office_shift_settings` — 拠点別 シフト自動作成 設定 (自動作成 v2 で追加)

自動作成 v2 ([auto-shift-design-v2.md §4.1 / §8②](auto-shift-design-v2.md)) で、これまでハードコードしていた調整値を拠点別に外出しする。office と 1:1。**行が無い拠点は既定値で扱う**（`office` への列追加はしない）。

| カラム                             | 型          | 既定      | 説明                                                          |
| ---------------------------------- | ----------- | --------- | ------------------------------------------------------------- |
| id                                 | uuid        |           | PK                                                            |
| office_id                          | uuid        |           | `offices.id` FK、**unique**（1 拠点 1 行）                    |
| max_consecutive_work_days          | integer     | 6         | 連勤上限（全フェーズのハード制約）                            |
| default_max_night_shifts_per_month | integer     | 5         | 月の夜勤上限の既定値（個人 `shift_constraints` で上書き可）   |
| default_annual_income_cap_yen      | integer     | 1,300,000 | パート年収上限の既定値（個人 `shift_constraints` で上書き可） |
| created_at / updated_at            | timestamptz |           |                                                               |

- ユニーク制約: `office_id`
- 持つ値は純粋関数の `ShiftGenSetting` ([auto-generator/types.ts](../src/lib/shift/auto-generator/types.ts)) と 1:1 対応。行が無ければ `DEFAULT_SHIFT_GEN_SETTING` が適用される
- 正社員の目標勤務日数の決め方（式: 週日数 × 月週数）は v2 時点ではコード側（定数）に留め、本テーブルには持たない。外出しが必要になった段階で列追加する

### 2.23 `office_coverage_demands` — 拠点別 配置基準（午前/午後・自動作成 v2 案A）

自動作成 v2 の **案A**（[auto-shift-design-v2.md](auto-shift-design-v2.md)）で、配置基準を「シフトパターン単位の人数」ではなく **「午前◯名・午後◯名」** で持つためのテーブル。デイ/ショート/ナーシングのように「午前と午後で人数が違う」「日曜だけ少ない/休業」を素直に表せる。office × 日種でユニーク。

| カラム                  | 型                                                       | 既定 | 説明                                                                                                |
| ----------------------- | -------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------- |
| id                      | uuid                                                     |      | PK                                                                                                  |
| office_id               | uuid                                                     |      | `offices.id` FK                                                                                     |
| day_kind                | enum(`weekday`, `saturday`, `sunday_holiday`, `holiday`) |      | 平日 / 土 / 日曜 / 祝日（祝日は日曜と別区分。デイのように「祝日は営業・日曜は休業」を区別するため） |
| am_required             | integer                                                  | 0    | 午前の必要在席人数（相談員含む総数）                                                                |
| pm_required             | integer                                                  | 0    | 午後の必要在席人数（相談員含む総数）                                                                |
| counselor_am_required   | integer                                                  | 0    | 午前に必要な生活相談員数（0=チェックしない）                                                        |
| counselor_pm_required   | integer                                                  | 0    | 午後に必要な生活相談員数（0=チェックしない）                                                        |
| night_in_required       | integer                                                  | 0    | 夜入の必要数（ショート/ナーシング=1）                                                               |
| night_out_required      | integer                                                  | 0    | 夜明の必要数（前日夜入とペア。ショート/ナーシング=1）                                               |
| created_at / updated_at | timestamptz                                              |      |                                                                                                     |

- ユニーク制約: `(office_id, day_kind)`
- **営業日の判定**: `am + pm + night_in + night_out > 0` の日種を営業日とする（専用フラグは持たない。v2 §8④と整合）。例: デイは `sunday_holiday` を全 0（日曜休業）、`holiday` は平日と同値（祝日は営業）。ショート/ナーシングは `holiday` を `sunday_holiday` と同値（祝日も日曜並み）
- 各勤務記号が午前/午後/夜勤のどれに何人分寄与するかは `shift_patterns.am_count` / `pm_count`（[§2.13](#213-shift_patterns--シフトパターン定義)、勤務記号マスター由来）で評価する
- 生活相談員かどうかは `employees.job_category = life_counselor` で判定（自動配置では強制せず、午前/午後 各 N 名を満たすかの**チェック**に使う）
- **旧 `office_shift_quotas`（パターン単位）は撤去済み（2026-06-09、[§2.11](#211-office_shift_quotas--拠点別-シフト必要人員数)）**。需要はこの午前/午後単位（デイ/ショート/NRS）と拠点専用 config（厨房・梨花）に一本化した

---

## 3. テーブル定義（Phase 3 以降、概念設計のみ）

### 3.1 `attendance_corrections` — 打刻修正申請 (Phase 3)

| カラム                    | 型                                                                    | 説明       |
| ------------------------- | --------------------------------------------------------------------- | ---------- |
| id                        | uuid                                                                  | PK         |
| attendance_record_id      | uuid                                                                  | 対象の勤怠 |
| requested_by              | uuid                                                                  | 申請者     |
| field                     | enum(`clock_in_at`, `clock_out_at`, `break_start_at`, `break_end_at`) | 修正対象   |
| current_value             | timestamptz                                                           |            |
| requested_value           | timestamptz                                                           |            |
| reason                    | text                                                                  |            |
| status                    | enum(`pending`, `approved`, `rejected`)                               |            |
| reviewed_by / reviewed_at | uuid / timestamptz                                                    |            |
| created_at / updated_at   | timestamptz                                                           |            |

### 3.2 `leave_requests` — 希望休 / 有休申請 (Phase 3 で承認フロー化)

> MVP は `shift_preferences` で希望休 / 希望夜勤 / 不可日を扱う（管理者承認は簡易運用）。Phase 3 でこのテーブルを追加し、本格的な承認フローと有休連動を組む。

| カラム                    | 型                                      | 説明 |
| ------------------------- | --------------------------------------- | ---- |
| id                        | uuid                                    | PK   |
| employee_id               | uuid                                    |      |
| request_type              | enum(`requested_off`, `paid_leave`)     |      |
| requested_date            | date                                    |      |
| half_day                  | enum(`full`, `am`, `pm`) (nullable)     |      |
| reason                    | text (nullable)                         |      |
| status                    | enum(`pending`, `approved`, `rejected`) |      |
| reviewed_by / reviewed_at | uuid / timestamptz                      |      |
| created_at / updated_at   | timestamptz                             |      |

---

## 4. テーブル定義（Future、置く位置のみ確保）

- `career_subsidy_records` — キャリアアップ助成金 申請対象期間と賃金変動の記録（MVP の `employment_contracts.career_subsidy_*` で当面まかなう）
- `office_audit_logs` — 管理操作の監査ログ（書類アクセスは MVP の `document_access_logs` で先行）
- `contract_pdf_templates` — 雇用契約書 / 労働条件通知書の PDF テンプレート

---

## 5. インデックス / パフォーマンス指針

- 打刻は 1 日 1 レコード想定なので、55 名 × 365 日 = 2 万行 / 年。10 年分でも 20 万行で軽量。
- 主要クエリ:
  - `shifts WHERE office_id = ? AND work_date BETWEEN ? AND ?` → `(office_id, work_date)` 複合
  - `employees WHERE office_id = ? AND employment_status = 'active'` → 部分インデックス検討
  - 現在有効契約: `employment_contracts WHERE employee_id = ? ORDER BY contract_start_on DESC LIMIT 1` → `(employee_id, contract_start_on DESC)`
  - 書類期限切迫: `employee_documents WHERE expires_on BETWEEN today AND today + 30d` → `(expires_on)` 部分インデックス
  - シフト希望: `shift_preferences WHERE employee_id = ? AND target_date BETWEEN ? AND ?` → `(employee_id, target_date)`
  - (Phase 2) `attendance_records WHERE employee_id = ? AND work_date BETWEEN ? AND ?` → `(employee_id, work_date)` 複合
- 月次集計は事前計算より、必要時に算出する方針（行数が少ないため）。Phase 2 で重くなったらマテビューを検討。

---

## 6. 設計上の留意点

- **夜勤跨ぎの日付**: `attendance_records.work_date` は **出勤した日**。退勤が翌日になる場合 `clock_out_at` は翌日の timestamptz で素直に入れる。`work_date` と `clock_out_at` の日付が乖離するケースを想定し、集計ロジックに反映する。
- **夜入（night_in）/ 夜明（night_out）**: 提供現場では夜勤を「夜入 16:30-24:00（当日）」と「夜明 00:00-08:30（翌日）」の **2 枚のシフトに分けて勤務表に貼る** 運用。`shifts` も 2 レコード（当日に `NIGHT_IN`、翌日に `NIGHT_OUT`）入れる。打刻 (`attendance_records`) は出勤日（`NIGHT_IN` 当日）にまとめて 1 レコードで持ち、`clock_out_at` は翌朝の timestamptz を入れる。実労働時間の集計は `NIGHT_IN` 側で完結させ、`NIGHT_OUT` 側は実労働 0 として扱う。
- **複合パターン（`AM_LEAVE_PM_DAY` / `AM_DAY_PM_LEAVE`）**: `shift_kind = work`、`start_time`/`end_time` は勤務分の時刻のみ、`paid_leave_units = 0.5` を設定。シフト割当時に `paid_leave_consumptions` に 0.5 日のレコードを自動生成する。
- **応援勤務**: `shifts.office_id` と `attendance_records.office_id` は `employees.office_id` と独立に持つ。応援先で打刻する想定。
- **削除運用**: 物理削除はせず、`employees.employment_status` で在籍 / 休職 / 退職を表現する。勤怠データは退職後も保持。
- **マルチテナント拡張**: 将来 `tenant_id` を主要テーブルに付与できるよう、ユニーク制約や FK 設計を「列追加で済む」形にしておく（コメント参照）。
- **時刻保存**: 全 `timestamptz` カラムは UTC 保存。UI 表示・集計の境界判定はサーバ側で JST 変換してから行う。
- **書類ファイルの保存とセキュリティ**: 本番は Supabase Storage または S3 互換オブジェクトストレージ。保存時はサーバ側暗号化（SSE-KMS 等）を必須とし、DB には `storage_key` のみ。ローカル開発は `./storage/` (gitignore) を許容する。ダウンロード時は 5 分有効の署名 URL をその都度発行し、固定 URL を画面に出さない。アクセスは `document_access_logs` に必ず記録する。
- **退職金通算判定**: `employment_contracts` のうち `employment_type = full_time` の `[contract_start_on, contract_end_on or today]` の日数を合計。1095 日以上で「対象」サジェスト。`retirement_allowance_eligible` が NULL なら自動判定値、非 NULL なら手動値を優先表示。
- **年収 130 万円アラート（パート）**: `shifts × shift_patterns` から当年の予定労働時間を集計し、`employment_contracts.wage_amount`（時給契約のみ）を掛けて見込み年収を算出。`shift_constraints.annual_income_cap_yen` の 80% / 100% で段階アラート。打刻実装後は実績ベースに切り替える。
- **シフト自動作成アルゴリズム**: `src/lib/shift/auto-generator/` に隔離。配置順は (1) 希望休 / 不可日 / 不可曜日を除外 → (2) 正社員の月間出勤目標達成 → (3) 希望夜勤を持つ従業員に夜勤割当 → (4) 個人上限を超えない範囲で配置 → (5) 残り枠にパート配置 → (6) 不足枠は警告として `shift_generation_runs.stats` に出す。アルゴリズムバージョンを `algorithm_version` に記録し、後の改良で結果差異を比較できるようにする。
- **年5日取得義務チェック**: `paid_leave_grants` から「年 10 日以上付与された付与履歴」を抽出し、付与日〜+1 年の期間内に消化された `paid_leave_consumptions.consumed_days` の合計が 5 日未満となる従業員をアラート対象とする。バッチ事前計算ではなくクエリで都度算出（行数が少ないため）。Phase 3 で実装。
