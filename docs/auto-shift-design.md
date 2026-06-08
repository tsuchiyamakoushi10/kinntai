# 月次シフト自動作成 設計 (Phase 1-H)

> ⚠️ **§4 のアルゴリズム(スコア合算 greedy)は [auto-shift-design-v2.md](auto-shift-design-v2.md) で「フェーズ式 + 拠点別設定」に再設計中** (2026-06-08)。データモデル(§3 quota / run / generation_run_id)・確定フロー(§6)・UI(§5)は本ドキュメントが引き続き有効。

> Phase 1 最終サブフェーズ「1-H. 月次シフト自動作成」の実装に入る前に、DB 追加・アルゴリズム・UI・確定フロー・残された決定論点を 1 本にまとめる。実装着手はこのドキュメントの **§7 残された決定論点** を社長と擦り合わせて確定したあと。

---

## 1. 目的とスコープ

### 1.1 目的

- 拠点 × 月単位で「制約・希望を踏まえた配置案」を 1 ボタンで生成し、管理者が S-A-08 で微調整して確定する。
- 手作業（紙 / Excel）で 1 拠点あたり数時間かかっていた配置の試行錯誤を、自動 + 微調整で **1 拠点 30 分以内** に短縮する（[development-plan §9](development-plan.md#9-成功指標kpi-案) の KPI に対応）。

### 1.2 含む

- 拠点別の「日種 × シフトパターン × 必要人員数」マスター (S-A-27)。
- 1 か月分のシフト自動作成 (S-A-26)。
  - 入力: 拠点・対象月・既存 run の扱い。
  - 出力: `shifts` への下書き書き込み + `shift_generation_runs.stats` の警告サマリ。
- 自動作成結果を S-A-08 (既存) で確認・微調整 → 同画面または S-A-26 から「確定」。

### 1.3 含まない

- 拠点をまたぐ応援勤務の最適化（応援は手動で S-A-08 から入れる）。
- 複数月一括の最適化。
- 強化学習 / ILP ソルバ等の高度な最適化（greedy + ルールベースで MVP は十分という判断）。
- 打刻実績に基づく再最適化（実績データは Phase 2 以降）。
- パートの希望シフト時間帯の自動マッチング（希望は「日 × 種別」までで、時間帯指定は手動）。

---

## 2. 全体フロー

```
事前マスター整備
  S-A-07 シフトパターン管理   …… 既存
  S-A-24 シフト制約 編集      …… 既存 (1-G)
  S-A-25 シフト希望管理       …… 既存 (1-G)
  S-A-27 拠点シフト枠 設定    …… 新規 (1-H)

月次運用
  S-A-26 自動作成 → run draft → S-A-08 で微調整 → 確定 (status=confirmed)
                                                       │
                                                       ▼
                                  S-E-04 / S-A-08 で従業員に公開
```

- 「下書き」と「確定」は `shift_generation_runs.status` で表現する。
- 下書き状態でも `shifts` 行は実在する (S-A-08 が常に最新を読むため)。確定はメタ情報の遷移であり、shifts 自体には影響しない。
- 確定後も S-A-08 から手動で書き換え可能。書き換えた `shifts` 行は `generation_run_id` を持ったまま、`updated_by` のみが管理者に変わる（履歴追跡用）。

---

## 3. データモデル追加

### 3.1 `office_shift_quotas` — 拠点別 シフト必要人員数

[database-design.md §2.11](database-design.md#211-office_shift_quotas--拠点別-シフト必要人員数) で既に定義済み。本ドキュメントでの確定事項:

- `day_kind` は **`weekday` / `saturday` / `sunday_holiday`** の 3 区分。
  - `sunday_holiday` は日曜および日本の祝日（[§3.4](#34-祝日マスター)参照）。
  - 振替休日も `sunday_holiday`。
- `required_count` は 0 以上。0 は明示的に「この日種では配置しない」を意味し、`null` は使わない（空欄 = 0）。
- `休み系パターン` (`OFF` / `PAID_LEAVE` / `ABSENCE` / `REQUESTED_OFF`) は quota の対象外。S-A-27 の UI からも除外する。
- `shift_pattern_id` は `office_id` と一致する拠点固有パターン、または `office_id = NULL` の共通パターンのみ選択可。バリデーションで担保。
- 既存パターンが `is_active=false` に落ちた場合、quota 行は残るが配置時に無視する（履歴目的）。S-A-27 で警告表示。

### 3.2 `shift_generation_runs` — 自動作成の実行履歴

[database-design.md §2.12](database-design.md#212-shift_generation_runs--シフト自動作成の実行履歴) を以下で確定する:

- `status` は `draft` / `confirmed` の 2 値。`cancelled` は持たない（再実行で上書き、不要なら手動でクリア）。
- `algorithm_version` は文字列。初版は `"greedy-v1"`。改良ごとに `"greedy-v1.1"`、別アプローチなら `"ilp-v1"` のように更新。
- `stats` (jsonb) は下記スキーマで固定:

  ```jsonc
  {
    "input": {
      "employees": 32, // 対象月の在籍人数
      "workingDaysInMonth": 30,
      "holidays": ["2026-06-07", "2026-06-14"],
    },
    "fill": {
      "totalSlots": 245, // sum(required_count * 各日)
      "filledSlots": 238,
      "rate": 0.971,
    },
    "warnings": [
      {
        "code": "QUOTA_UNDERFILLED",
        "date": "2026-06-08",
        "shiftPatternCode": "EARLY",
        "required": 2,
        "filled": 1,
      },
      {
        "code": "NIGHT_SHIFT_OVER_LIMIT",
        "employeeId": "uuid…",
        "month": "2026-06",
        "limit": 5,
        "assigned": 6,
      },
      {
        "code": "INCOME_CAP_EXCEEDED",
        "employeeId": "uuid…",
        "year": 2026,
        "capYen": 1300000,
        "projectedYen": 1342000,
      },
      // 他: TARGET_WORKDAYS_UNREACHED, UNAVAILABLE_DOW_IGNORED など
    ],
    "elapsedMs": 412,
    "seed": 1717286400000,
  }
  ```

- 再実行時は `(office_id, target_month)` の既存 run を **同じ行で上書き** する（unique 制約）。`status=confirmed` の場合は §6 のルールで再実行可否を判定。

### 3.3 `shifts.generation_run_id`

- `shifts` に nullable な `generation_run_id uuid` を追加。`ON DELETE SET NULL` で run を消しても shifts は残る。
- インデックス `(generation_run_id)` を追加。
- 手動入力の `shifts` は `generation_run_id = NULL`。run の手動編集で書き換わった行は run_id を保持し、UI で「自動由来＋手動編集済」表示が可能。
- 「どの run の draft が現在最新か」は `shift_generation_runs.id` を経由して逆引き。

### 3.4 祝日マスター

- MVP は **`src/lib/calendar/holidays.ts` にハードコード**。内閣府公表の `syukujitsu.csv` から 2024–2030 年分を取り込む。
- 振替休日（`振替`）と国民の休日も `sunday_holiday` 扱い。
- 更新は年 1 回手動でファイル書き換え（Future で `holidays` テーブル + S-A-XX 編集に昇格）。
- ファイルには **出典 URL** と **取り込み年月** をコメントで残し、改ざん監査を可能にする。

---

## 4. ドメインロジック (`src/lib/shift/auto-generator/`)

DB に触らない純粋関数群として実装し、ユニットテスト網羅を必須にする。DB I/O はサーバアクション側で行い、ロジック層には素のデータを渡す。

### 4.1 ディレクトリ構成

```
src/lib/shift/auto-generator/
├─ index.ts            …… 公開 API (generateMonthlyShifts)
├─ types.ts            …… 入出力型
├─ scoring.ts          …… 候補スコアリング (希望夜勤 / 目標出勤日 / 過剰夜勤の減点 など)
├─ constraints.ts      …… 制約フィルタ (希望休 / 不可日 / 不可曜日 / 上限)
├─ placement.ts        …… 配置本体 (greedy)
├─ warnings.ts         …… 警告集約
└─ __tests__/          …… ユニットテスト群
```

### 4.2 入力 (`GenerateInput`)

```ts
type GenerateInput = {
  officeId: string;
  targetMonth: string; // "YYYY-MM"
  seed: number; // 同一入力 → 同一出力を保証 (Mulberry32 など)
  algorithmVersion: string; // 結果と一緒に記録
  employees: ReadonlyArray<EmployeeForGen>; // active + on_leave 含む在籍者
  shiftPatterns: ReadonlyArray<PatternForGen>; // 対象拠点 + 共通
  quotas: ReadonlyArray<QuotaForGen>; // 拠点×日種×パターン
  constraints: ReadonlyArray<ConstraintForGen>; // 個人別 (なければ既定値で扱う)
  preferences: ReadonlyArray<PreferenceForGen>; // 当月の accepted のみ
  existingShifts: ReadonlyArray<ExistingShift>; // 当月のうち、保護対象 (§6)
  prevMonthNightIn: ReadonlyArray<{ employeeId: string; workDate: string }>;
  // 前月末日に NIGHT_IN がある場合、当月 1 日に NIGHT_OUT が必要
  holidays: ReadonlyArray<string>; // 当月内の祝日 "YYYY-MM-DD"
};
```

- `existingShifts` には、手動入力分（generation_run_id IS NULL）と、保護対象として渡したい行を入れる。§6 の再実行ポリシーで何を渡すかをサーバ側で決定。
- `prevMonthNightIn` は当月 1 日に NIGHT_OUT を自動で対にするための入力（夜勤跨ぎの取り扱いは [database-design.md §6](database-design.md#6-設計上の留意点)）。

### 4.3 出力 (`GenerateOutput`)

```ts
type GenerateOutput = {
  proposedShifts: ReadonlyArray<ProposedShift>; // 新規 / 上書き
  removedShifts: ReadonlyArray<{ employeeId: string; workDate: string }>; // run由来で削除
  warnings: ReadonlyArray<Warning>;
  stats: RunStats; // §3.2 の `stats` jsonb と同型
};
```

- `proposedShifts` には公休 (`OFF`) も含む。「自動作成は勤務だけ」だと S-A-08 で手動で休みを埋める負担が消えないため、休みも自動配置する（§7 論点 A の決定: 公休を含める）。

### 4.4 配置アルゴリズム

入力は決定論的にソートしてから処理し、`seed` で安定的に分散する。

1. **前処理**
   - 当月の日付一覧を作る。各日に `day_kind` を割り振る。
   - 各従業員に「当月の不可日集合」を作る:
     - `unavailable_days_of_week`（曜日マッチ）
     - `shift_preferences.preferenceType = UNAVAILABLE / REQUESTED_OFF` の日付
     - `existingShifts` で既に占有されている日付
   - 前月末 NIGHT_IN を見て、当月 1 日に NIGHT_OUT を強制配置（必要なら）。
   - 雇用期間外（退職日翌日以降、入社日前日以前）の日も不可日集合に追加。

2. **必要量算出**
   - 各日 × 勤務系パターンの quota を展開し、`slots` を作る。
     例: `{ date: "2026-06-08", patternCode: "EARLY", remaining: 2 }`
   - 公休は per-employee で必要数を算出: `(月の日数) - (当月の所定労働日数)`。所定労働日数は `weeklyWorkDays * 月の週数` を切り上げ（簡易式）。

3. **配置パス**
   - パス 1: **正社員 → 夜勤系 (NIGHT_IN + 翌日 NIGHT_OUT を 2 連で必ず一緒に配置)**。
     - 希望夜勤を持つ従業員から優先。
     - 月間夜勤上限を尊重。上限を超える場合は §7 論点 D の決定に従う。
   - パス 2: **正社員 → 早 / 日勤 / 遅 / 拠点固有フル系**。
     - `target_monthly_work_days` を満たすまで割当。
     - 各日の quota が満たされるまで複数人を配置。
   - パス 3: **契約社員 → 同上**（正社員と同じロジック、優先度のみ下）。
   - パス 4: **パート → 半日系 / 拠点固有短時間系**。
     - 不可日以外で、年収上限 (`annual_income_cap_yen`) を超えない範囲で配置。
     - 年収見込みは [`src/lib/shift/income-projection.ts`](../src/lib/shift/income-projection.ts) を再利用。
   - パス 5: **公休埋め**。
     - 各従業員について、所定労働日数を超える勤務日や、未配置日を `OFF` で埋める。
     - 夜勤明けの翌日に公休が来る場合はそれを許容（夜勤明け休息確保）。

4. **後処理**
   - 全 quota を再走査して `QUOTA_UNDERFILLED` 警告を集計。
   - 全従業員を再走査して `NIGHT_SHIFT_OVER_LIMIT` / `INCOME_CAP_EXCEEDED` / `TARGET_WORKDAYS_UNREACHED` を集計。
   - `removedShifts` は「前回 run で配置されたが今回配置されなかった日」を `(employeeId, workDate)` の差分から算出。

### 4.5 スコアリング (`scoring.ts`)

各「(employee, date, pattern)」候補に対し点数化:

| 観点                               | 加点                       | 減点                                    |
| ---------------------------------- | -------------------------- | --------------------------------------- |
| 希望夜勤を持つ従業員が夜勤候補     | +50                        | -                                       |
| 月間出勤目標 未達                  | +30 × (達成までの残日数比) | -                                       |
| 夜勤上限近接 (4 件目)              | -                          | -20                                     |
| 夜勤上限超過 (5 件目以降)          | -                          | -80（人員不足時のみ採用）               |
| 連続勤務 6 日目                    | -                          | -40                                     |
| 連続勤務 7 日目以降                | -                          | -200（強制回避）                        |
| 不可曜日（曜日のみ、日付指定なし） | -                          | -1000（実質除外、ただし手動で上書き可） |
| 年収アラート 80% / 100%            | -                          | -30 / -120                              |

- 候補が複数同点になった場合は `seed` で決定論的にランダム選択。
- スコア閾値（例 -150 以下なら配置しない）は定数で持ち、後でチューニング可能にする。

### 4.6 警告コード一覧

| code                          | 内容                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------- |
| `QUOTA_UNDERFILLED`           | ある日のあるパターンで必要人員に達さなかった                                     |
| `QUOTA_OVERFILLED`            | 既存シフトを保護した結果、quota を超えて配置されている                           |
| `NIGHT_SHIFT_OVER_LIMIT`      | 月間夜勤上限を超えて配置（強制配置時のみ）                                       |
| `TARGET_WORKDAYS_UNREACHED`   | 正社員の月間出勤目標に達さなかった                                               |
| `INCOME_CAP_EXCEEDED`         | パートの見込み年収が年収上限を超えた                                             |
| `UNAVAILABLE_DOW_VIOLATED`    | 不可曜日を意図的に上書きして配置（既存手動シフトの保護で発生し得る）             |
| `PREV_MONTH_NIGHT_HANGING`    | 前月末 NIGHT_IN に対する当月 1 日 NIGHT_OUT が、不可日と衝突して配置できなかった |
| `INACTIVE_PATTERN_REFERENCED` | quota が `is_active=false` のパターンを参照している（無視して継続）              |

---

## 5. UI 設計

### 5.1 S-A-27 拠点シフト枠 設定

- ルート: `/admin/offices/[id]/quotas`（または `/admin/quotas?officeId=...`）。
- 構造: 縦軸＝シフトパターン (勤務系のみ)、横軸＝`weekday` / `saturday` / `sunday_holiday`。
- 1 セル = `required_count` の数値入力（0 以上の整数）。
- 拠点切替セレクタ、「コピー: 平日 → 土」「クリア」のショートカット。
- 保存はサーバアクション 1 本でまとめて upsert。
- 拠点固有パターン (`office_id` 一致) と全拠点共通パターン (`office_id IS NULL`) の両方を行に並べる。共通パターンは「全拠点共通」とラベルする。

### 5.2 S-A-26 月次シフト自動作成

- ルート: `/admin/shifts/auto?officeId=...&ym=...`。
- 状態:
  1. **入力**: 拠点 + 対象月 + 「既存の手動編集を保護するか」チェック（§7 論点 B の確定値が既定）。
  2. **プレビュー (dry-run)**: ボタン押下で `generateMonthlyShifts` を呼び、警告と充足率を表示。DB 書き込みなし。
  3. **下書き保存**: 確定の前に DB へ書き込む。`shift_generation_runs.status = draft`。`shifts` の差分を upsert/delete。
  4. **微調整**: 「S-A-08 で確認・調整」リンクで `/admin/shifts?officeId=...&ym=...` へ。
  5. **確定**: `status = confirmed` に遷移。`stats` を再計算しない（draft 時のスナップショット）。
- 警告は重大度別 (`info` / `warn` / `error`) で色分け、件数バッジ表示。

### 5.3 S-A-08 月次勤務表編集 (既存)

- 既存のグリッドに **「自動由来」表示** を追加。`generation_run_id` を持つセルは左下に小さな印（▾ 等）。
- 当月の `shift_generation_runs.status` が `draft` の間は、ヘッダに「未確定の自動作成あり」バナー。
- `confirmed` 中も編集は可能。編集すると `updated_by` が変わり、`generation_run_id` は維持。
- 「自動作成へ戻る」リンクで S-A-26 に飛べる導線を追加。

---

## 6. 確定フローと再実行ポリシー

### 6.1 draft 中の再実行

- 同月の draft run がある場合は「上書きしますか？」確認のみで実行。
- 既存 draft の shifts は **全削除** し、新しい結果を書き込む（draft は捨ててよい状態）。

### 6.2 confirmed 後の再実行

- 既に `confirmed` の run がある場合、再実行は **ブロック**（ボタン無効化）。
- 「再生成したい」場合は明示的に「確定取り消し」ボタンで `confirmed → draft` に戻す。
- 確定取り消し時、`generation_run_id` を持つ shifts はそのまま残し、`status` だけ戻す。
- 確定取り消しの履歴は MVP では持たない（必要になったら `shift_generation_runs.confirmed_at` / `unconfirmed_at` を追加）。

### 6.3 手動編集分の保護

- §7 論点 B の確定値: **`generation_run_id IS NULL` の shifts は再実行で常に保護**。
- 保護対象は `existingShifts` として algorithm に渡し、warnings に `QUOTA_OVERFILLED` / `UNAVAILABLE_DOW_VIOLATED` が出る場合は表示。
- run 由来 (`generation_run_id` ≠ NULL) のセルを管理者が S-A-08 で書き換えた場合は、書き換え後の値で `generation_run_id` を保持したまま `updated_by` のみ更新。これは「自動由来＋手動編集済」のセルになる。再実行時はこれも保護対象（一度人手で触ったものは尊重）。
  - 保護判定は「`generation_run_id` の有無」ではなく **`updated_by != run.generated_by` OR `generation_run_id IS NULL`** で行う。
  - つまり: 自動配置直後で誰も触っていない (= `updated_by == run.generated_by`) の shifts のみ再実行で上書きされる。

---

## 7. 設計判断ログ（2026-05-21 確定）

| ID  | 論点                                 | 確定事項                                                             | 採用理由                                                                                                 |
| --- | ------------------------------------ | -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| A   | 自動作成に「公休」自動配置を含めるか | **含める**（§4.4 パス 5）                                            | S-A-08 で公休を 1 セルずつ埋める作業が消える。「公休の付け方は現場の裁量」が必要なら S-A-08 で上書き可。 |
| B   | 同月再実行時の手動編集分の扱い       | **`updated_by` で判定して人手分を保護**（§6.3）                      | 一度でも人が触ったセルは再実行で消えない。draft 直後の未編集セルだけ上書きされる。                       |
| C   | 祝日マスター                         | **`src/lib/calendar/holidays.ts` にハードコード**（年 1 回手動更新） | MVP では更新頻度が低い。テーブル化は Future。                                                            |
| D   | 夜勤上限超過時の挙動                 | **人員不足時のみ強制配置 + 警告**（§4.5）                            | 「現場が回らない」リスクのほうが大きい。`NIGHT_SHIFT_OVER_LIMIT` 警告で見える化する。                    |
| E   | 連続勤務日数の上限                   | **6 日まで許容、7 日目以降は強制回避**（§4.5）                       | 介護現場の慣行。労使協定で別途制限がある拠点は S-A-08 で手動調整。                                       |
| F   | 月間所定労働日数の算出式             | **`weeklyWorkDays * (月の週数, 切り上げ)`**（§4.4 前処理）           | パートの「週 3 日勤務」と整合しやすい。Phase 2 で雇用契約書とつき合わせて見直し可能。                    |
| G   | パートの時間帯マッチング             | **MVP では「日 × 種別」までで自動、時間帯指定は S-A-08 で手動**      | 完全マッチは Phase 2 以降。MVP は「曜日と種別が合っていればよい」運用。                                  |

---

## 8. テスト方針

- `src/lib/shift/auto-generator/__tests__/` にユニットテストを置き、純粋関数として網羅。
- 必須シナリオ:
  1. 全パターン埋まる単純系（5 人で日勤 2 枠を 1 週間）。
  2. 希望休・不可曜日が正しく除外される。
  3. 夜勤上限を尊重し、人員不足時のみ越境配置される。
  4. パートの年収上限超過で配置が止まる。
  5. 前月末 NIGHT_IN を引き継ぎ、当月 1 日に NIGHT_OUT が入る。
  6. 既存手動シフト (`existingShifts`) が保護される + `QUOTA_OVERFILLED` が出る。
  7. 同じ `seed` で実行すれば結果が再現する（決定論性）。
  8. quota が満たせない日が `QUOTA_UNDERFILLED` で出る。
- E2E (Playwright) は **§5.2 の dry-run → draft → confirm の一連の遷移** を最小データセットで通す。
- ロジックの修正で結果が変わった場合は **`algorithm_version` を更新** し、過去 run と区別できるようにする。

---

## 9. 受け入れ基準 (Phase 1-H 完了の定義)

- [ ] DB マイグレーション (`office_shift_quotas` / `shift_generation_runs` / `shifts.generation_run_id` / 祝日 lib) が main にマージされている。
- [ ] S-A-27 で 5 拠点分の quota を実データで登録でき、ラウンドトリップが画面上で確認できる。
- [ ] S-A-26 から 1 か月分の自動作成を実行し、`shift_generation_runs.draft` が作成され、`shifts` に差分が反映される。
- [ ] S-A-08 で自動作成セルが識別でき、手動編集後も再実行で保護されることがテストで確認できる。
- [ ] §8 のユニットテスト・E2E がすべて green。
- [ ] [development-plan.md §9](development-plan.md#9-成功指標kpi-案) の **「シフト自動作成の制約満足率 95% 以上」** をシード環境の 5 拠点 × 1 か月で測定し、満たすか、満たさない場合は警告で説明できる。

---

## 10. 関連ドキュメントの更新

このドキュメントが固まったら、以下を追従する:

- [database-design.md §2.11 / §2.12 / §2.14 / §6](database-design.md) — quota の day_kind 詳細、stats jsonb スキーマ、shifts.generation_run_id インデックスを反映。
- [development-plan.md §4 1-H](development-plan.md#1-h-月次シフト自動作成2〜3-週) — 実装サブステップ（1-H-1 〜 1-H-5）を本ドキュメントの §3〜§5 に揃える。
- [screen-list.md](screen-list.md) — S-A-26 / S-A-27 の主な操作欄に「dry-run / 下書き / 確定」の 3 段運用を追記。
