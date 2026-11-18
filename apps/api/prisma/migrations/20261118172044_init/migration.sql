-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('HEAD_NURSE', 'COORDINATOR', 'NURSE');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('PENDING_ACTIVATION', 'ACTIVE', 'LOCKED', 'DISABLED');

-- CreateEnum
CREATE TYPE "ClientPlatform" AS ENUM ('MINI_PROGRAM', 'H5', 'ADMIN_WEB');

-- CreateEnum
CREATE TYPE "ActivationPurpose" AS ENUM ('ACTIVATE_ACCOUNT', 'RESET_PASSWORD');

-- CreateEnum
CREATE TYPE "NoticeLevel" AS ENUM ('NORMAL', 'IMPORTANT', 'URGENT');

-- CreateEnum
CREATE TYPE "NoticeStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CLOSED', 'WITHDRAWN', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TaskCompletionMode" AS ENUM ('SIMPLE', 'REVIEW');

-- CreateEnum
CREATE TYPE "TaskRecordStatus" AS ENUM ('PENDING', 'SUBMITTED', 'RETURNED', 'APPROVED', 'COMPLETED', 'EXCLUDED');

-- CreateEnum
CREATE TYPE "SubmissionReviewStatus" AS ENUM ('PENDING', 'APPROVED', 'RETURNED');

-- CreateEnum
CREATE TYPE "ReminderTargetType" AS ENUM ('NOTICE_RECIPIENT', 'TASK_RECORD');

-- CreateEnum
CREATE TYPE "ReminderChannel" AS ENUM ('IN_APP', 'WECHAT_SUBSCRIBE', 'MANUAL');

-- CreateEnum
CREATE TYPE "ReminderStatus" AS ENUM ('PLANNED', 'PROCESSING', 'SENT', 'FAILED_RETRYABLE', 'FAILED_FINAL', 'CANCELLED');

