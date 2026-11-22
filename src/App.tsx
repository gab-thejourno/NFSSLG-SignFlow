/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { Header } from './components/layout/Header';
import { Sidebar } from './components/layout/Sidebar';
import { DashboardView } from './components/dashboard/DashboardView';
import { DocumentsApprovalView } from './components/documents/DocumentsApprovalView';
import { DocumentsListView } from './components/documents/DocumentsListView';
import { DocumentViewer } from './components/viewer/DocumentViewer';
import { UsersView } from './components/admin/UsersView';
import { AuditLogsView } from './components/admin/AuditLogsView';
import { SettingsView } from './components/admin/SettingsView';
import { UploadWizardModal } from './components/documents/UploadWizardModal';
import { SignatureStudioModal } from './components/signatures/SignatureStudioModal';
import { AuthModal } from './components/auth/AuthModal';
import { LoginPage } from './components/auth/LoginPage';

function MainApp() {
  const { user, loading } = useAuth();
  const [currentTab, setCurrentTab] = useState<string>('dashboard');
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Modals
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [isStudioOpen, setIsStudioOpen] = useState(false);
  const [isAuthOpen, setIsAuthOpen] = useState(false);

  const handleOpenDocument = (docId: string) => {
    setSelectedDocId(docId);
  };

  const handleBackFromViewer = () => {
    setSelectedDocId(null);
  };

  const handleNavigate = (tab: string) => {
    setSelectedDocId(null);
    setCurrentTab(tab);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 text-white">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-sm font-semibold tracking-wider text-slate-300">
            Initializing NFSSLG SignFlow Regional Portal...
          </div>
        </div>
      </div>
    );
  }

  // Dedicated Regional Login Gate
  if (!user) {
    return <LoginPage />;
  }

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans text-slate-900 antialiased selection:bg-blue-900 selection:text-white">
      {/* Header */}
      <Header
        onOpenUpload={() => setIsUploadOpen(true)}
        onOpenDocument={handleOpenDocument}
        onNavigate={handleNavigate}
      />

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onNavigate={handleNavigate}
          onOpenUpload={() => setIsUploadOpen(true)}
          onOpenStudio={() => setIsStudioOpen(true)}
        />

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto">
          {selectedDocId ? (
            <DocumentViewer
              documentId={selectedDocId}
              onBack={handleBackFromViewer}
            />
          ) : (
            <>
              {currentTab === 'dashboard' && (
                <DashboardView
                  onOpenDocument={handleOpenDocument}
                  onNavigate={handleNavigate}
                  onOpenUpload={() => setIsUploadOpen(true)}
                />
              )}

              {currentTab === 'approval' && (
                <DocumentsApprovalView onOpenDocument={handleOpenDocument} />
              )}

              {currentTab === 'my-docs' && (
                <DocumentsListView
                  scope="mine"
                  title="My Documents"
                  subtitle="Official documents and agreements initiated by your account"
                  onOpenDocument={handleOpenDocument}
                  onOpenUpload={() => setIsUploadOpen(true)}
                />
              )}

              {currentTab === 'completed' && (
                <DocumentsListView
                  scope="completed"
                  title="Completed Documents"
                  subtitle="Finalized agreements containing all confirmed signatures, certificates, and seals"
                  onOpenDocument={handleOpenDocument}
                />
              )}

              {currentTab === 'drafts' && (
                <DocumentsListView
                  scope="drafts"
                  title="Draft Documents"
                  subtitle="Unsent document drafts undergoing initial preparation"
                  onOpenDocument={handleOpenDocument}
                  onOpenUpload={() => setIsUploadOpen(true)}
                />
              )}

              {currentTab === 'archived' && (
                <DocumentsListView
                  scope="archived"
                  title="Archived Documents"
                  subtitle="Historical organizational documents retained for institutional recordkeeping"
                  onOpenDocument={handleOpenDocument}
                />
              )}

              {currentTab === 'users' && <UsersView />}

              {currentTab === 'audit' && <AuditLogsView />}

              {currentTab === 'settings' && <SettingsView />}
            </>
          )}
        </main>
      </div>

      {/* Modals */}
      <UploadWizardModal
        isOpen={isUploadOpen}
        onClose={() => setIsUploadOpen(false)}
        onSuccess={(docId) => {
          setSelectedDocId(docId);
        }}
      />

      <SignatureStudioModal
        isOpen={isStudioOpen}
        onClose={() => setIsStudioOpen(false)}
      />

      <AuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
      />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <MainApp />
    </AuthProvider>
  );
}
