import { IsBoolean, IsDateString, IsOptional } from "class-validator";

export class UpdateUserBranchDto {
  @IsBoolean()
  active!: boolean;

  @IsOptional()
  @IsDateString()
  endDate?: string;
}
