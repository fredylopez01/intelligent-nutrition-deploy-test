import { IsNotEmpty, IsString, MaxLength, MinLength } from "class-validator";

export class CreateUnitMeasureDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(5)
  @MaxLength(50)
  name!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(10)
  abreviation!: string;
}
