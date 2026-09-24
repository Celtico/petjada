import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsNumber, Max, Min, ValidateNested } from 'class-validator';
import type { AppendTrackRequest, TrackPointDto } from '@petjada/shared';

export class TrackPointInputDto implements TrackPointDto {
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

export class AppendTrackDto implements AppendTrackRequest {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => TrackPointInputDto)
  points!: TrackPointInputDto[];
}
