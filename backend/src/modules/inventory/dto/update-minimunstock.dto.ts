import { Type } from "class-transformer";
import { IsInt, Min } from "class-validator";

export class UpdateMinimumStockDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  minimumStock!: number;
}
