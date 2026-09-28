import { IsBoolean } from "class-validator";

export class UpdateDocumentTypeStatusDto {
  @IsBoolean()
  active!: boolean;
}
