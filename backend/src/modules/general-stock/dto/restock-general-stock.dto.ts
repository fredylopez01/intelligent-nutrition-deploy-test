import { Transform } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsString,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum RestockMovementType {
  ADJUSTMENT_ENTRY = "ADJUSTMENT_ENTRY",
  ADJUSTMENT_EXIT = "ADJUSTMENT_EXIT",
}

export class RestockGeneralStockDto {
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsEnum(RestockMovementType)
  movementType!: RestockMovementType;

  @Transform(({ value }): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
