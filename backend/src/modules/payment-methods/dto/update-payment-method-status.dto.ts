import { IsBoolean } from "class-validator";

export class UpdatePaymentMethodStatusDto {
  @IsBoolean()
  active!: boolean;
}
