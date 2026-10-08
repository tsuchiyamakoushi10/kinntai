# 研修アンケート 設計

> 2026-10-08 追加要望。研修のあとに職員へアンケートを配り、戻ってきた回答を「個別」と「一覧」で見られるようにする。
> これまでは Google フォームで集めていたが、回答がスプレッドシートの横長の表になり、一覧で非常に見にくかった。

---

## 1. 目的と方針

- 社長 (管理者) が研修ごとにアンケートを作り、対象の職員に配る。
- 職員は **マイページ** (自分のスマホでログイン) で回答する。トップに「未回答のアンケート」が出る。
- 回答は **いつも名前つき**。誰が何と答えたか、誰がまだ答えていないかが分かる。
- 回答すると、その職員の **研修記録 (`training_records`) を自動で付ける** (受講記録の二重入力をなくす)。
- 結果画面は「スプレッドシートの横長の表」にしない。
  - **一覧 (まとめ)**: 質問ごとに、評価の平均と内訳の棒、選択肢の人数、自由記述を名前つきで縦に並べる。
  - **個別**: 1 人分の回答を質問と並べて 1 枚で見る。前後の人へ移動できる。
  - **未回答**: 対象者のうちまだ答えていない人。
- 対象外 (今回): 匿名回答、ログイン不要のリンク / QR 回答、メール・LINE での通知、点数による合否判定。

## 2. 質問の種類

2026-10-08 追加要望で Google フォームに近い組み立てにした (§2.1)。

| 種類           | コード          | 回答の形 (`answers[question_id]`)                                         | まとめの見せ方                                                               |
| -------------- | --------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 見出し・説明   | `SECTION`       | なし (回答しない区切り。見出しと説明文だけ)                               | 区切りとして表示                                                             |
| 一行の答え     | `SHORT_TEXT`    | 文字 (200 文字まで)                                                       | 名前つきで縦に並べる                                                         |
| 自由記述       | `TEXT`          | 文字 (1,000 文字まで)                                                     | 名前つきで縦に並べる                                                         |
| ひとつ選ぶ     | `SINGLE_CHOICE` | 選択肢の 1 つ                                                             | 選択肢ごとの人数と割合の棒                                                   |
| プルダウン     | `DROPDOWN`      | 選択肢の 1 つ                                                             | 同上                                                                         |
| いくつでも選ぶ | `MULTI_CHOICE`  | 選択肢の配列                                                              | 同上                                                                         |
| 数の評価       | `SCALE`         | `min`〜`max` の整数 (min は 0 か 1、max は 2〜10。両端の文言を付けられる) | 平均と、各数字の人数の棒                                                     |
| 日付           | `DATE`          | `YYYY-MM-DD`                                                              | 名前つきで並べる                                                             |
| 表形式         | `GRID`          | `{ [行]: 列 }` (行ごとに列を 1 つ選ぶ)                                    | 行ごとに列の人数                                                             |
| (旧) 5段階評価 | `RATING_5`      | 1〜5 の整数                                                               | 平均と内訳。新規作成では使わず、編集画面で開くと `SCALE` (1〜5) に置き換わる |

- 質問ごとに「必須」と **補足説明** を付けられる。
- 選択式 (ひとつ / プルダウン / いくつでも) は選択肢 2〜20 個。ひとつ・いくつでもは **「その他（自由記述）」** を付けられる。
  - その他を選んだときは値に `__other__` を入れ、書いた文字は `answers["{question_id}.other"]` に入れる。
- 表形式は行 1〜20・列 2〜10。

### 2.1 組み立て (S-A-36)

- 質問のカードを **ドラッグで並べ替え** (マウスと指の両方。左端のつまみを持つ)。
- 各カードに「複製」「削除」、カードとカードの間に「＋ ここに追加」。
- 質問の種類を後から変えられる (選択肢など入力済みの内容はできるだけ引き継ぐ)。
- 番号は見出しを飛ばして Q1, Q2… と振る。
- **ひな形**: 今の質問一式に名前を付けて保存し (`training_survey_templates`)、作成時に選べる。前回のアンケートの「複製」も引き続き使える。
- 回答が 1 件でも来たら質問は変更できない (回答と質問がずれるのを防ぐ)。

## 3. 流れ

1. 管理者: 「研修アンケート」→「新しく作る」→ 研修名・研修日・回答期限・質問・対象者を入れる → **下書き保存**
2. 管理者: 「配信する」→ 対象者のマイページに出る (状態 `OPEN`)
   - 配信後も対象者の追加はできる。質問の変更は、回答が 0 件のあいだだけ (回答と質問がずれるのを防ぐ)。
