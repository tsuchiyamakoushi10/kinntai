# 雇用契約書 / 労働条件通知書 出力 設計 (Phase 1-I)

> 株式会社クロスハートの実運用書式「雇用契約書 兼 労働条件通知書」(短時間労働者用 / 正社員用) を、既存の `employment_contracts` データから一通の PDF として出力可能にするための設計。実装着手は §6 の残り判断事項を擦り合わせて確定したあと。

---

## 1. 目的とスコープ

### 1.1 目的

- 入社・契約更新時に、Word テンプレで手書きしていた「労働条件通知書 兼 雇用契約書」を、システムに登録した雇用契約データから 1 ボタンで PDF 出力する。
- 紙運用と書式を揃え、社労士チェック・労使紛争予防に耐える文書品質を担保する。
- サンプル 2 件 (大川理恵: 短時間 / 須賀みどり: 正社員フルタイム) を初期参照とする。

### 1.2 含む

- **会社マスタ** (`company_profile`) を新設し、法人名・代表者・割増率・締切日・相談窓口など「全契約に共通する条項」を単一行で保持する。
- `employment_contracts` のカラム拡張 (就業場所・業務内容・週所定区分・賞与有無等)。
- `employment_contract_allowances` テーブル新設 (諸手当 イロハニ を正規化)。
- S-A-21 (雇用契約 新規 / 編集) の入力項目拡張。
- **S-A-15 雇用契約書 PDF 自動生成 と S-A-18 労働条件通知書 PDF 自動生成 を一本化**。書式が同じため 1 つのエンドポイントで両対応 (タイトルだけ切替)。
- 既存 `pnpm docs:pdf` と同じ Playwright Chromium + HTML テンプレ方式で PDF 化。

### 1.3 含まない

- 電子署名フロー (DocuSign 等)。MVP は管理者が PDF を印刷し、実印を取って `employee_documents` に再アップロードする運用。
- 古い契約 (本機能リリース前に登録されたもの) の自動マイグレーション。新規 / 編集時に新項目を埋める運用とし、既存契約の出力可否は「必要項目が埋まっているか」で動的判定する。
- 印鑑画像の合成。
- PDF 改ざん検知 / タイムスタンプ署名。

---

## 2. データモデル

### 2.1 `company_profile` — 会社マスタ (新規, 単一行)

```
company_profile
  id                          uuid (PK, シングルトン)
  legal_name                  text         例: 株式会社クロスハート
  address                     text         例: 児玉郡神川町新里2022-135
  phone                       text         例: 0495-71-8531
  representative_title        text         例: 代表取締役
  representative_name         text         例: 木下 美由紀

  -- 退職関連
  retirement_age              integer      例: 60
  continued_employment_age    integer      例: 65
  resign_notice_days          integer      例: 30 (1 か月以上前に申出)

  -- 賃金関連 (全契約共通)
  wage_cutoff_day             text         例: "月末" (フリーテキストで運用)
  wage_payment_day            text         例: "翌月20日"
  wage_payment_method         text         例: "本人の金融機関口座への振込を原則とする"
  salary_raise_period         text         例: "毎年6月に行う場合がある"

  -- 割増賃金率 (%)
  overtime_rate_under_60h     integer      法定超 月60h以内 (例 25)
  overtime_rate_over_60h      integer      法定超 月60h超 (例 25)
  overtime_rate_within        integer      所定超 (例 0)
  holiday_legal_rate          integer      法定休日 (例 35)
  night_rate                  integer      深夜 (例 25)

  -- 休憩ルール
  break_rule_text             text         例: "1日6時間を超える勤務の場合には45分、1日8時間を超える勤務の場合には60分を、途中で与える。"

  -- 就業規則
  work_rules_name             text         例: "就業規則"
  part_time_work_rules_name   text         例: "パート職員賃金規程"

  -- 相談窓口
  contact_department          text         例: "本部"
  contact_person_title        text         例: "代表取締役"
  contact_person_name         text         例: "木下 美由紀"
  contact_phone               text         例: "0495-71-8531"

  created_at / updated_at     timestamptz
```

- レコードは常に 1 行。S-A-02 配下に「会社情報」サブ画面を追加して編集。
- 将来マルチテナント化する際は `id` を `tenant_id` として残し、複数行を許す形に変える (列追加で済むよう設計)。

### 2.2 `employment_contracts` 拡張

既存カラムに加え、サンプル書式の埋め込みに必要な以下を追加する。

