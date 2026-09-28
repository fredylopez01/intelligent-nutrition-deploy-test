import { Type } from "class-transformer";
import { IsBoolean, IsOptional, IsUUID, ValidateNested } from "class-validator";
import { UpdatePersonDto } from "../../persons/dto/update-person.dto.js";

export class UpdateUserDto {
  @IsOptional()
  @IsUUID()
  roleId?: string;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePersonDto)
  person?: UpdatePersonDto;
}
