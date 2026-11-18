import { Type } from 'class-transformer';
import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

class RecipientSelectionDto {
  @IsIn(['USERS'])
  mode!: 'USERS';

  @IsArray()
  @ArrayUnique()
  @IsUUID('4', { each: true })
  userIds!: string[];
}

export class CreateNoticeDto {
  @IsString()
  @MaxLength(200)
  title!: string;

  @IsString()
  @MaxLength(20000)
  content!: string;

  @IsIn(['NORMAL', 'IMPORTANT', 'URGENT'])
  level!: 'NORMAL' | 'IMPORTANT' | 'URGENT';

  @IsBoolean()
  requiresConfirmation!: boolean;

  @IsOptional()
  @IsDateString()
  deadlineAt?: string;

  @ValidateNested()
  @Type(() => RecipientSelectionDto)
  recipientSelection!: RecipientSelectionDto;
}

export class ConfirmNoticeDto {
  @IsInt()
  @Min(1)
  versionNo!: number;
}
