import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';
import {
  AUTO_ROUTE_LENGTHS_M,
  OBJECT_TYPES,
  type AutoRouteLengthM,
  type CreateRouteObjectInput,
  type CreateRouteRequest,
  type Leg,
  type LineStringGeometry,
  type LngLat,
  type ObjectType,
  type Position,
} from '@petjada/shared';
import { ObjectContentDto } from './content.dto';

export class LngLatDto implements LngLat {
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;
}

/** Valida que el valor sigui una llista de tuples `[lon, lat]` vàlides. */
function IsPositionList(minLength: number, validationOptions?: ValidationOptions) {
  return (object: object, propertyName: string): void => {
    registerDecorator({
      name: 'isPositionList',
      target: object.constructor,
      propertyName,
      options: { message: `${propertyName} ha de ser una llista d'almenys ${minLength} coordenades [lon, lat]`, ...validationOptions },
      validator: {
        validate(value: unknown): boolean {
          if (!Array.isArray(value) || value.length < minLength) return false;
          return value.every(
            (p) =>
              Array.isArray(p) &&
              p.length >= 2 &&
              typeof p[0] === 'number' &&
              typeof p[1] === 'number' &&
              Math.abs(p[0]) <= 180 &&
              Math.abs(p[1]) <= 90,
          );
        },
      },
    });
  };
}

export class LineStringDto implements LineStringGeometry {
  @Equals('LineString')
  type!: 'LineString';

  @IsPositionList(2)
  @ArrayMaxSize(20000)
  coordinates!: Position[];
}

/** Petició de previsualització: `mode` decideix quins camps són obligatoris. */
export class PreviewRouteDto {
  @IsIn(['auto', 'manual'])
  mode!: 'auto' | 'manual';

  @IsBoolean()
  roundTrip!: boolean;

  // --- auto ---
  @IsOptional()
  @ValidateNested()
  @Type(() => LngLatDto)
  origin?: LngLatDto;

  @IsOptional()
  @IsIn([...AUTO_ROUTE_LENGTHS_M])
  targetLengthM?: AutoRouteLengthM;

  // --- manual ---
  @IsOptional()
  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(25)
  @ValidateNested({ each: true })
  @Type(() => LngLatDto)
  waypoints?: LngLatDto[];
}

export class CreateRouteObjectDto extends ObjectContentDto implements CreateRouteObjectInput {
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;

  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @IsOptional()
  @IsIn([...OBJECT_TYPES])
  type?: ObjectType;

  @IsOptional()
  @IsIn(['anada', 'tornada'])
  leg?: Leg;
}

export class CreateRouteDto implements CreateRouteRequest {
  @IsString()
  @MaxLength(80)
  name!: string;

  @IsString()
  @MaxLength(500)
  description!: string;

  @IsBoolean()
  isPublic!: boolean;

  @IsBoolean()
  roundTrip!: boolean;

  @ValidateNested()
  @Type(() => LineStringDto)
  geometry!: LineStringDto;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateRouteObjectDto)
  objects?: CreateRouteObjectDto[];
}

export class NearbyQueryDto {
  @Type(() => Number)
  @IsNumber()
  @Min(-90)
  @Max(90)
  lat!: number;

  @Type(() => Number)
  @IsNumber()
  @Min(-180)
  @Max(180)
  lon!: number;
}
