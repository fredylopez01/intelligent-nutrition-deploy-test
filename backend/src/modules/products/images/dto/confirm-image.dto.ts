import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
} from "class-validator";
import { SUPPORTED_MIME_TYPES } from "../../../storage/magic-bytes.util.js";

const MAX_FILE_SIZE = 5 * 1024 * 1024;

export class ConfirmImageDto {
  @IsString()
  @MaxLength(500)
  storageKey!: string;

  @IsUrl()
  @MaxLength(2000)
  url!: string;

  @IsString()
  @MaxLength(255)
  fileName!: string;

  @IsIn(SUPPORTED_MIME_TYPES)
  mimeType!: string;

  @IsInt()
  @Min(1)
  @Max(MAX_FILE_SIZE)
  sizeBytes!: number;

  @IsBoolean()
  @IsOptional()
  isPrimary?: boolean;

  @IsInt()
  @Min(0)
  @Max(4)
  @IsOptional()
  sortOrder?: number;
}
