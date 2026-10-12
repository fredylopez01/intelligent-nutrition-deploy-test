import { IsBoolean } from "class-validator";

export class UpdateUnitMeasureStatusDto {
  @IsBoolean()
  active!: boolean;
}
