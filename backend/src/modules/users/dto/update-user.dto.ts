import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { UpdatePersonProfileDto } from "../../persons/dto/update-person-profile.dto.js";

export class UpdateUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePersonProfileDto)
  person?: UpdatePersonProfileDto;
}
