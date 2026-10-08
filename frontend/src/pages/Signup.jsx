import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Sparkles, ArrowRight, AlertCircle, Shield, UserCheck, Eye, EyeOff } from 'lucide-react';
import HealthStatusBadge from '../components/HealthStatusBadge';

const Signup = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('leader'); // 'leader' or 'employee'
  const [teamName, setTeamName] = useState('');
  const [teamId, setTeamId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { signup } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanName = name.trim();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanName || !cleanEmail || !cleanPassword) {
      setError('Please fill in all required fields.');
      return;
    }

    setLoading(true);

    try {
      const payload = {
        name: cleanName,
        email: cleanEmail,
        password: cleanPassword,
        role,
        team_name: role === 'leader' ? teamName.trim() : undefined,
        team_id: role === 'employee' ? teamId.trim().toUpperCase() : undefined,
      };

      await signup(payload);
      navigate('/dashboard');
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Registration failed. Please check inputs and database status.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-brand-icon">
            <Sparkles size={28} />
          </div>
          <h1 className="auth-title">Create Account</h1>
          <p className="auth-subtitle">Get started with AI-driven meeting intelligence</p>
          <div style={{ marginTop: '0.75rem' }}>
            <HealthStatusBadge />
          </div>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Select Your Role</label>
            <div className="role-grid">
              <div
                className={`role-card-select ${role === 'leader' ? 'selected' : ''}`}
                onClick={() => setRole('leader')}
              >
                <Shield size={20} color={role === 'leader' ? '#3b82f6' : '#64748b'} style={{ margin: '0 auto 4px' }} />
                <div className="role-title">Team Leader</div>
                <div className="role-desc">Create & manage team & meetings</div>
              </div>

              <div
                className={`role-card-select ${role === 'employee' ? 'selected' : ''}`}
                onClick={() => setRole('employee')}
              >
                <UserCheck size={20} color={role === 'employee' ? '#3b82f6' : '#64748b'} style={{ margin: '0 auto 4px' }} />
                <div className="role-title">Employee / Member</div>
                <div className="role-desc">Join team via Team ID</div>
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="name">Full Name</label>
            <input
              id="name"
              type="text"
              required
              className="form-input"
              placeholder="e.g. Alex Johnson"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="email">Email Address</label>
            <input
              id="email"
              type="email"
              required
              className="form-input"
              placeholder="e.g. alex@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label className="form-label" htmlFor="password">Password</label>
            <div style={{ position: 'relative' }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                required
                minLength={6}
                className="form-input"
                placeholder="At least 6 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{ paddingRight: '2.5rem' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center'
                }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {role === 'leader' ? (
            <div className="form-group">
              <label className="form-label" htmlFor="teamName">Team / Organization Name</label>
              <input
                id="teamName"
                type="text"
                required
                className="form-input"
                placeholder="e.g. Core Engineering Team"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                A unique Team ID code will be generated automatically for your members.
              </span>
            </div>
          ) : (
            <div className="form-group">
              <label className="form-label" htmlFor="teamId">Team ID (Join Code)</label>
              <input
                id="teamId"
                type="text"
                required
                className="form-input"
                placeholder="e.g. TEAM-ABC123"
                value={teamId}
                onChange={(e) => setTeamId(e.target.value)}
                style={{ textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}
              />
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                Ask your Team Leader for the 6-character Team Join Code.
              </span>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '0.75rem', padding: '0.75rem' }}
          >
            <span>{loading ? 'Creating Account...' : 'Complete Registration'}</span>
            <ArrowRight size={16} />
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '0.86rem', color: 'var(--text-muted)' }}>
          Already have an account?{' '}
          <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600, textDecoration: 'none' }}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Signup;
