import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Min,
  ValidateNested,
} from "class-validator";

export class ReceivePurchaseItemDto {
  @IsUUID("4")
  purchaseDetailId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  receivedQuantity!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  observation?: string;
}

export class ReceivePurchaseDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ReceivePurchaseItemDto)
  items!: ReceivePurchaseItemDto[];
}
