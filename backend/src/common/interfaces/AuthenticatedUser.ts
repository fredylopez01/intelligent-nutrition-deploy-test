export interface AuthenticatedUser {
  id: string;
  personId?: string;
  fullName?: string;
  email?: string | null;
  roleId?: string;
  active: boolean;
  mustChangePassword?: boolean;
  person?: {
    id: string;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
  };
  role: {
    id?: string;
    name: string;
  };
  branches?: Array<{ id: string; name: string }>;
}
