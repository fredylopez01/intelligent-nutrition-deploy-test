import { Type } from "class-transformer";
import {
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
} from "class-validator";

const MOVEMENT_TYPES = [
  "ENTRY",
  "EXIT",
  "ADJUSTMENT_ENTRY",
  "ADJUSTMENT_EXIT",
  "TRANSFER",
] as const;

export class ListInventoryMovementsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @IsUUID()
  branchId?: string;

  @IsOptional()
  @IsUUID()
  productId?: string;

  @IsOptional()
  @IsIn(MOVEMENT_TYPES)
  movementType?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "from must be a date in YYYY-MM-DD format",
  })
  from?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: "to must be a date in YYYY-MM-DD format",
  })
  to?: string;

  @IsOptional()
  @IsUUID()
  userId?: string;
}
