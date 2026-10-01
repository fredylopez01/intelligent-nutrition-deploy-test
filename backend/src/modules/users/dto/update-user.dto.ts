import { Type } from "class-transformer";
import { IsOptional, ValidateNested } from "class-validator";
import { UpdatePersonDto } from "../../persons/dto/update-person.dto.js";

export class UpdateUserDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePersonDto)
  person?: UpdatePersonDto;
}
