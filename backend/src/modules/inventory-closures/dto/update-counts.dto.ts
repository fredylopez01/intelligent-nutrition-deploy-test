import { Transform, Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
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
  productId!: string;

  @IsDateString(
    { strict: true },
    { message: "expirationDate must be a valid ISO 8601 date (YYYY-MM-DD)" },
  )
  expirationDate!: string;

  @IsInt()
  @Min(0)
  physicalQuantity!: number;

  @IsOptional()
  @Transform(({ value }): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class UpdateCountsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CountItemDto)
  items!: CountItemDto[];
}
