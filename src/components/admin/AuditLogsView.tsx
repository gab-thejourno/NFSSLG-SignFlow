import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Search,
  Filter,
  Download,
  Calendar,
  Clock,
  User as UserIcon,
  FileText,
  Hash,
  Shield,
  Layers,
} from 'lucide-react';
import type { DocumentEvent } from '../../types';
import { useAuth } from '../../context/AuthContext';
import { apiGetEvents } from '../../lib/api';

export const AuditLogsView: React.FC = () => {
  const { user } = useAuth();
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [actionFilter, setActionFilter] = useState<string>('all');

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const res = await apiGetEvents();
      setEvents(res.events);
    } catch (err) {
      console.error('Failed to load audit events', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, []);

  const filteredEvents = events.filter((e) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      (e.documentTitle && e.documentTitle.toLowerCase().includes(q)) ||
      e.userName.toLowerCase().includes(q) ||
      e.userEmail.toLowerCase().includes(q) ||
      e.details.toLowerCase().includes(q) ||
      e.action.toLowerCase().includes(q);

    const matchesAction = actionFilter === 'all' || e.action === actionFilter;

    return matchesSearch && matchesAction;
  });

  const exportCsv = () => {
    const headers = ['Event ID', 'Timestamp (UTC)', 'Action', 'Document Title', 'User Name', 'User Email', 'IP Address', 'Details'];
    const rows = filteredEvents.map((e) => [
      e.id,
      new Date(e.timestamp).toISOString(),
      e.action,
      `"${e.documentTitle || ''}"`,
      `"${e.userName}"`,
      e.userEmail,
      e.ipAddress || '127.0.0.1',
      `"${e.details.replace(/"/g, '""')}"`,
    ]);

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `SignFlow_Audit_Log_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center max-w-md mx-auto">
        <ShieldCheck className="w-12 h-12 text-rose-500 mx-auto mb-2" />
        <h3 className="text-base font-bold text-slate-800">Administrator Access Required</h3>
        <p className="text-xs text-slate-500 mt-1">
          The enterprise audit trail is cryptographically protected and restricted to system administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="p-3.5 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              Institutional Audit Trail & Event Ledger
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-blue-100 text-blue-900 border border-blue-200">
              Immutable Records
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Complete tamper-evident chronological event log for compliance, legal verification, and document lifecycle auditing
          </p>
        </div>

        <button
          onClick={exportCsv}
          className="flex items-center space-x-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors self-start sm:self-auto"
        >
          <Download className="w-4 h-4" />
          <span>Export Audit Log (CSV)</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center space-x-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <select
            value={actionFilter}
            onChange={(e) => setActionFilter(e.target.value)}
            className="px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 bg-slate-50/50"
          >
            <option value="all">All Action Types</option>
            <option value="DOCUMENT_UPLOADED">Document Uploaded</option>
            <option value="SIGNATURE_REQUEST_CREATED">Signature Request Created</option>
            <option value="SIGNATURE_CONFIRMED">Signature Confirmed</option>
            <option value="DOCUMENT_COMPLETED">Document Completed</option>
            <option value="DOCUMENT_OPENED">Document Opened</option>
            <option value="DOCUMENT_CANCELLED">Document Cancelled</option>
            <option value="DOCUMENT_REJECTED">Document Rejected</option>
          </select>
        </div>

        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by signer, document, IP, details..."
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-900 bg-slate-50/50"
          />
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-x-auto">
        <table className="w-full text-left text-xs min-w-[650px]">
          <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider">
            <tr>
              <th className="px-6 py-3.5">Timestamp (UTC)</th>
              <th className="px-6 py-3.5">Action Event</th>
              <th className="px-6 py-3.5">User / Signatory</th>
              <th className="px-6 py-3.5">Document Context</th>
              <th className="px-6 py-3.5">Audit Log Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {filteredEvents.map((evt) => (
              <tr key={evt.id} className="hover:bg-slate-50/60 transition-colors">
                <td className="px-6 py-4 whitespace-nowrap text-slate-600 font-mono text-[11px]">
                  {new Date(evt.timestamp).toLocaleString()}
                </td>

                <td className="px-6 py-4">
                  <span
                    className={`inline-flex items-center space-x-1 px-2.5 py-1 rounded-full font-bold text-[10px] tracking-wider uppercase ${
                      evt.action === 'DOCUMENT_COMPLETED'
                        ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                        : evt.action === 'SIGNATURE_CONFIRMED'
                        ? 'bg-blue-50 text-blue-800 border border-blue-200'
                        : evt.action === 'DOCUMENT_CANCELLED' || evt.action === 'DOCUMENT_REJECTED'
                        ? 'bg-rose-50 text-rose-800 border border-rose-200'
                        : 'bg-slate-100 text-slate-700 border border-slate-200'
                    }`}
                  >
                    {evt.action.replace(/_/g, ' ')}
                  </span>
                </td>

                <td className="px-6 py-4">
                  <div className="font-bold text-slate-900">{evt.userName}</div>
                  <div className="text-[11px] text-slate-500">{evt.userEmail}</div>
                </td>

                <td className="px-6 py-4">
                  <div className="font-semibold text-slate-900 max-w-xs truncate">
                    {evt.documentTitle || 'Document #' + evt.documentId.slice(-6)}
                  </div>
                  <div className="text-[10px] font-mono text-slate-400">ID: {evt.documentId}</div>
                </td>

                <td className="px-6 py-4 text-slate-600 max-w-sm">
                  <div className="line-clamp-2">{evt.details}</div>
                  {evt.ipAddress && (
                    <div className="text-[10px] font-mono text-slate-400 mt-0.5">
                      IP: {evt.ipAddress}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
