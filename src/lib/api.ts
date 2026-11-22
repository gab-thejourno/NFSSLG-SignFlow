import type {
  User,
  DocumentItem,
  DocumentEvent,
  AppNotification,
  OrganizationSettings,
  SignatureField,
} from '../types';
import { staticApi, subscribeStaticRealtime } from './staticClientStore';

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

class StaticHostFallbackError extends Error {
  constructor(message = 'Backend unavailable; using client-side static mode') {
    super(message);
    this.name = 'StaticHostFallbackError';
  }
}

let backendAvailable: boolean | null = null;
let backendCheckPromise: Promise<boolean> | null = null;

/**
 * Safely probes backend availability using a GET request (never POST,
 * so static hosts like Cloudflare Pages never return HTTP 405).
 */
export async function hasBackend(): Promise<boolean> {
  if (backendAvailable !== null) {
    return backendAvailable;
  }
  if (backendCheckPromise) {
    return backendCheckPromise;
  }

  backendCheckPromise = (async () => {
    try {
      const res = await fetch('/api/health', {
        method: 'GET',
        cache: 'no-store',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });

      const contentType = res.headers.get('content-type') || '';
      if (!res.ok || !contentType.includes('application/json')) {
        backendAvailable = false;
        return false;
      }

      const data = await res.json();
      backendAvailable = Boolean(data && data.ok === true && data.mode === 'server');
      return backendAvailable;
    } catch {
      backendAvailable = false;
      return false;
    } finally {
      backendCheckPromise = null;
    }
  })();

  return backendCheckPromise;
}

async function withBackendFallback<T>(
  serverFn: () => Promise<T>,
  staticFn: () => Promise<T>
): Promise<T> {
  if (!(await hasBackend())) {
    return staticFn();
  }
  try {
    return await serverFn();
  } catch (err) {
    if (err instanceof StaticHostFallbackError) {
      backendAvailable = false;
      return staticFn();
    }
    throw err;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}, retries = 2): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const isFormData =
    typeof FormData !== 'undefined' &&
    (options.body instanceof FormData ||
      Object.prototype.toString.call(options.body) === '[object FormData]');

  if (isFormData) {
    delete headers['Content-Type'];
  } else if (!headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(endpoint, {
      credentials: 'include',
      ...options,
      headers,
    });
  } catch (netErr: any) {
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 600));
      return request<T>(endpoint, options, retries - 1);
    }
    console.error(`Network fetch failure on ${endpoint}:`, netErr);
    throw new Error(
      netErr.message ||
        'Connection error: Failed to reach the server. Please check your network and try again.'
    );
  }

  // Static hosts like Cloudflare Pages return 405 Method Not Allowed on POST /api/*
  if (res.status === 405) {
    backendAvailable = false;
    throw new StaticHostFallbackError('Static host returned HTTP 405; switching to client-side mode.');
  }

  const contentType = res.headers.get('content-type') || '';

  // If the server returned HTML (static SPA fallback or transient reverse-proxy cold-start)
  if (contentType.includes('text/html')) {
    if (res.status === 404) {
      backendAvailable = false;
      throw new StaticHostFallbackError('Static host returned 404 HTML; switching to client-side mode.');
    }
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, 700));
      return request<T>(endpoint, options, retries - 1);
    }
    if (!res.ok) {
      throw new Error(`Server returned HTTP ${res.status}. Please refresh the page.`);
    }
    throw new Error(
      `Received an unexpected HTML response from ${endpoint}. The request may have timed out or been intercepted. Please try again.`
    );
  }

  if (!res.ok) {
    let errorMsg = `HTTP Error ${res.status}`;
    try {
      const data = await res.json();
      errorMsg = data.error || errorMsg;
    } catch {
      // ignore
    }
    throw new Error(errorMsg);
  }

  try {
    return await res.json();
  } catch (jsonErr: any) {
    console.error(`JSON parse error on ${endpoint}:`, jsonErr);
    throw new Error('Received invalid data format from server. Please retry.');
  }
}

