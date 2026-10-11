import {
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from "class-validator";

export class UpdateCategoryDto {
  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name?: string;

  @ValidateIf((_object, value) => value !== undefined)
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description?: string;
}
