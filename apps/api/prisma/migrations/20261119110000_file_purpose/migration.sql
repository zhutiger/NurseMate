CREATE TYPE "FilePurpose" AS ENUM ('NOTICE_ATTACHMENT', 'TASK_ATTACHMENT', 'TASK_SUBMISSION', 'EXPORT');

ALTER TABLE "file_objects" ADD COLUMN "purpose" "FilePurpose";

UPDATE "file_objects"
SET "purpose" = 'EXPORT'
WHERE "id" IN (SELECT "outputFileId" FROM "export_jobs" WHERE "outputFileId" IS NOT NULL);

UPDATE "file_objects" SET "purpose" = 'NOTICE_ATTACHMENT' WHERE "purpose" IS NULL;

ALTER TABLE "file_objects" ALTER COLUMN "purpose" SET NOT NULL;
