export type UserRole = 'admin' | 'user';
export type UserStatus = 'active' | 'pending' | 'disabled';

export interface User {
  id: string;
  email: string;
  fullName: string;
  username: string;
  department: string;
  position: string;
  role: UserRole;
  status: UserStatus;
  signaturePngUrl?: string;
  createdAt: string;
  updatedAt: string;
}

export const DOCUMENT_CATEGORIES = [
  'Resolution',
  'Memorandum',
  'Letters',
  'Advisories',
  'Others',
] as const;

export type StandardDocumentCategory = (typeof DOCUMENT_CATEGORIES)[number];
export type DocumentCategory = StandardDocumentCategory | (string & {});

export type DocumentStatus =
  | 'draft'
  | 'pending_signatures'
  | 'in_progress'
  | 'completed'
  | 'rejected'
  | 'cancelled'
  | 'archived';

export type SigningOrderType = 'sequential' | 'parallel';

export type SignatoryStatus = 'pending' | 'signed' | 'rejected' | 'waiting';

export interface DocumentSignatory {
  id: string;
  documentId: string;
  userId: string;
  user?: User;
  signingOrder: number;
  status: SignatoryStatus;
  signedAt?: string;
  rejectionReason?: string;
}

export interface SignatureField {
  id: string;
  documentId: string;
  signatoryId: string;
  userId: string;
  pageNumber: number;
  xPercent: number; // 0 - 100 percentage of page width
  yPercent: number; // 0 - 100 percentage of page height
  widthPercent: number;
  heightPercent: number;
  fieldLabel: string;
  isRequired: boolean;
  isSigned: boolean;
}

export interface SignatureRecord {
  id: string;
  documentId: string;
  signatoryId: string;
  userId: string;
  userName: string;
  userEmail: string;
  userPosition: string;
  signatureFieldId: string;
  signaturePngData: string; // base64 data url or file url
  pageNumber: number;
  xPercent: number;
  yPercent: number;
  widthPercent: number;
  heightPercent: number;
  signedAt: string;
  verificationHash: string;
  ipAddress?: string;
}

export interface DocumentEvent {
  id: string;
  documentId: string;
  documentTitle?: string;
  userId: string;
  userName: string;
  userEmail: string;
  action:
    | 'DOCUMENT_UPLOADED'
    | 'SIGNATURE_REQUEST_CREATED'
    | 'SIGNATORY_ADDED'
    | 'SIGNATORY_REMOVED'
    | 'DOCUMENT_OPENED'
    | 'SIGNATURE_SUBMITTED'
    | 'SIGNATURE_CONFIRMED'
    | 'DOCUMENT_COMPLETED'
    | 'DOCUMENT_CANCELLED'
    | 'DOCUMENT_REJECTED'
    | 'DOCUMENT_DOWNLOADED'
    | 'DOCUMENT_AMENDED';
  details: string;
  timestamp: string;
  ipAddress?: string;
  metadata?: Record<string, any>;
}

export interface DocumentVersion {
  id: string;
  documentId: string;
  versionNumber: number;
  pdfUrl: string;
  createdBy: string;
  changeNotes: string;
  createdAt: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  description: string;
  category: string;
  referenceNumber: string;
  deadline?: string;
  instructions?: string;
  status: DocumentStatus;
  signingOrderType: SigningOrderType;
  initiatorId: string;
  initiator?: User;
  signatories: DocumentSignatory[];
  fields: SignatureField[];
  signatures: SignatureRecord[];
  originalPdfUrl: string;
  finalPdfUrl?: string;
  currentVersion: number;
  pageCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AppNotification {
  id: string;
  userId: string;
  title: string;
  message: string;
  link?: string;
  read: boolean;
  createdAt: string;
}

export interface OrganizationSettings {
  organizationName: string;
  organizationEmail: string;
  defaultDeadlineDays: number;
  sequentialDefault: boolean;
  requireAdminApproval: boolean;
  allowSignatureDrawing: boolean;
  enforceTransparentPng: boolean;
}

export interface AuthSession {
  user: User;
  token: string;
}
