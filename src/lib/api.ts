import type {
  User,
  DocumentItem,
  DocumentEvent,
  AppNotification,
  OrganizationSettings,
  SignatureField,
} from '../types';

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

  const contentType = res.headers.get('content-type') || '';

  // If the server returned HTML (transient reverse-proxy cold-start or gateway glitch)
  if (contentType.includes('text/html')) {
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
  const data = await request<{ user: User; token: string }>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ identifier, password }),
  });
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
  return request(`/api/documents/${docId}/signee-place-field`, {
    method: 'POST',
    body: JSON.stringify(coordinates),
  });
}

export async function apiRegister(userData: {
  fullName: string;
  email: string;
  password: string;
  department: string;
  position: string;
  username?: string;
}): Promise<{ user: User; requiresApproval: boolean; message: string }> {
  return request('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(userData),
  });
}

export async function apiGetMe(): Promise<{ user: User }> {
  return request('/api/auth/me');
}

export async function apiUpdateProfile(updates: Partial<User>): Promise<{ user: User }> {
  return request('/api/auth/profile', {
    method: 'POST',
    body: JSON.stringify(updates),
  });
}

export async function apiChangePassword(currentPassword: string, newPassword: string): Promise<{ success: boolean; message: string }> {
  return request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword, newPassword }),
  });
}

export async function apiSwitchUser(userId: string): Promise<{ user: User; token: string }> {
  const data = await request<{ user: User; token: string }>('/api/auth/switch-user', {
    method: 'POST',
    body: JSON.stringify({ userId }),
  });
  setStoredToken(data.token);
  return data;
}

// Users
export async function apiGetUsers(): Promise<{ users: User[] }> {
  return request('/api/users');
}

export async function apiUpdateUser(id: string, updates: Partial<User>): Promise<{ user: User }> {
  return request(`/api/users/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
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

  return request(`/api/documents?${query.toString()}`);
}

export async function apiGetDocument(id: string): Promise<{ document: DocumentItem }> {
  return request(`/api/documents/${id}`);
}

export async function apiUploadPdf(file?: File, templateData?: {
  templateTitle: string;
  templateRef: string;
  category: string;
  signers?: string[];
}): Promise<{ fileUrl: string; filename: string; size?: number; pageCount: number }> {
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
  return request('/api/documents/create', {
    method: 'POST',
    body: JSON.stringify(data),
  });
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
  return request(`/api/documents/${docId}/sign`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function apiUpdateDocumentFields(
  docId: string,
  fields: SignatureField[]
): Promise<{ document: DocumentItem }> {
  return request(`/api/documents/${docId}/fields`, {
    method: 'POST',
    body: JSON.stringify({ fields }),
  });
}

export async function apiCancelDocument(docId: string, reason?: string): Promise<{ document: DocumentItem }> {
  return request(`/api/documents/${docId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

export async function apiRejectDocument(docId: string, reason?: string): Promise<{ document: DocumentItem }> {
  return request(`/api/documents/${docId}/reject`, {
    method: 'POST',
    body: JSON.stringify({ reason }),
  });
}

// Personal Signature Upload
export async function apiUploadSignaturePng(dataUrlOrFile: string | File): Promise<{ url: string }> {
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
}

// Audit Events
export async function apiGetEvents(): Promise<{ events: DocumentEvent[] }> {
  return request('/api/events');
}

// Notifications
export async function apiGetNotifications(): Promise<{ notifications: AppNotification[] }> {
  return request('/api/notifications');
}

export async function apiMarkNotificationRead(id: string): Promise<{ success: boolean }> {
  return request(`/api/notifications/${id}/read`, {
    method: 'PATCH',
  });
}

export async function apiMarkAllNotificationsRead(): Promise<{ success: boolean }> {
  return request('/api/notifications/read-all', {
    method: 'POST',
  });
}

// Settings
export async function apiGetSettings(): Promise<{ settings: OrganizationSettings }> {
  return request('/api/settings');
}

export async function apiUpdateSettings(settings: Partial<OrganizationSettings>): Promise<{ settings: OrganizationSettings }> {
  return request('/api/settings', {
    method: 'PATCH',
    body: JSON.stringify(settings),
  });
}

// Real-time EventSource listener
export function subscribeToRealtime(userId: string | undefined, onEvent: (event: any) => void): () => void {
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
    // EventSource automatically retries
  };

  return () => {
    eventSource.close();
  };
}
