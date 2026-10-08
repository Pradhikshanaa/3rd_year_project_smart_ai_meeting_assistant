import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { taskService } from '../services/api';
import { 
  CheckCircle2, XCircle, Clock, User, AlertCircle, 
  MessageSquare, ShieldCheck, ArrowRight, ArrowLeft 
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Approvals = () => {
  const { user, isLeader } = useAuth();
  const [approvals, setApprovals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Reject feedback modal
  const [rejectingTask, setRejectingTask] = useState(null);
  const [feedbackText, setFeedbackText] = useState('');

  const fetchApprovals = async () => {
    try {
      setLoading(true);
      const res = await taskService.getApprovals();
      if (res.success) {
        setApprovals(res.approvals);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load pending approvals from server.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchApprovals();
  }, []);

  const handleApprove = async (taskId, taskTitle) => {
    try {
      const res = await taskService.approveTask(taskId);
      if (res.success) {
        setApprovals(approvals.filter(a => a.id !== taskId));
        setSuccessMsg(`Task "${taskTitle}" has been APPROVED and marked Completed! 🎉`);
        setTimeout(() => setSuccessMsg(''), 3500);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error approving task.');
    }
  };

  const handleRejectSubmit = async (e) => {
    e.preventDefault();
    if (!feedbackText.trim() || !rejectingTask) return;

    try {
      const res = await taskService.rejectTask(rejectingTask.id, feedbackText.trim());
      if (res.success) {
        setApprovals(approvals.filter(a => a.id !== rejectingTask.id));
        setRejectingTask(null);
        setFeedbackText('');
        setSuccessMsg(`Task returned to employee with rework feedback.`);
        setTimeout(() => setSuccessMsg(''), 3500);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error rejecting task.');
    }
  };

  if (!isLeader) {
    return (
      <div className="page-body">
        <div className="alert alert-error">
          Access Denied: Only Team Leaders have permission to approve submitted tasks.
        </div>
        <Link to="/tasks" className="btn btn-secondary btn-sm" style={{ marginTop: '1rem' }}>
          Back to My Tasks
        </Link>
      </div>
    );
  }

  return (
    <div className="page-body">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <Link to="/tasks" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <ArrowLeft size={14} />
              <span>Back to Tasks</span>
            </Link>
            <span className="badge badge-leader">Team Leader Verification</span>
          </div>

          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)', marginTop: '4px' }}>
            Task Approvals Queue ({approvals.length})
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)' }}>
            Review tasks submitted by team members. Approve completion or provide feedback for rework.
          </p>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>{successMsg}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* Approvals List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Loading pending submissions from database...
        </div>
      ) : approvals.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {approvals.map(t => (
            <div
              key={t.id}
              className="card"
              style={{
                borderLeft: '4px solid #3b82f6',
                background: 'linear-gradient(to right, #ffffff, #f8fafc)'
              }}
            >
              <div className="card-body">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
                  
                  {/* Task Info */}
                  <div style={{ flex: 1, minWidth: '280px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px', flexWrap: 'wrap' }}>
                      <span className="badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>
                        Submitted for Verification
                      </span>

                      <span className="badge badge-leader">{t.priority || 'Medium'}</span>

                      {t.meeting_id && (
                        <span style={{ fontSize: '0.74rem', backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                          Source: {t.meeting_id}
                        </span>
                      )}
                    </div>

                    <h2 style={{ fontSize: '1.2rem', fontWeight: 700, color: 'var(--text-main)', marginBottom: '6px' }}>
                      {t.title}
                    </h2>

                    {t.description && (
                      <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
                        {t.description}
                      </p>
                    )}

                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--text-main)', fontWeight: 600 }}>
                        <User size={14} color="var(--primary)" />
                        <span>Submitted by: {t.assignee_name}</span>
                      </div>

                      {t.deadline && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                          <Clock size={14} />
                          <span>Deadline: {new Date(t.deadline).toLocaleDateString()}</span>
                        </div>
                      )}

                      <div>
                        <strong>Reported Progress: </strong>
                        <span style={{ color: '#10b981', fontWeight: 700 }}>100% (Complete)</span>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', minWidth: '180px' }}>
                    <button
                      onClick={() => handleApprove(t.id, t.title)}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: '#10b981',
                        color: 'white',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '0.6rem 1rem',
                        fontWeight: 600
                      }}
                    >
                      <CheckCircle2 size={16} />
                      <span>Approve Task</span>
                    </button>

                    <button
                      onClick={() => {
                        setRejectingTask(t);
                        setFeedbackText('');
                      }}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: '#fee2e2',
                        color: '#991b1b',
                        border: '1px solid #fca5a5',
                        display: 'inline-flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        padding: '0.6rem 1rem',
                        fontWeight: 600
                      }}
                    >
                      <XCircle size={16} />
                      <span>Reject & Request Rework</span>
                    </button>
                  </div>

                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <ShieldCheck className="empty-icon" style={{ color: '#10b981' }} />
          <div className="empty-title">All Caught Up!</div>
          <div className="empty-desc">
            There are no pending task submissions waiting for your verification.
          </div>
        </div>
      )}

      {/* Reject with Feedback Modal */}
      {rejectingTask && (
        <div className="modal-overlay" onClick={() => setRejectingTask(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '480px' }}>
            <div className="modal-header">
              <h2 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#991b1b' }}>
                <MessageSquare size={18} />
                <span>Request Task Rework</span>
              </h2>
              <button className="btn-close" onClick={() => setRejectingTask(null)}>×</button>
            </div>

            <form onSubmit={handleRejectSubmit}>
              <div className="modal-body">
                <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
                  Please provide clear feedback for <strong>{rejectingTask.assignee_name}</strong> on what needs to be revised or improved before this task can be approved.
                </p>

                <div style={{ backgroundColor: '#f8fafc', padding: '0.65rem 0.85rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', border: '1px solid var(--border-color)' }}>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Task Title:</div>
                  <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>{rejectingTask.title}</div>
                </div>

                <div>
                  <label className="form-label">Rework Feedback *</label>
                  <textarea
                    rows={4}
                    required
                    className="form-input"
                    placeholder="e.g. Please add error handling for edge cases and write unit tests before resubmitting."
                    value={feedbackText}
                    onChange={e => setFeedbackText(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setRejectingTask(null)}>
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!feedbackText.trim()}
                  className="btn btn-sm"
                  style={{ backgroundColor: '#ef4444', color: 'white' }}
                >
                  Send Feedback & Reject
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Approvals;
