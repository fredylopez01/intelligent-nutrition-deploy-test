import { IsNotEmpty, IsUUID } from "class-validator";

export class ChangeUserRoleDto {
  @IsUUID()
  @IsNotEmpty()
  roleId!: string;
}
