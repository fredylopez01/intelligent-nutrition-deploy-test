import { IsOptional, IsUUID } from "class-validator";

export class AvailabilityQueryDto {
  @IsUUID("4")
  productId!: string;

  @IsOptional()
  @IsUUID("4")
  excludeBranchId?: string;
}
