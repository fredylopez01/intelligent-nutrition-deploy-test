export class UserResponseDto {
  id!: string;
  fullName!: string;
  email!: string;
  role!: {
    id: string;
    name: string;
  };
  active!: boolean;
  mustChangePassword!: boolean;
  lastLoginAt!: Date | null;
  createdAt!: Date;
  updatedAt!: Date;
}
