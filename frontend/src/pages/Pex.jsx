import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { assistantService } from '../services/api';
import { 
  Sparkles, Send, Bot, User, Clock, CheckSquare, 
  Lightbulb, AlertCircle, Copy, Check, RefreshCw,
  Mic, MicOff
} from 'lucide-react';

const Pex = () => {
  const { user } = useAuth();
  const [messages, setMessages] = useState([
    {
      id: 1,
      sender: 'assistant',
      text: `Hello **${user?.name}**! 👋 I'm **Pex**, your personal meeting intelligence assistant.\n\nI have loaded your personal assigned tasks, upcoming team meetings, and recent decisions from the database. How can I help you organize your day?`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    }
  ]);
  const [inputMessage, setInputMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copiedId, setCopiedId] = useState(null);
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef(null);

  const toggleVoiceInput = () => {
    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      alert('Speech Recognition is not supported in this browser. Please open in Google Chrome or Microsoft Edge.');
      return;
    }

    if (isListening && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) {}
      setIsListening(false);
      return;
    }

    try {
      const recognizer = new SpeechClass();
      recognizer.continuous = false;
      recognizer.interimResults = true;
      recognizer.lang = navigator.language || 'en-US';

      recognizer.onstart = () => {
        setIsListening(true);
        setError('');
      };

      recognizer.onresult = (evt) => {
        let transcript = '';
        for (let i = 0; i < evt.results.length; i++) {
          transcript += evt.results[i][0].transcript;
        }
        if (transcript) {
          setInputMessage(transcript);
        }
      };

      recognizer.onerror = (e) => {
        console.warn('[Pex Voice STT Error]:', e.error);
        if (e.error === 'not-allowed') {
          setError('Microphone access was denied. Please allow microphone permission in your browser address bar.');
        } else if (e.error === 'network') {
          setError('Google Speech recognition network is currently unreachable.');
        }
        setIsListening(false);
      };

      recognizer.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognizer;
      recognizer.start();
    } catch (err) {
      console.error('[Pex STT Init Error]:', err);
      setIsListening(false);
      setError('Voice recognition error: ' + err.message);
    }
  };

  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, loading]);

  const handleSend = async (textToSend = inputMessage) => {
    const text = textToSend.trim();
    if (!text || loading) return;

    const userMsg = {
      id: Date.now(),
      sender: 'user',
      text: text,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const currentHistory = [...messages, userMsg];
    setMessages(currentHistory);
    setInputMessage('');
    setError('');
    setLoading(true);

    try {
      const historyPayload = currentHistory.slice(-8).map(m => ({
        sender: m.sender,
        text: m.text
      }));
      const res = await assistantService.sendMessage(text, historyPayload);
      if (res.success) {
        const botMsg = {
          id: Date.now() + 1,
          sender: 'assistant',
          text: res.reply,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        };
        setMessages(prev => [...prev, botMsg]);
      } else {
        setError(res.message || 'Pex could not generate a response.');
      }
    } catch (err) {
      console.error('[Pex API Error]:', err);
      const backendError = err.response?.data?.message || err.message;
      setError(`Pex Gemini Error: ${backendError}`);
    } finally {
      setLoading(false);
    }
  };

  const copyMessage = (id, text) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const quickPrompts = [
    "What should I work on today?",
    "Which of my tasks are highest priority?",
    "What did we decide in our recent meetings?",
    "Summarize my pending tasks and deadlines"
  ];

  // Helper to render rich markdown: headers, code blocks, lists, bold & inline code
  const renderFormattedText = (text) => {
    if (!text) return null;
    
    // Split by code blocks first
    const parts = text.split(/(```[\s\S]*?```)/g);
    
    return parts.map((part, partIdx) => {
      if (part.startsWith('```') && part.endsWith('```')) {
        const lines = part.slice(3, -3).trim().split('\n');
        let lang = '';
        let code = part.slice(3, -3);
        if (lines[0] && !lines[0].includes(' ') && lines.length > 1) {
          lang = lines[0].trim();
          code = lines.slice(1).join('\n');
        }
        return (
          <div key={`code-${partIdx}`} style={{ margin: '8px 0', borderRadius: '6px', overflow: 'hidden' }}>
            {lang && (
              <div style={{ backgroundColor: '#1e293b', color: '#94a3b8', fontSize: '0.72rem', padding: '3px 8px', fontWeight: 600, textTransform: 'uppercase' }}>
                {lang}
              </div>
            )}
            <pre style={{
              backgroundColor: '#0f172a',
              color: '#f8fafc',
              padding: '10px 14px',
              margin: 0,
              fontSize: '0.84rem',
              fontFamily: 'monospace',
              overflowX: 'auto',
              borderRadius: lang ? '0 0 6px 6px' : '6px'
            }}>
              <code>{code.trim()}</code>
            </pre>
          </div>
        );
      }

      const lines = part.split('\n');
      return lines.map((line, idx) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return <div key={`${partIdx}-${idx}`} style={{ height: '6px' }} />;
        }
        // Headers
        if (trimmed.startsWith('### ')) {
          return (
            <h4 key={`${partIdx}-${idx}`} style={{ fontSize: '0.98rem', fontWeight: 700, margin: '8px 0 4px', color: 'inherit' }}
                dangerouslySetInnerHTML={{ __html: formatBold(trimmed.substring(4)) }} />
          );
        }
        if (trimmed.startsWith('## ')) {
          return (
            <h3 key={`${partIdx}-${idx}`} style={{ fontSize: '1.05rem', fontWeight: 700, margin: '10px 0 4px', color: 'inherit' }}
                dangerouslySetInnerHTML={{ __html: formatBold(trimmed.substring(3)) }} />
          );
        }
        if (trimmed.startsWith('# ')) {
          return (
            <h2 key={`${partIdx}-${idx}`} style={{ fontSize: '1.12rem', fontWeight: 700, margin: '12px 0 6px', color: 'inherit' }}
                dangerouslySetInnerHTML={{ __html: formatBold(trimmed.substring(2)) }} />
          );
        }
        // Bullet list
        if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
          return (
            <li key={`${partIdx}-${idx}`} style={{ marginLeft: '1.25rem', marginBottom: '3px', listStyleType: 'disc' }}>
              <span dangerouslySetInnerHTML={{ __html: formatBold(trimmed.substring(2)) }} />
            </li>
          );
        }
        // Numbered list
        if (trimmed.match(/^\d+\.\s/)) {
          return (
            <div key={`${partIdx}-${idx}`} style={{ marginLeft: '0.5rem', marginBottom: '3px' }}>
              <span dangerouslySetInnerHTML={{ __html: formatBold(trimmed) }} />
            </div>
          );
        }
        return (
          <p key={`${partIdx}-${idx}`} style={{ margin: '0 0 6px 0', lineHeight: 1.5 }}
             dangerouslySetInnerHTML={{ __html: formatBold(line) }} />
        );
      });
    });
  };

  const formatBold = (str) => {
    if (!str) return '';
    return str
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code style="background:rgba(0,0,0,0.06);padding:2px 5px;border-radius:4px;font-family:monospace;font-size:0.88em;color:#4f46e5;font-weight:600;">$1</code>');
  };

  return (
    <div className="page-body" style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
      
      {/* Header Banner */}
      <div className="card" style={{ marginBottom: '1rem', flexShrink: 0, background: 'linear-gradient(to right, #4f46e5, #7c3aed)', color: 'white' }}>
        <div className="card-body" style={{ padding: '1rem 1.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                backgroundColor: 'rgba(255, 255, 255, 0.2)',
                padding: '8px',
                borderRadius: 'var(--radius-md)',
                display: 'flex'
              }}>
                <Sparkles size={22} color="white" />
              </div>
              <div>
                <h1 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: 'white' }}>
                  Pex &middot; AI Meeting & Task Assistant
                </h1>
                <div style={{ fontSize: '0.78rem', color: '#e0e7ff', marginTop: '2px' }}>
                  Powered by Google Gemini &bull; Live MySQL Task & Meeting Intelligence
                </div>
              </div>
            </div>

            <div style={{
              backgroundColor: 'rgba(255, 255, 255, 0.15)',
              border: '1px solid rgba(255, 255, 255, 0.25)',
              padding: '4px 12px',
              borderRadius: '9999px',
              fontSize: '0.76rem',
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', backgroundColor: '#4ade80', display: 'inline-block' }}></span>
              <span>Context: Your Assigned Tasks & Team Decisions</span>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: '1rem', flexShrink: 0 }}>{error}</div>}

      {/* Main Chat Stream Container */}
      <div className="card" style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{
          flex: 1,
          padding: '1.25rem',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
          backgroundColor: '#f8fafc'
        }}>
          {messages.map(m => (
            <div
              key={m.id}
              style={{
                display: 'flex',
                justifyContent: m.sender === 'user' ? 'flex-end' : 'flex-start',
                gap: '10px'
              }}
            >
              {m.sender === 'assistant' && (
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px'
                }}>
                  <Bot size={18} color="white" />
                </div>
              )}

              <div style={{
                maxWidth: '75%',
                minWidth: '220px',
                padding: '0.9rem 1.15rem',
                borderRadius: m.sender === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                backgroundColor: m.sender === 'user' ? 'var(--primary)' : 'white',
                color: m.sender === 'user' ? 'white' : 'var(--text-main)',
                boxShadow: 'var(--shadow-sm)',
                border: m.sender === 'assistant' ? '1px solid var(--border-color)' : 'none',
                position: 'relative'
              }}>
                <div style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>
                  {m.sender === 'assistant' ? renderFormattedText(m.text) : m.text}
                </div>

                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginTop: '6px',
                  fontSize: '0.7rem',
                  color: m.sender === 'user' ? '#c7d2fe' : 'var(--text-muted)'
                }}>
                  <span>{m.timestamp}</span>

                  {m.sender === 'assistant' && (
                    <button
                      onClick={() => copyMessage(m.id, m.text)}
                      title="Copy response"
                      style={{
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                        padding: '2px'
                      }}
                    >
                      {copiedId === m.id ? <Check size={12} color="#10b981" /> : <Copy size={12} />}
                    </button>
                  )}
                </div>
              </div>

              {m.sender === 'user' && (
                <div style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  backgroundColor: '#475569',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                  marginTop: '2px'
                }}>
                  <User size={18} color="white" />
                </div>
              )}
            </div>
          ))}

          {loading && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                backgroundColor: 'var(--primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}>
                <Sparkles size={16} color="white" className="animate-spin" />
              </div>
              <div style={{
                backgroundColor: 'white',
                padding: '0.75rem 1rem',
                borderRadius: '18px 18px 18px 4px',
                border: '1px solid var(--border-color)',
                fontSize: '0.84rem',
                color: 'var(--text-muted)',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}>
                <span>Pex is querying Gemini with your task & meeting intelligence...</span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Quick Suggestion Chips */}
        <div style={{
          padding: '0.5rem 1rem',
          backgroundColor: 'white',
          borderTop: '1px solid var(--border-color)',
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          flexShrink: 0
        }}>
          {quickPrompts.map((prompt, idx) => (
            <button
              key={idx}
              onClick={() => handleSend(prompt)}
              disabled={loading}
              className="btn btn-secondary btn-sm"
              style={{
                fontSize: '0.76rem',
                padding: '0.3rem 0.75rem',
                borderRadius: '9999px',
                whiteSpace: 'nowrap',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '4px'
              }}
            >
              <Lightbulb size={12} color="#f59e0b" />
              <span>{prompt}</span>
            </button>
          ))}
        </div>

        {/* Input Bar */}
        <div style={{ padding: '0.85rem 1rem', backgroundColor: 'white', borderTop: '1px solid var(--border-color)', flexShrink: 0 }}>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            style={{ display: 'flex', gap: '0.5rem' }}
          >
            <input
              type="text"
              className="form-input"
              placeholder="Ask Pex anything about your assigned tasks, deadlines, or meeting outcomes..."
              value={inputMessage}
              onChange={e => setInputMessage(e.target.value)}
              disabled={loading}
              style={{ borderRadius: '9999px', paddingLeft: '1.25rem' }}
            />

            <button
              type="button"
              onClick={toggleVoiceInput}
              disabled={loading}
              className="btn btn-secondary"
              style={{
                borderRadius: '50%',
                width: '42px',
                height: '42px',
                padding: 0,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: isListening ? '#fee2e2' : undefined,
                color: isListening ? '#ef4444' : undefined,
                borderColor: isListening ? '#fca5a5' : undefined,
                boxShadow: isListening ? '0 0 10px rgba(239, 68, 68, 0.4)' : undefined
              }}
              title={isListening ? 'Stop Listening' : 'Speak to Pex'}
            >
              {isListening ? <Mic size={18} /> : <MicOff size={18} />}
            </button>

            <button
              type="submit"
              disabled={!inputMessage.trim() || loading}
              className="btn btn-primary"
              style={{
                borderRadius: '9999px',
                padding: '0 1.25rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Send size={15} />
              <span>Send</span>
            </button>
          </form>
        </div>
      </div>

    </div>
  );
};

export default Pex;
