export type Permission = 'READ' | 'WRITE' | 'DELETE' | 'MANAGE';
export type PrincipalType = 'USER' | 'GROUP' | 'ROLE';

export const PERMISSIONS: Permission[] = ['READ', 'WRITE', 'DELETE', 'MANAGE'];

export interface PathItem {
  id: string;
  name: string;
}

/** A folder as the caller sees it: their permission, the path from the root and the subfolders they can read. */
export interface FolderView {
  id: string;
  name: string;
  parentId: string | null;
  inheritAcl: boolean;
  permission: Permission;
  path: PathItem[];
  children: PathItem[];
}

export interface AclEntry {
  principalType: PrincipalType;
  principalId: string;
  permission: Permission;
}

export interface AclView {
  inheritAcl: boolean;
  entries: AclEntry[];
  /** What the folder receives from its ancestors; shown, not edited here. */
  inherited: AclEntry[];
}

export interface VersionView {
  id: string;
  label: string;
  major: number;
  minor: number;
  size: number;
  mimeType: string;
  fileName: string;
  sha256: string;
  createdBy: string;
  createdAt: string;
  comment: string | null;
}

/** An uploaded file, or a text written in the app. */
export type DocumentKind = 'FILE' | 'WRITTEN';

/** Where a written document stands; uploaded files have none. */
export type WrittenState = 'DRAFT' | 'IN_APPROVAL' | 'APPROVED' | 'REVISION';

/** The text being worked on, and whether the reader may change it right now. */
export interface DraftView {
  html: string;
  revision: number;
  updatedBy: string;
  updatedAt: string;
  editable: boolean;
}

export interface DocumentSummary {
  id: string;
  folderId: string;
  name: string;
  typeId: string | null;
  currentVersion: VersionView | null;
  checkedOutBy: string | null;
  checkedOutAt: string | null;
  updatedAt: string;
  kind: DocumentKind;
}

export interface DocumentView {
  id: string;
  folderId: string;
  name: string;
  typeId: string | null;
  metadata: Record<string, unknown>;
  checkedOutBy: string | null;
  checkedOutAt: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  permission: Permission;
  currentVersionId: string | null;
  /** Newest first. */
  versions: VersionView[];
  /** The request this document belongs to (spec §6), if any. */
  linkedInstanceId: string | null;
  /** Whether the caller can also reach it through its library folder; false when only the request lets them in. */
  inLibrary: boolean;
  kind: DocumentKind;
  state: WrittenState | null;
  /** Whether a text is being worked on (a first draft or a revision). */
  hasDraft: boolean;
}

/** A short-lived storage URL; inline only for types the server allows the browser to show. */
export interface ContentLink {
  url: string;
  fileName: string;
  mimeType: string;
  inline: boolean;
  expiresAt: string;
}

export interface FormRef {
  key: string;
  version: number;
}

export interface DocumentType {
  id: string;
  name: string;
  form: FormRef | null;
}

export interface UploadTicket {
  uploadId: string;
  url: string;
  method: string;
  headers: Record<string, string>;
  expiresAt: string;
}

export interface StartUpload {
  fileName: string;
  size: number;
  sha256: string;
  mimeType: string;
  folderId?: string;
  documentId?: string;
  instanceId?: string;
  staged?: boolean;
  name?: string;
  typeId?: string;
  metadata?: Record<string, unknown>;
  major?: boolean;
  comment?: string;
}

export interface SearchHit {
  document: DocumentSummary;
  folderName: string | null;
}

export interface SearchResults {
  items: SearchHit[];
  total: number;
  page: number;
  size: number;
}

export interface SearchOptions {
  folderId?: string;
  typeId?: string;
  page?: number;
  size?: number;
}

/** Folder permissions include the ones before them: MANAGE ⊃ DELETE ⊃ WRITE ⊃ READ. */
export function covers(have: Permission | null | undefined, need: Permission): boolean {
  return !!have && PERMISSIONS.indexOf(have) >= PERMISSIONS.indexOf(need);
}

export function formatSize(bytes: number): string {
  if (bytes < 1000) {
    return `${bytes} B`;
  }
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = -1;
  do {
    value /= 1024;
    unit++;
  } while (value >= 1000 && unit < units.length - 1);
  return `${value.toFixed(1)} ${units[unit]}`;
}
