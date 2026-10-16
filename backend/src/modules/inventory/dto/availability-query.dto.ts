import { IsUUID } from "class-validator";

export class AvailabilityQueryDto {
  @IsUUID("4")
  productId!: string;
}
