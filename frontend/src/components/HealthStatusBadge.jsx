import React, { useEffect, useState } from 'react';
import { systemService } from '../services/api';
import { Activity, CheckCircle, AlertCircle } from 'lucide-react';

const HealthStatusBadge = () => {
  const [health, setHealth] = useState({ status: 'checking', dbStatus: 'unknown' });

  const fetchHealth = async () => {
    try {
      const res = await systemService.checkHealth();
      setHealth({
        status: res.status,
        dbStatus: res.database?.status || 'unknown',
        dbError: res.database?.error
      });
    } catch (err) {
      setHealth({ status: 'offline', dbStatus: 'disconnected', error: err.message });
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const isHealthy = health.status === 'online' && health.dbStatus === 'connected';

  return (
    <div
      title={health.dbError ? `Database Error: ${health.dbError}` : `API: ${health.status}, DB: ${health.dbStatus}`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        padding: '4px 10px',
        borderRadius: '20px',
        fontSize: '0.74rem',
        fontWeight: 600,
        backgroundColor: isHealthy ? '#ecfdf5' : health.status === 'online' ? '#fffbeb' : '#fef2f2',
        color: isHealthy ? '#065f46' : health.status === 'online' ? '#92400e' : '#991b1b',
        border: `1px solid ${isHealthy ? '#a7f3d0' : health.status === 'online' ? '#fde68a' : '#fecaca'}`,
        cursor: 'pointer'
      }}
      onClick={fetchHealth}
    >
      {isHealthy ? (
        <CheckCircle size={13} color="#10b981" />
      ) : health.status === 'online' ? (
        <Activity size={13} color="#f59e0b" />
      ) : (
        <AlertCircle size={13} color="#ef4444" />
      )}
      <span>{isHealthy ? 'System Online (Database Connected)' : health.status === 'online' ? 'API Online (Database Disconnected)' : 'API Offline'}</span>
    </div>
  );
};

export default HealthStatusBadge;
