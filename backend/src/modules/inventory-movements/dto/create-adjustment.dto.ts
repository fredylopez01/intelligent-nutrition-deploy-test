import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";

export enum AdjustmentType {
  ENTRY = "ENTRY",
  EXIT = "EXIT",
}

export class AdjustmentItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsDateString(
    { strict: true },
    { message: "expirationDate must be a valid ISO 8601 date (YYYY-MM-DD)" },
  )
  expirationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class CreateAdjustmentDto {
  @IsUUID()
  branchId: string;

  @IsEnum(AdjustmentType)
  adjustmentType: AdjustmentType;

  @IsString()
  @MinLength(3)
  @MaxLength(500)
  reason: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => AdjustmentItemDto)
  items: AdjustmentItemDto[];
}
