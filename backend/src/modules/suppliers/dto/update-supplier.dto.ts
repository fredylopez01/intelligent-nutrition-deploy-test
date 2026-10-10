import { Transform, Type } from "class-transformer";
import {
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from "class-validator";
import { UpdatePersonProfileDto } from "../../persons/dto/update-person-profile.dto.js";

export class UpdateSupplierDto {
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdatePersonProfileDto)
  person?: UpdatePersonProfileDto;

  @IsOptional()
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  commercialName?: string;
}
