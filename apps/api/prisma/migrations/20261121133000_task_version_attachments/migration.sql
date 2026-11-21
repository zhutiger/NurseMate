CREATE TABLE "task_version_attachments" (
  "taskVersionId" UUID NOT NULL,
  "fileId" UUID NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "task_version_attachments_pkey" PRIMARY KEY ("taskVersionId", "fileId")
);

ALTER TABLE "task_version_attachments" ADD CONSTRAINT "task_version_attachments_taskVersionId_fkey" FOREIGN KEY ("taskVersionId") REFERENCES "task_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "task_version_attachments" ADD CONSTRAINT "task_version_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

INSERT INTO "task_version_attachments" ("taskVersionId", "fileId", "sortOrder")
SELECT tv."id", ta."fileId", ta."sortOrder"
FROM "task_versions" tv
JOIN "tasks" t ON t."id" = tv."taskId" AND t."currentVersion" = tv."versionNo"
JOIN "task_attachments" ta ON ta."taskId" = t."id"
ON CONFLICT DO NOTHING;