// Authentication
export async function apiLogin(identifier: string, password: string): Promise<{ user: User; token: string }> {
  const data = await withBackendFallback(
    () =>
      request<{ user: User; token: string }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ identifier, password }),
      }),
    () => staticApi.login(identifier, password)
  );
  setStoredToken(data.token);
  return data;
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
  return withBackendFallback(
    () =>
      request(`/api/documents/${docId}/signee-place-field`, {
        method: 'POST',
        body: JSON.stringify(coordinates),
      }),
    () => staticApi.signeePlaceField(docId, coordinates)
  );
}

export async function apiRegister(userData: {
  fullName: string;
  email: string;
  password: string;
  department: string;
  position: string;
  username?: string;
}): Promise<{ user: User; requiresApproval: boolean; message: string }> {
  return withBackendFallback(
    () =>
      request('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify(userData),
      }),
    () => staticApi.register(userData)
  );
}

export async function apiGetMe(): Promise<{ user: User }> {
  return withBackendFallback(
    () => request('/api/auth/me'),
    () => staticApi.getMe()
  );
}

export async function apiUpdateProfile(updates: Partial<User>): Promise<{ user: User }> {
  return withBackendFallback(
    () =>
      request('/api/auth/profile', {
        method: 'POST',
        body: JSON.stringify(updates),
      }),
    () => staticApi.updateProfile(updates)
  );
}

export async function apiChangePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  return withBackendFallback(
    () =>
      request('/api/auth/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      }),
    () => staticApi.changePassword(currentPassword, newPassword)
  );
}

export async function apiSwitchUser(userId: string): Promise<{ user: User; token: string }> {
  const data = await withBackendFallback(
    () =>
      request<{ user: User; token: string }>('/api/auth/switch-user', {
        method: 'POST',
        body: JSON.stringify({ userId }),
      }),
    () => staticApi.switchUser(userId)
  );
  setStoredToken(data.token);
  return data;
}

// Users
export async function apiGetUsers(): Promise<{ users: User[] }> {
  return withBackendFallback(
    () => request('/api/users'),
    () => staticApi.getUsers()
  );
}

