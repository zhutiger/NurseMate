ALTER TABLE "tasks"
  ADD COLUMN "currentVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3),
  ADD COLUMN "deletedById" UUID,
  ADD COLUMN "deleteReason" VARCHAR(255),
  ADD COLUMN "sourceTaskId" UUID;

CREATE TABLE "task_versions" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "changeReason" VARCHAR(255),
  "createdById" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_versions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "task_views" (
  "id" UUID NOT NULL,
  "taskRecordId" UUID NOT NULL,
  "versionNo" INTEGER NOT NULL,
  "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "task_views_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "task_versions_taskId_versionNo_key" ON "task_versions"("taskId", "versionNo");
CREATE INDEX "task_versions_taskId_createdAt_idx" ON "task_versions"("taskId", "createdAt");
CREATE UNIQUE INDEX "task_views_taskRecordId_versionNo_key" ON "task_views"("taskRecordId", "versionNo");
CREATE INDEX "task_views_taskRecordId_viewedAt_idx" ON "task_views"("taskRecordId", "viewedAt");
CREATE INDEX "tasks_departmentId_deletedAt_idx" ON "tasks"("departmentId", "deletedAt");
CREATE INDEX "tasks_sourceTaskId_idx" ON "tasks"("sourceTaskId");

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_deletedById_fkey" FOREIGN KEY ("deletedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_sourceTaskId_fkey" FOREIGN KEY ("sourceTaskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_versions" ADD CONSTRAINT "task_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_views" ADD CONSTRAINT "task_views_taskRecordId_fkey" FOREIGN KEY ("taskRecordId") REFERENCES "task_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Existing published tasks become version 1 without changing their execution state.
UPDATE "tasks" SET "currentVersion" = 1 WHERE "status" IN ('PUBLISHED', 'CLOSED', 'WITHDRAWN');
INSERT INTO "task_versions" ("id", "taskId", "versionNo", "snapshot", "changeReason", "createdById", "createdAt")
SELECT gen_random_uuid(), t."id", 1,
       jsonb_build_object(
         'title', t."title", 'content', t."content", 'level', t."level",
         'deadlineAt', t."deadline", 'completionMode', t."completionMode",
         'feedbackRequired', t."feedbackRequired", 'attachmentRequired', t."attachmentRequired"
       ),
       '历史任务迁移生成初始版本', t."createdById", COALESCE(t."publishedAt", t."createdAt")
FROM "tasks" t
WHERE t."currentVersion" = 1;
