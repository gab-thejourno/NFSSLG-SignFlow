import React, { useState, useEffect } from 'react';
import {
  Settings,
  Building,
  Shield,
  Clock,
  Key,
  Check,
  Save,
  AlertCircle,
  PenTool,
} from 'lucide-react';
import type { OrganizationSettings } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiGetSettings, apiUpdateSettings } from '../../lib/api';

export const SettingsView: React.FC = () => {
  const { user, updateProfile, changePassword } = useAuth();
  const [settings, setSettings] = useState<OrganizationSettings>({
    organizationName: 'National Federation of SSLG',
    organizationEmail: 'nfsslg@signflow.gov.ph',
    defaultDeadlineDays: 7,
    sequentialDefault: false,
    requireAdminApproval: true,
    allowSignatureDrawing: true,
    enforceTransparentPng: true,
  });

  const [loading, setLoading] = useState(true);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Profile fields
  const [fullName, setFullName] = useState(user?.fullName || '');
  const [department, setDepartment] = useState(user?.department || '');
  const [position, setPosition] = useState(user?.position || '');
  const [profileSaved, setProfileSaved] = useState(false);

  // Password fields
  const [currPassword, setCurrPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        setLoading(true);
        const res = await apiGetSettings();
        setSettings(res.settings);
      } catch (err) {
        console.error('Failed to load settings', err);
      } finally {
        setLoading(false);
      }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (user) {
      setFullName(user.fullName);
      setDepartment(user.department);
      setPosition(user.position);
    }
  }, [user]);

  const handleSaveOrganizationSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (user?.role !== 'admin') return;
    try {
      const res = await apiUpdateSettings(settings);
      setSettings(res.settings);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to update settings');
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await updateProfile({
        fullName,
        department,
        position,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } catch (err: any) {
      alert(err.message || 'Failed to update profile');
    }
  };

  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (!currPassword) {
      setPasswordError('Please enter your current password');
      return;
    }
    if (newPassword.length < 6) {
      setPasswordError('New password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }

    setPasswordLoading(true);
    try {
      await changePassword(currPassword, newPassword);
      setPasswordSuccess(true);
      setCurrPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch (err: any) {
      setPasswordError(err.message || 'Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  return (
    <div className="p-4 sm:p-8 max-w-4xl mx-auto space-y-6 sm:space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">System & Account Settings</h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-1">
          Configure organization governance parameters, default workflows, and your personal profile
        </p>
      </div>

      {/* User Personal Profile Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
          <div className="p-2 bg-blue-50 text-blue-900 rounded-lg">
            <Building className="w-5 h-5 text-blue-800" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">Personal Profile & Credentials</h2>
            <p className="text-xs text-slate-500">
              Information displayed on official signature blocks and audit certificates
            </p>
          </div>
        </div>

        {profileSaved && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Profile information updated successfully!</span>
          </div>
        )}

        <form onSubmit={handleSaveProfile} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Full Name (Legal Signatory)
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Username & Identifier
              </label>
              <input
                type="text"
                disabled
                value={user?.username || ''}
                className="w-full px-3 py-2 border border-slate-200 bg-slate-50 rounded-lg text-xs font-mono text-slate-600 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Department
              </label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Official Position / Designation
              </label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5"
            >
              <Save className="w-4 h-4" />
              <span>Update Profile</span>
            </button>
          </div>
        </form>
      </div>

      {/* Security & Password Section */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-4">
        <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
          <div className="p-2 bg-amber-50 text-amber-900 rounded-lg">
            <Key className="w-5 h-5 text-amber-700" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-slate-900">Account Security & Password</h2>
            <p className="text-xs text-slate-500">
              Update your account password to protect your digital signature authority
            </p>
          </div>
        </div>

        {passwordSuccess && (
          <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
            <Check className="w-4 h-4 text-emerald-600" />
            <span>Password updated successfully!</span>
          </div>
        )}

        {passwordError && (
          <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{passwordError}</span>
          </div>
        )}

        <form onSubmit={handleSavePassword} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Current Password
              </label>
              <input
                type="password"
                required
                value={currPassword}
                onChange={(e) => setCurrPassword(e.target.value)}
                placeholder="Current password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                New Password
              </label>
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Min. 6 characters"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Confirm New Password
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Retype new password"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-white"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={passwordLoading}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5 disabled:opacity-50"
            >
              <Key className="w-4 h-4" />
              <span>{passwordLoading ? 'Updating Password...' : 'Change Password'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Organization Governance Settings (Admin Only) */}
      {user?.role === 'admin' ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-100">
            <div className="p-2 bg-purple-50 text-purple-900 rounded-lg">
              <Shield className="w-5 h-5 text-purple-800" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Organization Governance Parameters (Administrator)
              </h2>
              <p className="text-xs text-slate-500">
                System-wide rules, verification constraints, and default execution policies
              </p>
            </div>
          </div>

          {savedSuccess && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-xl text-xs font-semibold flex items-center space-x-2">
              <Check className="w-4 h-4 text-emerald-600" />
              <span>Organization settings saved!</span>
            </div>
          )}

          <form onSubmit={handleSaveOrganizationSettings} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Organization Entity Name
                </label>
                <input
                  type="text"
                  value={settings.organizationName}
                  onChange={(e) =>
                    setSettings({ ...settings, organizationName: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Compliance / Governance Email
                </label>
                <input
                  type="email"
                  value={settings.organizationEmail}
                  onChange={(e) =>
                    setSettings({ ...settings, organizationEmail: e.target.value })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Default Signing Deadline (Days)
                </label>
                <input
                  type="number"
                  min={1}
                  max={90}
                  value={settings.defaultDeadlineDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      defaultDeadlineDays: parseInt(e.target.value, 10) || 7,
                    })
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900"
                />
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-slate-100">
              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.requireAdminApproval}
                  onChange={(e) =>
                    setSettings({ ...settings, requireAdminApproval: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-900 rounded border-slate-300 focus:ring-blue-900"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Require Administrator Approval for New User Accounts
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Newly registered users will be placed in &quot;Pending&quot; status until approved by an admin
                  </div>
                </div>
              </label>

              <label className="flex items-center space-x-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.enforceTransparentPng}
                  onChange={(e) =>
                    setSettings({ ...settings, enforceTransparentPng: e.target.checked })
                  }
                  className="w-4 h-4 text-blue-900 rounded border-slate-300 focus:ring-blue-900"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    Enforce Transparent PNG Signatures
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Automatically cleans white backgrounds when signatures are uploaded
                  </div>
                </div>
              </label>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-5 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center space-x-1.5"
              >
                <Save className="w-4 h-4" />
                <span>Save Organization Settings</span>
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
};
