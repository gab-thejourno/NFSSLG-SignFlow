import React, { createContext, useContext, useState, useEffect } from 'react';
import type { User, AppNotification } from '../types';
import {
  apiGetMe,
  apiLogin,
  apiRegister,
  apiLogout,
  apiUpdateProfile,
  apiChangePassword,
  apiGetNotifications,
  apiMarkNotificationRead,
  apiMarkAllNotificationsRead,
  subscribeToRealtime,
} from '../lib/api';
import { supabase } from '../lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, pass: string) => Promise<void>;
  register: (data: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    position: string;
    username?: string;
  }) => Promise<{ requiresApproval: boolean; sessionActive: boolean; message: string }>;
  logout: () => Promise<void>;
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

    if (!supabase) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        apiGetMe()
          .then((res) => setUser(res.user))
          .catch(() => setUser(null));
      } else {
        setUser(null);
        setNotifications([]);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (user) {
      loadNotifications();
      const unsub = subscribeToRealtime(user.id, (evt) => {
        if (
          evt.type === 'SIGNATURE_ADDED' ||
          evt.type === 'DOCUMENT_CREATED' ||
          evt.type === 'USER_UPDATED' ||
          evt.type === 'FIELDS_UPDATED' ||
          evt.type === 'DOCUMENT_UPDATED'
        ) {
          loadNotifications();
        }
      });
      return unsub;
    }
  }, [user?.id]);

  const login = async (email: string, pass: string) => {
    const res = await apiLogin(email, pass);
    setUser(res.user);
    await loadNotifications();
  };

  const register = async (data: {
    fullName: string;
    email: string;
    password: string;
    department: string;
    position: string;
    username?: string;
  }) => {
    const res = await apiRegister(data);
    if (res.sessionActive) {
      setUser(res.user);
    }
    return {
      requiresApproval: res.requiresApproval,
      sessionActive: res.sessionActive,
      message: res.message,
    };
  };

  const logout = async () => {
    await apiLogout();
    setUser(null);
    setNotifications([]);
  };

  const updateProfile = async (data: Partial<User>) => {
    const res = await apiUpdateProfile(data);
    setUser(res.user);
  };

  const changePassword = async (currentPass: string, newPass: string) => {
    return apiChangePassword(currentPass, newPass);
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
