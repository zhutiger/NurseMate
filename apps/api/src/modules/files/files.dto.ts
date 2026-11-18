import { Equals, IsBoolean, IsIn, IsInt, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateUploadIntentDto {
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsString()
  @MaxLength(128)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(10 * 1024 * 1024)
  sizeBytes!: number;

  @IsString()
  @Matches(/^[a-fA-F0-9]{64}$/)
  sha256!: string;

  @IsIn(['NOTICE_ATTACHMENT', 'TASK_ATTACHMENT', 'TASK_SUBMISSION'])
  purpose!: 'NOTICE_ATTACHMENT' | 'TASK_ATTACHMENT' | 'TASK_SUBMISSION';

  @IsBoolean()
  @Equals(true)
  contentPolicyAccepted!: true;
}
