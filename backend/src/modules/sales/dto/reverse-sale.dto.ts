import { Transform } from "class-transformer";
import { IsNotEmpty, IsString, MinLength } from "class-validator";

export class ReverseSaleDto {
  @IsString()
  @IsNotEmpty()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @MinLength(10, {
    message: "reason must contain at least 10 characters.",
  })
  reason!: string;
}
