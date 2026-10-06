export class UserResponseDto {
  id!: string;
  personId!: string;
  person!: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address: string | null;
  };
  role!: {
    id: string;
    name: string;
  };
  branches!: Array<{ id: string; name: string }>;
  active!: boolean;
  mustChangePassword!: boolean;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
