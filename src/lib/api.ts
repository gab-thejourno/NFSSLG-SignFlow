import type {
  User,
  DocumentItem,
  DocumentEvent,
  AppNotification,
  OrganizationSettings,
  SignatureField,
} from '../types';
import { supabaseApi } from './supabaseApi';
import { isSupabaseConfigured } from './supabaseClient';

export { isSupabaseConfigured };

// Authentication
export async function apiLogin(email: string, password: string): Promise<{ user: User; token: string }> {
  return supabaseApi.login(email, password);
}

export async function apiRegister(userData: {
  fullName: string;
  email: string;
  password: string;
  department: string;
  position: string;
  username?: string;
}): Promise<{ user: User; requiresApproval: boolean; sessionActive: boolean; message: string }> {
  return supabaseApi.register(userData);
}

export async function apiLogout(): Promise<void> {
  return supabaseApi.logout();
}

export async function apiGetMe(): Promise<{ user: User }> {
  return supabaseApi.getMe();
}

export async function apiUpdateProfile(updates: Partial<User>): Promise<{ user: User }> {
  return supabaseApi.updateProfile(updates);
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return supabaseApi.changePassword(currentPassword, newPassword);
}

// Users
export async function apiGetUsers(): Promise<{ users: User[] }> {
  return supabaseApi.getUsers();
}

export async function apiUpdateUser(id: string, updates: Partial<User>): Promise<{ user: User }> {
  return supabaseApi.updateUser(id, updates);
}

// Documents
export async function apiGetDocuments(params?: {
  scope?: string;
  filterStatus?: string;
  search?: string;
}): Promise<{ documents: DocumentItem[] }> {
  return supabaseApi.getDocuments(params);
}

export async function apiGetDocument(id: string): Promise<{ document: DocumentItem }> {
  return supabaseApi.getDocument(id);
}

export async function apiUploadPdf(
  file?: File,
  templateData?: {
    templateTitle: string;
    templateRef: string;
    category: string;
    signers?: string[];
  }
): Promise<{ fileUrl: string; filename: string; size?: number; pageCount: number }> {
  return supabaseApi.uploadPdf(file, templateData);
}

export async function apiCreateDocument(data: {
  title: string;
  description?: string;
  category: string;
  referenceNumber?: string;
  deadline?: string;
  instructions?: string;
  signingOrderType: 'sequential' | 'parallel';
  signatoryUserIds: string[];
  fields?: Partial<SignatureField>[];
  pdfUrl: string;
}): Promise<{ document: DocumentItem }> {
  return supabaseApi.createDocument(data);
}

export async function apiSigneePlaceField(
  docId: string,
  coordinates: {
    pageNumber: number;
    xPercent: number;
    yPercent: number;
    widthPercent?: number;
    heightPercent?: number;
  }
): Promise<{ success: boolean; document: DocumentItem; field: SignatureField }> {
  return supabaseApi.signeePlaceField(docId, coordinates);
}

export async function apiSignDocument(
  docId: string,
  payload: {
    signaturePng?: string;
    signatureFile?: File;
    fieldId?: string;
    coordinates?: {
      pageNumber: number;
      xPercent: number;
      yPercent: number;
      widthPercent: number;
      heightPercent: number;
    };
  }
): Promise<{ success: boolean; document: DocumentItem; signature: any; completed: boolean }> {
  return supabaseApi.signDocument(docId, payload);
}

export async function apiUpdateDocumentFields(
  docId: string,
  fields: SignatureField[]
): Promise<{ document: DocumentItem }> {
  return supabaseApi.updateDocumentFields(docId, fields);
}

export async function apiCancelDocument(docId: string, _reason?: string): Promise<{ document: DocumentItem }> {
  return supabaseApi.cancelDocument(docId);
}

export async function apiRejectDocument(docId: string, reason?: string): Promise<{ document: DocumentItem }> {
  return supabaseApi.rejectDocument(docId, reason);
}

// Personal Signature Upload & Background Removal
export async function apiUploadSignaturePng(dataUrlOrFile: string | File): Promise<{ url: string }> {
  return supabaseApi.uploadSignaturePng(dataUrlOrFile);
}

// Audit Events
export async function apiGetEvents(): Promise<{ events: DocumentEvent[] }> {
  return supabaseApi.getEvents();
}

// Notifications
export async function apiGetNotifications(): Promise<{ notifications: AppNotification[] }> {
  return supabaseApi.getNotifications();
}

export async function apiMarkNotificationRead(id: string): Promise<{ success: boolean }> {
  return supabaseApi.markNotificationRead(id);
}

export async function apiMarkAllNotificationsRead(): Promise<{ success: boolean }> {
  return supabaseApi.markAllNotificationsRead();
}

// Settings
export async function apiGetSettings(): Promise<{ settings: OrganizationSettings }> {
  return supabaseApi.getSettings();
}

export async function apiUpdateSettings(
  settings: Partial<OrganizationSettings>
): Promise<{ settings: OrganizationSettings }> {
  return supabaseApi.updateSettings(settings);
}

// Realtime listener (Supabase Postgres Changes + UI sync)
export function subscribeToRealtime(userId: string | undefined, onEvent: (event: any) => void): () => void {
  return supabaseApi.subscribeToRealtime(userId, onEvent);
}
