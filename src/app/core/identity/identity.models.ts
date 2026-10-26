export interface UserSummary {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  department: string | null;
  position: string | null;
  managerId: string | null;
  enabled: boolean;
}

export interface GroupView {
  id: string;
  name: string;
  path: string;
}

export interface UserDetail extends UserSummary {
  roles: string[];
  groups: GroupView[];
}
