import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  FileCheck2,
  FolderOpen,
  CheckCircle2,
  FileEdit,
  Archive,
  Users,
  ScrollText,
  Settings,
  PlusCircle,
  PenTool,
  ShieldAlert,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { apiGetDocuments, subscribeToRealtime } from '../../lib/api';

interface SidebarProps {
  currentTab: string;
  onNavigate: (tab: string) => void;
  onOpenUpload: () => void;
  onOpenStudio: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onNavigate,
  onOpenUpload,
  onOpenStudio,
}) => {
  const { user, logout } = useAuth();
  const [pendingCount, setPendingCount] = useState(0);

  const fetchPendingApprovalCount = async () => {
    if (!user) return;
    try {
      const res = await apiGetDocuments({ scope: 'assigned', filterStatus: 'pending' });
      setPendingCount(res.documents.length);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    fetchPendingApprovalCount();
  }, [user?.id]);

  useEffect(() => {
    const unsub = subscribeToRealtime(user?.id, (evt) => {
      if (evt.type === 'SIGNATURE_ADDED' || evt.type === 'DOCUMENT_CREATED') {
        fetchPendingApprovalCount();
      }
    });
    return unsub;
  }, [user?.id]);

  const navItems = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: LayoutDashboard,
    },
    {
      id: 'approval',
      label: 'Documents for Your Approval',
      icon: FileCheck2,
      badge: pendingCount,
      highlight: true,
    },
    {
      id: 'my-docs',
      label: 'My Documents',
      icon: FolderOpen,
    },
    {
      id: 'completed',
      label: 'Completed Documents',
      icon: CheckCircle2,
    },
    {
      id: 'drafts',
      label: 'Drafts',
      icon: FileEdit,
    },
    {
      id: 'archived',
      label: 'Archived Documents',
      icon: Archive,
    },
  ];

  const adminNavItems = [
    {
      id: 'users',
      label: 'User Directory',
      icon: Users,
    },
    {
      id: 'audit',
      label: 'Audit Event Logs',
      icon: ScrollText,
    },
  ];

  return (
    <aside className="hidden md:flex w-64 bg-white border-r border-slate-200 flex-col justify-between shrink-0 shadow-xs select-none">
      <div className="p-4 space-y-6">
        {/* New Document Button */}
        <button
          onClick={onOpenUpload}
          className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Document</span>
        </button>

        {/* Main Navigation */}
        <div className="space-y-1">
          <div className="px-3 pb-2 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
            Workspaces
          </div>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isActive
                    ? 'bg-blue-50 text-blue-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center space-x-3 truncate">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      isActive ? 'text-blue-900' : 'text-slate-400'
                    }`}
                  />
                  <span className="truncate">{item.label}</span>
                </div>
                {item.badge !== undefined && item.badge > 0 && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-900 text-white shrink-0">
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Administrator Section */}
        {user?.role === 'admin' && (
          <div className="space-y-1 pt-3 border-t border-slate-100">
            <div className="px-3 pb-2 text-[10px] font-bold text-purple-700 uppercase tracking-wider flex items-center justify-between">
              <span>Administration</span>
              <ShieldAlert className="w-3 h-3 text-purple-600" />
            </div>
            {adminNavItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onNavigate(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-purple-50 text-purple-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <Icon
                      className={`w-4 h-4 shrink-0 ${
                        isActive ? 'text-purple-800' : 'text-slate-400'
                      }`}
                    />
                    <span>{item.label}</span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom Settings & Signature Studio */}
      <div className="p-4 border-t border-slate-200 space-y-1">
        <button
          onClick={onOpenStudio}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100 transition-colors"
        >
          <PenTool className="w-4 h-4 text-blue-800" />
          <span>Signature Studio</span>
        </button>

        <button
          onClick={() => onNavigate('settings')}
          className={`w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
            currentTab === 'settings'
              ? 'bg-blue-50 text-blue-900'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4 text-slate-400" />
          <span>Settings</span>
        </button>

        <button
          onClick={logout}
          className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
        >
          <LogOut className="w-4 h-4 text-rose-500" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
