import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from "class-validator";

export class UpdateProductDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsUUID("4")
  categoryId?: string;

  @IsOptional()
  @IsUUID("4")
  unitOfMeasureId?: string;

  @IsOptional()
  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: "price must be a number with up to 2 decimals",
  })
  price?: string;

  @IsOptional()
  @IsString()
  referenceCode?: string;
}
