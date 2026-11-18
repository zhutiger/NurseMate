import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

export const roles = ['HEAD_NURSE', 'COORDINATOR', 'NURSE'] as const;
export const userStatuses = ['PENDING_ACTIVATION', 'ACTIVE', 'LOCKED', 'DISABLED'] as const;
export const permissionCodes = [
  'notice.publish', 'notice.stats', 'notice.remind', 'notice.manage',
  'task.publish', 'task.stats', 'task.remind', 'task.review', 'task.manage',
  'user.manage', 'permission.manage', 'report.export', 'audit.view',
] as const;

export class UserListQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  page = 1;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  pageSize = 20;

  @IsOptional() @IsIn(roles)
  role?: (typeof roles)[number];

  @IsOptional() @IsIn(userStatuses)
  status?: (typeof userStatuses)[number];
}

export class CreateUserDto {
  @IsString() @MinLength(1) @MaxLength(64)
  employeeNo!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  name!: string;

  @IsIn(roles)
  role!: (typeof roles)[number];

  @IsOptional() @IsUUID()
  primaryGroupId?: string | null;
}

export class ImportUsersDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200)
  @ValidateNested({ each: true }) @Type(() => CreateUserDto)
  rows!: CreateUserDto[];
}

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(64)
  name?: string;

  @IsOptional() @IsIn(roles)
  role?: (typeof roles)[number];

  @IsOptional() @IsUUID()
  primaryGroupId?: string | null;

  @IsOptional() @IsIn(userStatuses)
  status?: (typeof userStatuses)[number];

  @IsOptional() @IsString() @MinLength(1) @MaxLength(255)
  reason?: string;
}

export class ActivationCodeDto {
  @IsIn(['ACTIVATE_ACCOUNT', 'RESET_PASSWORD'])
  purpose!: 'ACTIVATE_ACCOUNT' | 'RESET_PASSWORD';

  @IsString() @MinLength(1) @MaxLength(255)
  reason!: string;
}

export class ReplacePermissionsDto {
  @IsArray() @ArrayUnique() @IsIn(permissionCodes, { each: true })
  permissions!: (typeof permissionCodes)[number][];
}

export class RequiredReasonDto {
  @IsString() @MinLength(1) @MaxLength(255)
  reason!: string;
}

export class GroupDto {
  @IsString() @MinLength(1) @MaxLength(32)
  code!: string;

  @IsString() @MinLength(1) @MaxLength(64)
  name!: string;

  @IsOptional() @IsBoolean()
  enabled = true;
}
