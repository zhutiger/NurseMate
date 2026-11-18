import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class AssigneeSelectionDto {
  @IsIn(['USERS'])
  mode!: 'USERS';

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class CreateTaskDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
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
}

export class SubmitTaskDto {
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  feedback?: string;
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