-- CreateEnum
CREATE TYPE "FileStatus" AS ENUM ('PENDING', 'READY', 'BLOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "AuditResult" AS ENUM ('SUCCESS', 'FAILURE');

-- CreateEnum
CREATE TYPE "ExportType" AS ENUM ('NOTICE_RECIPIENTS', 'TASK_RECORDS');

-- CreateEnum
CREATE TYPE "ExportStatus" AS ENUM ('QUEUED', 'PROCESSING', 'SUCCEEDED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "departments" (
    "id" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(128) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nursing_groups" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "code" VARCHAR(32) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "nursing_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "primaryGroupId" UUID,
    "employeeNo" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "role" "UserRole" NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'PENDING_ACTIVATION',
    "passwordHash" VARCHAR(255),
    "passwordChangedAt" TIMESTAMPTZ(3),
    "failedLoginCount" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ(3),
    "activatedAt" TIMESTAMPTZ(3),
    "disabledAt" TIMESTAMPTZ(3),
    "disabledReason" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activation_codes" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "ActivationPurpose" NOT NULL,
    "codeHash" VARCHAR(255) NOT NULL,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "usedAt" TIMESTAMPTZ(3),
    "invalidatedAt" TIMESTAMPTZ(3),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "activation_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "wechat_identities" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "appId" VARCHAR(64) NOT NULL,
    "openId" VARCHAR(128) NOT NULL,
    "unionId" VARCHAR(128),
    "boundAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unboundAt" TIMESTAMPTZ(3),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "wechat_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "platform" "ClientPlatform" NOT NULL,
    "tokenHash" VARCHAR(255) NOT NULL,
    "deviceId" VARCHAR(128),
    "userAgent" VARCHAR(512),
    "ipAddress" VARCHAR(64),
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "lastUsedAt" TIMESTAMPTZ(3),
    "revokedAt" TIMESTAMPTZ(3),
    "revokeReason" VARCHAR(128),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "code" VARCHAR(64) NOT NULL,
    "name" VARCHAR(64) NOT NULL,
    "description" VARCHAR(255) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "user_permissions" (
    "userId" UUID NOT NULL,
    "permissionCode" VARCHAR(64) NOT NULL,
    "grantedById" UUID NOT NULL,
    "grantedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("userId","permissionCode")
);

-- CreateTable
CREATE TABLE "notices" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "level" "NoticeLevel" NOT NULL,
    "status" "NoticeStatus" NOT NULL DEFAULT 'DRAFT',
    "currentVersion" INTEGER NOT NULL DEFAULT 0,
    "requiresConfirmation" BOOLEAN NOT NULL DEFAULT true,
    "deadline" TIMESTAMPTZ(3),
    "recipientSelection" JSONB,
    "createdById" UUID NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closeReason" VARCHAR(255),
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawReason" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "notices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_versions" (
    "id" UUID NOT NULL,
    "noticeId" UUID NOT NULL,
    "versionNo" INTEGER NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "level" "NoticeLevel" NOT NULL,
    "deadline" TIMESTAMPTZ(3),
    "reconfirmRequired" BOOLEAN NOT NULL DEFAULT false,
    "changeReason" VARCHAR(255),
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_recipients" (
    "id" UUID NOT NULL,
    "noticeId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "addedVersionNo" INTEGER NOT NULL,
    "addedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "excludedAt" TIMESTAMPTZ(3),
    "excludedById" UUID,
    "exclusionReason" VARCHAR(255),

    CONSTRAINT "notice_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_views" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "noticeVersionId" UUID NOT NULL,
    "viewedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_views_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_confirmations" (
    "id" UUID NOT NULL,
    "recipientId" UUID NOT NULL,
    "noticeVersionId" UUID NOT NULL,
    "confirmedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notice_confirmations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tasks" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "content" TEXT NOT NULL,
    "level" "NoticeLevel" NOT NULL,
    "status" "TaskStatus" NOT NULL DEFAULT 'DRAFT',
    "completionMode" "TaskCompletionMode" NOT NULL,
    "feedbackRequired" BOOLEAN NOT NULL DEFAULT false,
    "attachmentRequired" BOOLEAN NOT NULL DEFAULT false,
    "deadline" TIMESTAMPTZ(3) NOT NULL,
    "assigneeSelection" JSONB,
    "createdById" UUID NOT NULL,
    "publishedById" UUID,
    "publishedAt" TIMESTAMPTZ(3),
    "closedAt" TIMESTAMPTZ(3),
    "closeReason" VARCHAR(255),
    "withdrawnAt" TIMESTAMPTZ(3),
    "withdrawReason" VARCHAR(255),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_records" (
    "id" UUID NOT NULL,
    "taskId" UUID NOT NULL,
    "assigneeId" UUID NOT NULL,
    "status" "TaskRecordStatus" NOT NULL DEFAULT 'PENDING',
    "completedAt" TIMESTAMPTZ(3),
    "excludedAt" TIMESTAMPTZ(3),
    "excludedById" UUID,
    "exclusionReason" VARCHAR(255),
    "lockVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "task_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "task_submissions" (
    "id" UUID NOT NULL,
    "taskRecordId" UUID NOT NULL,
    "submissionNo" INTEGER NOT NULL,
    "feedback" TEXT,
    "reviewStatus" "SubmissionReviewStatus" NOT NULL DEFAULT 'PENDING',
    "submittedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedById" UUID,
    "reviewedAt" TIMESTAMPTZ(3),
    "reviewComment" TEXT,

    CONSTRAINT "task_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_objects" (
    "id" UUID NOT NULL,
    "storageKey" VARCHAR(512) NOT NULL,
    "originalName" VARCHAR(255) NOT NULL,
    "mimeType" VARCHAR(128) NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "sha256" VARCHAR(64),
    "status" "FileStatus" NOT NULL DEFAULT 'PENDING',
    "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readyAt" TIMESTAMPTZ(3),

    CONSTRAINT "file_objects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_version_attachments" (
    "noticeVersionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "notice_version_attachments_pkey" PRIMARY KEY ("noticeVersionId","fileId")
);

-- CreateTable
CREATE TABLE "task_attachments" (
    "taskId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_attachments_pkey" PRIMARY KEY ("taskId","fileId")
);

-- CreateTable
CREATE TABLE "task_submission_attachments" (
    "taskSubmissionId" UUID NOT NULL,
    "fileId" UUID NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "task_submission_attachments_pkey" PRIMARY KEY ("taskSubmissionId","fileId")
);

-- CreateTable
CREATE TABLE "reminders" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "targetType" "ReminderTargetType" NOT NULL,
    "noticeRecipientId" UUID,
    "taskRecordId" UUID,
    "recipientId" UUID NOT NULL,
    "channel" "ReminderChannel" NOT NULL,
    "status" "ReminderStatus" NOT NULL DEFAULT 'PLANNED',
    "scheduledAt" TIMESTAMPTZ(3) NOT NULL,
    "sentAt" TIMESTAMPTZ(3),
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "requestedById" UUID,
    "externalMessageId" VARCHAR(255),
    "errorCode" VARCHAR(64),
    "errorMessage" VARCHAR(512),
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reminders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "actorId" UUID,
    "action" VARCHAR(96) NOT NULL,
    "targetType" VARCHAR(64) NOT NULL,
    "targetId" VARCHAR(64),
    "result" "AuditResult" NOT NULL,
    "requestId" VARCHAR(64),
    "ipAddress" VARCHAR(64),
    "userAgent" VARCHAR(512),
    "reason" VARCHAR(255),
    "beforeData" JSONB,
    "afterData" JSONB,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "export_jobs" (
    "id" UUID NOT NULL,
    "departmentId" UUID NOT NULL,
    "requestedById" UUID NOT NULL,
    "type" "ExportType" NOT NULL,
    "status" "ExportStatus" NOT NULL DEFAULT 'QUEUED',
    "filters" JSONB NOT NULL,
    "outputFileId" UUID,
    "errorMessage" VARCHAR(512),
    "requestedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMPTZ(3),
    "completedAt" TIMESTAMPTZ(3),
    "expiresAt" TIMESTAMPTZ(3),

    CONSTRAINT "export_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "idempotency_records" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "idempotencyKey" VARCHAR(128) NOT NULL,
    "method" VARCHAR(8) NOT NULL,
    "path" VARCHAR(255) NOT NULL,
    "requestHash" VARCHAR(64) NOT NULL,
    "responseStatus" INTEGER,
    "responseBody" JSONB,
    "expiresAt" TIMESTAMPTZ(3) NOT NULL,
    "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "idempotency_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE INDEX "nursing_groups_departmentId_enabled_idx" ON "nursing_groups"("departmentId", "enabled");

-- CreateIndex
CREATE UNIQUE INDEX "nursing_groups_departmentId_code_key" ON "nursing_groups"("departmentId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "nursing_groups_departmentId_name_key" ON "nursing_groups"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "users_employeeNo_key" ON "users"("employeeNo");

-- CreateIndex
CREATE INDEX "users_departmentId_status_idx" ON "users"("departmentId", "status");

-- CreateIndex
CREATE INDEX "users_departmentId_role_idx" ON "users"("departmentId", "role");

-- CreateIndex
CREATE INDEX "users_primaryGroupId_idx" ON "users"("primaryGroupId");

-- CreateIndex
CREATE INDEX "activation_codes_userId_purpose_expiresAt_idx" ON "activation_codes"("userId", "purpose", "expiresAt");

-- CreateIndex
CREATE INDEX "wechat_identities_unionId_idx" ON "wechat_identities"("unionId");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_identities_appId_openId_key" ON "wechat_identities"("appId", "openId");

-- CreateIndex
CREATE UNIQUE INDEX "wechat_identities_userId_appId_key" ON "wechat_identities"("userId", "appId");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_sessions_tokenHash_key" ON "refresh_sessions"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_sessions_userId_expiresAt_idx" ON "refresh_sessions"("userId", "expiresAt");

-- CreateIndex
CREATE INDEX "user_permissions_permissionCode_idx" ON "user_permissions"("permissionCode");

-- CreateIndex
CREATE INDEX "notices_departmentId_status_publishedAt_idx" ON "notices"("departmentId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "notices_departmentId_deadline_idx" ON "notices"("departmentId", "deadline");

-- CreateIndex
CREATE INDEX "notice_versions_noticeId_createdAt_idx" ON "notice_versions"("noticeId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notice_versions_noticeId_versionNo_key" ON "notice_versions"("noticeId", "versionNo");

-- CreateIndex
CREATE INDEX "notice_recipients_userId_excludedAt_idx" ON "notice_recipients"("userId", "excludedAt");

-- CreateIndex
CREATE UNIQUE INDEX "notice_recipients_noticeId_userId_key" ON "notice_recipients"("noticeId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "notice_views_recipientId_noticeVersionId_key" ON "notice_views"("recipientId", "noticeVersionId");

-- CreateIndex
CREATE UNIQUE INDEX "notice_confirmations_recipientId_noticeVersionId_key" ON "notice_confirmations"("recipientId", "noticeVersionId");

-- CreateIndex
CREATE INDEX "tasks_departmentId_status_publishedAt_idx" ON "tasks"("departmentId", "status", "publishedAt");

-- CreateIndex
CREATE INDEX "tasks_departmentId_deadline_idx" ON "tasks"("departmentId", "deadline");

-- CreateIndex
CREATE INDEX "task_records_assigneeId_status_idx" ON "task_records"("assigneeId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "task_records_taskId_assigneeId_key" ON "task_records"("taskId", "assigneeId");

-- CreateIndex
CREATE INDEX "task_submissions_reviewStatus_submittedAt_idx" ON "task_submissions"("reviewStatus", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "task_submissions_taskRecordId_submissionNo_key" ON "task_submissions"("taskRecordId", "submissionNo");

-- CreateIndex
CREATE UNIQUE INDEX "file_objects_storageKey_key" ON "file_objects"("storageKey");

-- CreateIndex
CREATE INDEX "file_objects_uploadedById_createdAt_idx" ON "file_objects"("uploadedById", "createdAt");

-- CreateIndex
CREATE INDEX "reminders_status_scheduledAt_idx" ON "reminders"("status", "scheduledAt");

-- CreateIndex
CREATE INDEX "reminders_recipientId_createdAt_idx" ON "reminders"("recipientId", "createdAt");

-- CreateIndex
CREATE INDEX "reminders_noticeRecipientId_idx" ON "reminders"("noticeRecipientId");

-- CreateIndex
CREATE INDEX "reminders_taskRecordId_idx" ON "reminders"("taskRecordId");

-- CreateIndex
CREATE INDEX "audit_logs_departmentId_createdAt_idx" ON "audit_logs"("departmentId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_actorId_createdAt_idx" ON "audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_logs_targetType_targetId_createdAt_idx" ON "audit_logs"("targetType", "targetId", "createdAt");

-- CreateIndex
CREATE INDEX "export_jobs_departmentId_requestedAt_idx" ON "export_jobs"("departmentId", "requestedAt");

-- CreateIndex
CREATE INDEX "export_jobs_requestedById_requestedAt_idx" ON "export_jobs"("requestedById", "requestedAt");

-- CreateIndex
CREATE INDEX "export_jobs_status_requestedAt_idx" ON "export_jobs"("status", "requestedAt");

-- CreateIndex
CREATE INDEX "idempotency_records_expiresAt_idx" ON "idempotency_records"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "idempotency_records_userId_idempotencyKey_method_path_key" ON "idempotency_records"("userId", "idempotencyKey", "method", "path");

-- AddForeignKey
ALTER TABLE "nursing_groups" ADD CONSTRAINT "nursing_groups_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_primaryGroupId_fkey" FOREIGN KEY ("primaryGroupId") REFERENCES "nursing_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activation_codes" ADD CONSTRAINT "activation_codes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "wechat_identities" ADD CONSTRAINT "wechat_identities_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_sessions" ADD CONSTRAINT "refresh_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionCode_fkey" FOREIGN KEY ("permissionCode") REFERENCES "permissions"("code") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_grantedById_fkey" FOREIGN KEY ("grantedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notices" ADD CONSTRAINT "notices_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_versions" ADD CONSTRAINT "notice_versions_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_versions" ADD CONSTRAINT "notice_versions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_noticeId_fkey" FOREIGN KEY ("noticeId") REFERENCES "notices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_views" ADD CONSTRAINT "notice_views_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "notice_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_views" ADD CONSTRAINT "notice_views_noticeVersionId_fkey" FOREIGN KEY ("noticeVersionId") REFERENCES "notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_confirmations" ADD CONSTRAINT "notice_confirmations_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "notice_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_confirmations" ADD CONSTRAINT "notice_confirmations_noticeVersionId_fkey" FOREIGN KEY ("noticeVersionId") REFERENCES "notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_publishedById_fkey" FOREIGN KEY ("publishedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_records" ADD CONSTRAINT "task_records_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_records" ADD CONSTRAINT "task_records_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_records" ADD CONSTRAINT "task_records_excludedById_fkey" FOREIGN KEY ("excludedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_taskRecordId_fkey" FOREIGN KEY ("taskRecordId") REFERENCES "task_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_version_attachments" ADD CONSTRAINT "notice_version_attachments_noticeVersionId_fkey" FOREIGN KEY ("noticeVersionId") REFERENCES "notice_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_version_attachments" ADD CONSTRAINT "notice_version_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_attachments" ADD CONSTRAINT "task_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_attachments" ADD CONSTRAINT "task_submission_attachments_taskSubmissionId_fkey" FOREIGN KEY ("taskSubmissionId") REFERENCES "task_submissions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_submission_attachments" ADD CONSTRAINT "task_submission_attachments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_noticeRecipientId_fkey" FOREIGN KEY ("noticeRecipientId") REFERENCES "notice_recipients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_taskRecordId_fkey" FOREIGN KEY ("taskRecordId") REFERENCES "task_records"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "export_jobs" ADD CONSTRAINT "export_jobs_outputFileId_fkey" FOREIGN KEY ("outputFileId") REFERENCES "file_objects"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "idempotency_records" ADD CONSTRAINT "idempotency_records_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Native invariants that Prisma schema cannot express.
ALTER TABLE "users" ADD CONSTRAINT "users_disabled_at_required_check"
CHECK ("status" <> 'DISABLED' OR "disabledAt" IS NOT NULL);

ALTER TABLE "notice_versions" ADD CONSTRAINT "notice_versions_version_no_positive_check"
CHECK ("versionNo" > 0);

ALTER TABLE "notice_recipients" ADD CONSTRAINT "notice_recipients_added_version_positive_check"
CHECK ("addedVersionNo" > 0);

ALTER TABLE "task_records" ADD CONSTRAINT "task_records_lock_version_nonnegative_check"
CHECK ("lockVersion" >= 0);

ALTER TABLE "task_submissions" ADD CONSTRAINT "task_submissions_submission_no_positive_check"
CHECK ("submissionNo" > 0);

ALTER TABLE "file_objects" ADD CONSTRAINT "file_objects_size_positive_check"
CHECK ("sizeBytes" > 0);

ALTER TABLE "reminders" ADD CONSTRAINT "reminders_target_exactly_one_check"
CHECK (
  ("targetType" = 'NOTICE_RECIPIENT' AND "noticeRecipientId" IS NOT NULL AND "taskRecordId" IS NULL)
  OR
  ("targetType" = 'TASK_RECORD' AND "taskRecordId" IS NOT NULL AND "noticeRecipientId" IS NULL)
);

ALTER TABLE "reminders" ADD CONSTRAINT "reminders_attempts_valid_check"
CHECK ("attemptCount" >= 0 AND "maxAttempts" > 0 AND "attemptCount" <= "maxAttempts");
