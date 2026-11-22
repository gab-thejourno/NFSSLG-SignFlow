import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  CheckCircle2,
  Clock,
  Download,
  Calendar,
  User as UserIcon,
  ChevronRight,
  Plus,
  Trash2,
  Archive,
  ExternalLink,
  ShieldCheck,
} from 'lucide-react';
import type { DocumentItem } from '../../types';
import { DOCUMENT_CATEGORIES } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiGetDocuments, subscribeToRealtime } from '../../lib/api';

interface DocumentsListViewProps {
  scope: 'mine' | 'completed' | 'drafts' | 'archived';
  title: string;
  subtitle: string;
  onOpenDocument: (docId: string) => void;
  onOpenUpload?: () => void;
}

export const DocumentsListView: React.FC<DocumentsListViewProps> = ({
  scope,
  title,
  subtitle,
  onOpenDocument,
  onOpenUpload,
}) => {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const fetchDocs = async () => {
    try {
      setLoading(true);
      const res = await apiGetDocuments({
        scope,
        search: searchQuery,
      });
      setDocuments(res.documents);
    } catch (err) {
      console.error('Failed to fetch documents', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDocs();
  }, [scope, searchQuery]);

  useEffect(() => {
    const unsub = subscribeToRealtime(user?.id, (evt) => {
      if (
        evt.type === 'SIGNATURE_ADDED' ||
        evt.type === 'DOCUMENT_CREATED' ||
        evt.type === 'DOCUMENT_UPDATED'
      ) {
        fetchDocs();
      }
    });
    return unsub;
  }, [user?.id, scope, searchQuery]);

  const allAvailableCategories = Array.from(
    new Set([
      ...DOCUMENT_CATEGORIES,
      ...documents.map((d) => d.category).filter(Boolean),
    ])
  );

  const filteredDocs =
    selectedCategory === 'all'
      ? documents
      : documents.filter(
          (doc) => doc.category?.toLowerCase() === selectedCategory.toLowerCase()
        );

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{title}</h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
              {filteredDocs.length} Total
            </span>
          </div>
          <p className="text-sm text-slate-500 mt-1">{subtitle}</p>
        </div>

        {onOpenUpload && (
          <button
            onClick={onOpenUpload}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-900 hover:bg-blue-950 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>New Document</span>
          </button>
        )}
      </div>

      {/* Filter Bar: Search & Category Filter */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search documents by title or reference number..."
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-slate-50/50"
          />
        </div>

        <div className="flex items-center space-x-2 self-end sm:self-auto">
          <label className="text-xs font-semibold text-slate-500 whitespace-nowrap">
            Category:
          </label>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50/60 focus:outline-none focus:ring-2 focus:ring-blue-900"
          >
            <option value="all">All Categories</option>
            {allAvailableCategories.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Document List */}
      {loading ? (
        <div className="py-16 text-center text-slate-400 flex flex-col items-center">
          <div className="w-8 h-8 border-3 border-blue-900 border-t-transparent rounded-full animate-spin mb-3"></div>
          <span className="text-xs font-medium">Loading documents...</span>
        </div>
      ) : filteredDocs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto">
          <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <h3 className="text-base font-bold text-slate-800">No documents found</h3>
          <p className="text-xs text-slate-500 mt-1">There are no documents matching this section or category.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {filteredDocs.map((doc) => {
            const signedCount = doc.signatories.filter((s) => s.status === 'signed').length;
            const totalCount = doc.signatories.length;
            const progressPercent = totalCount > 0 ? Math.round((signedCount / totalCount) * 100) : (doc.signatures.length > 0 ? 100 : 0);

            return (
              <div
                key={doc.id}
                onClick={() => onOpenDocument(doc.id)}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs hover:shadow-md hover:border-blue-900/40 transition-all cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-4 group"
              >
                {/* Details */}
                <div className="space-y-1.5 flex-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded border border-slate-200">
                      {doc.referenceNumber}
                    </span>
                    <span className="text-[11px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-800 rounded">
                      {doc.category}
                    </span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                        doc.status === 'completed'
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : doc.status === 'in_progress' || doc.status === 'pending_signatures'
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : 'bg-slate-100 text-slate-600'
                      }`}
                    >
                      {doc.status.replace(/_/g, ' ')}
                    </span>
                  </div>

                  <h3 className="text-base font-bold text-slate-900 group-hover:text-blue-900 transition-colors truncate">
                    {doc.title}
                  </h3>

                  <p className="text-xs text-slate-500 line-clamp-1">{doc.description}</p>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 pt-1">
                    <span className="flex items-center space-x-1">
                      <UserIcon className="w-3.5 h-3.5 text-slate-400" />
                      <span>Initiator: {doc.initiator?.fullName}</span>
                    </span>

                    <span className="flex items-center space-x-1">
                      <Calendar className="w-3.5 h-3.5 text-slate-400" />
                      <span>Created: {new Date(doc.createdAt).toLocaleDateString()}</span>
                    </span>

                    {doc.deadline && (
                      <span className="flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        <span>Deadline: {new Date(doc.deadline).toLocaleDateString()}</span>
                      </span>
                    )}
                  </div>
                </div>

                {/* Progress & Actions */}
                <div className="flex items-center space-x-5 border-t md:border-t-0 pt-3 md:pt-0 border-slate-100">
                  <div className="w-36 hidden sm:block">
                    <div className="flex justify-between text-[11px] font-semibold text-slate-600 mb-1">
                      <span>Signatures</span>
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
                  </div>

                  <div className="flex items-center space-x-2">
                    {(doc.status === 'completed' || doc.signatures.length > 0) && (
                      <a
                        href={`${doc.finalPdfUrl || doc.originalPdfUrl}${(doc.finalPdfUrl || doc.originalPdfUrl).includes('?') ? '&' : '?'}v=${encodeURIComponent(doc.updatedAt || '1')}`}
                        download={`${doc.referenceNumber}_Signed.pdf`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="px-3.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200 flex items-center space-x-1 transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>PDF</span>
                      </a>
                    )}

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDocument(doc.id);
                      }}
                      className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold border border-slate-200 flex items-center space-x-1 transition-colors"
                    >
                      <span>View</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
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
