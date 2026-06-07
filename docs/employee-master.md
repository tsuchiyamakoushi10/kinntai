# 統合社員マスター設計（全事業所・3用途対応）

> 状態: **ドラフト（2026-06-03）**。実装前のレビュー用。
> 関連: [database-design.md](database-design.md) / [auto-shift-design.md](auto-shift-design.md) /
> [employment-contract-printable.md](employment-contract-printable.md) /
> [requirements.md](requirements.md)

## 1. 目的とスコープ

社員マスターは、最終的に **1 つのデータ源** で次の 3 用途すべてを賄う必要がある。
現状はデータが CSV 複数本・梨花 `config.ts`・DB に分散しており、これを **DB を単一の真実の源
(single source of truth)** に統合する。

| #   | 用途           | 主な出力                                                          |
| --- | -------------- | ----------------------------------------------------------------- |
| ①   | **シフト作成** | 月次シフト自動生成・勤務表（全事業所）                            |
| ②   | **補助金**     | キャリアアップ助成金 / 処遇改善加算（将来。計算根拠は要件書必須） |
| ③   | **労働条件**   | 労働条件通知書 / 雇用契約書 PDF                                   |

**重要な前提**: 梨花だけでなく、ショート・デイ・ナーシング・厨房・ケアプランを含む
**全事業所が順次このマスターに乗る**。さらに **1 人が複数事業所をまたぐ「兼務」** が常態。
設計は最初からマルチ事業所・兼務を一級市民として扱う。

## 2. 事業所と拠点コード対応

`社員マスター_シフト用.csv` の拠点コードと DB `offices.code` の対応。

| CSV 拠点コード | DB office.code | 事業所                     | 24h 稼働      | 人数(CSV) |
| -------------- | -------------- | -------------------------- | ------------- | --------- |
| `NH`           | `NRS-CENTER`   | ナーシングホーム結いの心   | ○（夜勤あり） | 13        |
| `SHORT`        | `SHO-CENTER`   | ショートステイ結いの心     | ○（夜勤あり） | 13        |
| `DEY`          | `DAY-CENTER`   | デイサービス結いの心       | ×             | 12        |
| `RIKA`         | `DAY-RIKKA`    | デイサービス梨花           | ×             | 4         |
| `KITCHEN`      | `KITCHEN`      | 厨房                       | ×             | 3         |
| `CARE_PLAN`    | **（未登録）** | ケアプラン（居宅介護支援） | ×             | 1         |

> **TODO**: `CARE_PLAN`（居宅介護支援）は DB の `offices` に未登録。マスター取り込み前に
> 拠点として追加するか、対象外とするか要確認。

## 3. 兼務（マルチ事業所）の実態

CSV `兼務先` 列は単純な拠点名ではなく、**時間帯・条件付き**で記載される。

| 氏名       | 主たる拠点 | 兼務先（CSV 原文）                |
| ---------- | ---------- | --------------------------------- |
| 木下潤平   | NH         | `NH(午前)・DEY(午後)・RIKA(午後)` |
| 横野千波   | DEY        | `RIKA`                            |
| 大場奈緒   | （主拠点） | `SHORT(不足時)`                   |
| 續橋ののか | NH         | `NH・DEY`                         |
| 須賀みどり | （主拠点） | `KITCHEN(山口不足時フォロー)`     |

→ 兼務は「どの事業所に・いつ（午前/午後）・どんな条件で（不足時フォロー等）」を持つ。
**単一の `office_id` 列では表現できない**。割当を別テーブルに正規化する（§5）。

## 4. 3 用途 × 必要データと現状の所在

| 用途       | 必要データ                                                                                                                                                                           | 現状の所在                                                                    | 過不足                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| ① シフト   | 主拠点・**兼務先(複数/時間帯/条件)**・雇用形態・**配置可能な勤務記号(拠点別)**・**夜勤可否/専従**・夜勤月上限・**固定勤務パターン**・目安勤務日数・希望休枠・年収/扶養上限・連勤上限 | `ShiftConstraint`(月上限/目標日数/年収/不可曜日)・`ShiftPreference`(希望休)   | **太字が DB に無い**。今は CSV と梨花 `config.ts` のみ               |
| ② 補助金   | 雇用形態の**転換履歴**・資格(種別/取得日)・研修受講記録(費用負担)・賃金改善の根拠・算定対象期間                                                                                      | `Qualification` / `TrainingRecord` / `EmploymentContract.careerSubsidyTarget` | 器はある。**計算ロジックは要件書必須**（推測実装禁止：CLAUDE.md §5） |
| ③ 労働条件 | 契約期間・所定労働時間/日数・賃金(区分/額/手当)・保険・更新・就業場所/業務・退職金・特別措置                                                                                         | `EmploymentContract`（+ `EmploymentContractAllowance` / `CompanyProfile`）    | ほぼ網羅済み                                                         |

