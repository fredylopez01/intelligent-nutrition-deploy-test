import { Transform, Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from "class-validator";
import { NotificationType } from "../../../../generated/prisma/enums.js";

export class ListNotificationsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit: number = 20;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return value;
  })
  @IsBoolean()
  read?: boolean;

  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}
