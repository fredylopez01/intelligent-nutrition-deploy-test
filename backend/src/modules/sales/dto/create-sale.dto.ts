import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";
import { IsMoneyString } from "./is-money-string.validator.js";

export class CreateSaleItemDto {
  @IsUUID()
  @IsNotEmpty()
  productId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsMoneyString({
    message: 'discountAmount must be a decimal string (e.g. "0.00")',
  })
  @Matches(/^\d+\.\d{2}$/, {
    message: "discountAmount must have exactly 2 decimal places",
  })
  discountAmount?: string;

  @IsOptional()
  @IsMoneyString({
    message: 'taxAmount must be a decimal string (e.g. "0.00")',
  })
  @Matches(/^\d+\.\d{2}$/, {
    message: "taxAmount must have exactly 2 decimal places",
  })
  taxAmount?: string;
}

export class CreateSalePaymentDto {
  @IsUUID()
  @IsNotEmpty()
  paymentMethodId!: string;

  @IsMoneyString({
    message: 'amount must be a decimal string (e.g. "290000.00")',
  })
  @Matches(/^\d+\.\d{2}$/, {
    message: "amount must have exactly 2 decimal places",
  })
  amount!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string | null;
}

export class CreateSaleDto {
  @IsUUID()
  @IsNotEmpty()
  branchId!: string;

  @IsOptional()
  @IsUUID()
  customerId?: string | null;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSaleItemDto)
  items!: CreateSaleItemDto[];

  @IsOptional()
  @IsMoneyString({
    message: 'discountAmount must be a decimal string (e.g. "0.00")',
  })
  @Matches(/^\d+\.\d{2}$/, {
    message: "discountAmount must have exactly 2 decimal places",
  })
  discountAmount?: string;

  @IsOptional()
  @IsMoneyString({
    message: 'taxAmount must be a decimal string (e.g. "0.00")',
  })
  @Matches(/^\d+\.\d{2}$/, {
    message: "taxAmount must have exactly 2 decimal places",
  })
  taxAmount?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateSalePaymentDto)
  payments!: CreateSalePaymentDto[];
}
