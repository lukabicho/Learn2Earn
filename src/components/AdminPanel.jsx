import React, { useState, useEffect } from 'react';
import { Check, X, Clock, Award, Users, RefreshCw, Search, Key } from 'lucide-react';
import { adminGetPending, adminModerateSubmission } from '../services/api';

export default function AdminPanel() {
  const [moderatorKey, setModeratorKey] = useState(localStorage.getItem('moderatorKey') || '');
  const [showKeyInput, setShowKeyInput] = useState(!moderatorKey);
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filter, setFilter] = useState('all');
  const [stats, setStats] = useState({ pending: 0, approved: 0, rejected: 0, totalRewards: 0 });

  useEffect(() => {
    if (moderatorKey) loadPending();
  }, [moderatorKey]);

  // const saveKey = (key) => {
  //   localStorage.setItem('moderatorKey', key || '');
  //   setModeratorKey(key || '');
  //   setShowKeyInput(!key);
  // };

  const loadPending = async () => {
    setError(null);
    setLoading(true);
    try {
      const data = await adminGetPending(moderatorKey);
      // normalize shape returned by api.normalizeSubmission: { id, wallet, name, proofLink, amount, submittedAt, approved, moderatorNotes, raw }
      const list = Array.isArray(data) ? data : [];
      setSubmissions(list);
      // quick stats
      setStats({
        pending: list.filter((s) => !s.approved).length,
        approved: list.filter((s) => s.approved).length,
        rejected: 0,
        totalRewards: list.reduce((acc, s) => acc + (s.amount || 0), 0)
      });
    } catch (err) {
      console.error('loadPending error', err);
      setError(err?.message || String(err));
      setSubmissions([]);
    } finally {
      setLoading(false);
    }
  };

  const moderate = async (wallet, action) => {
    if (!moderatorKey) {
      setError('Moderator key required');
      return;
    }
    setError(null);
    setActionLoading((p) => ({ ...p, [wallet]: true }));
    try {
      const reason = action === 'reject' ? (window.prompt('Reason for rejection (optional):', '') ?? '') : '';
      await adminModerateSubmission(wallet, action, moderatorKey, reason);
      await loadPending();
    } catch (err) {
      console.error('moderate error', err);
      setError(err?.message || 'Action failed');
    } finally {
      setActionLoading((p) => ({ ...p, [wallet]: false }));
    }
  };

  const filtered = submissions.filter((s) => {
    const matchesFilter = filter === 'all' || (filter === 'pending' && !s.approved) || (filter === 'approved' && s.approved);
    const term = searchTerm.trim().toLowerCase();
    const matchesSearch = !term || (s.name || '').toLowerCase().includes(term) || (s.wallet || '').toLowerCase().includes(term);
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="container" style={{ padding: 16 }}>
      {showKeyInput ? (
        <div className="card" style={{ maxWidth: 560, margin: '2rem auto', padding: 16 }}>
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Key /> Admin Authentication
          </h2>
          <p style={{ color: '#666' }}>Enter moderator key to access admin actions</p>
          <input
            type="password"
            value={moderatorKey}
            onChange={(e) => setModeratorKey(e.target.value)}
            placeholder="Moderator key"
            style={{ width: '100%', padding: 8, marginBottom: 12 }}
            //onKeyPress={(e) => e.key === 'Enter' && saveKey(moderatorKey)}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => (moderatorKey)} disabled={!moderatorKey.trim()} style={{ flex: 1 }}>
              Enter
            </button>
            <button onClick={() => { (''); setShowKeyInput(false); }} style={{ flex: 1 }}>
              Skip (read-only)
            </button>
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h1 style={{ margin: 0 }}>Admin Panel</h1>
              <p style={{ color: '#666', margin: 0 }}>Manage pending submissions</p>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={() => { setShowKeyInput(true); setModeratorKey(''); localStorage.removeItem('moderatorKey'); }}>Change Key</button>
              <button onClick={loadPending}>Refresh</button>
            </div>
          </div>

          {error && <div style={{ background: '#fee', color: '#900', padding: 8, marginBottom: 12 }}>{error}</div>}

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginBottom: 12 }}>
            <div style={{ borderLeft: '4px solid #f59e0b', padding: 12 }}><div style={{ color: '#666' }}>Pending</div><div style={{ fontWeight: '700', fontSize: 20 }}>{stats.pending}</div></div>
            <div style={{ borderLeft: '4px solid #10b981', padding: 12 }}><div style={{ color: '#666' }}>Approved</div><div style={{ fontWeight: '700', fontSize: 20 }}>{stats.approved}</div></div>
            <div style={{ borderLeft: '4px solid #3b82f6', padding: 12 }}><div style={{ color: '#666' }}>Total Rewards</div><div style={{ fontWeight: '700', fontSize: 20 }}>{stats.totalRewards}</div></div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <input placeholder="Search by name or wallet" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} style={{ width: '60%', padding: 8, marginRight: 8 }} />
            <select value={filter} onChange={(e) => setFilter(e.target.value)} style={{ padding: 8 }}>
              <option value="all">All</option>
              <option value="pending">Pending</option>
              <option value="approved">Approved</option>
            </select>
          </div>

          <div className="card" style={{ padding: 0 }}>
            {loading ? (
              <div style={{ padding: 24, textAlign: 'center' }}>Loading…</div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: 24, textAlign: 'center' }}>
                <Users size={48} style={{ color: '#ddd' }} />
                <div style={{ color: '#666' }}>No submissions</div>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead style={{ background: '#f8f9fa' }}>
                  <tr>
                    <th style={{ padding: 12, textAlign: 'left' }}>Student</th>
                    <th style={{ padding: 12, textAlign: 'left' }}>Wallet</th>
                    <th style={{ padding: 12, textAlign: 'left' }}>Proof</th>
                    <th style={{ padding: 12, textAlign: 'left' }}>Submitted</th>
                    <th style={{ padding: 12, textAlign: 'left' }}>Amount</th>
                    <th style={{ padding: 12, textAlign: 'left' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((s) => {
                    const wallet = s.wallet || s.walletAddress || s.id || '';
                    return (
                      <tr key={wallet + s.id}>
                        <td style={{ padding: 12 }}>{s.name || '—'}</td>
                        <td style={{ padding: 12 }}><code>{(wallet || '').slice(0, 8)}…{(wallet || '').slice(-6)}</code></td>
                        <td style={{ padding: 12 }}><a href={s.proofLink} target="_blank" rel="noreferrer">View</a></td>
                        <td style={{ padding: 12 }}>{s.submittedAt ? new Date(s.submittedAt).toLocaleString() : '—'}</td>
                        <td style={{ padding: 12 }}>{s.amount ?? '10'}</td>
                        <td style={{ padding: 12 }}>
                          {!s.approved && (
                            <div style={{ display: 'flex', gap: 8 }}>
                              <button onClick={() => moderate(wallet, 'approve')} disabled={!!actionLoading[wallet]}>
                                {actionLoading[wallet] ? 'Working…' : <Check size={14} />}
                              </button>
                              <button onClick={() => moderate(wallet, 'reject')} disabled={!!actionLoading[wallet]}>
                                {actionLoading[wallet] ? 'Working…' : <X size={14} />}
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}
    </div>
  );
}