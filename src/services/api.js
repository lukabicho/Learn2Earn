import axios from 'axios';

const API_BASE_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3001/api').replace(/\/$/, '');

/**
 * Normalize different backend submission shapes into a consistent object
 * so the UI can rely on the same fields.
 */
const normalizeSubmission = (item) => ({
  id: item.id ?? item._id ?? null,
  wallet: (item.wallet || item.walletAddress || item.address || '').toLowerCase(),
  name: item.name ?? item.username ?? '',
  proofLink: item.proofLink ?? item.proof ?? item.link ?? '',
  amount: item.amount ?? item.reward ?? null,
  submittedAt: item.submittedAt ?? item.createdAt ?? null,
  approved: !!item.approved,
  moderatorNotes: item.moderatorNotes ?? item.notes ?? null,
  raw: item
});

/**
 * Helpers for basic submission flows
 */
export const submitProof = async (data) => {
  try {
    const res = await axios.post(`${API_BASE_URL}/submissions`, data);
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Failed to submit proof');
  }
};

export const checkSubmissionStatus = async (walletAddress) => {
  try {
    const normalized = walletAddress.toLowerCase();
    const res = await axios.get(`${API_BASE_URL}/submissions/${normalized}`);
    return res.data;
  } catch (err) {
    if (err.response?.status === 404) return null;
    throw new Error(err.response?.data?.message || 'Failed to check submission status');
  }
};

export const getApprovedSubmissions = async () => {
  try {
    const res = await axios.get(`${API_BASE_URL}/submissions/approved`);
    return res.data;
  } catch (err) {
    throw new Error(err.response?.data?.message || 'Failed to fetch approved submissions');
  }
};

/**
 * Admin helpers
 *
 * adminGetPending: try several common backend URL shapes and return a
 * normalized array of pending submissions.
 *
 * adminModerateSubmission: try multiple endpoint shapes to approve/reject.
 * Preferred backend shape (based on your server examples):
 *   PUT /api/submissions/{WALLET_ADDRESS}/approve
 * with body { approved: true|false, moderatorNotes: '...' }
 */
const tryCandidates = async (candidates, moderatorKey) => {
  let lastErr = null;
  for (const c of candidates) {
    try {
      const cfg = {
        url: c.url,
        method: c.method ?? 'get',
        headers: { ...(c.headers || {}), 'x-moderator-key': moderatorKey || '' }
      };
      if (c.data) cfg.data = c.data;
      const res = await axios(cfg);
      return res;
    } catch (err) {
      lastErr = err;
      // try next candidate only on 404; otherwise surface the error
      if (!err.response || err.response.status !== 404) break;
    }
  }
  throw lastErr ?? new Error('No candidates to try');
};

export const adminGetPending = async (moderatorKey) => {
  const candidates = [
    `${API_BASE_URL}/submissions?status=pending`,
    `${API_BASE_URL}/submissions`
  ].map((url) => ({ url, method: 'get' }));

  try {
    const res = await tryCandidates(candidates, moderatorKey);
    const data = res.data;
    // Normalize to an array if possible
    let list = [];
    if (Array.isArray(data)) list = data;
    else if (Array.isArray(data?.list)) list = data.list;
    else if (Array.isArray(data?.submissions)) list = data.submissions;
    else if (data && typeof data === 'object') list = Object.values(data);
    // Map to consistent shape
    return list.map(normalizeSubmission);
  } catch (err) {
    throw new Error(
      err.response?.data?.message ??
      err.response?.data ??
      err.message ??
      'Failed to load pending submissions'
    );
  }
};

export const adminModerateSubmission = async (idOrWallet, action, moderatorKey, reason = '') => {
  if (!idOrWallet) throw new Error('Missing submission identifier (id or wallet)');
  if (action !== 'approve' && action !== 'reject') throw new Error('Action must be "approve" or "reject"');

  const payload = { approved: action === 'approve', moderatorNotes: reason };
  const base = API_BASE_URL;

  // Try primary wallet-based PUT, then several fallbacks.
  const candidates = [
    // Primary (matches your backend example)
    { url: `${base}/submissions/${idOrWallet}/approve`, method: 'put', data: payload },

    // Common admin shapes
    { url: `${base}/admin/submissions/${idOrWallet}/${action}`, method: 'post', data: { reason } },
    { url: `${base}/submissions/${idOrWallet}/${action}`, method: 'post', data: { reason } },

    // Endpoints that accept id/wallet in body
    { url: `${base}/submissions/approve`, method: 'post', data: { id: idOrWallet, reason } },
    { url: `${base}/submissions/reject`, method: 'post', data: { id: idOrWallet, reason } },

    // Last-resort update by patch/put on resource
    { url: `${base}/submissions/${idOrWallet}`, method: 'patch', data: payload },
    { url: `${base}/submissions/${idOrWallet}`, method: 'put', data: payload }
  ];

  // tryCandidates helper exists above; reuse it
  try {
    const res = await tryCandidates(candidates, moderatorKey);
    return res.data;
  } catch (err) {
    // surface clear message
    const msg =
      err?.response?.data?.message ??
      err?.response?.data ??
      err?.message ??
      `Failed to ${action} submission`;
    throw new Error(msg);
  }
};