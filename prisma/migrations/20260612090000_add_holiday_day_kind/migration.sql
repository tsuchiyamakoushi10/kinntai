-- 祝日を日曜と別区分にする (デイは祝日営業・日曜休業を区別するため)。
-- DayKind enum に "holiday" を追加。既存の office_coverage_demands 行は変更しない
-- (祝日の配置基準は seed-coverage-demand.ts の upsert で各拠点に投入する)。
ALTER TYPE "day_kind" ADD VALUE IF NOT EXISTS 'holiday';
