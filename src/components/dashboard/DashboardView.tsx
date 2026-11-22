import React, { useState, useEffect } from 'react';
import {
  FileText,
  Clock,
  CheckCircle2,
  FileSignature,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  Upload,
  ShieldCheck,
  Calendar,
  Sparkles,
  Users,
  Activity,
  Download,
  PenTool,
} from 'lucide-react';
import type { DocumentItem, DocumentEvent } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiGetDocuments, apiGetEvents, subscribeToRealtime } from '../../lib/api';

interface DashboardViewProps {
  onOpenDocument: (docId: string) => void;
  onNavigate: (tab: string) => void;
  onOpenUpload: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  onOpenDocument,
  onNavigate,
  onOpenUpload,
}) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [loading, setLoading] = useState(true);

  const loadData = async () => {
    try {
      setLoading(true);
      const [docsRes, eventsRes] = await Promise.all([
        apiGetDocuments(),
        apiGetEvents(),
      ]);
      setDocuments(docsRes.documents);
      setEvents(eventsRes.events.slice(0, 8));
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    const unsub = subscribeToRealtime(user?.id, (evt) => {
      if (
        evt.type === 'SIGNATURE_ADDED' ||
        evt.type === 'DOCUMENT_CREATED' ||
        evt.type === 'DOCUMENT_UPDATED'
      ) {
        loadData();
      }
    });
    return unsub;
  }, [user?.id]);

  // Calculations for stats
  // Pending Signatures: documents where current user is a signatory and their status is pending
  const pendingForMe = documents.filter((d) => {
    const sig = d.signatories.find((s) => s.userId === user?.id);
    return sig?.status === 'pending' && d.status !== 'completed' && d.status !== 'cancelled';
  }).length;

  // Documents awaiting others: initiated by user or where user has signed, but not all have signed
  const awaitingOthers = documents.filter((d) => {
    const isInitiator = d.initiatorId === user?.id;
    const mySig = d.signatories.find((s) => s.userId === user?.id);
    const hasSigned = mySig?.status === 'signed';
    return (
      (isInitiator || hasSigned) &&
      d.status !== 'completed' &&
      d.status !== 'draft' &&
      d.status !== 'cancelled'
    );
  }).length;

  const completedDocs = documents.filter((d) => d.status === 'completed').length;
  const draftDocs = documents.filter((d) => d.status === 'draft').length;

  // Documents requiring attention
  const urgentDocs = documents
    .filter((d) => {
      const sig = d.signatories.find((s) => s.userId === user?.id);
      return sig?.status === 'pending' && d.status !== 'completed';
    })
    .slice(0, 3);

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-5 sm:space-y-8">
      {/* Welcome & Quick Action Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl p-4 sm:p-6 text-white shadow-lg border border-blue-950/40">
        <div>
          <div className="flex items-center space-x-2 text-xs font-semibold text-blue-300 uppercase tracking-wider mb-1">
            <ShieldCheck className="w-4 h-4 text-emerald-400" />
            <span>NFSSLG Digital Signature Workspace</span>
          </div>
          <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight">
            Welcome back, {user?.fullName}
          </h1>
          <p className="text-xs text-slate-300 mt-1">
            {user?.position} • {user?.department}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 w-full sm:w-auto">
          <button
            onClick={() => onNavigate('approval')}
            className="flex items-center justify-center space-x-2 px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-semibold backdrop-blur-xs border border-white/20 transition-all"
          >
            <Clock className="w-4 h-4 text-amber-300" />
            <span>Review Approvals ({pendingForMe})</span>
          </button>

          <button
            onClick={onOpenUpload}
            className="flex items-center justify-center space-x-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-md transition-all"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {/* Pending Signatures */}
        <div
          onClick={() => onNavigate('approval')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-900/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Pending Signatures
            </span>
            <div className="p-2 bg-blue-50 text-blue-900 rounded-xl group-hover:scale-110 transition-transform">
              <PenTool className="w-5 h-5 text-blue-700" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-900">{pendingForMe}</span>
            <span className="text-xs text-slate-400">awaiting your action</span>
          </div>
          <div className="mt-3 flex items-center text-xs font-semibold text-blue-900 group-hover:translate-x-1 transition-transform">
            <span>Documents for Your Approval</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Documents Awaiting Others */}
        <div
          onClick={() => onNavigate('my-docs')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-blue-900/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Awaiting Others
            </span>
            <div className="p-2 bg-amber-50 text-amber-800 rounded-xl group-hover:scale-110 transition-transform">
              <Clock className="w-5 h-5 text-amber-700" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-900">{awaitingOthers}</span>
            <span className="text-xs text-slate-400">in approval chain</span>
          </div>
          <div className="mt-3 flex items-center text-xs font-semibold text-slate-600 group-hover:text-blue-900 group-hover:translate-x-1 transition-transform">
            <span>Track Progress</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Completed Documents */}
        <div
          onClick={() => onNavigate('completed')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-emerald-500/40 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Completed Documents
            </span>
            <div className="p-2 bg-emerald-50 text-emerald-800 rounded-xl group-hover:scale-110 transition-transform">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-900">{completedDocs}</span>
            <span className="text-xs text-slate-400">finalized with seals</span>
          </div>
          <div className="mt-3 flex items-center text-xs font-semibold text-emerald-700 group-hover:translate-x-1 transition-transform">
            <span>View & Download</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>

        {/* Draft Documents */}
        <div
          onClick={() => onNavigate('drafts')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs hover:border-slate-400 transition-all cursor-pointer group"
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Drafts & Templates
            </span>
            <div className="p-2 bg-slate-100 text-slate-700 rounded-xl group-hover:scale-110 transition-transform">
              <FileText className="w-5 h-5 text-slate-600" />
            </div>
          </div>
          <div className="flex items-baseline space-x-2">
            <span className="text-3xl font-extrabold text-slate-900">{draftDocs}</span>
            <span className="text-xs text-slate-400">unreleased</span>
          </div>
          <div className="mt-3 flex items-center text-xs font-semibold text-slate-600 group-hover:text-slate-900 group-hover:translate-x-1 transition-transform">
            <span>Manage Drafts</span>
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </div>
        </div>
      </div>

      {/* Main Grid: Urgent Approvals & Recent Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Column (2 Cols): Urgent Documents For Your Approval */}
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <PenTool className="w-4 h-4 text-blue-900" />
              <h2 className="text-base font-bold text-slate-900">
                Action Required: Documents for Your Approval
              </h2>
            </div>
            <button
              onClick={() => onNavigate('approval')}
              className="text-xs font-semibold text-blue-900 hover:underline flex items-center gap-1"
            >
              <span>View All ({pendingForMe})</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          {urgentDocs.length === 0 ? (
            <div className="bg-white p-8 rounded-2xl border border-slate-200 text-center">
              <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
              <h4 className="text-sm font-bold text-slate-800">You are all caught up!</h4>
              <p className="text-xs text-slate-500 mt-1">
                No documents are currently awaiting your signature.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {urgentDocs.map((doc) => {
                const signedCount = doc.signatories.filter((s) => s.status === 'signed').length;
                const totalCount = doc.signatories.length;

                return (
                  <div
                    key={doc.id}
                    onClick={() => onOpenDocument(doc.id)}
                    className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs hover:border-blue-900/50 hover:shadow-md transition-all cursor-pointer flex items-center justify-between gap-4"
                  >
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-bold border border-slate-200">
                          {doc.referenceNumber}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-800">
                          {doc.category}
                        </span>
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 truncate">{doc.title}</h4>
                      <p className="text-xs text-slate-500 flex items-center space-x-3">
                        <span>Initiated by: {doc.initiator?.fullName}</span>
                        <span>•</span>
                        <span>
                          Signatures: {signedCount} of {totalCount}
                        </span>
                      </p>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDocument(doc.id);
                      }}
                      className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs whitespace-nowrap transition-colors flex items-center space-x-1.5"
                    >
                      <PenTool className="w-3.5 h-3.5" />
                      <span>Review & Sign</span>
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Quick Informational Guide */}
          <div className="bg-slate-50 p-5 rounded-2xl border border-slate-200 flex items-start space-x-4">
            <div className="p-2.5 bg-blue-100 text-blue-900 rounded-xl shrink-0 mt-0.5">
              <ShieldCheck className="w-6 h-6 text-blue-900" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                Digital Signatures & Organization Verification Charter
              </h4>
              <p className="text-xs text-slate-600 leading-relaxed">
                NFSSLG SignFlow maintains centralized signature synchronization. You may upload a transparent
                PNG or use the Signature Studio pen tool. Once signed, your signature is cryptographically
                embedded into the immutable PDF document with SHA-256 seal verification.
              </p>
            </div>
          </div>
        </div>

        {/* Right Column (1 Col): Live Audit Activity Feed */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-900" />
              <h2 className="text-base font-bold text-slate-900">Recent Audit Trail</h2>
            </div>
            {user?.role === 'admin' && (
              <button
                onClick={() => onNavigate('audit')}
                className="text-xs font-semibold text-blue-900 hover:underline"
              >
                Full Logs
              </button>
            )}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs space-y-3">
            {events.map((evt) => (
              <div
                key={evt.id}
                className="text-xs pb-3 border-b border-slate-100 last:border-0 last:pb-0 space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 truncate max-w-[170px]">
                    {evt.userName}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(evt.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <div className="flex items-center space-x-1.5">
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      evt.action === 'SIGNATURE_CONFIRMED'
                        ? 'bg-blue-600'
                        : evt.action === 'DOCUMENT_COMPLETED'
                        ? 'bg-emerald-600'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span className="font-semibold text-slate-700 text-[11px]">
                    {evt.action.replace(/_/g, ' ')}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 line-clamp-1">{evt.details}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
