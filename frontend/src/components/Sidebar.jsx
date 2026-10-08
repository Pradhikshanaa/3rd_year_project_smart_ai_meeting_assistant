import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, Video, CheckSquare, Sparkles, CheckCircle2, Bell, MessageSquare } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { messageService } from '../services/api';
import { getSocket } from '../services/socket';

const Sidebar = () => {
  const { user, isLeader } = useAuth();
  const location = useLocation();
  const [unreadMsgCount, setUnreadMsgCount] = useState(0);

  const fetchUnreadCount = async () => {
    if (!user) return;
    try {
      const res = await messageService.getUnreadCount();
      if (res && res.success) {
        setUnreadMsgCount(res.unread_count || 0);
      }
    } catch (err) {
      console.warn('[Sidebar] Error fetching unread message count:', err.message);
    }
  };

  useEffect(() => {
    fetchUnreadCount();

    // Poll every 30 seconds as fallback
    const interval = setInterval(fetchUnreadCount, 30000);

    // Socket.IO real-time unread updates
    let socket = null;
    if (user) {
      socket = getSocket(user);
      const onReceive = (msg) => {
        if (msg.receiver_id === user.id) {
          if (!location.pathname.startsWith('/chat')) {
            setUnreadMsgCount((prev) => prev + 1);
          }
        }
      };
      const onRead = () => {
        fetchUnreadCount();
      };

      socket.on('receive_message', onReceive);
      socket.on('messages_read', onRead);

      return () => {
        clearInterval(interval);
        if (socket) {
          socket.off('receive_message', onReceive);
          socket.off('messages_read', onRead);
        }
      };
    }

    return () => clearInterval(interval);
  }, [user, location.pathname]);

  // When user navigates to /chat, refresh unread count
  useEffect(() => {
    if (location.pathname === '/chat') {
      fetchUnreadCount();
    }
  }, [location.pathname]);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-brand-icon">
          <Sparkles size={20} color="white" />
        </div>
        <div>
          <div className="sidebar-title">Smart AI Assistant</div>
          <div className="sidebar-subtitle">Meeting Intelligence</div>
        </div>
      </div>

      <nav className="sidebar-nav">
        <NavLink
          to="/dashboard"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <LayoutDashboard size={18} />
          <span>Dashboard</span>
        </NavLink>

        <NavLink
          to="/team"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Users size={18} />
          <span>My Team</span>
        </NavLink>

        <NavLink
          to="/chat"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          style={{ position: 'relative' }}
        >
          <MessageSquare size={18} />
          <span>{isLeader ? 'Team Chat' : 'Direct Chat'}</span>
          {unreadMsgCount > 0 && (
            <span style={{
              marginLeft: 'auto',
              backgroundColor: '#ef4444',
              color: 'white',
              borderRadius: '9999px',
              fontSize: '0.7rem',
              fontWeight: 700,
              minWidth: '18px',
              height: '18px',
              padding: '0 5px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 5px rgba(239, 68, 68, 0.4)'
            }}>
              {unreadMsgCount > 99 ? '99+' : unreadMsgCount}
            </span>
          )}
        </NavLink>

        <NavLink
          to="/meetings"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Video size={18} />
          <span>Meetings</span>
        </NavLink>

        <NavLink
          to="/tasks"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <CheckSquare size={18} />
          <span>{isLeader ? 'Team Tasks' : 'My Tasks'}</span>
        </NavLink>

        {isLeader && (
          <NavLink
            to="/approvals"
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <CheckCircle2 size={18} />
            <span>Approvals</span>
          </NavLink>
        )}

        <NavLink
          to="/pex"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          style={{ backgroundColor: 'rgba(99, 102, 241, 0.1)', color: '#818cf8', fontWeight: 600 }}
        >
          <Sparkles size={18} color="#818cf8" />
          <span>Pex AI</span>
        </NavLink>

        <NavLink
          to="/notifications"
          className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
        >
          <Bell size={18} />
          <span>Notifications</span>
        </NavLink>
      </nav>

      <div className="sidebar-footer">
        <div>College Mini Project</div>
        <div style={{ fontSize: '0.7rem', color: '#64748b', marginTop: '2px' }}>
          Role: {isLeader ? 'Leader (Full Access)' : 'Employee (Restricted)'}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
