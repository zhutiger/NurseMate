import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnsupportedMediaTypeException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import type { AuthUser } from '../../common/current-user.decorator';
import { AccessService } from '../../common/access.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUploadIntentDto } from './files.dto';

const ALLOWED_TYPES: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'application/pdf': ['.pdf'],
  'application/msword': ['.doc'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
};

@Injectable()
export class FilesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: AccessService,
  ) {}

  private storageRoot() {
    return process.env.FILE_STORAGE_PATH ?? '/data/nursemate';
  }

  async createIntent(user: AuthUser, dto: CreateUploadIntentDto) {
    const extensions = ALLOWED_TYPES[dto.mimeType];
    const extension = extname(dto.fileName).toLowerCase();
    if (!extensions || !extensions.includes(extension)) throw new UnsupportedMediaTypeException('FILE_TYPE_NOT_ALLOWED');
    if (/病历|身份证|患者|病情|诊疗|medical\s*record/i.test(dto.fileName)) {
      await this.prisma.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'file.blocked', targetType: 'file', result: 'FAILURE', reason: 'SENSITIVE_FILENAME' },
      });
      throw new ConflictException('SENSITIVE_CONTENT_PROHIBITED');
    }
    const file = await this.prisma.$transaction(async (tx) => {
      const created = await tx.fileObject.create({
        data: {
          id: randomUUID(),
          storageKey: `uploads/${user.id}/${randomUUID()}`,
          originalName: dto.fileName.trim(),
          mimeType: dto.mimeType,
          sizeBytes: BigInt(dto.sizeBytes),
          sha256: dto.sha256.toLowerCase(),
          purpose: dto.purpose,
          uploadedById: user.id,
        },
      });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'file.intent_create', targetType: 'file', targetId: created.id, result: 'SUCCESS', afterData: { purpose: dto.purpose, sizeBytes: dto.sizeBytes, mimeType: dto.mimeType } },
      });
      return created;
    });
    return {
      id: file.id,
      status: file.status,
      uploadUrl: `/api/v1/files/${file.id}/content`,
      uploadMethod: 'PUT',
      requiredContentType: 'application/octet-stream',
      expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    };
  }

  async uploadContent(user: AuthUser, fileId: string, content: Buffer) {
    const file = await this.prisma.fileObject.findFirst({ where: { id: fileId, uploadedById: user.id } });
    if (!file) throw new NotFoundException('RESOURCE_NOT_FOUND');
    if (file.status === 'READY') return { id: file.id, status: file.status };
    if (file.status !== 'PENDING') throw new ConflictException('FILE_STATE_CONFLICT');
    const digest = createHash('sha256').update(content).digest('hex');
    if (BigInt(content.length) !== file.sizeBytes || digest !== file.sha256) {
      await this.prisma.$transaction([
        this.prisma.fileObject.update({ where: { id: file.id }, data: { status: 'BLOCKED' } }),
        this.prisma.auditLog.create({
          data: { departmentId: user.departmentId, actorId: user.id, action: 'file.blocked', targetType: 'file', targetId: file.id, result: 'FAILURE', reason: 'SIZE_OR_DIGEST_MISMATCH' },
        }),
      ]);
      throw new ConflictException('FILE_VERIFICATION_FAILED');
    }
    const absolutePath = join(this.storageRoot(), file.storageKey);
    await mkdir(join(this.storageRoot(), 'uploads', user.id), { recursive: true });
    try {
      await writeFile(absolutePath, content, { flag: 'wx' });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
      const existing = await readFile(absolutePath);
      if (createHash('sha256').update(existing).digest('hex') !== digest) throw new ConflictException('FILE_STATE_CONFLICT');
    }
    return { id: file.id, uploaded: true };
  }

  async complete(user: AuthUser, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({ where: { id: fileId, uploadedById: user.id } });
    if (!file) throw new NotFoundException('RESOURCE_NOT_FOUND');
    if (file.status === 'READY') return this.reference(file);
    if (file.status !== 'PENDING') throw new ConflictException('FILE_STATE_CONFLICT');
    let content: Buffer;
    try {
      const absolutePath = join(this.storageRoot(), file.storageKey);
      const details = await stat(absolutePath);
      if (BigInt(details.size) !== file.sizeBytes) throw new Error('size');
      content = await readFile(absolutePath);
    } catch {
      throw new ConflictException('FILE_UPLOAD_INCOMPLETE');
    }
    if (createHash('sha256').update(content).digest('hex') !== file.sha256) {
      await this.prisma.fileObject.update({ where: { id: file.id }, data: { status: 'BLOCKED' } });
      throw new ConflictException('FILE_VERIFICATION_FAILED');
    }
    const ready = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.fileObject.update({ where: { id: file.id }, data: { status: 'READY', readyAt: new Date() } });
      await tx.auditLog.create({
        data: { departmentId: user.departmentId, actorId: user.id, action: 'file.ready', targetType: 'file', targetId: file.id, result: 'SUCCESS' },
      });
      return updated;
    });
    return this.reference(ready);
  }

  private reference(file: { id: string; originalName: string; mimeType: string; sizeBytes: bigint; status: string; purpose: string }) {
    return { id: file.id, fileName: file.originalName, mimeType: file.mimeType, sizeBytes: Number(file.sizeBytes), status: file.status, purpose: file.purpose };
  }

  async download(user: AuthUser, fileId: string) {
    const file = await this.prisma.fileObject.findFirst({
      where: { id: fileId, status: 'READY', uploadedBy: { departmentId: user.departmentId } },
    });
    if (!file) throw new NotFoundException('RESOURCE_NOT_FOUND');
    let allowed = file.uploadedById === user.id || user.role === 'HEAD_NURSE';
    if (!allowed && user.role === 'COORDINATOR') {
      allowed = await this.access.has(user, 'notice.stats')
        || await this.access.has(user, 'task.stats')
        || await this.access.has(user, 'task.review')
        || await this.access.has(user, 'report.export');
    }
    if (!allowed) {
      const [notice, task, submission] = await Promise.all([
        this.prisma.noticeVersionAttachment.findFirst({ where: { fileId, noticeVersion: { notice: { recipients: { some: { userId: user.id, excludedAt: null } } } } } }),
        this.prisma.taskAttachment.findFirst({ where: { fileId, task: { records: { some: { assigneeId: user.id, excludedAt: null } } } } }),
        this.prisma.taskSubmissionAttachment.findFirst({ where: { fileId, submission: { taskRecord: { assigneeId: user.id, excludedAt: null } } } }),
      ]);
      allowed = Boolean(notice || task || submission);
    }
    if (!allowed) throw new ForbiddenException('PERMISSION_DENIED');
    return { file, content: await readFile(join(this.storageRoot(), file.storageKey)) };
  }
}
