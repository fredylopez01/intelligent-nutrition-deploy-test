import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateCategoryDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(3)
  @MaxLength(100)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  description?: string;
}
