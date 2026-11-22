import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  PenTool,
  Download,
  Calendar,
  User as UserIcon,
  ChevronRight,
  ArrowUpDown,
  Lock,
} from 'lucide-react';
import type { DocumentItem } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiGetDocuments, subscribeToRealtime } from '../../lib/api';

interface DocumentsApprovalViewProps {
  onOpenDocument: (docId: string) => void;
}

export const DocumentsApprovalView: React.FC<DocumentsApprovalViewProps> = ({
  onOpenDocument,
}) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'signed' | 'overdue' | 'completed'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchAssignedDocs = async () => {
    try {
      setLoading(true);
      const res = await apiGetDocuments({
        scope: 'assigned',
        filterStatus: filter,
        search: searchQuery,
      });
      setDocuments(res.documents);
    } catch (err) {
      console.error('Failed to fetch assigned documents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAssignedDocs();
  }, [filter, searchQuery]);

  useEffect(() => {
    const unsub = subscribeToRealtime(user?.id, (evt) => {
      if (evt.type === 'SIGNATURE_ADDED' || evt.type === 'DOCUMENT_CREATED') {
        fetchAssignedDocs();
      }
    });
    return unsub;
  }, [user?.id, filter, searchQuery]);

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Title & Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">
              Documents for Your Approval
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
              {documents.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">
            Official documents assigned to your account requiring review, legal verification, and signature
          </p>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Filter Pills */}
        <div className="flex items-center space-x-1 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          {[
            { id: 'all', label: 'All Assigned' },
            { id: 'pending', label: 'Pending My Signature' },
            { id: 'signed', label: 'Signed by Me' },
            { id: 'overdue', label: 'Overdue' },
            { id: 'completed', label: 'Fully Completed' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilter(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
                filter === tab.id
                  ? 'bg-blue-900 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by title, ref #, category..."
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Documents List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center">
          <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mb-3"></div>
          <span className="text-xs font-medium">Fetching documents for your approval...</span>
        </div>
      ) : documents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto">
          <div className="w-12 h-12 bg-blue-50 text-blue-900 rounded-full flex items-center justify-center mx-auto mb-3">
            <CheckCircle2 className="w-6 h-6 text-blue-800" />
          </div>
          <h3 className="text-base font-bold text-slate-900">All caught up!</h3>
          <p className="text-xs text-slate-500 mt-1">
            There are no documents requiring your signature matching this filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-4">
          {documents.map((doc) => {
            const mySigRecord = doc.signatories.find((s) => s.userId === user?.id);
            const isMyTurn = mySigRecord?.status === 'pending';
            const isSignedByMe = mySigRecord?.status === 'signed';
            const isWaitingSequence =
              doc.signingOrderType === 'sequential' && mySigRecord?.status === 'waiting';

            const signedCount = doc.signatories.filter((s) => s.status === 'signed').length;
            const totalCount = doc.signatories.length;
            const progressPercent = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : (doc.signatures.length > 0 ? 100 : 0);

            const isOverdue =
              doc.deadline && new Date(doc.deadline) < new Date() && doc.status !== 'completed';

            return (
              <div
                key={doc.id}
                onClick={() => onOpenDocument(doc.id)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-blue-900/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Main Information */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                      {doc.referenceNumber}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-800 rounded">
                      {doc.category}
                    </span>
                    {isOverdue && (
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-rose-50 text-rose-700 rounded border border-rose-200 flex items-center gap-1">
                        <AlertTriangle className="w-3 h-3" />
                        OVERDUE
                      </span>
                    )}
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors truncate">
                    {doc.title}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-1">{doc.description}</p>

                  {/* Metadata Row */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                    <span className="flex items-center space-x-1">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Initiator: {doc.initiator?.fullName || 'Legal Counsel'}</span>
                    </span>

                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>
                        Received: {new Date(doc.createdAt).toLocaleDateString()}
                      </span>
                    </span>

                    {doc.deadline && (
                      <span
                        className={`flex items-center space-x-1 ${
                          isOverdue ? 'text-rose-600 font-semibold' : ''
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Deadline: {new Date(doc.deadline).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress & Signatory Status */}
                <div className="flex items-center space-x-6 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="w-36 hidden sm:block">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Progress</span>
                      <span className="text-blue-950 font-bold">
                        {signedCount}/{totalCount}
                      </span>
                    </div>
                    <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden border border-slate-200">
                      <div
                        className={`h-full ${
                          doc.status === 'completed' ? 'bg-emerald-600' : 'bg-blue-900'
                        }`}
                        style={{ width: `${progressPercent}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 block">
                      {doc.signingOrderType === 'sequential' ? 'Sequential' : 'Parallel'} Workflow
                    </span>
                  </div>

                  {/* Action Button Based on User Status */}
                  <div className="flex items-center space-x-2">
                    {doc.status === 'completed' ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(doc.id);
                        }}
                        className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 flex items-center space-x-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                        <span>Completed Document</span>
                      </button>
                    ) : isMyTurn ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(doc.id);
                        }}
                        className="px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs flex items-center space-x-1.5 transition-colors animate-pulse"
                      >
                        <PenTool className="w-4 h-4" />
                        <span>Sign Document</span>
                      </button>
                    ) : isSignedByMe ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(doc.id);
                        }}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 flex items-center space-x-1.5 transition-colors"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>Signed (Awaiting Others)</span>
                      </button>
                    ) : isWaitingSequence ? (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(doc.id);
                        }}
                        className="px-3.5 py-2 bg-slate-50 text-slate-500 rounded-lg text-xs font-semibold border border-slate-200 flex items-center space-x-1.5"
                      >
                        <Lock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Waiting for Turn</span>
                      </button>
                    ) : (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenDocument(doc.id);
                        }}
                        className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 flex items-center space-x-1.5 transition-colors"
                      >
                        <span>View Document</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
