import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, Matches, MaxLength } from "class-validator";

export class CreatePaymentMethodDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(30)
  @Matches(/^[A-Z0-9_]+$/)
  code!: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;
}
