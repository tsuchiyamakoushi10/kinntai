# データベース設計

PostgreSQL を前提とする。テーブル名・カラム名は `snake_case`、主キーは `id`（UUID または bigserial、Prisma 標準に従う）。

---

## 1. ER 概要（テキスト表現）

```
offices ──< employees ──< attendance_records
                │             │
                │             └< break_records
                │
                ├< paid_leave_grants
                ├< paid_leave_consumptions
                ├< shifts >── shift_patterns
                ├< leave_requests           (Phase 2)
                ├< attendance_corrections   (Phase 2)
                ├< employment_contracts     (Future)
                └< qualifications

users ──── employees   (1:1、users.role で管理者/従業員を区別)
```

`>──` は多対1、`──<` は1対多。`users` と `employees` は分離し、ログイン情報と人事情報を別管理にする。

---

## 2. テーブル定義（MVP）

### 2.1 `users` — ログインアカウント

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| email | text | 一意、ログイン用 |
| password_hash | text | bcrypt |
| role | enum(`admin`, `employee`) | 権限 |
| employee_id | uuid (nullable) | `employees.id` FK。管理者でも従業員情報を持つ場合あり |
| pin_code_hash | text (nullable) | 共有タブレット打刻用の4桁暗証番号ハッシュ |
| is_active | boolean | 無効化フラグ |
| last_login_at | timestamptz | 最終ログイン |
| created_at / updated_at | timestamptz | |

### 2.2 `offices` — 拠点

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| name | text | 拠点名 |
| code | text | 拠点コード（一意） |
| address | text | 所在地 |
| timezone | text | 既定 `Asia/Tokyo` |
| is_active | boolean | |
| created_at / updated_at | timestamptz | |

### 2.3 `employees` — 従業員

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_code | text | 事業所内で一意（例 `EMP-0001`） |
| last_name / first_name | text | 漢字氏名 |
| last_name_kana / first_name_kana | text | カナ氏名（50音検索用） |
| birth_date | date | |
| gender | enum(`male`, `female`, `other`) (nullable) | |
| phone | text (nullable) | |
| address | text (nullable) | |
| office_id | uuid | `offices.id` FK（主たる所属拠点） |
| employment_type | enum(`full_time`, `contract`, `part_time`) | 雇用形態 |
| hired_at | date | 雇い入れ日（有給付与の基準日） |
| retired_at | date (nullable) | 退職日 |
| weekly_work_days | numeric(3,1) | 所定労働日数 / 週（例 5.0） |
| daily_work_hours | numeric(4,2) | 所定労働時間 / 日（例 8.00） |
| base_wage_type | enum(`hourly`, `monthly`) | 時給 / 月給 |
| base_wage_amount | integer | 円 |
| notes | text | 備考 |
| created_at / updated_at | timestamptz | |

- インデックス: `(office_id, retired_at)`、`employee_code` unique

### 2.4 `qualifications` — 保有資格（キャリアアップ助成金 / 加算で参照）

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_id | uuid | FK |
| qualification_type | enum(`care_worker`, `initial_training`, `practical_training`, `chief_care_worker`, `nurse`, `other`) | 種別 |
| acquired_on | date | 取得日 |
| certificate_number | text (nullable) | 登録番号 |
| created_at / updated_at | timestamptz | |

### 2.5 `shift_patterns` — シフトパターン定義

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| office_id | uuid (nullable) | NULL は全拠点共通 |
| code | text | 一意（例 `EARLY`, `DAY`, `LATE`, `NIGHT`, `AFTER_NIGHT`, `OFF`, `PAID_LEAVE`, `ABSENCE`） |
| name | text | 表示名（早番 など） |
| shift_kind | enum(`work`, `night`, `after_night`, `off`, `paid_leave`, `absence`, `requested_off`) | 種別 |
| start_time | time (nullable) | 勤務開始（休み系は NULL） |
| end_time | time (nullable) | 勤務終了。翌日跨ぎの場合は時刻だけ保持し、`crosses_midnight` で判定 |
| crosses_midnight | boolean | 夜勤判定用 |
| break_minutes | integer | 休憩時間（分） |
| color | text | カラーコード（勤務表表示用） |
| sort_order | integer | 表示順 |
| is_active | boolean | |
| created_at / updated_at | timestamptz | |

### 2.6 `shifts` — 月次シフト（勤務表）

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_id | uuid | FK |
| office_id | uuid | FK（応援勤務に備え独立保持） |
| work_date | date | 業務日（夜勤は出勤日） |
| shift_pattern_id | uuid | FK |
| note | text (nullable) | 備考 |
| created_by | uuid | `users.id` |
| updated_by | uuid | `users.id` |
| created_at / updated_at | timestamptz | |

- ユニーク制約: `(employee_id, work_date)`
- インデックス: `(office_id, work_date)`

### 2.7 `attendance_records` — 打刻実績（日次）

