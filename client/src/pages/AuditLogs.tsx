import React, { useState, useEffect } from 'react';
import { History, Search, Filter, ShieldCheck, Eye, X } from 'lucide-react';
import { api } from '../api/client';

export const AuditLogs: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [filterAction, setFilterAction] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedLog, setSelectedLog] = useState<any | null>(null);

  useEffect(() => {
    loadLogs();
  }, [filterAction]);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const res = await api.getAuditLogs(filterAction || undefined);
      setLogs(res.logs || []);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const getActionBadge = (action: string) => {
    if (action.includes('LOGIN')) return 'badge-present';
    if (action.includes('SUBMIT') || action.includes('CREATE')) return 'badge-excused';
    if (action.includes('DELETE') || action.includes('RESTORE')) return 'badge-absent';
    return 'badge-late';
  };

  return (
    <div>
      {/* Top Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.5rem',
          flexWrap: 'wrap',
          gap: '1rem'
        }}
      >
        <div>
          <h2>System Audit Trail & Security Logs</h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
            Traceable, tamper-evident log of student additions, marks modifications, and administrative events.
          </p>
        </div>

        <div style={{ width: '220px' }}>
          <select
            className="form-select"
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <option value="">All Actions</option>
            <option value="USER_LOGIN">User Logins</option>
            <option value="STUDENT_CREATE">Student Admissions</option>
            <option value="STUDENT_UPDATE">Student Updates</option>
            <option value="ATTENDANCE_SUBMIT">Attendance Submissions</option>
            <option value="MARKS_SUBMIT">Marks Entries</option>
            <option value="BACKUP_EXPORT">Backup Exports</option>
            <option value="BACKUP_RESTORE">Backup Restores</option>
          </select>
        </div>
      </div>

      {/* Logs Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-responsive">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: 170 }}>Timestamp</th>
                <th>User Account</th>
                <th>Action Performed</th>
                <th>Entity Target</th>
                <th>IP Address</th>
                <th style={{ textAlign: 'right' }}>Payload Details</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    Loading audit trail...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '2.5rem' }}>
                    <div style={{ color: 'var(--text-muted)' }}>No audit events found.</div>
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id}>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {log.timestamp}
                    </td>
                    <td>
                      <strong>{log.username}</strong>
                    </td>
                    <td>
                      <span className={`badge ${getActionBadge(log.action)}`}>
                        {log.action}
                      </span>
                    </td>
                    <td>
                      <code>{log.entity_type} {log.entity_id ? `(#${log.entity_id})` : ''}</code>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {log.ip_address || '127.0.0.1'}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="btn btn-secondary btn-sm"
                        style={{ padding: '0.3rem 0.55rem' }}
                      >
                        <Eye size={13} /> View JSON
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail JSON Modal */}
      {selectedLog && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '540px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem' }}>Audit Event Details #{selectedLog.id}</h3>
              <button onClick={() => setSelectedLog(null)} className="btn btn-secondary btn-icon btn-sm">
                <X size={18} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ marginBottom: '1rem', fontSize: '0.85rem' }}>
                <div><strong>Action:</strong> {selectedLog.action}</div>
                <div><strong>User:</strong> {selectedLog.username}</div>
                <div><strong>Timestamp:</strong> {selectedLog.timestamp}</div>
                <div><strong>Target:</strong> {selectedLog.entity_type} {selectedLog.entity_id}</div>
              </div>

              <label className="form-label">Raw Event Payload Data:</label>
              <pre
                style={{
                  background: 'var(--bg-subtle)',
                  padding: '1rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.8rem',
                  overflowX: 'auto',
                  border: '1px solid var(--border-color)',
                  maxHeight: '300px'
                }}
              >
                {(() => {
                  try {
                    return JSON.stringify(JSON.parse(selectedLog.details), null, 2);
                  } catch {
                    return selectedLog.details;
                  }
                })()}
              </pre>
            </div>

            <div className="modal-footer">
              <button onClick={() => setSelectedLog(null)} className="btn btn-secondary">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
