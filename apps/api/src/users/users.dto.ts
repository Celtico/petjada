import { IsOptional, IsString, IsUrl, Length, ValidateIf } from 'class-validator';
import type { UpdateProfileRequest } from '@petjada/shared';

export class UpdateProfileDto implements UpdateProfileRequest {
  @IsOptional()
  @IsString()
  @Length(2, 40, { message: 'El nom ha de tenir entre 2 i 40 caràcters' })
  displayName?: string;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_protocol: true }, { message: "L'avatar ha de ser una URL" })
  avatarUrl?: string | null;
}
