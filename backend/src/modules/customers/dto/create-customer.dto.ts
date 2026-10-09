import { Type } from "class-transformer";
import { IsOptional, IsUUID, ValidateNested } from "class-validator";
import { CreateCustomerPersonDto } from "./create-customer-person.dto.js";

export class CreateCustomerDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateCustomerPersonDto)
  person?: CreateCustomerPersonDto;

  @IsOptional()
  @IsUUID()
  personId?: string;
}