import { Type } from "class-transformer";
import {
  ArrayUnique,
  IsArray,
  IsOptional,
  IsUUID,
  ValidateNested,
} from "class-validator";
import { CreatePersonDto } from "../../persons/dto/create-person.dto.js";

export class CreateUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePersonDto)
  person?: CreatePersonDto;

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
