import { ArrayMinSize, ArrayUnique, IsArray, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class ReminderRequestDto {
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('4', { each: true })
  targetUserIds?: string[];

  @IsArray()
  @ArrayUnique()
  @IsIn(['IN_APP', 'WECHAT_SUBSCRIBE', 'MANUAL'], { each: true })
  channels!: Array<'IN_APP' | 'WECHAT_SUBSCRIBE' | 'MANUAL'>;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  note?: string;
}
