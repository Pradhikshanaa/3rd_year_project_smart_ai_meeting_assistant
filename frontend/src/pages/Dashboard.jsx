import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardService } from '../services/api';
import { 
  Users, Video, CheckSquare, Clock, Copy, Check, 
  Calendar, AlertCircle, Sparkles, PlusCircle, ArrowUpRight 
} from 'lucide-react';
import { Link } from 'react-router-dom';

const Dashboard = () => {
  const { user, team, isLeader } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await dashboardService.getStats();
      if (res.success) {
        setData(res);
      } else {
        setError(res.message || 'Failed to fetch dashboard data');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error connecting to database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
  }, []);

  const copyTeamCode = () => {
    if (team?.team_id) {
      navigator.clipboard.writeText(team.team_id);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  if (loading) {
    return (
      <div className="page-body" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <div style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>Loading dashboard data from database...</div>
      </div>
    );
  }

  return (
    <div className="page-body">
      {/* Welcome Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.75rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Welcome back, {user?.name} 👋
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            {isLeader ? (
              <span>Team Leader Control Panel &middot; {team?.team_name}</span>
            ) : (
              <span>Employee Dashboard &middot; Member of {team?.team_name || 'Team'}</span>
            )}
          </p>
        </div>

        {isLeader && team && (
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <div style={{
              background: 'white',
              border: '1px solid var(--border-color)',
              padding: '0.5rem 0.85rem',
              borderRadius: 'var(--radius-md)',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: 'var(--shadow-sm)'
            }}>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>Team Join ID:</span>
              <code style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--primary)' }}>{team.team_id}</code>
              <button
                onClick={copyTeamCode}
                className="btn btn-secondary btn-sm"
                style={{ padding: '2px 6px', height: '24px' }}
                title="Share this code with team members so they can join your team"
              >
                {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                <span>{copied ? 'Copied' : 'Share'}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Stats Cards Section */}
      {isLeader ? (
        // Leader Stats
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper icon-blue">
              <Users size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.total_members || 0}</div>
              <div className="stat-label">Team Members</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper icon-purple">
              <Video size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.total_meetings || 0}</div>
              <div className="stat-label">Total Meetings</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper icon-amber">
              <Clock size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.pending_tasks || 0}</div>
              <div className="stat-label">Pending Action Items</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper icon-green">
              <CheckSquare size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.completed_tasks || 0}</div>
              <div className="stat-label">Completed Tasks</div>
            </div>
          </div>
        </div>
      ) : (
        // Employee Stats
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-icon-wrapper icon-blue">
              <CheckSquare size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.assigned_tasks || 0}</div>
              <div className="stat-label">My Assigned Tasks</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper icon-amber">
              <Clock size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.in_progress_tasks || 0}</div>
              <div className="stat-label">In Progress</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper icon-green">
              <CheckSquare size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.completed_tasks || 0}</div>
              <div className="stat-label">Approved & Completed</div>
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-icon-wrapper icon-purple">
              <Video size={24} />
            </div>
            <div>
              <div className="stat-val">{data?.stats?.joined_meetings || 0}</div>
              <div className="stat-label">Attended Meetings</div>
            </div>
          </div>
        </div>
      )}

      {/* Phase 8: Task Risk Monitor & Meeting Impact Widget */}
      <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(to right, #ffffff, #f8fafc)', border: '1px solid #e2e8f0' }}>
        <div className="card-body" style={{ padding: '1.25rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            
            {/* Risk Overview */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flex: 1, minWidth: '300px' }}>
              <div style={{
                backgroundColor: '#fee2e2',
                color: '#dc2626',
                padding: '10px',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <AlertCircle size={24} />
              </div>

              <div>
                <div style={{ fontWeight: 700, fontSize: '0.96rem', color: 'var(--text-main)' }}>
                  Task Risk Monitor & Intelligence
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '6px', fontSize: '0.82rem' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#dc2626', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#dc2626' }} />
                    {data?.stats?.risk_distribution?.high || 0} High Risk
                  </span>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#d97706', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#d97706' }} />
                    {data?.stats?.risk_distribution?.medium || 0} Medium Risk
                  </span>

                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#16a34a', fontWeight: 600 }}>
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#16a34a' }} />
                    {data?.stats?.risk_distribution?.low || 0} Low Risk
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Meeting Impact Score for Leader / Quick Link */}
            {isLeader && data?.stats?.avg_effectiveness && (
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                backgroundColor: 'white',
                border: '1px solid #bfdbfe',
                padding: '0.6rem 1rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  fontWeight: 800,
                  fontSize: '0.95rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}>
                  {data.stats.avg_effectiveness}%
                </div>
                <div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', fontWeight: 600 }}>
                    Avg Meeting Effectiveness
                  </div>
                  <div style={{ fontSize: '0.84rem', fontWeight: 700, color: 'var(--primary-dark)' }}>
                    High Decision Impact
                  </div>
                </div>
              </div>
            )}

            <div>
              <Link to="/tasks" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                <span>View Risk Analysis</span>
                <ArrowUpRight size={13} />
              </Link>
            </div>

          </div>
        </div>
      </div>

      {/* Main Grid Content */}
      <div style={{ display: 'grid', gridTemplateColumns: isLeader ? '1fr 1fr' : '1fr', gap: '1.5rem' }}>
        
        {/* Left Column: Team / User Info */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">
              {isLeader ? 'Team Members Roster' : 'My Assigned Tasks'}
            </h2>
            {isLeader ? (
              <Link to="/team" className="btn btn-secondary btn-sm">
                <span>View Full Team</span>
                <ArrowUpRight size={13} />
              </Link>
            ) : null}
          </div>

          <div className="card-body" style={{ padding: 0 }}>
            {isLeader ? (
              data?.recent_members && data.recent_members.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Member</th>
                        <th>Role</th>
                        <th>Joined</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.recent_members.map((m) => (
                        <tr key={m.id}>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                              <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                                {getInitials(m.name)}
                              </div>
                              <div>
                                <div style={{ fontWeight: 600 }}>{m.name}</div>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{m.email}</div>
                              </div>
                            </div>
                          </td>
                          <td>
                            <span className={`badge ${m.role === 'leader' ? 'badge-leader' : 'badge-employee'}`}>
                              {m.role === 'leader' ? 'Team Leader' : 'Employee'}
                            </span>
                          </td>
                          <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                            {m.created_at ? new Date(m.created_at).toLocaleDateString() : 'N/A'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <Users className="empty-icon" />
                  <div className="empty-title">No members in this team yet</div>
                  <div className="empty-desc">
                    Share your Team Join Code <strong>{team?.team_id}</strong> with coworkers so they can join during signup.
                  </div>
                </div>
              )
            ) : (
              // Employee Assigned Tasks view
              data?.my_tasks && data.my_tasks.length > 0 ? (
                <div className="table-container">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Task</th>
                        <th>Priority</th>
                        <th>Progress</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.my_tasks.map((t) => (
                        <tr key={t.id}>
                          <td style={{ fontWeight: 600 }}>{t.title}</td>
                          <td><span className="badge">{t.priority}</span></td>
                          <td>{t.progress}%</td>
                          <td><span className="badge badge-warning">{t.status}</span></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state">
                  <CheckSquare className="empty-icon" />
                  <div className="empty-title">No tasks assigned yet</div>
                  <div className="empty-desc">
                    You currently have zero pending tasks. When your Team Leader runs meetings with Gemini AI, action items will appear here automatically.
                  </div>
                </div>
              )
            )}
          </div>
        </div>

        {/* Right Column: Meetings Activity / Empty State */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">Recent Meetings & AI Insights</h2>
          </div>
          <div className="card-body">
            <div className="empty-state" style={{ padding: '2.5rem 1rem' }}>
              <Video className="empty-icon" />
              <div className="empty-title">No meetings recorded yet</div>
              <div className="empty-desc">
                {isLeader ? (
                  <span>
                    When you launch your first meeting (Phase 3), Gemini AI will transcribe speech in real-time, generate summaries, and assign action items.
                  </span>
                ) : (
                  <span>
                    Upcoming and past team meetings will be listed here once scheduled or initiated by your Team Leader.
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;
