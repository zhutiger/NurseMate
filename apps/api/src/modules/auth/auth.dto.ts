import { IsIn, IsNotEmpty, IsString, Matches, MaxLength, MinLength } from 'class-validator';

const platforms = ['MINI_PROGRAM', 'H5', 'ADMIN_WEB'] as const;

export class LoginDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  employeeNo!: string;

  @IsString() @IsNotEmpty() @MaxLength(72)
  password!: string;

  @IsIn(platforms)
  clientPlatform!: (typeof platforms)[number];

  @IsString() @MaxLength(128)
  deviceName!: string;
}

export class ActivateDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  employeeNo!: string;

  @IsString() @MinLength(6) @MaxLength(32)
  activationCode!: string;

  @IsString() @MinLength(10) @MaxLength(72) @Matches(/[A-Za-z]/) @Matches(/[0-9]/)
  password!: string;

  @IsIn(platforms)
  clientPlatform!: (typeof platforms)[number];

  @IsString() @MaxLength(128)
  deviceName!: string;
}

export class ResetPasswordDto {
  @IsString() @IsNotEmpty() @MaxLength(64)
  employeeNo!: string;

  @IsString() @MinLength(6) @MaxLength(32)
  resetCode!: string;

  @IsString() @MinLength(10) @MaxLength(72) @Matches(/[A-Za-z]/) @Matches(/[0-9]/)
  newPassword!: string;
}

export class RefreshDto {
  @IsString() @MinLength(20)
  refreshToken!: string;
}

export class AssociateWechatDto {
  @IsString() @IsNotEmpty() @MaxLength(128)
  code!: string;
}
