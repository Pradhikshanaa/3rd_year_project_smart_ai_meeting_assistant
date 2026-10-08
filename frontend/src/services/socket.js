import { io } from 'socket.io-client';

let socketInstance = null;

export const getSocketUrl = () => {
  const isLocalHost = typeof window !== 'undefined' && (
    window.location.hostname === 'localhost' || 
    window.location.hostname === '127.0.0.1' ||
    window.location.hostname.startsWith('192.168.') ||
    window.location.hostname.startsWith('10.')
  );

  const envSocketUrl = import.meta.env.VITE_SOCKET_URL;
  const envApiUrl = import.meta.env.VITE_API_URL;

  if (!isLocalHost) {
    if (envSocketUrl && !envSocketUrl.includes('localhost') && !envSocketUrl.includes('127.0.0.1')) {
      return envSocketUrl;
    }
    if (envApiUrl && !envApiUrl.includes('localhost') && !envApiUrl.includes('127.0.0.1')) {
      return envApiUrl.replace(/\/api\/?$/, '');
    }
    return 'https://threerd-year-project-smart-ai-meeting.onrender.com';
  }

  if (envSocketUrl) return envSocketUrl;
  if (envApiUrl) return envApiUrl.replace(/\/api\/?$/, '');
  return typeof window !== 'undefined' ? window.location.origin : 'http://127.0.0.1:5000';
};

export const getSocket = (user) => {
  if (!socketInstance) {
    const socketUrl = getSocketUrl();
    socketInstance = io(socketUrl, {
      path: '/socket.io',
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO] Connected to server, socket ID:', socketInstance.id);
      if (user && user.id) {
        socketInstance.emit('join-user', { user_id: user.id });
      }
    });

    socketInstance.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', reason);
    });
  } else if (socketInstance.connected && user && user.id) {
    socketInstance.emit('join-user', { user_id: user.id });
  }

  return socketInstance;
};

export const closeSocket = () => {
  if (socketInstance) {
    socketInstance.disconnect();
    socketInstance = null;
  }
};

export default getSocket;
