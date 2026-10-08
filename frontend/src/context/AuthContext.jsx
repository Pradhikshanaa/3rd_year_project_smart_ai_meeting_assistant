import React, { createContext, useContext, useState, useEffect } from 'react';
import { authService } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user');
    return saved ? JSON.parse(saved) : null;
  });
  const [team, setTeam] = useState(() => {
    const saved = localStorage.getItem('team');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('token') || null);
  const [loading, setLoading] = useState(() => {
    return !!localStorage.getItem('token');
  });

  useEffect(() => {
    let isMounted = true;
    const fetchCurrentUser = async () => {
      const storedToken = localStorage.getItem('token');
      if (!storedToken) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const res = await authService.getMe();
        if (res && res.success && isMounted) {
          setUser(res.user);
          setTeam(res.team);
          localStorage.setItem('user', JSON.stringify(res.user));
          if (res.team) localStorage.setItem('team', JSON.stringify(res.team));
        }
      } catch (err) {
        console.warn("Failed to restore session token:", err.message);
        if (isMounted) logout();
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchCurrentUser();

    // Fallback safety timer so app is NEVER blocked on a blank screen
    const safetyTimer = setTimeout(() => {
      if (isMounted) setLoading(false);
    }, 2000);

    return () => {
      isMounted = false;
      clearTimeout(safetyTimer);
    };
  }, []);

  const login = async (email, password) => {
    const data = await authService.login({ email, password });
    if (data.success) {
      setToken(data.token);
      setUser(data.user);
      setTeam(data.team);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.team) localStorage.setItem('team', JSON.stringify(data.team));
    }
    return data;
  };

  const signup = async (payload) => {
    const data = await authService.signup(payload);
    if (data.success) {
      setToken(data.token);
      setUser(data.user);
      setTeam(data.team);
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      if (data.team) localStorage.setItem('team', JSON.stringify(data.team));
    }
    return data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    localStorage.removeItem('team');
    setToken(null);
    setUser(null);
    setTeam(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        team,
        token,
        loading,
        login,
        signup,
        logout,
        isLeader: user?.role === 'leader',
        isEmployee: user?.role === 'employee',
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
