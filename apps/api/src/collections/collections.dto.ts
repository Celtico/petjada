import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import type { AssignCollectionObjectsRequest, PolygonGeometry, Position, UpsertCollectionRequest } from '@petjada/shared';

function isPosition(p: unknown): boolean {
  return (
    Array.isArray(p) &&
    p.length >= 2 &&
    typeof p[0] === 'number' &&
    typeof p[1] === 'number' &&
    Math.abs(p[0]) <= 180 &&
    Math.abs(p[1]) <= 90
  );
}

/** Anells d'un polígon GeoJSON: cada anell té ≥ 4 posicions i és tancat. */
function IsPolygonRings(validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isPolygonRings',
      target: object.constructor,
      propertyName,
      options: { message: 'La zona ha de ser un polígon GeoJSON vàlid (anell tancat de 4 punts o més)', ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value) || value.length < 1 || value.length > 10) return false;
          return value.every((ring) => {
            if (!Array.isArray(ring) || ring.length < 4 || ring.length > 5000) return false;
            if (!ring.every(isPosition)) return false;
            const first = ring[0] as Position;
            const last = ring[ring.length - 1] as Position;
            return first[0] === last[0] && first[1] === last[1];
          });
        },
      },
    });
  };
}

export class PolygonDto implements PolygonGeometry {
  @Equals('Polygon')
  type!: 'Polygon';

  @IsPolygonRings()
  coordinates!: Position[][];
}

export class UpsertCollectionDto implements UpsertCollectionRequest {
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @ValidateNested()
  @Type(() => PolygonDto)
  zone!: PolygonDto;

  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsUrl({ require_protocol: false })
  @MaxLength(2048)
  coverImageUrl?: string | null;

  @IsInt()
  @Min(0)
  @Max(100000)
  bonusPoints!: number;
}

export class AssignObjectsDto implements AssignCollectionObjectsRequest {
  @IsArray()
  @ArrayMinSize(0)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  objectIds!: string[];
}
