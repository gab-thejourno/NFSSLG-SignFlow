import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, AppNotification } from '../types';
import {
  apiGetMe,
  apiLogin,
  apiRegister,
  apiSwitchUser,
  apiUpdateProfile,
  apiChangePassword,
  setStoredToken,
  apiGetNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  subscribeToRealtime,
} from '../lib/api';

export interface RegionalAccount {
  id: string;
  name: string;
  roleTitle: string;
  department: string;
  email: string;
  code: string;
  role: 'admin' | 'user';
  status: 'active' | 'pending';
}

export const REGIONAL_ACCOUNTS: RegionalAccount[] = [
  {
    id: 'usr-centraloffice',
    name: 'Central Office - Youth Formation Division (YFD)',
    roleTitle: 'National Federation of SSLG Central Office',
    department: 'National Federation of SSLG Central Office (YFD)',
    email: 'centraloffice@signflow.gov.ph',
    code: 'nfsslg-yfd',
    role: 'admin',
    status: 'active',
  },
  {
    id: 'usr-ncr',
    name: 'RFSSLG President - NCR',
    roleTitle: 'National Capital Region',
    department: 'Regional Federation of SSLG - NCR (National Capital Region)',
    email: 'ncr@signflow.gov.ph',
    code: 'nfsslg-ncr',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-car',
    name: 'RFSSLG President - CAR',
    roleTitle: 'Cordillera Administrative Region',
    department: 'Regional Federation of SSLG - CAR (Cordillera Administrative Region)',
    email: 'car@signflow.gov.ph',
    code: 'nfsslg-car',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region1',
    name: 'RFSSLG President - Region 1',
    roleTitle: 'Ilocos Region',
    department: 'Regional Federation of SSLG - Region 1 (Ilocos Region)',
    email: 'region1@signflow.gov.ph',
    code: 'nfsslg-r1',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region2',
    name: 'RFSSLG President - Region 2',
    roleTitle: 'Cagayan Valley',
    department: 'Regional Federation of SSLG - Region 2 (Cagayan Valley)',
    email: 'region2@signflow.gov.ph',
    code: 'nfsslg-r2',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region3',
    name: 'RFSSLG President - Region 3',
    roleTitle: 'Central Luzon',
    department: 'Regional Federation of SSLG - Region 3 (Central Luzon)',
    email: 'region3@signflow.gov.ph',
    code: 'nfsslg-r3',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region4a',
    name: 'RFSSLG President - Region 4A',
    roleTitle: 'CALABARZON',
    department: 'Regional Federation of SSLG - Region 4A (CALABARZON)',
    email: 'region4a@signflow.gov.ph',
    code: 'nfsslg-r4a',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region4b',
    name: 'RFSSLG President - Region 4B',
    roleTitle: 'MIMAROPA',
    department: 'Regional Federation of SSLG - Region 4B (MIMAROPA)',
    email: 'region4b@signflow.gov.ph',
    code: 'nfsslg-r4b',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region5',
    name: 'RFSSLG President - Region 5',
    roleTitle: 'Bicol Region',
    department: 'Regional Federation of SSLG - Region 5 (Bicol Region)',
    email: 'region5@signflow.gov.ph',
    code: 'nfsslg-r5',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region6',
    name: 'RFSSLG President - Region 6',
    roleTitle: 'Western Visayas',
    department: 'Regional Federation of SSLG - Region 6 (Western Visayas)',
    email: 'region6@signflow.gov.ph',
    code: 'nfsslg-r6',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region7',
    name: 'RFSSLG President - Region 7',
    roleTitle: 'Central Visayas',
    department: 'Regional Federation of SSLG - Region 7 (Central Visayas)',
    email: 'region7@signflow.gov.ph',
    code: 'nfsslg-r7',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-nir',
    name: 'RFSSLG President - NIR',
    roleTitle: 'Negros Island Region',
    department: 'Regional Federation of SSLG - NIR (Negros Island Region)',
    email: 'nir@signflow.gov.ph',
    code: 'nfsslg-nir',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region8',
    name: 'RFSSLG President - Region 8',
    roleTitle: 'Eastern Visayas',
    department: 'Regional Federation of SSLG - Region 8 (Eastern Visayas)',
    email: 'region8@signflow.gov.ph',
    code: 'nfsslg-r8',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region9',
    name: 'RFSSLG President - Region 9',
    roleTitle: 'Zamboanga Peninsula',
    department: 'Regional Federation of SSLG - Region 9 (Zamboanga Peninsula)',
    email: 'region9@signflow.gov.ph',
    code: 'nfsslg-r9',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region10',
    name: 'RFSSLG President - Region 10',
    roleTitle: 'Northern Mindanao',
    department: 'Regional Federation of SSLG - Region 10 (Northern Mindanao)',
    email: 'region10@signflow.gov.ph',
    code: 'nfsslg-r10',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region11',
    name: 'RFSSLG President - Region 11',
    roleTitle: 'Davao Region',
    department: 'Regional Federation of SSLG - Region 11 (Davao Region)',
    email: 'region11@signflow.gov.ph',
    code: 'nfsslg-r11',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region12',
    name: 'RFSSLG President - Region 12',
    roleTitle: 'SOCCSKSARGEN',
    department: 'Regional Federation of SSLG - Region 12 (SOCCSKSARGEN)',
    email: 'region12@signflow.gov.ph',
    code: 'nfsslg-r12',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-region13',
    name: 'RFSSLG President - Region 13',
    roleTitle: 'Caraga Administrative Region',
    department: 'Regional Federation of SSLG - Region 13 (Caraga Administrative Region)',
    email: 'region13@signflow.gov.ph',
    code: 'nfsslg-r13',
    role: 'user',
    status: 'active',
  },
  {
    id: 'usr-barmm',
    name: 'RFSSLG President - BARMM',
    roleTitle: 'Bangsamoro Autonomous Region',
    department: 'Regional Federation of SSLG - BARMM (Bangsamoro Autonomous Region)',
    email: 'barmm@signflow.gov.ph',
    code: 'nfsslg-barmm',
    role: 'user',
    status: 'active',
  },
];

