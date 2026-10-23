import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export class CountItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(0)
  physicalQuantity: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class UpdateCountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountItemDto)
  counts: CountItemDto[];
}
