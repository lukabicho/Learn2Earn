import React, { useState, useEffect } from 'react';
import { checkSubmissionStatus } from '../services/api';

export default function ClaimReward({ account }) {
  const [submission, setSubmission] = useState(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState(null);

  // Fetch submission status on mount or when account changes
  useEffect(() => {
    if (!account) {
      setSubmission(null);
      setLoading(false);
      return;
    }

    const fetchSubmission = async () => {
      setLoading(true);
      setStatus(null);
      try {
        const data = await checkSubmissionStatus(account);
        setSubmission(data);
      } catch (err) {
        console.error('Error fetching submission:', err);
        setStatus({ type: 'error', message: err.message || 'Failed to fetch submission' });
        setSubmission(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSubmission();
  }, [account]);

  const openExplorer = () => {
    if (submission?.transactionHash) {
      window.open(`https://explore-testnet.vechain.org/transactions/${submission.transactionHash}`, '_blank');
    }
  };

  if (!account) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
        Please connect your wallet to view your rewards status.
      </div>
    );
  }

  if (loading) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center' }}>
        Loading submission status…
      </div>
    );
  }

  if (!submission) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: '#666' }}>
        No submission found for your wallet.
      </div>
    );
  }

  return (
    <div className="reward-section" style={{ padding: '1.5rem', maxWidth: '600px', margin: '0 auto' }}>
      <h3 style={{ marginBottom: '1rem' }}>🎁 Reward Status</h3>

      {submission.approved ? (
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#d4edda', 
          borderRadius: '8px',
          border: '1px solid #c3e6cb'
        }}>
          <div style={{ color: '#155724', fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
            ✅ Rewards Distributed!
          </div>
          <p style={{ color: '#155724', margin: '0.5rem 0' }}>
            Your submission has been approved and B3TR tokens have been automatically distributed to your wallet.
          </p>
          <div style={{ 
            marginTop: '1rem',
            padding: '1rem',
            backgroundColor: '#fff',
            borderRadius: '6px',
            fontSize: '0.9rem'
          }}>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Reward Amount:</strong> 10 B3TR
            </div>
            <div style={{ marginBottom: '0.5rem' }}>
              <strong>Approved:</strong> {new Date(submission.approvedAt).toLocaleString()}
            </div>
            {submission.transactionHash && (
              <div>
                <strong>Transaction:</strong>{' '}
                <button
                  onClick={openExplorer}
                  style={{
                    padding: '0.25rem 0.75rem',
                    borderRadius: '4px',
                    backgroundColor: '#007bff',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    fontSize: '0.85rem',
                    marginLeft: '0.5rem'
                  }}
                  onMouseOver={(e) => e.target.style.backgroundColor = '#0056b3'}
                  onMouseOut={(e) => e.target.style.backgroundColor = '#007bff'}
                >
                  View on Explorer →
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div style={{ 
          padding: '1.5rem', 
          backgroundColor: '#fff3cd', 
          borderRadius: '8px',
          border: '1px solid #ffeaa7',
          color: '#856404'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '0.5rem', fontSize: '1.1rem' }}>
            ⏳ Pending Review
          </div>
          <p style={{ margin: '0.5rem 0' }}>
            Your submission is currently being reviewed by our team. Once approved, rewards will be automatically distributed to your wallet.
          </p>
          <div style={{ 
            marginTop: '1rem',
            padding: '0.75rem',
            backgroundColor: '#fff',
            borderRadius: '6px',
            fontSize: '0.85rem',
            color: '#666'
          }}>
            <strong>Note:</strong> No action required from you. Rewards are distributed automatically upon approval.
          </div>
        </div>
      )}

      {status && (
        <div 
          style={{ 
            marginTop: '1rem',
            padding: '0.75rem',
            borderRadius: '6px',
            backgroundColor: status.type === 'error' ? '#f8d7da' : '#d1ecf1',
            border: `1px solid ${status.type === 'error' ? '#f5c6cb' : '#bee5eb'}`,
            color: status.type === 'error' ? '#721c24' : '#0c5460'
          }}
        >
          {status.message}
        </div>
      )}
    </div>
  );
}