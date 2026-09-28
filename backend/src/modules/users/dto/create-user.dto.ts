import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreateUserPersonDto } from "./create-user-person.dto.js";

export class CreateUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateUserPersonDto)
  person?: CreateUserPersonDto;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @IsUUID()
  roleId!: string;

  @IsOptional()
  @IsArray()
  @ArrayUnique()
  @IsUUID(undefined, { each: true })
  branchIds?: string[];
}
