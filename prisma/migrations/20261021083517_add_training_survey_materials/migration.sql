-- CreateEnum
CREATE TYPE "training_survey_material_kind" AS ENUM ('file', 'link');

-- CreateTable
CREATE TABLE "training_survey_materials" (
    "id" UUID NOT NULL,
    "survey_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL,
    "kind" "training_survey_material_kind" NOT NULL,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "storage_key" TEXT,
    "file_name" TEXT,
    "mime_type" TEXT,
    "size_bytes" INTEGER,
    "must_view" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "training_survey_materials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "training_survey_material_views" (
    "material_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "viewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "training_survey_material_views_pkey" PRIMARY KEY ("material_id","employee_id")
);

-- CreateIndex
CREATE INDEX "training_survey_materials_survey_id_sort_order_idx" ON "training_survey_materials"("survey_id", "sort_order");

-- CreateIndex
CREATE INDEX "training_survey_materials_storage_key_idx" ON "training_survey_materials"("storage_key");

-- CreateIndex
CREATE INDEX "training_survey_material_views_employee_id_idx" ON "training_survey_material_views"("employee_id");

-- AddForeignKey
ALTER TABLE "training_survey_materials" ADD CONSTRAINT "training_survey_materials_survey_id_fkey" FOREIGN KEY ("survey_id") REFERENCES "training_surveys"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_material_views" ADD CONSTRAINT "training_survey_material_views_material_id_fkey" FOREIGN KEY ("material_id") REFERENCES "training_survey_materials"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "training_survey_material_views" ADD CONSTRAINT "training_survey_material_views_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 本番 (Supabase) は public の全テーブルで RLS を有効にする (アプリは所有者ロールで接続)
ALTER TABLE "training_survey_materials" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "training_survey_material_views" ENABLE ROW LEVEL SECURITY;
