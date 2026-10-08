import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { teamService } from '../services/api';
import { Users, Shield, Copy, Check, Mail, Calendar, AlertCircle, Sparkles } from 'lucide-react';

const MyTeam = () => {
  const { user, isLeader } = useAuth();
  const [teamData, setTeamData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  const fetchTeam = async () => {
    try {
      setLoading(true);
      const res = await teamService.getMyTeam();
      if (res.success) {
        setTeamData(res);
      } else {
        setError(res.message || 'Could not fetch team information');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error connecting to database');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTeam();
  }, []);

  const copyTeamCode = () => {
    if (teamData?.team?.team_id) {
      navigator.clipboard.writeText(teamData.team.team_id);
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
        <div style={{ color: 'var(--text-muted)' }}>Fetching team roster and details from database...</div>
      </div>
    );
  }

  return (
    <div className="page-body">
      {/* Team Header Card */}
      <div className="card" style={{ marginBottom: '1.75rem', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
        <div className="card-body" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: 'var(--radius-md)',
                backgroundColor: 'var(--primary-light)',
                color: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Users size={22} />
              </div>
              <div>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-main)' }}>
                  {teamData?.team?.team_name || 'My Team'}
                </h1>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Created on {teamData?.team?.created_at ? new Date(teamData.team.created_at).toLocaleDateString() : 'N/A'} &middot; Total Members: {teamData?.total_members || 0}
                </div>
              </div>
            </div>
          </div>

          {/* Team Join Code Card */}
          <div style={{
            background: 'white',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-lg)',
            padding: '0.85rem 1.25rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            boxShadow: 'var(--shadow-sm)'
          }}>
            <div>
              <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-muted)', letterSpacing: '0.05em' }}>
                Unique Team ID
              </div>
              <code style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--primary-dark)', letterSpacing: '0.05em' }}>
                {teamData?.team?.team_id}
              </code>
            </div>

            <button
              onClick={copyTeamCode}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
              title="Copy code to share with employees"
            >
              {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
              <span>{copied ? 'Copied' : 'Copy'}</span>
            </button>
          </div>
        </div>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Team Leader & Team Structure Overview */}
      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Leader Profile Card */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Shield size={16} color="#8b5cf6" />
              <span>Team Leader</span>
            </h2>
          </div>
          <div className="card-body">
            {teamData?.leader ? (
              <div style={{ textAlign: 'center', padding: '1rem 0' }}>
                <div className="avatar" style={{ width: '60px', height: '60px', fontSize: '1.3rem', margin: '0 auto 1rem', background: '#ede9fe', color: '#6d28d9' }}>
                  {getInitials(teamData.leader.name)}
                </div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700 }}>{teamData.leader.name}</div>
                <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                  <Mail size={12} />
                  <span>{teamData.leader.email}</span>
                </div>
                <div style={{ marginTop: '0.75rem' }}>
                  <span className="badge badge-leader">Team Leader</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--text-light)', marginTop: '1rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
                  Member since {teamData.leader.created_at ? new Date(teamData.leader.created_at).toLocaleDateString() : 'N/A'}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)', padding: '1.5rem 0' }}>
                No assigned leader found.
              </div>
            )}
          </div>
        </div>

        {/* Member Directory */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title">All Team Members ({teamData?.members?.length || 0})</h2>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            {teamData?.members && teamData.members.length > 0 ? (
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Role</th>
                      <th>Joined Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {teamData.members.map((member) => (
                      <tr key={member.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                              {getInitials(member.name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600 }}>{member.name}</div>
                              {member.id === user?.id && (
                                <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 600 }}>(You)</span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td style={{ color: 'var(--text-muted)' }}>{member.email}</td>
                        <td>
                          <span className={`badge ${member.role === 'leader' ? 'badge-leader' : 'badge-employee'}`}>
                            {member.role === 'leader' ? 'Team Leader' : 'Employee'}
                          </span>
                        </td>
                        <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                          {member.created_at ? new Date(member.created_at).toLocaleDateString() : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-state">
                <Users className="empty-icon" />
                <div className="empty-title">No members found</div>
                <div className="empty-desc">
                  Share your Team ID with employees to invite them to this team.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};

export default MyTeam;
