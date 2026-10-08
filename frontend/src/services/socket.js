import { io } from 'socket.io-client';

let socketInstance = null;

const getSocketUrl = () => {
  if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
  }
  return window.location.origin;
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
