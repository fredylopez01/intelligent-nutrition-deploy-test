import { Transform, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { CreateSupplierPersonDto } from "./create-supplier-person.dto.js";

export class CreateSupplierDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => CreateSupplierPersonDto)
  person?: CreateSupplierPersonDto;

  @IsOptional()
  @IsUUID()
  personId?: string;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  commercialName!: string;
}
