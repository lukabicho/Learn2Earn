import express from 'express';
import cors from 'cors';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';
import { gradeSubmissionOnChain } from './contractService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// Initialize database
const db = new sqlite3.Database(join(__dirname, 'submissions.db'));

db.run(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_address TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    proof_link TEXT NOT NULL,
    submitted_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    approved BOOLEAN DEFAULT 0,
    approved_at DATETIME,
    moderator_notes TEXT,
    claimed BOOLEAN DEFAULT 0,
    claimed_at DATETIME,
    transaction_hash TEXT
  )
`);

// Routes

// Submit proof
app.post('/api/submissions', async (req, res) => {
  try {
    const { walletAddress, name, proofLink } = req.body;
    if (!walletAddress || !name || !proofLink) {
      return res.status(400).json({ message: 'Missing required fields: walletAddress, name, and proofLink are required' });
    }

    const normalizedWallet = walletAddress.toLowerCase();

    const existingSubmission = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM submissions WHERE wallet_address = ?', [normalizedWallet], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (existingSubmission) {
      return res.status(400).json({ message: 'You have already submitted a proof' });
    }

    await new Promise((resolve, reject) => {
      db.run(
        'INSERT INTO submissions (wallet_address, name, proof_link) VALUES (?, ?, ?)',
        [normalizedWallet, name, proofLink],
        function (err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });

    res.status(201).json({ message: 'Submission received successfully', walletAddress: normalizedWallet });
  } catch (error) {
    console.error('Error saving submission:', error);
    res.status(500).json({ message: 'Failed to save submission' });
  }
});

// Get submission by wallet
app.get('/api/submissions/:walletAddress', async (req, res) => {
  try {
    const walletAddress = req.params.walletAddress.toLowerCase();
    const submission = await new Promise((resolve, reject) => {
      db.get('SELECT * FROM submissions WHERE wallet_address = ?', [walletAddress], (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });

    if (!submission) return res.status(404).json({ message: 'No submission found' });

    res.json({
      submitted: true,
      approved: submission.approved === 1,
      claimed: submission.claimed === 1,
      submittedAt: submission.submitted_at,
      approvedAt: submission.approved_at,
      claimedAt: submission.claimed_at,
      transactionHash: submission.transaction_hash,
      name: submission.name,
      proofLink: submission.proof_link
    });
  } catch (error) {
    console.error('Error fetching submission:', error);
    res.status(500).json({ message: 'Failed to fetch submission' });
  }
});

// Get all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    const submissions = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM submissions ORDER BY submitted_at DESC', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });

    res.json(submissions.map(sub => ({
      id: sub.id,
      walletAddress: sub.wallet_address,
      name: sub.name,
      proofLink: sub.proof_link,
      submitted: true,
      approved: sub.approved === 1,
      submittedAt: sub.submitted_at,
      approvedAt: sub.approved_at,
      moderatorNotes: sub.moderator_notes
    })));
  } catch (error) {
    console.error('Error fetching submissions:', error);
    res.status(500).json({ message: 'Failed to fetch submissions' });
  }
});

// Approve/reject submission (moderator)
// NOTE: If approved=true, rewards are distributed automatically on-chain!
app.put('/api/submissions/:walletAddress/approve', async (req, res) => {
  const walletAddress = req.params.walletAddress.toLowerCase();
  const { approved, moderatorNotes } = req.body;
  const moderatorKey = req.headers['x-moderator-key'];

  if (moderatorKey !== process.env.MODERATOR_KEY) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  try {
    // Call smart contract FIRST to grade submission
    // This will automatically distribute rewards if approved=true
    console.log(`Grading submission on-chain for ${walletAddress}: ${approved ? 'approved' : 'rejected'}`);
    const contractResult = await gradeSubmissionOnChain(walletAddress, approved);

    if (!contractResult.success) {
      console.error('Smart contract grading failed:', contractResult.error);
      return res.status(500).json({ 
        message: 'Failed to process on blockchain: ' + contractResult.error 
      });
    }

    // Update database after successful blockchain transaction
    await new Promise((resolve, reject) => {
      db.run(
        `UPDATE submissions SET 
          approved = ?, 
          approved_at = ?, 
          moderator_notes = ?,
          claimed = ?,
          claimed_at = ?,
          transaction_hash = ?
        WHERE wallet_address = ?`,
        [
          approved ? 1 : 0, 
          new Date().toISOString(), 
          moderatorNotes || null,
          approved ? 1 : 0, // Auto-mark as claimed if approved
          approved ? new Date().toISOString() : null,
          contractResult.txId,
          walletAddress
        ],
        function (err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });

    res.json({ 
      message: approved 
        ? 'Submission approved and rewards distributed automatically!' 
        : 'Submission rejected', 
      approved,
      txId: contractResult.txId,
      rewardsDistributed: approved
    });
  } catch (error) {
    console.error('Error updating submission:', error);
    res.status(500).json({ message: 'Failed to update submission' });
  }
});

// Get all approved submissions
app.get('/api/submissions/approved', async (req, res) => {
  try {
    const submissions = await new Promise((resolve, reject) => {
      db.all('SELECT wallet_address, name FROM submissions WHERE approved = 1', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    res.json(submissions);
  } catch (error) {
    console.error('Error fetching approved submissions:', error);
    res.status(500).json({ message: 'Failed to fetch approved submissions' });
  }
});

// REMOVED: Claim reward endpoint - rewards are distributed automatically when approved!
// The smart contract distributes rewards automatically in gradeSubmission() when approved=true

// Start server
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});