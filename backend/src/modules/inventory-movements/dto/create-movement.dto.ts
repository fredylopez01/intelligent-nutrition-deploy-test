import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateNested,
} from "class-validator";

export enum DirectMovementType {
  ENTRY = "ENTRY",
  EXIT = "EXIT",
}

export class MovementItemDto {
  @IsUUID()
  productId: string;

  @IsInt()
  @Min(1)
  quantity: number;

  @IsDateString(
    { strict: true },
    { message: "expirationDate must be a valid ISO 8601 date (YYYY-MM-DD)" },
  )
  expirationDate: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;
}

export class CreateMovementDto {
  @IsUUID()
  branchId: string;

  @IsEnum(DirectMovementType)
  movementType: DirectMovementType;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  observation?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MovementItemDto)
  items: MovementItemDto[];
}
