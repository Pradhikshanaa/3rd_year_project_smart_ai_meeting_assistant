import React, { useEffect, useState } from 'react';
import { systemService } from '../services/api';
import { Activity, CheckCircle, AlertCircle } from 'lucide-react';

const HealthStatusBadge = () => {
  const [health, setHealth] = useState({ status: 'checking', dbStatus: 'unknown' });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchHealth = async () => {
    setIsRefreshing(true);
    try {
      const res = await systemService.checkHealth();
      setHealth({
        status: res.status || 'online',
        dbStatus: res.database?.status || 'unknown',
        dbError: res.database?.error
      });
    } catch (err) {
      // If the cloud server is spinning up or offline
      setHealth({
        status: 'offline',
        dbStatus: 'disconnected',
        error: err.message
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Fast retry (5s) if server is offline (Render waking up), normal poll (15s) when online
    const intervalTime = health.status === 'offline' ? 5000 : 15000;
    const interval = setInterval(fetchHealth, intervalTime);
    return () => clearInterval(interval);
  }, [health.status]);

  const isHealthy = health.status === 'online' && health.dbStatus === 'connected';
  const isWakingUp = health.status === 'offline' || health.status === 'checking';

  let badgeText = 'System Online (Database Connected)';
  let badgeBg = '#ecfdf5';
  let badgeColor = '#065f46';
  let badgeBorder = '#a7f3d0';

  if (isHealthy) {
    badgeText = 'System Online (Database Connected)';
    badgeBg = '#ecfdf5';
    badgeColor = '#065f46';
    badgeBorder = '#a7f3d0';
  } else if (isWakingUp) {
    badgeText = isRefreshing ? 'Connecting to Cloud Backend...' : 'Waking Up Cloud Server... (Click to Retry)';
    badgeBg = '#fffbeb';
    badgeColor = '#92400e';
    badgeBorder = '#fde68a';
  } else if (health.status === 'online' && health.dbStatus !== 'connected') {
    badgeText = 'API Online (Database Disconnected)';
    badgeBg = '#fef2f2';
    badgeColor = '#991b1b';
    badgeBorder = '#fecaca';
  }

  return (
    <div
      title={health.dbError ? `Database Error: ${health.dbError}` : `API: ${health.status}, DB: ${health.dbStatus} (Click to refresh)`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '0.74rem',
        fontWeight: 600,
        backgroundColor: badgeBg,
        color: badgeColor,
        border: `1px solid ${badgeBorder}`,
        cursor: 'pointer',
        userSelect: 'none',
        transition: 'all 0.2s ease'
      }}
      onClick={fetchHealth}
    >
      {isHealthy ? (
        <CheckCircle size={13} color="#10b981" />
      ) : isWakingUp ? (
        <Activity size={13} color="#f59e0b" style={{ animation: isRefreshing ? 'spin 1s linear infinite' : 'none' }} />
      ) : (
        <AlertCircle size={13} color="#ef4444" />
      )}
      <span>{badgeText}</span>
    </div>
  );
};

export default HealthStatusBadge;
