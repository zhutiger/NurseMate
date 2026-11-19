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

export class RecipientSelectionDto {
  @IsIn(['ALL_ACTIVE', 'GROUPS', 'USERS'])
  mode!: 'ALL_ACTIVE' | 'GROUPS' | 'USERS';

  @ValidateIf((value: RecipientSelectionDto) => value.mode === 'GROUPS')
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  groupIds?: string[];

  @ValidateIf((value: RecipientSelectionDto) => value.mode === 'USERS')
  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds?: string[];
}

export class CreateNoticeDto {
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

  @IsBoolean()
  requiresConfirmation!: boolean;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string | null;

  @ValidateNested()
  @Type(() => RecipientSelectionDto)
  recipientSelection!: RecipientSelectionDto;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @ArrayMaxSize(9)
  @IsUUID('4', { each: true })
  attachmentFileIds?: string[];
}

export class UpdateNoticeDto extends CreateNoticeDto {
  @IsOptional()
  @IsString()
  @MaxLength(255)
  changeReason?: string;

  @IsOptional()
  @IsBoolean()
  requireReconfirm?: boolean;
}

export class ConfirmNoticeDto {
  @IsInt()
  @Min(1)
  versionNo!: number;
}

export class NoticeListQueryDto {
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

  @IsOptional()
  @IsIn(['NORMAL', 'IMPORTANT', 'URGENT'])
  level?: 'NORMAL' | 'IMPORTANT' | 'URGENT';
}

export class MyNoticeListQueryDto {
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
  @IsIn(['UNSEEN', 'VIEWED', 'CONFIRMED', 'OVERDUE_UNSEEN', 'OVERDUE_UNCONFIRMED', 'RECONFIRM_REQUIRED'])
  status?: 'UNSEEN' | 'VIEWED' | 'CONFIRMED' | 'OVERDUE_UNSEEN' | 'OVERDUE_UNCONFIRMED' | 'RECONFIRM_REQUIRED';
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

export class RecipientPageQueryDto {
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