→ ③はほぼ完結、②は器あり計算待ち、**①だけが重要データを DB 外に漏らしている**。
本設計の中心は **①のシフト用データを DB に取り込む**こと。

## 5. スキーマ提案

### 5.1 既存テーブルは活かす

`Employee` / `EmploymentContract` / `Qualification` / `TrainingRecord` / `ShiftConstraint` /
`ShiftPreference` / `ShiftPattern` / `OfficeShiftQuota` / `Shift`（実績）はそのまま使う。
`Shift.officeId` は既に `Employee.officeId` と独立で、応援勤務を実績として記録できる。
**足りないのは「どの事業所で・どの勤務記号で働けるか」という適性／設定の層**。

### 5.2 新規: `employee_office_assignment`（事業所への配属・適性）

1 従業員 × 所属/兼務する事業所 ごとに 1 行。梨花 `config.ts` の per-member 属性の DB 版。

| 列                      | 型                            | 意味                                                  |
| ----------------------- | ----------------------------- | ----------------------------------------------------- |
| `id`                    | uuid                          |                                                       |
| `employee_id`           | uuid                          |                                                       |
| `office_id`             | uuid                          | 配属先事業所                                          |
| `role`                  | enum(`primary` / `support`)   | 主たる所属 / 応援(兼務)                               |
| `allowed_pattern_codes` | text[]                        | その事業所で配置可能な勤務記号（`ShiftPattern.code`） |
| `time_scope`            | enum(`all_day` / `am` / `pm`) | 午前のみ・午後のみ等（益子=am, 木下=pm）              |
| `condition_note`        | text?                         | 「不足時フォロー」等の条件（自動配置では参考扱い）    |
| `target_work_days`      | int?                          | その事業所での目安勤務日数                            |
| `priority`              | int                           | 配置優先度（自動生成の Tier 制御）                    |

- マルチ事業所・拠点別の配置可能記号・時間帯制約を正規に表現できる。
- 自動生成は「対象事業所の assignment 行」を読むだけでよく、梨花以外もデータ投入で展開可能。
- `role=support` は §3 の兼務（横野・木下 等）。自動生成では「来る人」として不足補充に使う
  （[auto-shift-design.md] の方針 / 梨花設計書 §7 と整合）。

### 5.3 `ShiftConstraint` への追加（従業員単位の体力・夜勤制約）

夜勤は「事業所が 24h か」と「本人の可否」の両面。本人単位の制約はここに集約する。

| 追加列                 | 型   | 意味                       |
| ---------------------- | ---- | -------------------------- |
| `night_allowed`        | bool | 夜勤可否（CSV `夜勤可否`） |
| `night_dedicated`      | bool | 夜勤専従（CSV `夜勤専従`） |
| `max_consecutive_days` | int? | 連勤上限（未設定は既定 6） |

> 既存の `max_night_shifts_per_month`（CSV `夜勤月上限`）・`target_monthly_work_days`・
> `annual_income_cap_yen`・`unavailable_days_of_week` はそのまま使う。

### 5.4 ②補助金・③労働条件は既存で受ける

- 雇用形態の**転換履歴**は `EmploymentContract` の時系列で表現（転換日 = 新契約の開始）。
  CSV 備考の「転換日:R7.10」等は契約レコードに落とす。
- 研修・資格・`careerSubsidyTarget` は既存。**算定ロジックは要件書確定後に `src/lib/` で実装**
  （現時点では器のみ。TODO を残す）。

## 6. CSV → DB マッピング（`社員マスター_シフト用.csv` 全 37 列）

