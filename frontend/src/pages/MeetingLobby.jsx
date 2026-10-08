import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { meetingService } from '../services/api';
import { 
  Video, Users, Calendar, Clock, ArrowLeft, Shield, 
  Check, Copy, AlertCircle, PlayCircle, CheckCircle2, XCircle, Sparkles,
  Mic, MicOff, Volume2, Radio
} from 'lucide-react';

const MeetingLobby = () => {
  const { meetingId } = useParams();
  const { user, isLeader } = useAuth();
  const [meeting, setMeeting] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [rsvpLoading, setRsvpLoading] = useState(false);

  // Pre-Call Microphone Testing State
  const [isTestingMic, setIsTestingMic] = useState(false);
  const [micTestVolume, setMicTestVolume] = useState(0);
  const [micTestStatus, setMicTestStatus] = useState(''); // '' | 'active' | 'denied' | 'error'
  const micTestStreamRef = useRef(null);
  const micTestAudioCtxRef = useRef(null);
  const micTestAnimRef = useRef(null);

  const stopMicTest = () => {
    if (micTestAnimRef.current) cancelAnimationFrame(micTestAnimRef.current);
    if (micTestAudioCtxRef.current) {
      micTestAudioCtxRef.current.close().catch(() => {});
      micTestAudioCtxRef.current = null;
    }
    if (micTestStreamRef.current) {
      micTestStreamRef.current.getTracks().forEach(t => t.stop());
      micTestStreamRef.current = null;
    }
    setIsTestingMic(false);
    setMicTestVolume(0);
  };

  const startMicTest = async () => {
    try {
      setMicTestStatus('requesting');
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });
      micTestStreamRef.current = stream;
      
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        const ctx = new AudioContextClass();
        micTestAudioCtxRef.current = ctx;
        if (ctx.state === 'suspended') {
          await ctx.resume().catch(() => {});
        }
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        const timeData = new Uint8Array(analyser.fftSize);
        const loop = () => {
          if (!micTestAudioCtxRef.current) return;
          if (micTestAudioCtxRef.current.state === 'suspended') {
            micTestAudioCtxRef.current.resume().catch(() => {});
          }
          analyser.getByteTimeDomainData(timeData);
          let sumSquares = 0;
          for (let i = 0; i < timeData.length; i++) {
            const norm = (timeData[i] - 128) / 128;
            sumSquares += norm * norm;
          }
          const rms = Math.sqrt(sumSquares / timeData.length);
          // Scale RMS accurately to 0-100% volume for speech
          const vol = Math.min(100, Math.round(rms * 280));
          setMicTestVolume(vol);
          micTestAnimRef.current = requestAnimationFrame(loop);
        };
        loop();
      }
      setIsTestingMic(true);
      setMicTestStatus('active');
    } catch (err) {
      console.warn('[Lobby] Mic test error:', err);
      setMicTestStatus('denied');
      setIsTestingMic(false);
    }
  };

  useEffect(() => {
    return () => {
      stopMicTest();
    };
  }, []);

  const navigate = useNavigate();

  const fetchMeetingData = async () => {
    try {
      setLoading(true);
      const res = await meetingService.getMeetingDetails(meetingId);
      if (res.success) {
        setMeeting(res.meeting);
        setParticipants(res.participants);
      } else {
        setError(res.message || 'Meeting not found');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error loading meeting lobby');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMeetingData();
    // Poll for status updates (e.g. if host starts meeting)
    const interval = setInterval(fetchMeetingData, 10000);
    return () => clearInterval(interval);
  }, [meetingId]);

  const copyMeetingLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRsvp = async (status) => {
    try {
      setRsvpLoading(true);
      await meetingService.rsvp(meetingId, status);
      fetchMeetingData();
    } catch (err) {
      console.error(err);
      alert('Failed to update RSVP: ' + (err.response?.data?.message || err.message));
    } finally {
      setRsvpLoading(false);
    }
  };

  const handleStartCall = async () => {
    try {
      if (meeting?.status === 'scheduled' && meeting.is_host) {
        await meetingService.updateStatus(meetingId, 'live');
      }
      navigate(`/meeting/${meetingId}/room`);
    } catch (err) {
      console.error(err);
      alert('Could not start call: ' + (err.response?.data?.message || err.message));
    }
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  if (loading) {
    return (
      <div className="page-body" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <div style={{ color: 'var(--text-muted)' }}>Loading meeting lobby details...</div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div className="page-body">
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={16} />
          <span>{error || 'Meeting not found or you do not have permission to view it.'}</span>
        </div>
        <Link to="/meetings" className="btn btn-secondary btn-sm">
          <ArrowLeft size={14} />
          <span>Back to Meetings</span>
        </Link>
      </div>
    );
  }

  const currentUserParticipant = participants.find(p => p.user_id === user?.id);

  return (
    <div className="page-body">
      {/* Back button */}
      <div style={{ marginBottom: '1.25rem' }}>
        <Link to="/meetings" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={14} />
          <span>Back to All Meetings</span>
        </Link>
      </div>

      {/* Main Lobby Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Left Column: Meeting Details & Call Action */}
        <div>
          <div className="card">
            <div className="card-body">
              {/* Header Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <code style={{
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary-dark)',
                      padding: '3px 10px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      fontSize: '0.9rem'
                    }}>
                      {meeting.meeting_id}
                    </code>

                    <span className={`badge ${
                      meeting.status === 'live' ? 'badge-warning' : meeting.status === 'completed' ? 'badge-success' : 'badge-employee'
                    }`}>
                      {meeting.status === 'live' ? '● LIVE SESSION' : meeting.status.toUpperCase()}
                    </span>
                  </div>

                  <h1 style={{ fontSize: '1.65rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.25 }}>
                    {meeting.title}
                  </h1>
                </div>

                <button
                  onClick={copyMeetingLink}
                  className="btn btn-secondary btn-sm"
                  title="Copy meeting share URL"
                >
                  {copied ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                  <span>{copied ? 'Link Copied' : 'Share Link'}</span>
                </button>
              </div>

              {/* Time & Host info */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.85rem',
                padding: '1rem',
                backgroundColor: '#f8fafc',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                marginBottom: '1.5rem',
                fontSize: '0.85rem'
              }}>
                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Date</div>
                  <div style={{ fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={13} />
                    <span>{meeting.start_time ? new Date(meeting.start_time).toLocaleDateString() : 'Today'}</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Scheduled Time</div>
                  <div style={{ fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={13} />
                    <span>{meeting.start_time ? new Date(meeting.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} ({meeting.duration}m)</span>
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>Meeting Host</div>
                  <div style={{ fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Shield size={13} color="#8b5cf6" />
                    <span>{meeting.creator_name}</span>
                  </div>
                </div>
              </div>

              {/* Description */}
              {meeting.description && (
                <div style={{ marginBottom: '1.25rem' }}>
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '4px' }}>
                    Overview
                  </h3>
                  <p style={{ fontSize: '0.9rem', color: 'var(--text-main)' }}>{meeting.description}</p>
                </div>
              )}

              {/* Agenda */}
              {meeting.agenda && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '0.85rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    Meeting Agenda (for Gemini Analysis)
                  </h3>
                  <div style={{
                    backgroundColor: '#faf5ff',
                    border: '1px solid #f3e8ff',
                    borderRadius: 'var(--radius-md)',
                    padding: '1rem',
                    fontSize: '0.88rem',
                    whiteSpace: 'pre-line',
                    color: '#4c1d95'
                  }}>
                    {meeting.agenda}
                  </div>
                </div>
              )}

              {/* RSVP Action for Employees */}
              {!meeting.is_host && currentUserParticipant && (
                <div style={{
                  padding: '1rem',
                  border: '1px solid var(--border-color)',
                  borderRadius: 'var(--radius-md)',
                  backgroundColor: '#f8fafc',
                  marginBottom: '1.5rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '0.75rem'
                }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.88rem' }}>Your Invitation RSVP:</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      Current status: <strong style={{ textTransform: 'capitalize' }}>{currentUserParticipant.invitation_status}</strong>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={() => handleRsvp('accepted')}
                      disabled={rsvpLoading || currentUserParticipant.invitation_status === 'accepted'}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: currentUserParticipant.invitation_status === 'accepted' ? '#10b981' : '#ecfdf5',
                        color: currentUserParticipant.invitation_status === 'accepted' ? 'white' : '#065f46',
                        border: '1px solid #a7f3d0'
                      }}
                    >
                      <CheckCircle2 size={14} />
                      <span>Accept</span>
                    </button>

                    <button
                      onClick={() => handleRsvp('declined')}
                      disabled={rsvpLoading || currentUserParticipant.invitation_status === 'declined'}
                      className="btn btn-sm"
                      style={{
                        backgroundColor: currentUserParticipant.invitation_status === 'declined' ? '#ef4444' : '#fef2f2',
                        color: currentUserParticipant.invitation_status === 'declined' ? 'white' : '#991b1b',
                        border: '1px solid #fecaca'
                      }}
                    >
                      <XCircle size={14} />
                      <span>Decline</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Pre-Call Audio & Microphone Diagnostics */}
              <div style={{
                backgroundColor: '#f8fafc',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                padding: '1rem',
                marginBottom: '1.25rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '0.75rem'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px',
                    height: '36px',
                    borderRadius: '8px',
                    backgroundColor: isTestingMic ? 'rgba(34, 197, 94, 0.15)' : 'var(--bg-hover)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}>
                    <Mic size={18} color={isTestingMic && micTestVolume > 8 ? '#16a34a' : 'var(--text-muted)'} />
                  </div>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>Microphone Pre-Check</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {micTestStatus === 'active' 
                        ? (micTestVolume > 8 ? `Voice detected (${micTestVolume}%)` : 'Listening for audio...')
                        : micTestStatus === 'denied'
                        ? 'Microphone permission blocked in browser'
                        : 'Test your mic before joining the live call'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  {isTestingMic && (
                    <div style={{ width: '80px', height: '8px', backgroundColor: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${Math.max(4, micTestVolume)}%`,
                        height: '100%',
                        backgroundColor: micTestVolume > 30 ? '#16a34a' : micTestVolume > 10 ? '#0284c7' : '#94a3b8',
                        transition: 'width 0.08s ease-out'
                      }} />
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={isTestingMic ? stopMicTest : startMicTest}
                    className="btn btn-secondary btn-sm"
                    style={{ fontSize: '0.78rem', padding: '5px 12px' }}
                  >
                    {isTestingMic ? 'Stop Test' : 'Test Mic'}
                  </button>
                </div>
              </div>

              {/* Call Join Banner */}
              <div style={{
                backgroundColor: meeting.status === 'live' ? '#eff6ff' : '#f8fafc',
                border: `1px solid ${meeting.status === 'live' ? '#bfdbfe' : 'var(--border-color)'}`,
                borderRadius: 'var(--radius-lg)',
                padding: '1.5rem',
                textAlign: 'center'
              }}>
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)' }}>
                    {meeting.status === 'live' ? 'Meeting is Currently Live' : meeting.is_host ? 'Ready to launch meeting session' : 'Waiting for Host to start'}
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                    Gemini speech recognition will listen and transcribe the session once live.
                  </p>
                </div>

                {meeting.status === 'completed' ? (
                  <Link
                    to={`/meeting/${meetingId}/details`}
                    className="btn btn-primary"
                    style={{ padding: '0.75rem 2rem', fontSize: '0.95rem', display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                  >
                    <Sparkles size={18} />
                    <span>View Gemini AI Summary & Decisions</span>
                  </Link>
                ) : meeting.is_host ? (
                  <button
                    onClick={handleStartCall}
                    className="btn btn-primary"
                    style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
                  >
                    <PlayCircle size={18} />
                    <span>{meeting.status === 'live' ? 'Re-enter Live Room' : 'Launch / Start Meeting Call'}</span>
                  </button>
                ) : (
                  <button
                    onClick={handleStartCall}
                    disabled={meeting.status !== 'live'}
                    className={`btn ${meeting.status === 'live' ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ padding: '0.75rem 2rem', fontSize: '0.95rem' }}
                  >
                    <Video size={18} />
                    <span>{meeting.status === 'live' ? 'Join Live Meeting' : 'Waiting for Host...'}</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        </div>

        {/* Right Column: Participant Roster */}
        <div>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Users size={16} />
                <span>Invited Participants ({participants.length})</span>
              </h2>
            </div>

            <div className="card-body" style={{ padding: 0 }}>
              <div className="table-container">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th>RSVP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {participants.map((p) => (
                      <tr key={p.user_id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                            <div className="avatar" style={{ width: '32px', height: '32px', fontSize: '0.8rem' }}>
                              {getInitials(p.name)}
                            </div>
                            <div>
                              <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                {p.name} {p.user_id === user?.id && <span style={{ color: 'var(--primary)', fontSize: '0.72rem' }}>(You)</span>}
                              </div>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                                {p.role === 'leader' ? 'Host / Leader' : 'Team Member'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td>
                          <span className={`badge ${
                            p.invitation_status === 'accepted' ? 'badge-success' : p.invitation_status === 'declined' ? 'badge-warning' : 'badge-employee'
                          }`}>
                            {p.invitation_status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default MeetingLobby;
