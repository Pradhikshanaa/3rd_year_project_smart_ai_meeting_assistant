import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { messageService } from '../services/api';
import { getSocket } from '../services/socket';
import { 
  Send, Search, Check, CheckCheck, User, Users, 
  MessageSquare, Shield, Clock, AlertCircle, RefreshCw, Sparkles 
} from 'lucide-react';

const formatMessageTime = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return '';
  }
};

const formatConversationDate = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const isYesterday = date.toDateString() === yesterday.toDateString();

    if (isToday) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    if (isYesterday) {
      return 'Yesterday';
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
};

const formatDateDivider = (isoString) => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return 'Today';
    
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return 'Yesterday';

    return date.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
  } catch (e) {
    return '';
  }
};

const DirectChat = () => {
  const { user, isLeader, team } = useAuth();
  
  const [conversations, setConversations] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  
  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');

  const messagesEndRef = useRef(null);
  const activePartnerRef = useRef(null);

  // Keep ref up to date for socket listeners
  useEffect(() => {
    activePartnerRef.current = selectedUser;
  }, [selectedUser]);

  const scrollToBottom = (behavior = 'smooth') => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: 'end' });
    }
  };

  // 1. Fetch Conversations on Mount
  const fetchConversations = async (keepSelection = true) => {
    try {
      setLoadingConversations(true);
      setError('');
      const res = await messageService.getConversations();
      if (res.success) {
        const convs = res.conversations || [];
        setConversations(convs);

        if (!keepSelection || !selectedUser) {
          if (convs.length > 0) {
            setSelectedUser(convs[0].user);
          }
        }
      }
    } catch (err) {
      console.error('[Chat] Failed to load conversations:', err);
      setError(err.response?.data?.message || 'Failed to load conversations.');
    } finally {
      setLoadingConversations(false);
    }
  };

  // 2. Fetch Messages when selectedUser changes
  const fetchMessages = async (targetUser) => {
    if (!targetUser || !targetUser.id) return;
    try {
      setLoadingMessages(true);
      const res = await messageService.getMessages(targetUser.id);
      if (res.success) {
        setMessages(res.messages || []);
        
        // Update unread count in conversations list for this user
        setConversations((prev) =>
          prev.map((c) => (c.user.id === targetUser.id ? { ...c, unread_count: 0 } : c))
        );

        setTimeout(() => scrollToBottom('auto'), 50);
      }
    } catch (err) {
      console.error('[Chat] Failed to load messages:', err);
      setError(err.response?.data?.message || 'Failed to load conversation messages.');
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    fetchConversations(false);
  }, []);

  useEffect(() => {
    if (selectedUser) {
      fetchMessages(selectedUser);
    }
  }, [selectedUser?.id]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // 3. Setup Socket.IO Real-time delivery
  useEffect(() => {
    if (!user) return;

    const socket = getSocket(user);

    const handleReceiveMessage = (msg) => {
      console.log('[Socket.IO Chat] Received message:', msg);
      
      const currentActive = activePartnerRef.current;

      // If message is from current active conversation partner
      if (currentActive && (msg.sender_id === currentActive.id || msg.receiver_id === currentActive.id)) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some((m) => m.id === msg.id)) return prev;
          return [...prev, msg];
        });

        // Mark as read immediately on backend
        if (msg.sender_id === currentActive.id) {
          messageService.markAsRead(msg.id).catch(() => {});
          socket.emit('mark_messages_read', { sender_id: msg.sender_id, reader_id: user.id });
        }
      }

      // Update conversations list with latest message snippet
      setConversations((prev) => {
        const partnerId = msg.sender_id === user.id ? msg.receiver_id : msg.sender_id;
        const exists = prev.some((c) => c.user.id === partnerId);

        if (!exists) {
          // Refresh list if new participant
          fetchConversations(true);
          return prev;
        }

        return prev.map((c) => {
          if (c.user.id === partnerId) {
            const isCurrentlyOpen = currentActive && currentActive.id === partnerId;
            return {
              ...c,
              last_message: msg,
              unread_count: isCurrentlyOpen ? 0 : (msg.sender_id === partnerId ? (c.unread_count || 0) + 1 : c.unread_count)
            };
          }
          return c;
        });
      });
    };

    const handleMessageConfirm = (msg) => {
      setMessages((prev) => {
        if (prev.some((m) => m.id === msg.id)) return prev;
        return [...prev, msg];
      });
    };

    const handleMessagesRead = ({ reader_id, sender_id }) => {
      if (reader_id && sender_id === user.id) {
        // Mark messages as read in UI (blue ticks)
        setMessages((prev) =>
          prev.map((m) => (m.sender_id === user.id ? { ...m, is_read: true } : m))
        );
      }
    };

    socket.on('receive_message', handleReceiveMessage);
    socket.on('message_sent_confirm', handleMessageConfirm);
    socket.on('messages_read', handleMessagesRead);

    return () => {
      socket.off('receive_message', handleReceiveMessage);
      socket.off('message_sent_confirm', handleMessageConfirm);
      socket.off('messages_read', handleMessagesRead);
    };
  }, [user]);

  // 4. Send Message Handler
  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if (!inputMessage.trim() || !selectedUser || sending) return;

    const textToSend = inputMessage.trim();
    setInputMessage('');
    setSending(true);

    try {
      // Send via REST API (which automatically emits Socket.IO and saves DB)
      const res = await messageService.sendMessage(selectedUser.id, textToSend);
      if (res.success && res.message) {
        const newMsg = res.message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev;
          return [...prev, newMsg];
        });

        // Update local conversation item
        setConversations((prev) =>
          prev.map((c) =>
            c.user.id === selectedUser.id ? { ...c, last_message: newMsg } : c
          )
        );
      }
    } catch (err) {
      console.error('[Chat] Failed to send message:', err);
      setError(err.response?.data?.message || 'Failed to send message.');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Filter conversations
  const filteredConversations = conversations.filter((c) =>
    c.user.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.user.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="page-body" style={{ maxWidth: '1400px', height: 'calc(100vh - 120px)', padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header Card */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '1rem',
        background: 'var(--bg-card)',
        padding: '0.9rem 1.5rem',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            width: 42,
            height: 42,
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)'
          }}>
            <MessageSquare size={22} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
              {isLeader ? 'Team Direct Messages' : 'Direct Chat with Team Leader'}
            </h1>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
              {isLeader 
                ? `1-to-1 professional Q&A hub for team ${team?.team_name || user?.team_id || ''}`
                : `Ask questions and get direct guidance from your Team Leader`}
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <span className={`badge ${isLeader ? 'badge-leader' : 'badge-employee'}`}>
            <Shield size={12} />
            {isLeader ? 'Leader View' : 'Employee View'}
          </span>
          <button
            onClick={() => fetchConversations(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              padding: '0.45rem 0.85rem',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-color)',
              background: 'var(--bg-card)',
              color: 'var(--text-muted)',
              fontSize: '0.82rem',
              cursor: 'pointer'
            }}
            title="Refresh conversations"
          >
            <RefreshCw size={14} className={loadingConversations ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div style={{
          backgroundColor: 'var(--danger-light, #fef2f2)',
          color: 'var(--danger-text, #991b1b)',
          padding: '0.75rem 1rem',
          borderRadius: 'var(--radius-md)',
          marginBottom: '1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          fontSize: '0.875rem'
        }}>
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Main WhatsApp-Style Container */}
      <div style={{
        flex: 1,
        display: 'flex',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--border-color)',
        boxShadow: 'var(--shadow-md)',
        overflow: 'hidden',
        minHeight: 0
      }}>
        {/* LEFT SIDE: Conversation List (Only for Leader or when multiple contacts exist) */}
        {isLeader && (
          <div style={{
            width: '340px',
            borderRight: '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            background: '#fafbfc'
          }}>
            {/* Search Header */}
            <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-color)', background: 'var(--bg-card)' }}>
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#f1f5f9',
                padding: '0.5rem 0.85rem',
                borderRadius: 'var(--radius-md)'
              }}>
                <Search size={16} color="var(--text-muted)" />
                <input
                  type="text"
                  placeholder="Search team member..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    outline: 'none',
                    width: '100%',
                    fontSize: '0.875rem',
                    color: 'var(--text-main)'
                  }}
                />
              </div>
            </div>

            {/* Conversation List Items */}
            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loadingConversations ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  Loading team members...
                </div>
              ) : filteredConversations.length === 0 ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                  <Users size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                  <div>No team employees found</div>
                </div>
              ) : (
                filteredConversations.map((c) => {
                  const isSelected = selectedUser?.id === c.user.id;
                  const lastMsgText = c.last_message?.message_text || 'No messages yet';
                  const isUnread = (c.unread_count || 0) > 0;

                  return (
                    <div
                      key={c.user.id}
                      onClick={() => setSelectedUser(c.user)}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.85rem',
                        padding: '0.85rem 1rem',
                        borderBottom: '1px solid #f1f5f9',
                        cursor: 'pointer',
                        backgroundColor: isSelected ? '#eff6ff' : 'transparent',
                        borderLeft: isSelected ? '4px solid var(--primary)' : '4px solid transparent',
                        transition: 'background 0.15s ease'
                      }}
                    >
                      {/* Avatar */}
                      <div style={{ position: 'relative' }}>
                        <div style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          backgroundColor: '#e0e7ff',
                          color: '#4338ca',
                          fontWeight: 700,
                          fontSize: '1rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {c.user.name.charAt(0).toUpperCase()}
                        </div>
                        {isUnread && (
                          <div style={{
                            position: 'absolute',
                            top: -2,
                            right: -2,
                            width: 12,
                            height: 12,
                            borderRadius: '50%',
                            backgroundColor: 'var(--primary)',
                            border: '2px solid #ffffff'
                          }} />
                        )}
                      </div>

                      {/* Contact Info & Snippet */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '2px' }}>
                          <span style={{
                            fontWeight: isUnread ? 700 : (isSelected ? 600 : 500),
                            fontSize: '0.92rem',
                            color: 'var(--text-main)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {c.user.name}
                          </span>
                          <span style={{ fontSize: '0.72rem', color: isUnread ? 'var(--primary)' : 'var(--text-light)', fontWeight: isUnread ? 600 : 400 }}>
                            {formatConversationDate(c.last_message?.created_at)}
                          </span>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{
                            fontSize: '0.8rem',
                            color: isUnread ? 'var(--text-main)' : 'var(--text-muted)',
                            fontWeight: isUnread ? 600 : 400,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            maxWidth: '180px'
                          }}>
                            {c.last_message?.sender_id === user.id && (
                              <span style={{ color: 'var(--text-light)', marginRight: 4 }}>You:</span>
                            )}
                            {lastMsgText}
                          </span>

                          {isUnread && (
                            <span style={{
                              backgroundColor: 'var(--primary)',
                              color: 'white',
                              borderRadius: 'var(--radius-full)',
                              fontSize: '0.72rem',
                              fontWeight: 700,
                              minWidth: '20px',
                              height: '20px',
                              padding: '0 6px',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}>
                              {c.unread_count}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* RIGHT SIDE: Active Chat Pane */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: '#ffffff' }}>
          {selectedUser ? (
            <>
              {/* Chat Header */}
              <div style={{
                padding: '0.85rem 1.5rem',
                borderBottom: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'var(--bg-card)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
                  <div style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    backgroundColor: selectedUser.role === 'leader' ? '#f3e8ff' : '#e0e7ff',
                    color: selectedUser.role === 'leader' ? '#6b21a8' : '#4338ca',
                    fontWeight: 700,
                    fontSize: '1rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    boxShadow: 'var(--shadow-sm)'
                  }}>
                    {selectedUser.name.charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontWeight: 700, fontSize: '0.98rem', color: 'var(--text-main)' }}>
                        {selectedUser.name}
                      </span>
                      <span className={`badge ${selectedUser.role === 'leader' ? 'badge-leader' : 'badge-employee'}`}>
                        {selectedUser.role === 'leader' ? 'Team Leader' : 'Employee'}
                      </span>
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {selectedUser.email}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    fontSize: '0.78rem',
                    color: 'var(--success-text)',
                    backgroundColor: 'var(--success-light)',
                    padding: '0.25rem 0.65rem',
                    borderRadius: 'var(--radius-full)',
                    fontWeight: 600
                  }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--success)' }} />
                    Active Direct Channel
                  </span>
                </div>
              </div>

              {/* Messages Body */}
              <div style={{
                flex: 1,
                overflowY: 'auto',
                padding: '1.5rem',
                backgroundColor: '#f8fafc',
                backgroundImage: 'radial-gradient(#e2e8f0 1px, transparent 1px)',
                backgroundSize: '24px 24px',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.75rem'
              }}>
                {loadingMessages ? (
                  <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    <div className="spin" style={{ display: 'inline-block', marginBottom: '0.5rem' }}>⌛</div>
                    <div>Loading messages...</div>
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{
                    margin: 'auto',
                    textAlign: 'center',
                    maxWidth: '420px',
                    padding: '2rem',
                    background: 'rgba(255, 255, 255, 0.85)',
                    backdropFilter: 'blur(8px)',
                    borderRadius: 'var(--radius-lg)',
                    border: '1px dashed var(--border-color)'
                  }}>
                    <div style={{
                      width: 54,
                      height: 54,
                      borderRadius: '50%',
                      background: 'var(--primary-light)',
                      color: 'var(--primary)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      margin: '0 auto 1rem'
                    }}>
                      <Sparkles size={26} />
                    </div>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text-main)' }}>
                      No messages yet
                    </h3>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      {isLeader
                        ? `Send a message to ${selectedUser.name} to share task updates, answer doubts, or provide feedback.`
                        : `Ask your Team Leader ${selectedUser.name} any technical or task-related questions directly here.`}
                    </p>
                  </div>
                ) : (
                  messages.map((msg, index) => {
                    const isOutgoing = msg.sender_id === user.id;
                    const prevMsg = index > 0 ? messages[index - 1] : null;
                    const showDateDivider = !prevMsg || formatDateDivider(prevMsg.created_at) !== formatDateDivider(msg.created_at);

                    return (
                      <React.Fragment key={msg.id || index}>
                        {showDateDivider && (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            margin: '0.75rem 0'
                          }}>
                            <span style={{
                              backgroundColor: '#e2e8f0',
                              color: '#475569',
                              fontSize: '0.72rem',
                              fontWeight: 600,
                              padding: '0.2rem 0.75rem',
                              borderRadius: 'var(--radius-full)',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                            }}>
                              {formatDateDivider(msg.created_at)}
                            </span>
                          </div>
                        )}

                        <div style={{
                          display: 'flex',
                          justifyContent: isOutgoing ? 'flex-end' : 'flex-start',
                          marginBottom: '2px'
                        }}>
                          <div style={{
                            maxWidth: '70%',
                            padding: '0.65rem 0.95rem',
                            borderRadius: isOutgoing ? '16px 16px 2px 16px' : '16px 16px 16px 2px',
                            background: isOutgoing
                              ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                              : '#ffffff',
                            color: isOutgoing ? '#ffffff' : 'var(--text-main)',
                            boxShadow: isOutgoing
                              ? '0 2px 6px rgba(37, 99, 235, 0.25)'
                              : '0 1px 3px rgba(0, 0, 0, 0.08)',
                            border: isOutgoing ? 'none' : '1px solid #e2e8f0',
                            position: 'relative'
                          }}>
                            {/* Message text */}
                            <div style={{
                              fontSize: '0.9rem',
                              lineHeight: 1.45,
                              whiteSpace: 'pre-wrap',
                              wordBreak: 'break-word'
                            }}>
                              {msg.message_text}
                            </div>

                            {/* Timestamp & read receipt */}
                            <div style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              gap: '4px',
                              marginTop: '4px',
                              fontSize: '0.68rem',
                              color: isOutgoing ? 'rgba(255, 255, 255, 0.8)' : '#94a3b8'
                            }}>
                              <span>{formatMessageTime(msg.created_at)}</span>
                              {isOutgoing && (
                                <span title={msg.is_read ? 'Read' : 'Delivered'}>
                                  {msg.is_read ? (
                                    <CheckCheck size={14} color="#60a5fa" strokeWidth={2.5} />
                                  ) : (
                                    <CheckCheck size={14} color="rgba(255,255,255,0.7)" strokeWidth={1.8} />
                                  )}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <form
                onSubmit={handleSendMessage}
                style={{
                  padding: '0.85rem 1.25rem',
                  borderTop: '1px solid var(--border-color)',
                  background: 'var(--bg-card)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem'
                }}
              >
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  background: '#f1f5f9',
                  borderRadius: 'var(--radius-full)',
                  padding: '0.35rem 1rem',
                  border: '1px solid transparent',
                  transition: 'border 0.2s'
                }}>
                  <input
                    type="text"
                    placeholder={`Message ${selectedUser.name}... (Press Enter to send)`}
                    value={inputMessage}
                    onChange={(e) => setInputMessage(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={sending}
                    style={{
                      width: '100%',
                      border: 'none',
                      background: 'transparent',
                      outline: 'none',
                      fontSize: '0.9rem',
                      color: 'var(--text-main)'
                    }}
                  />
                </div>

                <button
                  type="submit"
                  disabled={!inputMessage.trim() || sending}
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: '50%',
                    background: inputMessage.trim()
                      ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                      : '#e2e8f0',
                    color: inputMessage.trim() ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    cursor: inputMessage.trim() ? 'pointer' : 'not-allowed',
                    transition: 'all 0.2s',
                    boxShadow: inputMessage.trim() ? '0 3px 8px rgba(59, 130, 246, 0.35)' : 'none'
                  }}
                  title="Send Message"
                >
                  <Send size={18} />
                </button>
              </form>
            </>
          ) : (
            <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)' }}>
              <MessageSquare size={48} style={{ opacity: 0.3, margin: '0 auto 1rem' }} />
              <h3>Select a conversation</h3>
              <p style={{ fontSize: '0.875rem' }}>Choose an employee from the left panel to begin chatting.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DirectChat;