| CSV 列                                  | 取り込み先                                                        | 備考                                   |
| --------------------------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| 社員コード                              | `Employee.employee_code`                                          | 空欄は import 採番（既存ロジック）     |
| 氏名 / 姓 / 名 / 姓カナ / 名カナ        | `Employee.last_name`/`first_name`/`*_kana`                        |                                        |
| 拠点コード                              | `Employee.office_id` + `assignment(role=primary)`                 | §2 で変換                              |
| 職種(推定)                              | `Employee.job_category`                                           |                                        |
| 雇用形態                                | `Employee.employment_type` + `EmploymentContract.employment_type` |                                        |
| 勤務区分補足                            | `assignment.time_scope` / `target_work_days` / 備考               | 「半日Fのみ(午前)」等を解析            |
| 兼務先                                  | `assignment(role=support)` 複数行                                 | 時間帯/条件を解析（§3）                |
| 夜勤可否                                | `ShiftConstraint.night_allowed`                                   | **新列**                               |
| 夜勤月上限                              | `ShiftConstraint.max_night_shifts_per_month`                      | 既存                                   |
| 夜勤専従                                | `ShiftConstraint.night_dedicated`                                 | **新列**                               |
| 固定勤務パターン                        | `assignment.allowed_pattern_codes`                                | **新概念**                             |
| 資格                                    | `Qualification`                                                   |                                        |
| 生年月日 / 性別                         | `Employee.birth_date` / `gender`                                  | PII（ログ出力禁止）                    |
| 拠点(元値)                              | （取り込み補助。保存しない or 備考）                              |                                        |
| 入社日 / 雇い入れ日                     | `Employee.joined_at` / `hired_at`                                 | 雇い入れ日=有給基準日                  |
| 賃金区分 / 賃金額                       | `Employee.base_wage_*` + `EmploymentContract.wage_*`              |                                        |
| 週所定労働日数 / 1日所定労働時間        | `Employee.weekly_work_days` / `daily_work_hours`                  |                                        |
| 雇用保険 / 社保加入 / 退職金対象        | `EmploymentContract.has_*` / `retirement_allowance_eligible`      | TRUE/FALSE                             |
| 履歴書 / 契約書 / 個人情報保護 / 資格証 | `EmployeeDocument`（提出チェック）                                | **TODO**: 提出済フラグの持ち方を要確認 |
| 電話 / 住所                             | `Employee.phone` / `address`                                      | PII                                    |
| メール                                  | `User.email`（ログイン）                                          | Employee に email 列は無い             |
| 備考                                    | `Employee.notes`                                                  | 「転換日」等は契約へ転記               |
| 表記確認                                | （取り込み QA 用。保存しない）                                    |                                        |

## 7. 取り込み・移行・本番

1. **CSV を 1 本に統一**: 取り込みは `社員マスター_シフト用.csv` を正とする。
   旧 `統合社員マスター_UTF8.csv` / `社員マスター_取り込み用.csv` は廃止。
2. **`scripts/import-employees.ts` を更新**: 新 CSV のヘッダ・兼務先解析・新列対応。
3. **マイグレーション**: §5 の新テーブル・新列を追加（本番反映はユーザー確認必須：CLAUDE.md §5）。
4. **本番 DB の現状は未確認**。本番は古い取り込み由来で、上記の新列・兼務情報を持たない見込み。
   反映には マイグレーション + 再取り込み が必要。**実値はユーザー許可のもと読み取り専用で確認する**。

## 8. 段階導入（全事業所展開）

1. スキーマ（§5）と取り込み（§7）を整備。
2. **梨花を最初の利用者**に。梨花 `config.ts` の固定値を `assignment` 行へ移行し、
   自動生成を「config 読み」から「DB(assignment) 読み」へ切替。
3. 他事業所（ショート/デイ/ナーシング/厨房）は **データ投入のみ**で展開。
   夜勤あり拠点（NH/SHORT）は `OfficeShiftQuota` に夜入/夜明、`ShiftConstraint.night_*` を使う。
4. ②補助金・③労働条件は同じマスターから出力（③は既に可能、②は要件書後）。

## 9. 未確定事項（要確認）

- [ ] `CARE_PLAN`（居宅）を事業所として登録するか。
- [ ] 兼務先の「不足時フォロー」等の条件を自動生成でどこまで扱うか（当面は参考表示のみ想定）。
- [ ] 書類提出フラグ（履歴書/契約書/個人情報保護/資格証）の保持方法。
- [ ] 補助金（キャリアアップ助成金/処遇改善加算）の算定根拠 → **要件書の該当箇所**。
- [ ] 夜勤可否/専従を `ShiftConstraint`（本人単位）と `assignment`（事業所単位）のどちらに置くか最終決定。
