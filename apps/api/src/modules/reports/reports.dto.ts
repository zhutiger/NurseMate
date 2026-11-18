import { Transform } from 'class-transformer';
import { IsIn, IsInt, IsObject, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateExportDto {
  @IsIn(['NOTICE_RECIPIENTS', 'TASK_RECORDS'])
  type!: 'NOTICE_RECIPIENTS' | 'TASK_RECORDS';

  @IsOptional()
  @IsObject()
  filters?: Record<string, unknown>;
}

export class AuditListQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  action?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  targetType?: string;
}
