import { IsOptional, IsString, IsUrl, MaxLength, ValidateIf } from 'class-validator';
import { STORY_TEXT_MAX_LENGTH, type ObjectContentInput } from '@petjada/shared';

/** Contingut d'una fitxa. Es fa servir tant en crear la ruta com en editar-lo després. */
export class ObjectContentDto implements ObjectContentInput {
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(120)
  title?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(STORY_TEXT_MAX_LENGTH, { message: `El text de la fitxa no pot superar ${STORY_TEXT_MAX_LENGTH} caràcters` })
  storyText?: string | null;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_protocol: false }, { message: "La imatge de la fitxa ha de ser una URL" })
  @MaxLength(2048)
  storyImageUrl?: string | null;
}