| カラム                          | 型                                                  | 説明                                                                                                      |
| ------------------------------- | --------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| workplace_initial               | text                                                | 雇入直後の就業場所 (例: ショートステイ結いの心)                                                           |
| workplace_scope                 | text                                                | 変更の範囲 (2024 年改正で必須。既定: 「会社が運営する全事業所その他業務に関連する場所」)                  |
| job_description_initial         | text                                                | 雇入直後の業務内容 (例: 介護業務(夜勤専従) / 看護師業務)                                                  |
| job_description_scope           | text                                                | 業務内容の変更範囲 (既定: 「変更なし」)                                                                   |
| weekly_hours_category           | enum (`under_20`, `between_20_30`, `between_30_40`) | 週所定労働時間区分。保険加入判定の根拠                                                                    |
| shift_based_schedule            | boolean                                             | シフト勤務か (true=シフト, false=固定時刻)                                                                |
| has_early_end_possibility       | boolean                                             | 終業時刻の繰り上げの可能性あり (現運用は基本 true)                                                        |
| has_overtime                    | boolean                                             | 所定時間外労働の有無                                                                                      |
| has_bonus                       | boolean                                             | 賞与の有無                                                                                                |
| bonus_description               | text (nullable)                                     | 有の場合の本文 (例: 年2回 会社業績及び個人の勤務成績・将来性等により支給の有無も含めて支給することがある) |
| retirement_allowance_start_text | text (nullable)                                     | 退職金 有 の場合の支給開始時期 (例: 勤務開始より満3年経過後より開始)                                      |
| special_measure_type            | enum (`none`, `high_skill`, `post_retirement`)      | 有期雇用特別措置法の対象種別                                                                              |
| special_measure_business_title  | text (nullable)                                     | 高度専門の場合の特定有期業務                                                                              |
| special_measure_start_on        | date (nullable)                                     | 特定有期業務の開始日                                                                                      |
| special_measure_end_on          | date (nullable)                                     | 特定有期業務の完了日                                                                                      |

- `is_renewable` / `hasRenewalLimit` / `renewalLimitCount` / `renewalCriteria` は既存。新規追加なし。
- `has_employment_insurance` / `has_social_insurance` は既存。`weekly_hours_category` から自動推奨値を出すヘルパを書く (UI 補助、保存時の上書きは可)。

### 2.3 `employment_contract_allowances` — 諸手当 (新規)

```
employment_contract_allowances
  id                  uuid (PK)
  contract_id         uuid (FK employment_contracts.id, ON DELETE CASCADE)
  sort_order          integer       帳票の イロハニ 順 (0..3 を想定。上限なしで運用)
  name                text          例: "夜勤手当", "看護師手当", "休日手当"
  amount_yen          integer       例: 20000, 10000, 1000
  calculation_method  text          例: "20000円/1回×夜勤回数", "出勤回数1回につき"
  created_at / updated_at  timestamptz
```

- インデックス: `(contract_id, sort_order)`
- サンプルでは イロハニ 4 件まで。MVP では「上限なし、UI では 4 行を既定で表示し追加可」とする。

---

## 3. UI

### 3.1 S-A-02 配下「会社情報」(新規)

- ルート: `/admin/offices/company` または `/admin/company-profile`
- 単一フォーム。社労士確認用に変更履歴は持たない (`updated_at` のみ)。

### 3.2 S-A-21 雇用契約 新規 / 編集 拡張

- 既存フォームの下に **「労働条件通知書 出力用」** セクションを追加:
  - 就業場所 (初回 / 変更範囲)
  - 業務内容 (初回 / 変更範囲) — チェックボックス候補: 看護師業務 / 介護業務 / 介護業務(夜勤専従) / 清掃業務 / 厨房業務 / 事務業務 (+自由記入)
  - 週所定区分 (ラジオ 3 択)
  - シフト勤務 / 固定 (ラジオ)
  - 所定時間外労働 有 / 無
  - 賞与 有 / 無 + 詳細テキスト
  - 退職金 有 / 無 + 支給開始時期テキスト
  - 有期雇用特別措置法 区分 + 関連項目
- 諸手当: サブフォーム (動的に行追加可、4 行を既定表示)。

### 3.3 S-A-15 / S-A-18 PDF 出力 — 一本化

- ルート: `/admin/employees/[id]/contracts/[contractId]/pdf`
- クエリ `?type=notice` (労働条件通知書) / `?type=contract` (雇用契約書) でタイトルだけ切り替え。本文は共通。
- ボタン配置: S-A-04 雇用契約タブ → 契約行の右端「PDF」リンク。
- 必須項目が埋まっていない場合は出力ボタンを `disabled` にし、不足項目のリストを下に出す。

---

## 4. PDF 出力方式

### 4.1 技術選定

- 既存 `scripts/build-demo-pdf.ts` で導入済の Playwright Chromium を再利用する。
- React Server Components の `renderToStaticMarkup` で HTML を生成 → Playwright で `page.setContent` → `page.pdf()`。
- 日本語フォント: 既存スクリプトと同じ `IPAGothic` / `WenQuanYi Zen Hei` を CSS で指定。

### 4.2 モジュール構成

