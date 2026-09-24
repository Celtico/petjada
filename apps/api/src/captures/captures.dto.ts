import { IsNumber, IsUUID, Max, Min } from 'class-validator';
import type { CaptureRequest } from '@petjada/shared';

export class CaptureDto implements CaptureRequest {
  @IsUUID()
  objectId!: string;

  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsNumber()
  @Min(0)
  accuracy!: number;

  @IsNumber()
  @Min(0)
  timestamp!: number;
}
