import { IsEmail, IsString, Length, MaxLength } from 'class-validator';
import type { MagicLinkRequest, VerifyCodeRequest } from '@petjada/shared';

export class MagicLinkDto implements MagicLinkRequest {
  @IsEmail({}, { message: "L'adreça electrònica no és vàlida" })
  @MaxLength(254)
  email!: string;
}

export class VerifyCodeDto implements VerifyCodeRequest {
  @IsEmail({}, { message: "L'adreça electrònica no és vàlida" })
  @MaxLength(254)
  email!: string;

  @IsString()
  @Length(4, 12, { message: 'El codi ha de tenir 6 xifres' })
  code!: string;
}
