import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import HealthStatusBadge from './HealthStatusBadge';
import NotificationBell from './NotificationBell';
import { LogOut, Copy, Check, Users, Shield } from 'lucide-react';

const Navbar = () => {
  const { user, team, logout, isLeader } = useAuth();
  const [copied, setCopied] = useState(false);

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

  return (
    <header className="top-navbar">
      <div className="navbar-left">
        {team && (
          <div className="team-pill">
            <Users size={15} />
            <span>{team.team_name}</span>
            <button
              onClick={copyTeamCode}
              title="Copy Team Code for members to join"
              style={{
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'rgba(59, 130, 246, 0.1)',
                fontSize: '0.74rem',
                color: 'var(--primary-dark)',
                fontWeight: 700
              }}
            >
              <code>{team.team_id}</code>
              {copied ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
            </button>
          </div>
        )}
      </div>

      <div className="navbar-right">
        <HealthStatusBadge />
        <NotificationBell />

        {user && (
          <div className="user-profile-badge">
            <div className="avatar">
              {getInitials(user.name)}
            </div>
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: 600, lineHeight: 1.2 }}>{user.name}</div>
              <span className={`badge ${isLeader ? 'badge-leader' : 'badge-employee'}`}>
                {isLeader ? <Shield size={10} /> : null}
                {user.role === 'leader' ? 'Team Leader' : 'Team Member'}
              </span>
            </div>

            <button
              onClick={logout}
              className="btn btn-secondary btn-sm"
              style={{ marginLeft: '0.5rem', color: 'var(--text-muted)' }}
              title="Sign Out"
            >
              <LogOut size={14} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Navbar;