1日 1 レコード。打刻は本テーブルにまとめて保持し、休憩は子テーブルに切る。

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_id | uuid | FK |
| office_id | uuid | FK（打刻時の拠点） |
| work_date | date | 業務日（夜勤は出勤日基準） |
| clock_in_at | timestamptz (nullable) | 出勤打刻 |
| clock_out_at | timestamptz (nullable) | 退勤打刻（翌日にまたがる場合は翌日時刻） |
| shift_pattern_id | uuid (nullable) | 紐付くシフト |
| total_work_minutes | integer (nullable) | 集計後の実労働分（バッチで計算） |
| total_break_minutes | integer (nullable) | 休憩合計分 |
| overtime_minutes | integer (nullable) | 所定外（時間外） |
| night_minutes | integer (nullable) | 深夜時間（22:00–翌5:00） |
| status | enum(`open`, `submitted`, `approved`, `rejected`) | ワークフロー状態 |
| approved_by | uuid (nullable) | `users.id` |
| approved_at | timestamptz (nullable) | |
| note | text (nullable) | |
| created_at / updated_at | timestamptz | |

- ユニーク制約: `(employee_id, work_date)`

### 2.8 `break_records` — 休憩打刻

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| attendance_record_id | uuid | FK |
| break_start_at | timestamptz | |
| break_end_at | timestamptz (nullable) | 進行中は NULL |
| created_at / updated_at | timestamptz | |

### 2.9 `paid_leave_grants` — 有給付与履歴

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_id | uuid | FK |
| granted_on | date | 付与日 |
| granted_days | numeric(4,1) | 付与日数 |
| expires_on | date | 失効日（付与日 + 2年） |
| grant_type | enum(`statutory`, `manual_adjustment`, `carry_over`) | 法定 / 手動 / 繰越 |
| note | text (nullable) | |
| created_at / updated_at | timestamptz | |

### 2.10 `paid_leave_consumptions` — 有給消化記録

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_id | uuid | FK |
| consumed_on | date | 消化日 |
| consumed_days | numeric(3,1) | 消化日数（半休は 0.5） |
| source_grant_id | uuid (nullable) | 古い付与から消化するためのトレース用 |
| shift_id | uuid (nullable) | 紐付くシフト |
| created_at / updated_at | timestamptz | |

---

## 3. テーブル定義（Phase 2 以降、概念設計のみ）

### 3.1 `attendance_corrections` — 打刻修正申請

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| attendance_record_id | uuid | 対象の勤怠 |
| requested_by | uuid | 申請者 |
| field | enum(`clock_in_at`, `clock_out_at`, `break_start_at`, `break_end_at`) | 修正対象 |
| current_value | timestamptz | |
| requested_value | timestamptz | |
| reason | text | |
| status | enum(`pending`, `approved`, `rejected`) | |
| reviewed_by / reviewed_at | uuid / timestamptz | |
| created_at / updated_at | timestamptz | |

### 3.2 `leave_requests` — 希望休 / 有休申請

| カラム | 型 | 説明 |
| --- | --- | --- |
| id | uuid | PK |
| employee_id | uuid | |
| request_type | enum(`requested_off`, `paid_leave`) | |
| requested_date | date | |
| half_day | enum(`full`, `am`, `pm`) (nullable) | |
| reason | text (nullable) | |
| status | enum(`pending`, `approved`, `rejected`) | |
| reviewed_by / reviewed_at | uuid / timestamptz | |
| created_at / updated_at | timestamptz | |

---

## 4. テーブル定義（Future、置く位置のみ確保）

- `employment_contracts` — 雇用契約書履歴
- `career_subsidy_records` — キャリアアップ助成金 申請対象期間と賃金変動の記録
- `office_audit_logs` — 管理操作の監査ログ

---

## 5. インデックス / パフォーマンス指針

- 打刻は1日1レコード想定なので、40名 × 365日 = 1.5万行 / 年。10年分でも 15万行で軽量。
- 主要クエリ:
  - `attendance_records WHERE employee_id = ? AND work_date BETWEEN ? AND ?` → `(employee_id, work_date)` 複合
  - `shifts WHERE office_id = ? AND work_date BETWEEN ? AND ?` → `(office_id, work_date)` 複合
  - `employees WHERE office_id = ? AND retired_at IS NULL` → 部分インデックス検討
- 月次集計は事前計算より、必要時に算出する方針（行数が少ないため）。Phase 2 で重くなったらマテビューを検討。

---

## 6. 設計上の留意点

- **夜勤跨ぎの日付**: `attendance_records.work_date` は **出勤した日**。退勤が翌日になる場合 `clock_out_at` は翌日の timestamptz で素直に入れる。`work_date` と `clock_out_at` の日付が乖離するケースを想定し、集計ロジックに反映する。
- **明け（after_night）**: シフト上は別パターンだが、実労働時間は基本ゼロ（夜勤当日に含めて算定する）。集計ロジックで取り扱いを統一する。
- **応援勤務**: `shifts.office_id` と `attendance_records.office_id` は `employees.office_id` と独立に持つ。応援先で打刻する想定。
- **削除運用**: 物理削除はせず、`is_active` / `retired_at` でソフト削除する。勤怠データは退職後も保持。
- **マルチテナント拡張**: 将来 `tenant_id` を主要テーブルに付与できるよう、ユニーク制約や FK 設計を「列追加で済む」形にしておく（コメント参照）。
- **時刻保存**: 全 `timestamptz` カラムは UTC 保存。UI 表示・集計の境界判定はサーバ側で JST 変換してから行う。
