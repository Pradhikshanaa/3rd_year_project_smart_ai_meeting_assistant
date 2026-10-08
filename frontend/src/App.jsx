import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';
import Login from './pages/Login';
import Signup from './pages/Signup';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Dashboard from './pages/Dashboard';
import MyTeam from './pages/MyTeam';
import Meetings from './pages/Meetings';
import MeetingLobby from './pages/MeetingLobby';
import MeetingRoom from './pages/MeetingRoom';
import MeetingDetails from './pages/MeetingDetails';
import Tasks from './pages/Tasks';
import Approvals from './pages/Approvals';
import Notifications from './pages/Notifications';
import Pex from './pages/Pex';
import DirectChat from './pages/DirectChat';

// Protected Layout component wrapping Sidebar & Navbar
const AppLayout = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main)' }}>
        <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>Initializing Smart AI Meeting Assistant...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <div className="app-container">
      <Sidebar />
      <div className="main-content">
        <Navbar />
        {children}
      </div>
    </div>
  );
};

// Protected Fullscreen Layout (for WebRTC Meeting Room)
const ProtectedFullscreen = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#090d16', color: 'white' }}>
        <div>Connecting...</div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

// Public Route wrapper (redirects to /dashboard if already logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--bg-main, #f8fafc)' }}>
        <div style={{ color: 'var(--text-muted, #64748b)', fontSize: '0.9rem', fontWeight: 500 }}>
          Loading...
        </div>
      </div>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          {/* Public Auth Routes */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/signup" element={<PublicRoute><Signup /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/reset-password/:token" element={<PublicRoute><ResetPassword /></PublicRoute>} />

          {/* Protected Dashboard & Management Routes */}
          <Route path="/dashboard" element={<AppLayout><Dashboard /></AppLayout>} />
          <Route path="/team" element={<AppLayout><MyTeam /></AppLayout>} />
          <Route path="/chat" element={<AppLayout><DirectChat /></AppLayout>} />
          <Route path="/meetings" element={<AppLayout><Meetings /></AppLayout>} />
          <Route path="/meeting/:meetingId" element={<AppLayout><MeetingLobby /></AppLayout>} />
          <Route path="/meeting/:meetingId/details" element={<AppLayout><MeetingDetails /></AppLayout>} />
          <Route path="/tasks" element={<AppLayout><Tasks /></AppLayout>} />
          <Route path="/approvals" element={<AppLayout><Approvals /></AppLayout>} />
          <Route path="/notifications" element={<AppLayout><Notifications /></AppLayout>} />
          <Route path="/assistant" element={<AppLayout><Pex /></AppLayout>} />
          <Route path="/pex" element={<AppLayout><Pex /></AppLayout>} />

          {/* Dedicated Fullscreen WebRTC Meeting Room */}
          <Route path="/meeting/:meetingId/room" element={<ProtectedFullscreen><MeetingRoom /></ProtectedFullscreen>} />

          {/* Root redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
