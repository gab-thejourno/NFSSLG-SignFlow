import React, { useState } from 'react';
import {
  FileCheck,
  Bell,
  Check,
  User as UserIcon,
  LogOut,
  ChevronDown,
  PenTool,
  Shield,
  KeyRound,
  Menu,
  X,
  LayoutDashboard,
  FileCheck2,
  FolderOpen,
  CheckCircle2,
  FileEdit,
  Archive,
  Users,
  ScrollText,
  PlusCircle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { SignatureStudioModal } from '../signatures/SignatureStudioModal';
import { ChangePasswordModal } from '../auth/ChangePasswordModal';

interface HeaderProps {
  onOpenUpload: () => void;
  onOpenDocument: (docId: string) => void;
  onNavigate: (tab: string) => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenUpload,
  onOpenDocument,
  onNavigate,
}) => {
  const {
    user,
    logout,
    notifications,
    unreadCount,
    markNotificationRead,
    markAllNotificationsRead,
  } = useAuth();

  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isPasswordModalOpen, setIsPasswordModalOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleMobileNav = (tab: string) => {
    setIsMobileMenuOpen(false);
    onNavigate(tab);
  };

  const roleBadgeLabel =
    user?.role === 'admin' ? 'Central Office Admin' : 'RFSSLG President';

  return (
    <>
      <header className="bg-slate-900 border-b border-slate-800 text-white h-16 px-3 sm:px-6 flex items-center justify-between sticky top-0 z-30 shadow-md">
        {/* Left: Mobile Menu Button & Brand */}
        <div className="flex items-center space-x-2 sm:space-x-5">
          {/* Mobile Hamburger Button */}
          <button
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
            aria-label="Toggle navigation menu"
          >
            {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>

          <div
            onClick={() => onNavigate('dashboard')}
            className="flex items-center space-x-2.5 sm:space-x-3 cursor-pointer group"
          >
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shrink-0 shadow-md ring-1 ring-blue-400/30">
              <img src="/logo.svg" alt="NFSSLG Emblem" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center space-x-1.5 sm:space-x-2">
                <span className="text-base sm:text-lg font-black tracking-tight text-white group-hover:text-blue-200 transition-colors">
                  NFSSLG SignFlow
                </span>
                <span className="text-[9px] sm:text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-500/25 text-blue-300 border border-blue-400/30">
                  OFFICIAL
                </span>
              </div>
              <div className="text-[9px] sm:text-[10px] text-slate-300 tracking-wider uppercase font-semibold truncate max-w-[170px] sm:max-w-none">
                National Federation of SSLG
              </div>
            </div>
          </div>

          {/* Active Regional Session Badge (Desktop/Tablet) */}
          <div className="hidden lg:flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/80 text-xs text-slate-200">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Session:</span>
            <strong className="text-white font-bold truncate max-w-[200px]">{user?.fullName}</strong>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-900/60 text-blue-300 font-semibold uppercase whitespace-nowrap">
              {roleBadgeLabel}
            </span>
          </div>
        </div>

        {/* Right: Actions, Signature Studio, Notifications, Profile */}
        <div className="flex items-center space-x-2 sm:space-x-3">
          {/* Signature Studio (Desktop) */}
          <button
            onClick={() => setIsStudioOpen(true)}
            className="hidden sm:flex items-center space-x-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold border border-slate-700 transition-colors"
          >
            <PenTool className="w-3.5 h-3.5 text-blue-400" />
            <span>Signature Studio</span>
          </button>

          {/* Notifications Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsNotifOpen(!isNotifOpen);
                setIsUserMenuOpen(false);
              }}
              className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors relative"
              aria-label="Notifications"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                  {unreadCount}
                </span>
              )}
            </button>

            {isNotifOpen && (
              <div className="absolute right-0 mt-2 w-72 sm:w-96 bg-white text-slate-900 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Bell className="w-4 h-4 text-blue-900" />
                    <span className="text-xs font-bold text-slate-800">
                      Notifications ({unreadCount})
                    </span>
                  </div>
                  {unreadCount > 0 && (
                    <button
                      onClick={markAllNotificationsRead}
                      className="text-[11px] text-blue-900 hover:underline font-semibold"
                    >
                      Mark all as read
                    </button>
                  )}
                </div>

                <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                  {notifications.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-400">
                      No notifications yet
                    </div>
                  ) : (
                    notifications.map((n) => (
                      <div
                        key={n.id}
                        onClick={() => {
                          markNotificationRead(n.id);
                          if (n.link && n.link.includes('/documents/')) {
                            const docId = n.link.split('/')[2];
                            onOpenDocument(docId);
                            setIsNotifOpen(false);
                          }
                        }}
                        className={`p-3.5 hover:bg-slate-50 cursor-pointer transition-colors ${
                          !n.read ? 'bg-blue-50/40' : ''
                        }`}
                      >
                        <div className="flex items-start justify-between">
                          <h4 className="text-xs font-bold text-slate-900">{n.title}</h4>
                          <span className="text-[10px] text-slate-400">
                            {new Date(n.createdAt).toLocaleTimeString([], {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1">{n.message}</p>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>

          {/* User Profile Menu Dropdown */}
          <div className="relative">
            <button
              onClick={() => {
                setIsUserMenuOpen(!isUserMenuOpen);
                setIsNotifOpen(false);
              }}
              className="flex items-center space-x-2 p-1 sm:px-2 sm:py-1 rounded-lg hover:bg-slate-800 transition-colors text-left"
            >
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white font-bold flex items-center justify-center text-xs shrink-0">
                {user?.fullName
                  ?.split(' ')
                  .map((n) => n[0])
                  .join('')
                  .slice(0, 2) || 'CO'}
              </div>

              <div className="hidden sm:block text-left max-w-[130px] lg:max-w-[180px]">
                <div className="text-xs font-bold text-slate-100 leading-tight truncate">
                  {user?.fullName || 'User'}
                </div>
                <div className="text-[10px] text-slate-400 truncate">{user?.username || ''}</div>
              </div>

              <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
            </button>

            {/* Profile Dropdown Menu */}
            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 bg-white text-slate-800 rounded-xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="p-3 bg-slate-50 border-b border-slate-100">
                  <div className="text-xs font-bold text-slate-900 truncate">{user?.fullName}</div>
                  <div className="text-[11px] text-slate-500 font-mono">@{user?.username}</div>
                  <div className="text-[10px] text-blue-900 font-semibold mt-1 uppercase">
                    {roleBadgeLabel}
                  </div>
                </div>

                <div className="p-1 space-y-0.5 text-xs font-medium">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsPasswordModalOpen(true);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <KeyRound className="w-4 h-4 text-blue-900" />
                    <span>Change Password</span>
                  </button>

                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      setIsStudioOpen(true);
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <PenTool className="w-4 h-4 text-blue-900" />
                    <span>My Signatures</span>
                  </button>
                </div>

                <div className="p-1 border-t border-slate-100">
                  <button
                    onClick={() => {
                      setIsUserMenuOpen(false);
                      logout();
                    }}
                    className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-rose-600 hover:bg-rose-50 transition-colors text-xs font-medium"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>Sign Out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs flex animate-in fade-in duration-150">
          <div className="w-4/5 max-w-xs bg-white text-slate-800 h-full shadow-2xl flex flex-col justify-between overflow-y-auto animate-in slide-in-from-left duration-200">
            <div className="p-4 space-y-5">
              {/* Drawer Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center space-x-2.5">
                  <div className="w-8 h-8 rounded-full shadow-xs flex items-center justify-center shrink-0">
                    <img src="/logo.svg" alt="NFSSLG Emblem" className="w-full h-full object-contain" />
                  </div>
                  <div>
                    <span className="font-black text-sm text-slate-900 block leading-tight">
                      NFSSLG SignFlow
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold block">
                      DepEd Youth Formation
                    </span>
                  </div>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* User Session Info Card */}
              <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100">
                <div className="text-xs font-bold text-blue-950 truncate">{user?.fullName}</div>
                <div className="text-[11px] font-mono text-blue-800">@{user?.username}</div>
                <div className="text-[10px] font-semibold text-blue-700 mt-1 uppercase">
                  {roleBadgeLabel}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="space-y-2">
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onOpenUpload();
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 bg-blue-900 hover:bg-blue-950 text-white rounded-xl text-xs font-bold shadow-xs transition-colors"
                >
                  <PlusCircle className="w-4 h-4" />
                  <span>New Document</span>
                </button>

                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    setIsStudioOpen(true);
                  }}
                  className="w-full flex items-center justify-center space-x-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold transition-colors"
                >
                  <PenTool className="w-4 h-4 text-blue-900" />
                  <span>Signature Studio</span>
                </button>
              </div>

              {/* Navigation Items */}
              <div className="space-y-1 pt-2 border-t border-slate-100">
                <div className="px-2 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Workspaces
                </div>
                <button
                  onClick={() => handleMobileNav('dashboard')}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <LayoutDashboard className="w-4 h-4 text-slate-400" />
                  <span>Dashboard</span>
                </button>

                <button
                  onClick={() => handleMobileNav('approval')}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <FileCheck2 className="w-4 h-4 text-blue-900" />
                  <span>Documents for Your Approval</span>
                </button>

                <button
                  onClick={() => handleMobileNav('my-docs')}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <FolderOpen className="w-4 h-4 text-slate-400" />
                  <span>My Documents</span>
                </button>

                <button
                  onClick={() => handleMobileNav('completed')}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Completed Documents</span>
                </button>

                <button
                  onClick={() => handleMobileNav('drafts')}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <FileEdit className="w-4 h-4 text-slate-400" />
                  <span>Drafts</span>
                </button>

                <button
                  onClick={() => handleMobileNav('archived')}
                  className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                >
                  <Archive className="w-4 h-4 text-slate-400" />
                  <span>Archived Documents</span>
                </button>

                {user?.role === 'admin' && (
                  <>
                    <div className="px-2 pt-3 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Administration
                    </div>
                    <button
                      onClick={() => handleMobileNav('users')}
                      className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <Users className="w-4 h-4 text-slate-400" />
                      <span>User Directory</span>
                    </button>
                    <button
                      onClick={() => handleMobileNav('audit')}
                      className="w-full flex items-center space-x-3 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <ScrollText className="w-4 h-4 text-slate-400" />
                      <span>Audit Event Logs</span>
                    </button>
                  </>
                )}
              </div>
            </div>

            {/* Mobile Footer Actions */}
            <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  setIsPasswordModalOpen(true);
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-200 transition-colors"
              >
                <KeyRound className="w-4 h-4 text-blue-900" />
                <span>Change Password</span>
              </button>

              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  logout();
                }}
                className="w-full flex items-center space-x-2 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <LogOut className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Click outside to close */}
          <div className="flex-1" onClick={() => setIsMobileMenuOpen(false)} />
        </div>
      )}

      {/* Signature Studio Modal */}
      <SignatureStudioModal isOpen={isStudioOpen} onClose={() => setIsStudioOpen(false)} />

      {/* Change Password Modal */}
      <ChangePasswordModal
        isOpen={isPasswordModalOpen}
        onClose={() => setIsPasswordModalOpen(false)}
      />
    </>
  );
};
