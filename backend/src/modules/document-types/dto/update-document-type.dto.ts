import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class UpdateDocumentTypeDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(20)
  code?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;
}
