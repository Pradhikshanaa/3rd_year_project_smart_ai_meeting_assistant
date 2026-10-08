import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authService } from '../services/api';
import { KeyRound, Mail, ArrowRight, ArrowLeft, AlertCircle, CheckCircle2 } from 'lucide-react';

const ForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devResetUrl, setDevResetUrl] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Please enter your registered email address.');
      return;
    }

    setLoading(true);

    try {
      const res = await authService.forgotPassword(cleanEmail);
      if (res.success) {
        setSubmitted(true);
        setEmailSent(!!res.email_sent);
        if (res.dev_reset_url) {
          setDevResetUrl(res.dev_reset_url);
        }
      } else {
        setError(res.message || 'Could not process request. Please try again.');
      }
    } catch (err) {
      console.error('Forgot password error:', err);
      setError(err.response?.data?.message || 'Failed to send reset link. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-wrapper">
      <div className="auth-card" style={{ maxWidth: '440px' }}>
        <div className="auth-header">
          <div className="auth-brand-icon" style={{ backgroundColor: '#fef3c7', color: '#d97706' }}>
            <KeyRound size={28} />
          </div>
          <h1 className="auth-title">Forgot Password</h1>
          <p className="auth-subtitle">Enter your email and we'll send you a password reset link</p>
        </div>

        {error && (
          <div className="alert alert-error">
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {submitted ? (
          <div>
            <div style={{
              backgroundColor: '#ecfdf5',
              border: '1px solid #a7f3d0',
              borderRadius: '10px',
              padding: '16px',
              textAlign: 'center',
              color: '#065f46',
              marginBottom: '1.5rem'
            }}>
              <CheckCircle2 size={36} color="#059669" style={{ margin: '0 auto 10px' }} />
              <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: '6px' }}>
                {emailSent ? 'Reset Email Sent to Inbox!' : 'Reset Request Processed'}
              </div>
              <p style={{ fontSize: '0.86rem', lineHeight: 1.5, margin: 0 }}>
                {emailSent ? (
                  <span>A password reset email has been delivered to <strong>{email}</strong>. Please check your inbox and click the link (valid for 30 minutes).</span>
                ) : (
                  <span>If an account exists with <strong>{email}</strong>, a reset token was generated (valid for 30 minutes).</span>
                )}
              </p>
            </div>

            {/* Local dev helper shown only when SMTP credentials are not yet entered in .env */}
            {devResetUrl && (
              <div style={{
                backgroundColor: '#fffbeb',
                border: '1px dashed #f59e0b',
                padding: '12px',
                borderRadius: '8px',
                marginBottom: '1.25rem',
                fontSize: '0.78rem',
                color: '#92400e'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '4px', color: '#b45309' }}>
                  ⚠️ SMTP Credentials Not Set in .env
                </div>
                <div style={{ marginBottom: '6px', fontSize: '0.75rem' }}>
                  Add your <code>SMTP_USERNAME</code> and <code>SMTP_PASSWORD</code> (Gmail App Password) in <code>backend/.env</code> to send real emails. For testing right now, you can use this link:
                </div>
                <a href={devResetUrl} style={{ color: '#2563eb', wordBreak: 'break-all', fontWeight: 600 }}>
                  {devResetUrl}
                </a>
              </div>
            )}

            <Link
              to="/login"
              className="btn btn-secondary"
              style={{ width: '100%', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <ArrowLeft size={16} />
              <span>Back to Sign In</span>
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label className="form-label" htmlFor="email">Your Account Email</label>
              <div style={{ position: 'relative' }}>
                <input
                  id="email"
                  type="email"
                  required
                  className="form-input"
                  placeholder="e.g. user@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  style={{ paddingLeft: '2.5rem' }}
                />
                <Mail
                  size={16}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--text-muted)'
                  }}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="btn btn-primary"
              style={{ width: '100%', marginTop: '0.5rem', padding: '0.75rem' }}
            >
              <span>{loading ? 'Sending link...' : 'Send Password Reset Link'}</span>
              <ArrowRight size={16} />
            </button>

            <div style={{ textAlign: 'center', marginTop: '1.25rem', fontSize: '0.86rem' }}>
              <Link
                to="/login"
                style={{ color: 'var(--text-muted)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
              >
                <ArrowLeft size={14} />
                <span>Return to Sign In</span>
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

export default ForgotPassword;
