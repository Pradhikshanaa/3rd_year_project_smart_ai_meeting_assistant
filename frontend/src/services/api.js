import axios from 'axios';

// Smart API Base URL resolver:
// 1. Explicit VITE_API_URL environment variable if set
// 2. If running on Vite dev server (e.g. localhost:5173), route to http://127.0.0.1:5000/api
// 3. If running on a unified port / ngrok tunnel (port 5000 or default 80/443), route to window.location.origin/api
const getApiBaseUrl = () => {
  if (import.meta.env.VITE_API_URL) {
    return import.meta.env.VITE_API_URL;
  }
  return '/api';
};

const API_BASE_URL = getApiBaseUrl();

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Interceptor to attach JWT token to all outbound requests
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Interceptor to handle unauthenticated 401s gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const msg = error.response.data?.message || '';
      // Only force redirect if token is explicitly expired or invalid
      if (msg.includes('expired') || msg.includes('invalid') || msg.includes('missing')) {
        if (!window.location.pathname.includes('/login') && !window.location.pathname.includes('/signup')) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(error);
  }
);

export const authService = {
  signup: async (userData) => {
    const res = await api.post('/auth/signup', userData);
    return res.data;
  },
  login: async (credentials) => {
    const res = await api.post('/auth/login', credentials);
    return res.data;
  },
  getMe: async () => {
    const res = await api.get('/auth/me');
    return res.data;
  },
  forgotPassword: async (email) => {
    const res = await api.post('/auth/forgot-password', { email });
    return res.data;
  },
  resetPassword: async (token, password) => {
    const res = await api.post('/auth/reset-password', { token, password });
    return res.data;
  },
};

export const dashboardService = {
  getStats: async () => {
    const res = await api.get('/dashboard/stats');
    return res.data;
  },
};

export const teamService = {
  getMyTeam: async () => {
    const res = await api.get('/teams/my-team');
    return res.data;
  },
};

export const meetingService = {
  createMeeting: async (meetingData) => {
    const res = await api.post('/meetings', meetingData);
    return res.data;
  },
  getMeetings: async (status = null) => {
    const params = status ? { status } : {};
    const res = await api.get('/meetings', { params });
    return res.data;
  },
  getMeetingDetails: async (meetingId) => {
    const res = await api.get(`/meetings/${meetingId}`);
    return res.data;
  },
  updateStatus: async (meetingId, status) => {
    const res = await api.patch(`/meetings/${meetingId}/status`, { status });
    return res.data;
  },
  rsvp: async (meetingId, status) => {
    const res = await api.patch(`/meetings/${meetingId}/rsvp`, { status });
    return res.data;
  },
  joinSession: async (meetingId) => {
    const res = await api.post(`/meetings/${meetingId}/join`);
    return res.data;
  },
  leaveSession: async (meetingId) => {
    const res = await api.post(`/meetings/${meetingId}/leave`);
    return res.data;
  },
  endSession: async (meetingId, transcript = '') => {
    const res = await api.post(`/meetings/${meetingId}/end`, { transcript }, { timeout: 90000 });
    return res.data;
  },
  saveTranscript: async (meetingId, transcript) => {
    const res = await api.post(`/meetings/${meetingId}/transcript`, { transcript });
    return res.data;
  },
  analyzeMeeting: async (meetingId, transcript = '') => {
    const res = await api.post(`/meetings/${meetingId}/analyze`, { transcript }, { timeout: 120000 });
    return res.data;
  },
  getDecisions: async (meetingId) => {
    const res = await api.get(`/meetings/${meetingId}/decisions`);
    return res.data;
  },
  getAudioUrl: (meetingId) => {
    return `${API_BASE_URL}/meetings/${meetingId}/audio`;
  },
  transcribeAudioChunk: async (meetingId, audioBlob) => {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'chunk.webm');
    const res = await api.post(`/meetings/${meetingId}/transcribe-audio`, formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000,
    });
    return res.data;
  },
};

export const taskService = {
  getTasks: async (params = {}) => {
    const res = await api.get('/tasks', { params });
    return res.data;
  },
  getApprovals: async () => {
    const res = await api.get('/tasks/approvals');
    return res.data;
  },
  getSuggestedTasks: async (meetingId) => {
    const res = await api.get(`/meetings/${meetingId}/suggested-tasks`);
    return res.data;
  },
  createTask: async (taskData) => {
    const res = await api.post('/tasks', taskData);
    return res.data;
  },
  confirmTask: async (taskId, editData = {}) => {
    const res = await api.patch(`/tasks/${taskId}/confirm`, editData);
    return res.data;
  },
  deleteTask: async (taskId) => {
    const res = await api.delete(`/tasks/${taskId}`);
    return res.data;
  },
  updateProgress: async (taskId, progress) => {
    const res = await api.patch(`/tasks/${taskId}/progress`, { progress });
    return res.data;
  },
  submitForReview: async (taskId) => {
    const res = await api.patch(`/tasks/${taskId}/submit`);
    return res.data;
  },
  approveTask: async (taskId) => {
    const res = await api.patch(`/tasks/${taskId}/approve`);
    return res.data;
  },
  rejectTask: async (taskId, feedback) => {
    const res = await api.patch(`/tasks/${taskId}/reject`, { feedback });
    return res.data;
  },
  triggerReminders: async (force = true) => {
    const res = await api.post(`/tasks/trigger-reminders?force=${force}`);
    return res.data;
  },
  getRemindersLog: async () => {
    const res = await api.get('/tasks/reminders-log');
    return res.data;
  },
};

export const notificationService = {
  getNotifications: async (limit = 50) => {
    const res = await api.get('/notifications', { params: { limit } });
    return res.data;
  },
  markAsRead: async (id) => {
    const res = await api.put(`/notifications/${id}/read`);
    return res.data;
  },
  markAllAsRead: async () => {
    const res = await api.put('/notifications/read-all');
    return res.data;
  },
};

export const messageService = {
  getConversations: async () => {
    const res = await api.get('/messages/conversations');
    return res.data;
  },
  getMessages: async (otherUserId) => {
    const res = await api.get(`/messages/${otherUserId}`);
    return res.data;
  },
  sendMessage: async (receiverId, messageText) => {
    const res = await api.post('/messages', { receiver_id: receiverId, message_text: messageText });
    return res.data;
  },
  markAsRead: async (messageId) => {
    const res = await api.put(`/messages/${messageId}/read`);
    return res.data;
  },
  markAllAsRead: async (otherUserId) => {
    const res = await api.put(`/messages/${otherUserId}/read-all`);
    return res.data;
  },
  getUnreadCount: async () => {
    const res = await api.get('/messages/unread-count');
    return res.data;
  },
};

export const assistantService = {
  sendMessage: async (message, history = []) => {
    const res = await api.post('/assistant/chat', { message, history }, { timeout: 60000 });
    return res.data;
  },
};

export const systemService = {
  checkHealth: async () => {
    const res = await api.get('/health');
    return res.data;
  },
};

export default api;
