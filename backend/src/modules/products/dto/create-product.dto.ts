import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  MaxLength,
} from "class-validator";

export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(150)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @Length(2, 50, {
    message: "referenceCode must be between 2 and 50 characters",
  })
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message:
      "referenceCode can only contain alphanumeric characters, hyphens and underscores",
  })
  referenceCode!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsUUID("4")
  categoryId!: string;

  @IsUUID("4")
  unitOfMeasureId!: string;

  @IsString()
  @Matches(/^\d+(\.\d{1,2})?$/, {
    message: "price must be a number with up to 2 decimals",
  })
  price!: string;
}
