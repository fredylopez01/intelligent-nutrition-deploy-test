import { UserResponseDto } from "./user-response.dto.js";

export class PaginationMetaDto {
  page!: number;
  limit!: number;
  total!: number;
  totalPages!: number;
}

export class PaginatedUsersResponseDto {
  data!: UserResponseDto[];
  meta!: PaginationMetaDto;
  message?: string;
}
