import { IsBoolean } from "class-validator";

export class UpdateProductStatusDto {
  @IsBoolean()
  active!: boolean;
}
