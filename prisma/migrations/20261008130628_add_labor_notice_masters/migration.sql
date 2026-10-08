-- CreateTable
CREATE TABLE "labor_notice_presets" (
    "notice_type" "labor_notice_type" NOT NULL,
    "texts" JSONB NOT NULL,
    "default_fixed_term_months" INTEGER,
    "converts_to_indefinite" BOOLEAN NOT NULL,
    "default_pattern_codes" TEXT[],
    "allowance_rows" JSONB NOT NULL,
    "qualification_allowances" JSONB NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "labor_notice_presets_pkey" PRIMARY KEY ("notice_type")
);

-- CreateTable
CREATE TABLE "labor_notice_work_patterns" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "start_time" TEXT NOT NULL,
    "end_time" TEXT NOT NULL,
    "ends_next_day" BOOLEAN NOT NULL DEFAULT false,
    "break_minutes" INTEGER NOT NULL DEFAULT 0,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "labor_notice_work_patterns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "min_wages" (
    "id" UUID NOT NULL,
    "prefecture" TEXT NOT NULL,
    "yen" INTEGER NOT NULL,
    "effective_from" DATE NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "min_wages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "labor_notice_work_patterns_code_key" ON "labor_notice_work_patterns"("code");

-- CreateIndex
CREATE UNIQUE INDEX "min_wages_prefecture_effective_from_key" ON "min_wages"("prefecture", "effective_from");

-- 本番 (Supabase) は public の全テーブルで RLS を有効にしている。アプリは所有者ロールで接続するため影響なし。
ALTER TABLE "labor_notice_presets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "labor_notice_work_patterns" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "min_wages" ENABLE ROW LEVEL SECURITY;