export const DEMO_ACCOUNTS = REGIONAL_ACCOUNTS;

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (identifier: string, pass: string) => Promise<void>;
  register: (data: any) => Promise<{ requiresApproval: boolean; message: string }>;
  logout: () => void;
  switchUser: (userId: string) => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
  changePassword: (currentPass: string, newPass: string) => Promise<{ success: boolean; message: string }>;
  notifications: AppNotification[];
  unreadCount: number;
  markNotificationRead: (id: string) => Promise<void>;
  markAllNotificationsRead: () => Promise<void>;
  refreshNotifications: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);

  const fetchCurrentUser = async () => {
    try {
      const data = await apiGetMe();
      setUser(data.user);
    } catch {
      // If no valid session, start on login page
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const res = await apiGetNotifications();
      setNotifications(res.notifications);
    } catch (e) {
      console.error('Failed to fetch notifications', e);
    }
  };

  useEffect(() => {
    fetchCurrentUser();
  }, []);

  useEffect(() => {
    if (user) {
      loadNotifications();
      const unsub = subscribeToRealtime(user.id, (evt) => {
        if (
          evt.type === 'SIGNATURE_ADDED' ||
          evt.type === 'DOCUMENT_CREATED' ||
          evt.type === 'USER_UPDATED' ||
          evt.type === 'FIELDS_UPDATED'
        ) {
          loadNotifications();
        }
      });
      return unsub;
    }
  }, [user?.id]);

  const login = async (identifier: string, pass: string) => {
    const res = await apiLogin(identifier, pass);
    setUser(res.user);
    await loadNotifications();
  };

  const register = async (data: any) => {
    return apiRegister(data);
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  const switchUser = async (userId: string) => {
    setLoading(true);
    try {
      const res = await apiSwitchUser(userId);
      setUser(res.user);
    } finally {
      setLoading(false);
    }
  };

  const updateProfile = async (data: Partial<User>) => {
    const res = await apiUpdateProfile(data);
    setUser(res.user);
  };

  const changePassword = async (currentPass: string, newPass: string) => {
    const res = await apiChangePassword(currentPass, newPass);
    return res;
  };

  const handleMarkNotificationRead = async (id: string) => {
    await apiMarkNotificationRead(id);
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const handleMarkAllNotificationsRead = async () => {
    await apiMarkAllNotificationsRead();
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        switchUser,
        updateProfile,
        changePassword,
        notifications,
        unreadCount,
        markNotificationRead: handleMarkNotificationRead,
        markAllNotificationsRead: handleMarkAllNotificationsRead,
        refreshNotifications: loadNotifications,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
