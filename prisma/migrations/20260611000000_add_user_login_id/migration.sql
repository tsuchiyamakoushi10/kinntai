-- ログインID対応。介護職員はメール未保有が多いため、email を任意 (NULLABLE) に変更し、
-- 代わりに自動発行する login_id (例 "e0001") でログインできるようにする。
-- どちらか一方でもあればログイン可。Postgres の UNIQUE は複数 NULL を許す。非破壊。

-- email を NOT NULL から NULLABLE へ
ALTER TABLE "users" ALTER COLUMN "email" DROP NOT NULL;

-- login_id 列の追加 + UNIQUE 制約
ALTER TABLE "users" ADD COLUMN "login_id" TEXT;
CREATE UNIQUE INDEX "users_login_id_key" ON "users"("login_id");
