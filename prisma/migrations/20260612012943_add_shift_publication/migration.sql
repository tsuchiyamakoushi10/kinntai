-- CreateTable
CREATE TABLE "shift_publications" (
    "id" UUID NOT NULL,
    "office_id" UUID NOT NULL,
    "target_month" DATE NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "published_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "shift_publications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "shift_publications_office_id_target_month_key" ON "shift_publications"("office_id", "target_month");

-- AddForeignKey
ALTER TABLE "shift_publications" ADD CONSTRAINT "shift_publications_office_id_fkey" FOREIGN KEY ("office_id") REFERENCES "offices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_publications" ADD CONSTRAINT "shift_publications_published_by_fkey" FOREIGN KEY ("published_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
