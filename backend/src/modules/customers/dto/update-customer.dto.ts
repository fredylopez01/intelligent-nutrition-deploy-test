import { Type } from "class-transformer";
import { UpdateCustomerPersonDto } from "./update-customer-person.dto.js";
import { IsOptional, ValidateNested } from "class-validator";

export class UpdateCustomerDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateCustomerPersonDto)
  person?: UpdateCustomerPersonDto;
}
