import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

export enum AdjustmentMovementType {
  ADJUSTMENT_ENTRY = "ADJUSTMENT_ENTRY",
  ADJUSTMENT_EXIT = "ADJUSTMENT_EXIT",
}

export class CreateAdjustmentDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  productId!: string;

  @IsEnum(AdjustmentMovementType)
  movementType!: AdjustmentMovementType;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: "expirationDate must be a valid ISO 8601 date (YYYY-MM-DD)" },
  )
  expirationDate?: string;

  @Transform(({ value }): unknown =>
    typeof value === "string" ? value.trim() : value,
  )
  @IsString()
  @MinLength(10)
  @MaxLength(500)
  reason!: string;
}
