import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from "class-validator";

export enum BranchInventorySortBy {
  NAME = "name",
  QUANTITY = "quantity",
  REFERENCE_CODE = "referenceCode",
}

export enum SortOrder {
  ASC = "asc",
  DESC = "desc",
}

export class ListBranchInventoryQueryDto {
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
  @IsString()
  search?: string;

  @IsOptional()
  @IsUUID("4")
  categoryId?: string;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  lowStock?: boolean;

  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  productActive?: boolean = true;

  @IsOptional()
  @IsEnum(BranchInventorySortBy)
  sortBy: BranchInventorySortBy = BranchInventorySortBy.NAME;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder: SortOrder = SortOrder.ASC;
}
