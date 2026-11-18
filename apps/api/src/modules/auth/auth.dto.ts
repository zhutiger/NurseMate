import { IsIn, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(64)
  employeeNo!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(72)
  password!: string;

  @IsIn(['MINI_PROGRAM', 'H5', 'ADMIN_WEB'])
  clientPlatform!: 'MINI_PROGRAM' | 'H5' | 'ADMIN_WEB';

  @IsString()
  @MaxLength(128)
  deviceName!: string;
}