3. 職員: マイページのトップ「未回答のアンケート」→ 回答 → 送信
   - 送信すると研修記録を自動で作る (研修名・研修日・研修種別)。
   - 締め切り前なら回答を直せる (研修記録は 1 件のまま)。
4. 管理者: 結果画面で「まとめ / 個別 / 未回答」を見る。「締め切る」で回答を止める (状態 `CLOSED`)。期限を過ぎたら自動で回答できなくなる。

## 4. データモデル

```
training_surveys                 -- 研修アンケート
  id                uuid PK
  title             text         -- 研修名 (研修記録の研修名にもなる)
  description       text null    -- 職員に見せる説明
  trained_on        date         -- 研修日 (研修記録の日付)
  training_type     training_type -- 研修記録の種別 (既定 company_paid)
  answer_until      date null    -- 回答期限 (この日の終わりまで。null = 締め切るまで)
  status            enum training_survey_status (draft / open / closed)
  office_id         uuid null FK offices  -- 主な対象拠点 (一覧の絞り込み用。対象者は targets が正)
  opened_at, closed_at timestamptz null
  created_by        uuid FK users
  created_at, updated_at
  -- tenant_id: マルチテナント化時に追加 (CLAUDE.md §3.3)

training_survey_questions
  id uuid PK, survey_id FK (cascade), sort_order int,
  kind enum training_survey_question_kind
    (section / short_text / text / single_choice / dropdown / multi_choice / scale / date / grid / rating_5)
  label text, description text null (補足説明),
  options text[] (選択式の選択肢、表形式の列。RATING_5 は [低い側の文言, 高い側の文言]),
  config jsonb null (SCALE: {min, max, minLabel, maxLabel} / GRID: {rows} / 選択式: {allowOther}),
  required boolean

training_survey_templates        -- ひな形 (質問一式を名前つきで保存)
  id uuid PK, name text, questions jsonb (SurveyQuestion の配列。id は空), created_at, updated_at

training_survey_targets          -- 配信対象 (未回答の判定に使う)
  survey_id FK (cascade), employee_id FK, created_at
  PK (survey_id, employee_id)

training_survey_responses        -- 回答 (1 人 1 件)
  id uuid PK, survey_id FK (cascade), employee_id FK,
  answers jsonb  -- { [question_id]: number | string | string[] | {[行]: 列}, "{question_id}.other": string }
  training_record_id uuid null FK training_records (set null)
  submitted_at timestamptz, updated_at
  unique (survey_id, employee_id)
```

- 回答は 1 人 1 行に JSON でまとめる (質問数が少なく、個別表示で 1 行読めば済むため)。集計はアプリ側で行う。
- 本番は public の全テーブルで RLS を有効にする (アプリは所有者ロールで接続)。

## 5. 画面

| ID     | 画面                       | 内容                                                                                                                      |
| ------ | -------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| S-A-35 | 研修アンケート 一覧        | 研修名・研修日・状態・回答数 / 対象数・期限。「新しく作る」「複製」                                                       |
| S-A-36 | 研修アンケート 作成 / 編集 | 研修名・研修日・期限・説明・種別、質問の追加・並べ替え・削除、対象者 (拠点ごとに全員 / 個別にチェック)。下書き保存 / 配信 |
| S-A-37 | 研修アンケート 結果        | タブ: まとめ / 個別 / 未回答。締め切る・再開する                                                                          |
| S-E-11 | アンケート 一覧 (職員)     | マイページのトップに未回答の件数。未回答と回答済みの一覧                                                                  |
| S-E-12 | アンケート 回答 (職員)     | 質問を縦に並べる。評価は大きな数字ボタン。送信で完了表示                                                                  |

- 管理画面は左メニュー「研修アンケート」(従業員の下)。
- 職員画面は 2 階層以内 (トップ → 回答) に収める (CLAUDE.md §3.1)。

## 6. ロジック (`src/lib/training-survey/`)

- `checkSurveyDraft` — 作成画面の入力 (研修名・日付・質問・選択肢) の検証。
- `checkAnswers(questions, raw)` — 回答の検証。必須の未回答、範囲外の評価、存在しない選択肢を弾く。
- `canAnswer(survey, today)` — 状態が open で、期限 (JST の日付) を過ぎていないか。
- `summarize(questions, responses)` — まとめ画面用の集計 (評価の平均と内訳、選択肢の人数、自由記述の一覧)。
- いずれも純関数でテストを書く。

## 7. 実装ステップ

1. 設計 (本書) と要件・画面一覧・DB 設計への追記 ← 完了
2. スキーマとマイグレーション ← 完了
3. ロジック + テスト (`tests/training-survey/`) ← 完了
4. 管理画面 (一覧・作成・結果) ← 完了
5. 職員画面 (マイページのお知らせ・回答) ← 完了
