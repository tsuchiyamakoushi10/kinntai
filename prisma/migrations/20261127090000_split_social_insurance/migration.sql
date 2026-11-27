-- 社会保険の加入を健康保険と厚生年金に分ける。
-- 既存の値は両方に写してから旧列を消す。
ALTER TABLE "employment_contracts" ADD COLUMN "has_health_insurance" BOOLEAN;
ALTER TABLE "employment_contracts" ADD COLUMN "has_pension_insurance" BOOLEAN;

UPDATE "employment_contracts"
SET "has_health_insurance" = "has_social_insurance",
    "has_pension_insurance" = "has_social_insurance";

ALTER TABLE "employment_contracts" DROP COLUMN "has_social_insurance";
