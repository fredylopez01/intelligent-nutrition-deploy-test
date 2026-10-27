import { Transform } from "class-transformer";
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from "class-validator";

export enum DirectMovementType {
  ENTRY = "ENTRY",
  EXIT = "EXIT",
}

const trim = ({ value }: { value: unknown }): unknown =>
  typeof value === "string" ? value.trim() : value;

export class CreateMovementDto {
  @IsUUID()
  branchId!: string;

  @IsUUID()
  productId!: string;

  @IsEnum(DirectMovementType)
  movementType!: DirectMovementType;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsDateString(
    { strict: true },
    { message: "expirationDate must be a valid ISO 8601 date (YYYY-MM-DD)" },
  )
  expirationDate?: string;

  @Transform(trim)
  @ValidateIf(
    (dto: CreateMovementDto) =>
      dto.movementType === DirectMovementType.EXIT ||
      dto.observation !== undefined,
  )
  @IsString()
  @MinLength(3)
  @MaxLength(500)
  observation?: string;
}
