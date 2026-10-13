import { IsBoolean, IsInt, IsOptional, Max, Min } from "class-validator";

export class PatchImageDto {
  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsInt()
  @Min(0)
  @Max(4)
  @IsOptional()
  sortOrder?: number;
}
