-- shift_kind enum を「夜入 / 夜明」を別物として持つ形に変える。
-- ALTER TYPE ... RENAME VALUE を使い、既存データが残っていてもそのまま読み替えられる
-- 形にする（Prisma 自動生成だと DROP / RECREATE になり、列のデータを失うため手書き）。
ALTER TYPE "shift_kind" RENAME VALUE 'night' TO 'night_in';
ALTER TYPE "shift_kind" RENAME VALUE 'after_night' TO 'night_out';

-- shift_patterns に paid_leave_units を追加。
-- 純粋有休 = 1.0、複合（有/日, 日/有）= 0.5、それ以外 = 0.0 で運用する。
-- 既存行は全て 0.0 でよい（純粋有休と複合パターンはシードで個別に値を入れる）。
ALTER TABLE "shift_patterns"
  ADD COLUMN "paid_leave_units" DECIMAL(3, 1) NOT NULL DEFAULT 0;
