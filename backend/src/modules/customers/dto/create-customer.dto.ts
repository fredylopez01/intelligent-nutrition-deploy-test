import { Type } from "class-transformer";
import { IsOptional, IsUUID, ValidateNested } from "class-validator";
import { CreatePersonDto } from "../../persons/dto/create-person.dto.js";

export class CreateCustomerDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreatePersonDto)
  person?: CreatePersonDto;

  @IsOptional()
  @IsUUID()
  personId?: string;
}