```
src/lib/employment-contract/
├─ pdf.ts             …… HTML 文字列 → PDF Buffer を返す関数
├─ html-template.tsx  …… React コンポーネントで雇用契約書 HTML を生成
├─ data.ts            …… DB から「会社マスタ + 雇用契約 + 諸手当 + 従業員」を取得し描画用 ViewModel に整形
└─ __tests__/
   └─ html-template.test.tsx  …… テンプレが必須項目をすべて含むことのスナップショット検証
```

### 4.3 ファイル命名

- 出力ファイル名: `労働条件通知書_{employee_code}_{contract_start_on}.pdf` / `雇用契約書_{...}.pdf`
- ブラウザでのダウンロード時のみ使う。サーバ側に保存はしない (印鑑後の保存は既存 `employee_documents` 経由)。

### 4.4 セキュリティ

- ルートは管理者ロールガード。
- 従業員本人による自分の契約書 PDF 出力は MVP では対応しない (現運用に合わせる)。Phase 3 で要件確認。

---

## 5. ロジック

### 5.1 必須項目チェック

PDF 出力前に以下を検証 (`canRenderContract(contract): { ok: true } | { ok: false; missing: string[] }`):

- `workplace_initial`, `workplace_scope` (2024 年改正で必須)
- `job_description_initial`, `job_description_scope`
- `weekly_hours_category`
- 会社マスタ (`company_profile`) が登録済みであること
- 期間の定めありの場合: `contract_end_on`, `is_renewable`, `renewal_criteria` のいずれかが埋まっていること

### 5.2 表示の動的判定

- 会社マスタの値はテンプレ内で参照。
- `shift_based_schedule = true` のとき: 「始業及び終業の時刻は、シフトにおいて定める」を表示。
- `weekly_hours_category` に応じて保険加入判定の文言をチェック表示 (実際の `has_*_insurance` 値とは別)。

### 5.3 諸手当の描画

- 帳票では イロハニ の 4 行で表示する。
- 5 件以上の場合: 4 件目までは表で、5 件目以降は「その他諸手当 (備考欄)」に集約。

---

## 6. 設計判断ログ (2026-05-21 確定)

| ID  | 論点                               | 確定事項                                                                | 採用理由                                                                                                 |
| --- | ---------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A   | PDF 生成方式                       | **Playwright Chromium + HTML テンプレ**                                 | 既存 `scripts/build-demo-pdf.ts` と同じスタック。日本語フォント (IPAGothic) 設定を流用でき追加依存ゼロ。 |
| B   | 会社マスタの持ち方                 | **`company_profile` 単一行テーブル**                                    | 型付きで読みやすく、将来 `id = tenant_id` 拡張も容易。                                                   |
| C   | 諸手当の上限                       | **上限なし** (UI は 4 行既定 + 追加ボタン)                              | サンプル書式は 4 件だが、現場の手当バリエーションを縛らない。                                            |
| D   | 既存 Word テンプレ運用との関係     | **併存可**                                                              | 社労士確認・微修正用に Word を残す。1-I は「システムから 1 ボタンで PDF が出る」状態を目標とする。       |
| E   | 印鑑                               | **手作業** (PDF 印刷 → 押印 → スキャン → `employee_documents` 再アップ) | 既存運用と整合。電子印鑑合成は Future で別途検討。                                                       |
| F   | 業務内容のデータ形式               | **チェックボックス候補 + 自由記入のテキスト 1 行に保存**                | enum 配列にすると追加業務 (例: 厨房業務) を入れるたびに migration が要る。                               |
| G   | 既存契約 (本機能リリース前) の扱い | **必須項目が空なら PDF 出力不可、新規/編集時に埋める運用**              | 一括マイグレーションは法的書類で危険。出力可否を契約ごとに動的判定する。                                 |

---

## 7. 受け入れ基準 (Phase 1-I 完了の定義)

- [ ] `company_profile` を S-A-02 配下から編集できる。
- [ ] S-A-21 で新項目を入力でき、`employment_contracts` 拡張カラムと `employment_contract_allowances` に保存される。
- [ ] S-A-04 雇用契約タブから「労働条件通知書 PDF」「雇用契約書 PDF」が出力でき、サンプル 2 件 (大川 / 須賀) と同じ書式・同じ内容で生成される。
- [ ] 必須項目が埋まっていない契約では出力ボタンが無効になり、不足項目が明示される。
- [ ] `src/lib/employment-contract/__tests__/html-template.test.tsx` で書式の主要項目 (12 ブロック以上) を網羅する。

---

## 8. 関連ドキュメントの更新

- `docs/database-design.md` に `company_profile` / `employment_contract_allowances` / `employment_contracts` 拡張カラムを追加。
- `docs/development-plan.md` に「Phase 1-I 労働条件通知書 PDF 出力」サブフェーズを追加 (Future の S-A-15 / S-A-18 を Phase 1-I に前倒し)。
- `docs/screen-list.md` で S-A-15 / S-A-18 を MVP に格上げ、新規「会社情報」画面を S-A-28 として追加。
