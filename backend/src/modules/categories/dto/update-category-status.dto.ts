import { IsBoolean } from "class-validator";

export class UpdateCategoryStatusDto {
  @IsBoolean()
  active!: boolean;
}