export async function apiUpdateUser(id: string, updates: Partial<User>): Promise<{ user: User }> {
  return withBackendFallback(
    () =>
      request(`/api/users/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(updates),
      }),
    () => staticApi.updateUser(id, updates)
  );
}

// Documents
export async function apiGetDocuments(params?: {
  scope?: string;
  filterStatus?: string;
  search?: string;
}): Promise<{ documents: DocumentItem[] }> {
  const query = new URLSearchParams();
  if (params?.scope) query.set('scope', params.scope);
  if (params?.filterStatus) query.set('filterStatus', params.filterStatus);
  if (params?.search) query.set('search', params.search);

  return withBackendFallback(
    () => request(`/api/documents?${query.toString()}`),
    () => staticApi.getDocuments(params)
  );
}

export async function apiGetDocument(id: string): Promise<{ document: DocumentItem }> {
  return withBackendFallback(
    () => request(`/api/documents/${id}`),
    () => staticApi.getDocument(id)
  );
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
  return withBackendFallback(
    () => {
      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        return request('/api/documents/upload', {
          method: 'POST',
          body: formData,
        });
      }

      return request('/api/documents/upload', {
        method: 'POST',
        body: JSON.stringify(templateData || {}),
      });
    },
    () => staticApi.uploadPdf(file, templateData)
  );
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
  return withBackendFallback(
    () =>
      request('/api/documents/create', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    () => staticApi.createDocument(data)
  );
}

export async function apiSignDocument(
  docId: string,
  payload: {
    signaturePng?: string;
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
  return withBackendFallback(
    () =>
      request(`/api/documents/${docId}/sign`, {
        method: 'POST',
        body: JSON.stringify(payload),
      }),
    () => staticApi.signDocument(docId, payload)
  );
}

export async function apiUpdateDocumentFields(
  docId: string,
  fields: SignatureField[]
): Promise<{ document: DocumentItem }> {
  return withBackendFallback(
    () =>
      request(`/api/documents/${docId}/fields`, {
        method: 'POST',
        body: JSON.stringify({ fields }),
      }),
    () => staticApi.updateDocumentFields(docId, fields)
  );
}

export async function apiCancelDocument(docId: string, _reason?: string): Promise<{ document: DocumentItem }> {
  return withBackendFallback(
    () =>
      request(`/api/documents/${docId}/cancel`, {
        method: 'POST',
        body: JSON.stringify({ reason: _reason }),
      }),
    () => staticApi.cancelDocument(docId)
  );
}

export async function apiRejectDocument(docId: string, reason?: string): Promise<{ document: DocumentItem }> {
  return withBackendFallback(
    () =>
      request(`/api/documents/${docId}/reject`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      }),
    () => staticApi.rejectDocument(docId, reason)
  );
}

// Personal Signature Upload
export async function apiUploadSignaturePng(dataUrlOrFile: string | File): Promise<{ url: string }> {
  return withBackendFallback(
    () => {
      if (typeof dataUrlOrFile === 'string') {
        return request('/api/signatures/upload', {
          method: 'POST',
          body: JSON.stringify({ dataUrl: dataUrlOrFile }),
        });
      }

      const formData = new FormData();
      formData.append('signature', dataUrlOrFile);
      return request('/api/signatures/upload', {
        method: 'POST',
        body: formData,
      });
    },
    () => staticApi.uploadSignaturePng(dataUrlOrFile)
  );
}

// Audit Events
export async function apiGetEvents(): Promise<{ events: DocumentEvent[] }> {
  return withBackendFallback(
    () => request('/api/events'),
    () => staticApi.getEvents()
  );
}

// Notifications
export async function apiGetNotifications(): Promise<{ notifications: AppNotification[] }> {
  return withBackendFallback(
    () => request('/api/notifications'),
    () => staticApi.getNotifications()
  );
}

export async function apiMarkNotificationRead(id: string): Promise<{ success: boolean }> {
  return withBackendFallback(
    () =>
      request(`/api/notifications/${id}/read`, {
        method: 'PATCH',
      }),
    () => staticApi.markNotificationRead(id)
  );
}

export async function apiMarkAllNotificationsRead(): Promise<{ success: boolean }> {
  return withBackendFallback(
    () =>
      request('/api/notifications/read-all', {
        method: 'POST',
      }),
    () => staticApi.markAllNotificationsRead()
  );
}

// Settings
export async function apiGetSettings(): Promise<{ settings: OrganizationSettings }> {
  return withBackendFallback(
    () => request('/api/settings'),
    () => staticApi.getSettings()
  );
}

export async function apiUpdateSettings(
  settings: Partial<OrganizationSettings>
): Promise<{ settings: OrganizationSettings }> {
  return withBackendFallback(
    () =>
      request('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify(settings),
      }),
    () => staticApi.updateSettings(settings)
  );
}

// Real-time EventSource listener (uses BroadcastChannel/local events when running as static site)
export function subscribeToRealtime(userId: string | undefined, onEvent: (event: any) => void): () => void {
  let disposed = false;
  let cleanup: (() => void) | null = null;

  hasBackend().then((available) => {
    if (disposed) return;

    if (!available) {
      cleanup = subscribeStaticRealtime(onEvent);
      return;
    }

    const url = userId ? `/api/realtime?userId=${encodeURIComponent(userId)}` : '/api/realtime';
    const eventSource = new EventSource(url);

    eventSource.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch {
        // ignore
      }
    };

    eventSource.onerror = () => {
      // EventSource automatically retries when backend is active
    };

    cleanup = () => {
      eventSource.close();
    };
  });

  return () => {
    disposed = true;
    cleanup?.();
  };
}
