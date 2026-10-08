import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { taskService, teamService } from '../services/api';
import { 
  CheckCircle2, Clock, AlertTriangle, AlertCircle, 
  Send, Plus, Filter, User, ArrowRight, Sparkles, Check, Mail
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Tasks = () => {
  const { user, isLeader } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [sendingReminders, setSendingReminders] = useState(false);

  // New task modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newAssignee, setNewAssignee] = useState('');
  const [newPriority, setNewPriority] = useState('Medium');
  const [newDeadline, setNewDeadline] = useState('');
  const [newDuration, setNewDuration] = useState('');

  const fetchTasks = async () => {
    try {
      setLoading(true);
      const params = {};
      if (assigneeFilter) params.assigned_to = assigneeFilter;
      const res = await taskService.getTasks(params);
      if (res.success) {
        setTasks(res.tasks);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load tasks from server.');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeam = async () => {
    try {
      const res = await teamService.getMyTeam();
      if (res.success) {
        const membersList = res.members || res.team?.members || [];
        setTeamMembers(membersList);
        console.log('[Tasks] Successfully loaded team members:', membersList.length);
      }
    } catch (err) {
      console.error('[Tasks] Error fetching team members:', err);
    }
  };

  useEffect(() => {
    fetchTasks();
    fetchTeam();
  }, [assigneeFilter]);

  const handleUpdateProgress = async (taskId, progress) => {
    try {
      const res = await taskService.updateProgress(taskId, progress);
      if (res.success) {
        setTasks(tasks.map(t => t.id === taskId ? { ...t, progress: res.task.progress, status: res.task.status } : t));
        setSuccessMsg(`Progress updated to ${progress}%`);
        setTimeout(() => setSuccessMsg(''), 2500);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error updating task progress.');
    }
  };

  const handleSubmitForReview = async (taskId) => {
    try {
      const res = await taskService.submitForReview(taskId);
      if (res.success) {
        setTasks(tasks.map(t => t.id === taskId ? res.task : t));
        setSuccessMsg('Task submitted for Team Leader verification!');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error submitting task.');
    }
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    try {
      const res = await taskService.createTask({
        title: newTitle.trim(),
        description: newDesc.trim(),
        assigned_to: newAssignee || null,
        priority: newPriority,
        deadline: newDeadline || null,
        estimated_duration: newDuration || 'Not Mentioned'
      });

      if (res.success) {
        setShowCreateModal(false);
        setNewTitle('');
        setNewDesc('');
        setNewAssignee('');
        setNewPriority('Medium');
        setNewDeadline('');
        setNewDuration('');
        fetchTasks();
        setSuccessMsg('Task created and assigned successfully.');
        setTimeout(() => setSuccessMsg(''), 3000);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error creating task.');
    }
  };

  // Filter tasks
  const filteredTasks = tasks.filter(t => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'high_risk') return t.risk && t.risk.level === 'High';
    if (activeFilter === 'in_progress') return t.status === 'in_progress' || t.status === 'assigned' || t.status === 'pending';
    if (activeFilter === 'submitted') return t.status === 'submitted' || t.status === 'under_review';
    if (activeFilter === 'completed') return t.status === 'completed';
    if (activeFilter === 'rejected') return t.status === 'rejected';
    return true;
  });

  const getPriorityBadge = (p) => {
    const priority = p || 'Medium';
    if (priority === 'Urgent' || priority === 'High') {
      return <span className="badge badge-danger">{priority}</span>;
    }
    if (priority === 'Medium') {
      return <span className="badge badge-leader">{priority}</span>;
    }
    return <span className="badge badge-employee">{priority}</span>;
  };

  const getRiskBadge = (risk) => {
    if (!risk || risk.level === 'None') return null;
    if (risk.level === 'High') {
      return (
        <span 
          className="badge badge-danger" 
          title={risk.reason}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', cursor: 'help', fontWeight: 700 }}
        >
          <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'white', display: 'inline-block' }} />
          <span>High Risk</span>
        </span>
      );
    }
    if (risk.level === 'Medium') {
      return (
        <span 
          className="badge" 
          title={risk.reason}
          style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
        >
          <span>Med Risk</span>
        </span>
      );
    }
    return (
      <span 
        className="badge" 
        title={risk.reason}
        style={{ backgroundColor: '#f0fdf4', color: '#166534', border: '1px solid #bbf7d0', display: 'inline-flex', alignItems: 'center', gap: '4px', cursor: 'help' }}
      >
        <span>Low Risk</span>
      </span>
    );
  };

  const getStatusBadge = (status) => {
    if (status === 'completed') return <span className="badge badge-success">Completed</span>;
    if (status === 'submitted' || status === 'under_review') return <span className="badge" style={{ backgroundColor: '#eff6ff', color: '#1e40af', border: '1px solid #bfdbfe' }}>Pending Review</span>;
    if (status === 'rejected') return <span className="badge badge-danger">Needs Rework</span>;
    if (status === 'in_progress') return <span className="badge" style={{ backgroundColor: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>In Progress</span>;
    return <span className="badge badge-employee">Assigned</span>;
  };

  const handleTriggerReminders = async () => {
    try {
      setSendingReminders(true);
      setError('');
      setSuccessMsg('');
      const res = await taskService.triggerReminders(true);
      if (res.success) {
        const count = res.summary?.reminders_sent_count || 0;
        const msg = count > 0
          ? `Dispatched ${count} deadline reminder notification(s) successfully!`
          : `Reminder scan completed: No pending/urgent deadline tasks found.`;
        setSuccessMsg(msg);
        fetchTasks();
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Failed to trigger deadline reminders.');
    } finally {
      setSendingReminders(false);
    }
  };

  return (
    <div className="page-body">
      {/* Top Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>
            {isLeader ? 'Team Tasks & Workflow' : 'My Assigned Tasks'}
          </h1>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            {isLeader 
              ? 'Oversee task progress, monitor task risk levels, and verify employee submissions.' 
              : 'Track your assigned deliverables, manage risk, update progress, and submit for verification.'}
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          {isLeader && (
            <>
              <button
                onClick={handleTriggerReminders}
                disabled={sendingReminders}
                className="btn btn-secondary btn-sm"
                title="Scan all tasks and send deadline reminder emails right now"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Mail size={15} color="#6366f1" />
                <span>{sendingReminders ? 'Sending Reminders...' : 'Send Deadline Reminders'}</span>
              </button>

              <Link to="/approvals" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <CheckCircle2 size={15} color="#10b981" />
                <span>Approvals Queue</span>
              </Link>

              <button
                onClick={() => {
                  fetchTeam();
                  setShowCreateModal(true);
                }}
                className="btn btn-primary btn-sm"
                style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <Plus size={15} />
                <span>Create Task</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Notifications */}
      {successMsg && <div className="alert alert-success" style={{ marginBottom: '1.25rem' }}>{successMsg}</div>}
      {error && <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* Tabs & Filters */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
        overflowX: 'auto',
        gap: '0.75rem'
      }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[
            { id: 'all', label: `All (${tasks.length})` },
            { id: 'high_risk', label: `⚠️ High Risk (${tasks.filter(t => t.risk?.level === 'High').length})` },
            { id: 'in_progress', label: `In Progress (${tasks.filter(t => ['in_progress', 'assigned', 'pending'].includes(t.status)).length})` },
            { id: 'submitted', label: `Under Review (${tasks.filter(t => ['submitted', 'under_review'].includes(t.status)).length})` },
            { id: 'rejected', label: `Needs Rework (${tasks.filter(t => t.status === 'rejected').length})` },
            { id: 'completed', label: `Completed (${tasks.filter(t => t.status === 'completed').length})` },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id)}
              style={{
                padding: '0.65rem 1rem',
                background: 'none',
                border: 'none',
                borderBottom: activeFilter === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
                color: activeFilter === tab.id ? 'var(--primary)' : 'var(--text-muted)',
                fontWeight: activeFilter === tab.id ? 700 : 500,
                cursor: 'pointer',
                fontSize: '0.9rem',
                whiteSpace: 'nowrap'
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Leader Filter by Assignee */}
        {isLeader && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Filter size={14} color="var(--text-muted)" />
            <select
              className="form-input"
              value={assigneeFilter}
              onChange={(e) => setAssigneeFilter(e.target.value)}
              style={{ padding: '0.35rem 0.6rem', fontSize: '0.84rem' }}
            >
              <option value="">All Team Members</option>
              {teamMembers.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Task Cards Grid */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Loading tasks from database...
        </div>
      ) : filteredTasks.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredTasks.map(t => (
            <div key={t.id} className="card" style={{ display: 'flex', flexDirection: 'column' }}>
              <div className="card-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                    {getStatusBadge(t.status)}
                    {getPriorityBadge(t.priority)}
                    {getRiskBadge(t.risk)}
                    {t.meeting_id && (
                      <span style={{ fontSize: '0.72rem', backgroundColor: '#f1f5f9', color: '#475569', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace' }}>
                        {t.meeting_id}
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--text-main)' }}>
                    {t.title}
                  </h3>
                </div>
              </div>

              <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem', flex: 1 }}>
                {t.description && (
                  <p style={{ fontSize: '0.86rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                    {t.description}
                  </p>
                )}

                {/* Risk Notice Banner */}
                {t.risk && t.risk.level === 'High' && (
                  <div style={{
                    backgroundColor: '#fff1f2',
                    border: '1px solid #ffe4e6',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.8rem',
                    color: '#be123c',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <AlertTriangle size={14} color="#e11d48" style={{ flexShrink: 0 }} />
                    <span><strong>Risk Warning:</strong> {t.risk.reason}</span>
                  </div>
                )}

                {/* Rejection Notice & Feedback Banner */}
                {t.status === 'rejected' && t.rejection_feedback && (
                  <div style={{
                    backgroundColor: '#fef2f2',
                    border: '1px solid #fecaca',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.84rem'
                  }}>
                    <div style={{ fontWeight: 700, color: '#991b1b', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      <AlertTriangle size={14} />
                      <span>Feedback from Team Leader:</span>
                    </div>
                    <div style={{ color: '#7f1d1d' }}>{t.rejection_feedback}</div>
                  </div>
                )}

                {/* Meta details */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {isLeader && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <User size={13} />
                      <span>{t.assignee_name}</span>
                    </div>
                  )}
                  {t.deadline && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Clock size={13} />
                      <span>Due: {new Date(t.deadline).toLocaleDateString()}</span>
                    </div>
                  )}
                  {t.estimated_duration && t.estimated_duration !== 'Not Mentioned' && (
                    <div>Est: {t.estimated_duration}</div>
                  )}
                </div>

                {/* Progress Bar */}
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>Progress</span>
                    <span style={{ fontWeight: 700, color: 'var(--text-main)' }}>{t.progress || 0}%</span>
                  </div>
                  <div style={{ height: '7px', backgroundColor: '#e2e8f0', borderRadius: '9999px', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%',
                      width: `${t.progress || 0}%`,
                      backgroundColor: t.status === 'completed' ? '#10b981' : t.status === 'rejected' ? '#ef4444' : 'var(--primary)',
                      transition: 'width 0.3s ease'
                    }} />
                  </div>
                </div>

                {/* Employee Progress Selector & Submission Section */}
                {(!isLeader || t.assigned_to === user?.id) && t.status !== 'completed' && t.status !== 'submitted' && (
                  <div style={{ backgroundColor: '#f8fafc', padding: '0.75rem', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '6px', textTransform: 'uppercase' }}>
                      Update Your Progress:
                    </div>

                    <div style={{ display: 'flex', gap: '4px', marginBottom: '0.75rem' }}>
                      {[0, 25, 50, 75, 100].map(val => (
                        <button
                          key={val}
                          onClick={() => handleUpdateProgress(t.id, val)}
                          className="btn btn-sm"
                          style={{
                            flex: 1,
                            padding: '0.3rem 0',
                            fontSize: '0.78rem',
                            backgroundColor: t.progress === val ? 'var(--primary)' : 'white',
                            color: t.progress === val ? 'white' : 'var(--text-main)',
                            border: '1px solid var(--border-color)'
                          }}
                        >
                          {val}%
                        </button>
                      ))}
                    </div>

                    {/* Submit for Verification Button */}
                    <button
                      onClick={() => handleSubmitForReview(t.id)}
                      className="btn btn-primary btn-sm"
                      style={{ width: '100%', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}
                    >
                      <Send size={13} />
                      <span>Submit for Verification</span>
                    </button>
                  </div>
                )}

                {/* Submitted notice */}
                {(t.status === 'submitted' || t.status === 'under_review') && (
                  <div style={{
                    backgroundColor: '#eff6ff',
                    border: '1px solid #bfdbfe',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    color: '#1e40af',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    <Clock size={14} />
                    <span>Awaiting Team Leader approval</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <CheckCircle2 className="empty-icon" />
          <div className="empty-title">No tasks found</div>
          <div className="empty-desc">
            {isLeader 
              ? 'Run Gemini meeting analysis or click "Create Task" above to assign action items.' 
              : 'You have no assigned tasks in this category.'}
          </div>
        </div>
      )}

      {/* Create Task Modal (Leader) */}
      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <h2 className="modal-title">Create & Assign Team Task</h2>
              <button className="btn-close" onClick={() => setShowCreateModal(false)}>×</button>
            </div>

            <form onSubmit={handleCreateTask}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div>
                  <label className="form-label">Task Title *</label>
                  <input
                    type="text"
                    required
                    className="form-input"
                    placeholder="e.g. Implement WebRTC signaling handlers"
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                  />
                </div>

                <div>
                  <label className="form-label">Description</label>
                  <textarea
                    rows={3}
                    className="form-input"
                    placeholder="Provide specific instructions or acceptance criteria..."
                    value={newDesc}
                    onChange={e => setNewDesc(e.target.value)}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label" htmlFor="task-assignee-select">Assign To</label>
                    <select
                      id="task-assignee-select"
                      className="form-input"
                      value={newAssignee}
                      onChange={e => setNewAssignee(e.target.value)}
                      style={{
                        cursor: 'pointer',
                        backgroundColor: '#ffffff',
                        color: '#0f172a',
                        zIndex: 20
                      }}
                    >
                      <option value="">Unassigned</option>
                      {teamMembers.map(m => (
                        <option key={m.id} value={m.id}>
                          {m.name} ({m.role === 'leader' ? 'Leader' : 'Employee'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="form-label">Priority</label>
                    <select
                      className="form-input"
                      value={newPriority}
                      onChange={e => setNewPriority(e.target.value)}
                    >
                      <option value="Low">Low</option>
                      <option value="Medium">Medium</option>
                      <option value="High">High</option>
                      <option value="Urgent">Urgent</option>
                    </select>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div>
                    <label className="form-label">Deadline</label>
                    <input
                      type="date"
                      className="form-input"
                      value={newDeadline}
                      onChange={e => setNewDeadline(e.target.value)}
                    />
                  </div>

                  <div>
                    <label className="form-label">Est. Duration</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. 2 hours, 1 day"
                      value={newDuration}
                      onChange={e => setNewDuration(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Assign Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Tasks;
