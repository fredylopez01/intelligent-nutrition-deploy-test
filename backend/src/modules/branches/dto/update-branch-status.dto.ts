import { IsBoolean } from "class-validator";

export class UpdateBranchStatusDto {
  @IsBoolean()
  active!: boolean;
}