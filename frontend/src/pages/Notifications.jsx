import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { notificationService } from '../services/api';
import { 
  Bell, Check, CheckCheck, Video, CheckSquare, 
  Calendar, AlertTriangle, Clock, ArrowRight, Filter 
} from 'lucide-react';

const Notifications = () => {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, unread, task, meeting
  const [error, setError] = useState('');

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await notificationService.getNotifications(100);
      if (res.success) {
        setNotifications(res.notifications || []);
        setUnreadCount(res.unread_count || 0);
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load notifications.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  const handleMarkAsRead = async (id) => {
    try {
      const res = await notificationService.markAsRead(id);
      if (res.success) {
        setNotifications(notifications.map(n => n.id === id ? { ...n, is_read: true } : n));
        setUnreadCount(Math.max(0, unreadCount - 1));
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      const res = await notificationService.markAllAsRead();
      if (res.success) {
        setNotifications(notifications.map(n => ({ ...n, is_read: true })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredNotifications = notifications.filter(n => {
    if (filter === 'unread') return !n.is_read;
    if (filter === 'task') return n.type === 'task' || n.message.toLowerCase().includes('task');
    if (filter === 'meeting') return n.type === 'meeting' || n.message.toLowerCase().includes('meeting');
    return true;
  });

  const getNotificationIcon = (n) => {
    const msg = n.message.toLowerCase();
    if (msg.includes('overdue') || msg.includes('urgent') || msg.includes('rework')) {
      return <AlertTriangle size={18} color="#ef4444" />;
    }
    if (n.type === 'task' || msg.includes('task')) {
      return <CheckSquare size={18} color="#8b5cf6" />;
    }
    return <Video size={18} color="#3b82f6" />;
  };

  return (
    <div className="page-body">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>
              Notifications Hub
            </h1>
            {unreadCount > 0 && (
              <span className="badge badge-danger" style={{ fontSize: '0.78rem' }}>
                {unreadCount} Unread
              </span>
            )}
          </div>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', marginTop: '2px' }}>
            Stay updated with meeting invites, task assignments, deadline reminders, and approvals.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            onClick={handleMarkAllAsRead}
            className="btn btn-secondary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <CheckCheck size={15} />
            <span>Mark All as Read</span>
          </button>
        )}
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1.25rem' }}>{error}</div>}

      {/* Tabs */}
      <div style={{
        display: 'flex',
        gap: '0.5rem',
        borderBottom: '1px solid var(--border-color)',
        marginBottom: '1.5rem',
        overflowX: 'auto'
      }}>
        {[
          { id: 'all', label: `All (${notifications.length})` },
          { id: 'unread', label: `Unread (${unreadCount})` },
          { id: 'task', label: `Task Reminders (${notifications.filter(n => n.type === 'task' || n.message.toLowerCase().includes('task')).length})` },
          { id: 'meeting', label: `Meeting Invites (${notifications.filter(n => n.type === 'meeting' || n.message.toLowerCase().includes('meeting')).length})` },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            style={{
              padding: '0.65rem 1.1rem',
              background: 'none',
              border: 'none',
              borderBottom: filter === tab.id ? '2px solid var(--primary)' : '2px solid transparent',
              color: filter === tab.id ? 'var(--primary)' : 'var(--text-muted)',
              fontWeight: filter === tab.id ? 700 : 500,
              cursor: 'pointer',
              fontSize: '0.9rem',
              whiteSpace: 'nowrap'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Notifications List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Loading your notifications...
        </div>
      ) : filteredNotifications.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filteredNotifications.map(n => (
            <div
              key={n.id}
              className="card"
              style={{
                borderLeft: !n.is_read ? '4px solid var(--primary)' : '1px solid var(--border-color)',
                backgroundColor: !n.is_read ? '#f8fafc' : 'white',
                transition: 'background-color 0.2s'
              }}
            >
              <div className="card-body" style={{ padding: '1rem 1.25rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
                  
                  {/* Left: Icon & Text */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', flex: 1, minWidth: '260px' }}>
                    <div style={{
                      padding: '8px',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: !n.is_read ? 'var(--primary-light)' : '#f1f5f9',
                      marginTop: '2px',
                      flexShrink: 0
                    }}>
                      {getNotificationIcon(n)}
                    </div>

                    <div>
                      <div style={{
                        fontSize: '0.92rem',
                        fontWeight: !n.is_read ? 600 : 400,
                        color: 'var(--text-main)',
                        lineHeight: 1.5
                      }}>
                        {n.message}
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '4px', fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        <span style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <Clock size={12} />
                          {new Date(n.created_at).toLocaleString()}
                        </span>

                        {n.meeting_id && (
                          <span style={{ fontFamily: 'monospace', backgroundColor: '#e2e8f0', padding: '1px 6px', borderRadius: '4px' }}>
                            {n.meeting_id}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    {n.meeting_id && (
                      <Link
                        to={`/meeting/${n.meeting_id}`}
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <Video size={13} />
                        <span>Meeting</span>
                      </Link>
                    )}

                    {n.task_id && (
                      <Link
                        to="/tasks"
                        className="btn btn-secondary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                      >
                        <CheckSquare size={13} />
                        <span>View Task</span>
                      </Link>
                    )}

                    {!n.is_read && (
                      <button
                        onClick={() => handleMarkAsRead(n.id)}
                        className="btn btn-sm"
                        title="Mark as Read"
                        style={{
                          backgroundColor: '#f1f5f9',
                          border: '1px solid var(--border-color)',
                          padding: '0.4rem 0.6rem',
                          color: 'var(--text-muted)'
                        }}
                      >
                        <Check size={14} />
                      </button>
                    )}
                  </div>

                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Bell className="empty-icon" />
          <div className="empty-title">No notifications</div>
          <div className="empty-desc">
            You're all caught up! When you receive meeting invites, task updates, or deadline reminders, they will appear here.
          </div>
        </div>
      )}
    </div>
  );
};

export default Notifications;
