import { IsUUID } from "class-validator";

export class AssignUserBranchDto {
  @IsUUID()
  branchId!: string;
}
