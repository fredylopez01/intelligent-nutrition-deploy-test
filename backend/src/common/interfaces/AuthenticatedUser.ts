export interface AuthenticatedUser {
  id: string;
  fullName: string;
  email: string;
  roleId: string;
  active: boolean;
  role: {
    name: string;
  };
}
