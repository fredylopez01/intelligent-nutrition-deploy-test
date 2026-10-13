export class ProductResponseDto {
  id!: string;
  name!: string;
  referenceCode!: string;
  description!: string | null;
  categoryId!: string;
  unitOfMeasureId!: string;
  price!: string;
  active!: boolean;
  primaryImageUrl!: string | null;
  createdAt!: Date;
  updatedAt!: Date;
}
