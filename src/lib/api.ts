import type {
  User,
  DocumentItem,
  DocumentEvent,
  AppNotification,
  OrganizationSettings,
  SignatureField,
} from '../types';
import { supabaseApi } from './supabaseApi';
import { staticApi, subscribeStaticRealtime } from './staticClientStore';
import { isSupabaseConfigured } from './supabaseClient';
import { processSignatureImageToTransparentPng } from './signatureProcessor';

export { isSupabaseConfigured };

const TOKEN_KEY = 'signflow_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string | null) {
  if (token) {
    localStorage.setItem(TOKEN_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_KEY);
  }
}

// Authentication (Username/Identifier + Password; no public registration)
export async function apiLogin(identifier: string, password: string): Promise<{ user: User; token: string }> {
  if (isSupabaseConfigured) {
    return supabaseApi.login(identifier, password);
  }
  const data = await staticApi.login(identifier, password);
  setStoredToken(data.token);
  return data;
}

export async function apiLogout(): Promise<void> {
  setStoredToken(null);
  if (isSupabaseConfigured) {
    await supabaseApi.logout();
  }
}

export async function apiGetMe(): Promise<{ user: User }> {
  return isSupabaseConfigured ? supabaseApi.getMe() : staticApi.getMe();
}

export async function apiUpdateProfile(updates: Partial<User>): Promise<{ user: User }> {
  return isSupabaseConfigured ? supabaseApi.updateProfile(updates) : staticApi.updateProfile(updates);
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return isSupabaseConfigured
    ? supabaseApi.changePassword(currentPassword, newPassword)
    : staticApi.changePassword(currentPassword, newPassword);
}

// Users
export async function apiGetUsers(): Promise<{ users: User[] }> {
  return isSupabaseConfigured ? supabaseApi.getUsers() : staticApi.getUsers();
}

export async function apiUpdateUser(id: string, updates: Partial<User>): Promise<{ user: User }> {
  return isSupabaseConfigured ? supabaseApi.updateUser(id, updates) : staticApi.updateUser(id, updates);
}

// Documents
export async function apiGetDocuments(params?: {
  scope?: string;
  filterStatus?: string;
  search?: string;
}): Promise<{ documents: DocumentItem[] }> {
  return isSupabaseConfigured ? supabaseApi.getDocuments(params) : staticApi.getDocuments(params);
}

export async function apiGetDocument(id: string): Promise<{ document: DocumentItem }> {
  return isSupabaseConfigured ? supabaseApi.getDocument(id) : staticApi.getDocument(id);
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
  return isSupabaseConfigured ? supabaseApi.uploadPdf(file, templateData) : staticApi.uploadPdf(file, templateData);
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
  return isSupabaseConfigured ? supabaseApi.createDocument(data) : staticApi.createDocument(data);
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
  return isSupabaseConfigured
    ? supabaseApi.signeePlaceField(docId, coordinates)
    : staticApi.signeePlaceField(docId, coordinates);
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
  if (isSupabaseConfigured) {
    return supabaseApi.signDocument(docId, payload);
  }
  let signaturePng = payload.signaturePng;
  if (!signaturePng && payload.signatureFile) {
    const processed = await processSignatureImageToTransparentPng(payload.signatureFile);
    signaturePng = processed.dataUrl;
  }
  return staticApi.signDocument(docId, {
    ...payload,
    signaturePng,
  });
}

export async function apiUpdateDocumentFields(
  docId: string,
  fields: SignatureField[]
): Promise<{ document: DocumentItem }> {
  return isSupabaseConfigured
    ? supabaseApi.updateDocumentFields(docId, fields)
    : staticApi.updateDocumentFields(docId, fields);
}

export async function apiDelegateSignatories(
  docId: string,
  targetUserIds: string[],
  replaceCurrentUser = false
): Promise<{ document: DocumentItem }> {
  return isSupabaseConfigured
    ? supabaseApi.delegateSignatories(docId, targetUserIds, replaceCurrentUser)
    : staticApi.delegateSignatories(docId, targetUserIds, replaceCurrentUser);
}

export async function apiCancelDocument(docId: string, _reason?: string): Promise<{ document: DocumentItem }> {
  return isSupabaseConfigured ? supabaseApi.cancelDocument(docId) : staticApi.cancelDocument(docId);
}

export async function apiRejectDocument(docId: string, reason?: string): Promise<{ document: DocumentItem }> {
  return isSupabaseConfigured ? supabaseApi.rejectDocument(docId, reason) : staticApi.rejectDocument(docId, reason);
}

// Personal Signature Upload & White-Background Removal
export async function apiUploadSignaturePng(dataUrlOrFile: string | File): Promise<{ url: string }> {
  if (isSupabaseConfigured) {
    return supabaseApi.uploadSignaturePng(dataUrlOrFile);
  }
  const processed = await processSignatureImageToTransparentPng(dataUrlOrFile);
  return { url: processed.dataUrl };
}

// Audit Events
export async function apiGetEvents(): Promise<{ events: DocumentEvent[] }> {
  return isSupabaseConfigured ? supabaseApi.getEvents() : staticApi.getEvents();
}

// Notifications
export async function apiGetNotifications(): Promise<{ notifications: AppNotification[] }> {
  return isSupabaseConfigured ? supabaseApi.getNotifications() : staticApi.getNotifications();
}

export async function apiMarkNotificationRead(id: string): Promise<{ success: boolean }> {
  return isSupabaseConfigured ? supabaseApi.markNotificationRead(id) : staticApi.markNotificationRead(id);
}

export async function apiMarkAllNotificationsRead(): Promise<{ success: boolean }> {
  return isSupabaseConfigured ? supabaseApi.markAllNotificationsRead() : staticApi.markAllNotificationsRead();
}

// Settings
export async function apiGetSettings(): Promise<{ settings: OrganizationSettings }> {
  return isSupabaseConfigured ? supabaseApi.getSettings() : staticApi.getSettings();
}

export async function apiUpdateSettings(
  settings: Partial<OrganizationSettings>
): Promise<{ settings: OrganizationSettings }> {
  return isSupabaseConfigured ? supabaseApi.updateSettings(settings) : staticApi.updateSettings(settings);
}

// Realtime listener
export function subscribeToRealtime(userId: string | undefined, onEvent: (event: any) => void): () => void {
  return isSupabaseConfigured
    ? supabaseApi.subscribeToRealtime(userId, onEvent)
    : subscribeStaticRealtime(onEvent);
}
