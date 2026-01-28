-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "is_evaluated" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_opportunity" BOOLEAN,
ADD COLUMN     "opportunity_score" INTEGER,
ADD COLUMN     "opportunity_reason" TEXT,
ADD COLUMN     "evaluated_at" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "posts_is_evaluated_idx" ON "posts"("is_evaluated");

-- CreateIndex
CREATE INDEX "posts_is_opportunity_idx" ON "posts"("is_opportunity");
