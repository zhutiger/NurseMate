import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class AssigneeSelectionDto {
  @IsIn(['ALL_ACTIVE', 'GROUPS', 'USERS'])
  mode!: 'ALL_ACTIVE' | 'GROUPS' | 'USERS';

  @ValidateIf((value: AssigneeSelectionDto) => value.mode === 'GROUPS')
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ValidateIf((value: AssigneeSelectionDto) => value.mode === 'USERS')
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds?: string[];
}

export class CreateTaskDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(20000)
  content!: string;

  @IsIn(['NORMAL', 'IMPORTANT', 'URGENT'])
  level!: 'NORMAL' | 'IMPORTANT' | 'URGENT';

  @IsIn(['SIMPLE', 'REVIEW'])
  completionMode!: 'SIMPLE' | 'REVIEW';

  @IsBoolean()
  feedbackRequired!: boolean;

  @IsBoolean()
  attachmentRequired!: boolean;

  @IsDateString()
  deadlineAt!: string;

  @ValidateNested()
  @Type(() => AssigneeSelectionDto)
  assigneeSelection!: AssigneeSelectionDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(9)
  @IsUUID('4', { each: true })
  attachmentFileIds?: string[];
}

export class SubmitTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(9)
  @IsUUID('4', { each: true })
  attachmentFileIds?: string[];
}

export class ReviewTaskDto {
  @IsUUID()
  submissionId!: string;

  @IsIn(['APPROVE', 'RETURN'])
  action!: 'APPROVE' | 'RETURN';

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  comment?: string;
}

export class TaskListQueryDto {
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
  @IsIn(['DRAFT', 'PUBLISHED', 'CLOSED', 'WITHDRAWN', 'CANCELLED'])
  status?: 'DRAFT' | 'PUBLISHED' | 'CLOSED' | 'WITHDRAWN' | 'CANCELLED';
}

export class MyTaskListQueryDto {
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
  @IsIn(['PENDING', 'SUBMITTED', 'RETURNED', 'APPROVED', 'COMPLETED', 'OVERDUE_PENDING', 'OVERDUE_RETURNED'])
  status?: string;
}

export class TaskRecordPageQueryDto {
  @Transform(({ value }) => Number(value ?? 1))
  @IsInt()
  @Min(1)
  page = 1;

  @Transform(({ value }) => Number(value ?? 20))
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize = 20;
}

export class RequiredReasonDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  reason!: string;
}

export class OptionalReasonDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  reason?: string;
}
