import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { IsDecimalString } from "./is-decimal-string.validator.js";

export class CreatePurchaseItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @Min(1)
  @IsNotEmpty()
  requestedQuantity!: number;

  @IsDecimalString({ message: "unitPrice must be a decimal string (e.g. \"98000.00\")" })
  @IsNotEmpty()
  @Matches(/^\d+\.\d{2}$/, {
    message: "unitPrice must have exactly 2 decimal places",
  })
  unitPrice!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string | null;
}

export class CreatePurchaseDto {
  @IsUUID()
  @IsNotEmpty()
  supplierId!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreatePurchaseItemDto)
  items!: CreatePurchaseItemDto[];
}
