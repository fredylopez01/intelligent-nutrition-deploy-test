import { IsBoolean } from "class-validator";

export class UpdateCustomerStatusDto {
  @IsBoolean()
  active!: boolean;
}
