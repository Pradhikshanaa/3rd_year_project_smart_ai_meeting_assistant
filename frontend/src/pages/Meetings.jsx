import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { meetingService, teamService } from '../services/api';
import { 
  Video, Plus, Calendar, Clock, Users, ArrowRight, 
  CheckCircle, PlayCircle, Eye, AlertCircle, Sparkles, X, Check, Copy
} from 'lucide-react';

const Meetings = () => {
  const { user, isLeader } = useAuth();
  const [meetings, setMeetings] = useState([]);
  const [activeTab, setActiveTab] = useState('upcoming'); // 'upcoming', 'live', 'completed'
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  
  // Modal states
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  
  // Form fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [agenda, setAgenda] = useState('');
  const [meetingDate, setMeetingDate] = useState('');
  const [meetingTime, setMeetingTime] = useState('');
  const [duration, setDuration] = useState(30);
  const [teamMembers, setTeamMembers] = useState([]);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState([]);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [copiedId, setCopiedId] = useState(null);

  const navigate = useNavigate();

  const fetchMeetings = async () => {
    try {
      setLoading(true);
      const res = await meetingService.getMeetings();
      if (res.success) {
        setMeetings(res.meetings);
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error loading meetings from database');
    } finally {
      setLoading(false);
    }
  };

  const fetchTeamMembers = async () => {
    try {
      const res = await teamService.getMyTeam();
      if (res.success && res.members) {
        // Filter out leader themselves from the invite list candidates
        const eligible = res.members.filter(m => m.id !== user?.id);
        setTeamMembers(eligible);
        // Default select all eligible members
        setSelectedParticipantIds(eligible.map(m => m.id));
      }
    } catch (err) {
      console.error("Could not fetch team members for invite list:", err);
    }
  };

  useEffect(() => {
    fetchMeetings();
    fetchTeamMembers();

    // Default meetingDate to today and meetingTime to nearest half hour
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    setMeetingDate(todayStr);
    setMeetingTime(timeStr);
  }, []);

  const toggleParticipant = (memberId) => {
    setSelectedParticipantIds(prev => 
      prev.includes(memberId) ? prev.filter(id => id !== memberId) : [...prev, memberId]
    );
  };

  const handleCreateMeeting = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSubmitting(true);

    try {
      let startDateTime = null;
      if (meetingDate && meetingTime) {
        startDateTime = new Date(`${meetingDate}T${meetingTime}:00`).toISOString();
      }

      const payload = {
        title,
        description,
        agenda,
        start_time: startDateTime,
        duration: parseInt(duration, 10),
        participant_ids: selectedParticipantIds
      };

      const res = await meetingService.createMeeting(payload);
      if (res.success) {
        setShowCreateModal(false);
        // Reset form
        setTitle('');
        setDescription('');
        setAgenda('');
        fetchMeetings();
      }
    } catch (err) {
      console.error(err);
      setFormError(err.response?.data?.message || 'Failed to create meeting');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleStartMeeting = async (meetingId) => {
    try {
      await meetingService.updateStatus(meetingId, 'live');
      navigate(`/meeting/${meetingId}`);
    } catch (err) {
      console.error(err);
      alert('Could not start meeting: ' + (err.response?.data?.message || err.message));
    }
  };

  const copyLink = (meetingId) => {
    const url = `${window.location.origin}/meeting/${meetingId}`;
    navigator.clipboard.writeText(url);
    setCopiedId(meetingId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Filter meetings based on active tab
  const filteredMeetings = meetings.filter(m => {
    if (activeTab === 'live') return m.status === 'live';
    if (activeTab === 'completed') return m.status === 'completed';
    return m.status === 'scheduled'; // 'upcoming'
  });

  return (
    <div className="page-body">
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.75rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>
            Meetings & Smart Sessions
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
            Schedule and run meetings with automatic Gemini AI transcription and task generation
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="btn btn-primary"
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <Plus size={18} />
          <span>Create New Meeting</span>
        </button>
      </div>

      {error && (
        <div className="alert alert-error">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', borderBottom: '1px solid var(--border-color)', marginBottom: '1.5rem' }}>
        <button
          onClick={() => setActiveTab('upcoming')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'upcoming' ? '2px solid var(--primary)' : '2px solid transparent',
            color: activeTab === 'upcoming' ? 'var(--primary)' : 'var(--text-muted)',
            fontWeight: activeTab === 'upcoming' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.92rem'
          }}
        >
          Upcoming ({meetings.filter(m => m.status === 'scheduled').length})
        </button>

        <button
          onClick={() => setActiveTab('live')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'live' ? '2px solid #ef4444' : '2px solid transparent',
            color: activeTab === 'live' ? '#ef4444' : 'var(--text-muted)',
            fontWeight: activeTab === 'live' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.92rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}
        >
          {meetings.filter(m => m.status === 'live').length > 0 && (
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444', display: 'inline-block' }}></span>
          )}
          <span>Ongoing / Live ({meetings.filter(m => m.status === 'live').length})</span>
        </button>

        <button
          onClick={() => setActiveTab('completed')}
          style={{
            padding: '0.65rem 1.25rem',
            background: 'none',
            border: 'none',
            borderBottom: activeTab === 'completed' ? '2px solid var(--success)' : '2px solid transparent',
            color: activeTab === 'completed' ? 'var(--success-text)' : 'var(--text-muted)',
            fontWeight: activeTab === 'completed' ? 700 : 500,
            cursor: 'pointer',
            fontSize: '0.92rem'
          }}
        >
          Completed ({meetings.filter(m => m.status === 'completed').length})
        </button>
      </div>

      {/* Meeting Cards List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem 0', color: 'var(--text-muted)' }}>
          Loading meetings from database...
        </div>
      ) : filteredMeetings.length > 0 ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))', gap: '1.25rem' }}>
          {filteredMeetings.map((m) => (
            <div key={m.id} className="card" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              <div className="card-header" style={{ alignItems: 'flex-start' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                    <code style={{
                      backgroundColor: 'var(--primary-light)',
                      color: 'var(--primary-dark)',
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontWeight: 700,
                      fontSize: '0.8rem'
                    }}>
                      {m.meeting_id}
                    </code>

                    <span className={`badge ${
                      m.status === 'live' ? 'badge-warning' : m.status === 'completed' ? 'badge-success' : 'badge-employee'
                    }`}>
                      {m.status === 'live' ? '● LIVE NOW' : m.status}
                    </span>
                  </div>

                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--text-main)', lineHeight: 1.3 }}>
                    {m.title}
                  </h3>
                </div>

                <button
                  onClick={() => copyLink(m.meeting_id)}
                  className="btn btn-secondary btn-sm"
                  style={{ padding: '4px 8px' }}
                  title="Copy Direct Meeting Link"
                >
                  {copiedId === m.meeting_id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                </button>
              </div>

              <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem', fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Calendar size={14} />
                    <span>{m.start_time ? new Date(m.start_time).toLocaleDateString() : 'Today'}</span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Clock size={14} />
                    <span>
                      {m.start_time ? new Date(m.start_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : ''} ({m.duration} mins)
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <Users size={14} />
                    <span>{m.total_participants} Invited</span>
                  </div>
                </div>

                {m.agenda && (
                  <div style={{
                    backgroundColor: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.82rem',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-muted)'
                  }}>
                    <strong style={{ color: 'var(--text-main)' }}>Agenda: </strong>
                    <span>{m.agenda.length > 90 ? `${m.agenda.substring(0, 90)}...` : m.agenda}</span>
                  </div>
                )}

                <div style={{ marginTop: 'auto', paddingTop: '0.75rem', display: 'flex', gap: '0.6rem', borderTop: '1px solid var(--border-color)' }}>
                  <button
                    onClick={() => {
                      setSelectedMeeting(m);
                      setShowDetailsModal(true);
                    }}
                    className="btn btn-secondary btn-sm"
                    style={{ flex: 1 }}
                  >
                    <Eye size={14} />
                    <span>Details</span>
                  </button>

                  {m.status === 'completed' ? (
                    <Link
                      to={`/meeting/${m.meeting_id}/details`}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}
                    >
                      <Sparkles size={14} />
                      <span>AI Insights & Summary</span>
                    </Link>
                  ) : isLeader && m.status === 'scheduled' ? (
                    <button
                      onClick={() => handleStartMeeting(m.meeting_id)}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                    >
                      <PlayCircle size={14} />
                      <span>Start Meeting</span>
                    </button>
                  ) : (
                    <Link
                      to={`/meeting/${m.meeting_id}`}
                      className="btn btn-primary btn-sm"
                      style={{ flex: 1 }}
                    >
                      <Video size={14} />
                      <span>{m.status === 'live' ? 'Join Live Call' : 'Enter Lobby'}</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card">
          <div className="card-body">
            <div className="empty-state">
              <Video className="empty-icon" />
              <div className="empty-title">
                {activeTab === 'live' ? 'No ongoing live meetings' : activeTab === 'completed' ? 'No completed meetings yet' : 'No upcoming meetings scheduled'}
              </div>
              <div className="empty-desc">
                {isLeader ? 'Click "Create New Meeting" above to schedule a session with your team.' : 'Your Team Leader will schedule meetings and invitations will appear here automatically.'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CREATE MEETING MODAL */}
      {showCreateModal && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflowY: 'auto',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-color)'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>Schedule / Create Meeting</h2>
                <p style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>Generate Meeting ID & notify participants</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            {formError && (
              <div style={{ margin: '1rem 1.5rem 0' }} className="alert alert-error">
                <AlertCircle size={15} />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleCreateMeeting} style={{ padding: '1.5rem' }}>
              <div className="form-group">
                <label className="form-label" htmlFor="mTitle">Meeting Title *</label>
                <input
                  id="mTitle"
                  type="text"
                  required
                  className="form-input"
                  placeholder="e.g. Sprint 1 Planning & Task Delegation"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="mDesc">Description</label>
                <textarea
                  id="mDesc"
                  rows={2}
                  className="form-input"
                  placeholder="Brief overview of the meeting purpose"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
                <div className="form-group">
                  <label className="form-label">Date</label>
                  <input
                    type="date"
                    required
                    className="form-input"
                    value={meetingDate}
                    onChange={(e) => setMeetingDate(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Start Time</label>
                  <input
                    type="time"
                    required
                    className="form-input"
                    value={meetingTime}
                    onChange={(e) => setMeetingTime(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Duration</label>
                  <select
                    className="form-select"
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                  >
                    <option value={15}>15 mins</option>
                    <option value={30}>30 mins</option>
                    <option value={45}>45 mins</option>
                    <option value={60}>60 mins</option>
                    <option value={90}>90 mins</option>
                  </select>
                </div>
              </div>

              {/* Participant Selection from same team */}
              <div className="form-group">
                <label className="form-label">Invite Team Members (from your team)</label>
                {teamMembers.length > 0 ? (
                  <div style={{
                    maxHeight: '140px',
                    overflowY: 'auto',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-md)',
                    padding: '0.5rem'
                  }}>
                    {teamMembers.map((member) => {
                      const isSelected = selectedParticipantIds.includes(member.id);
                      return (
                        <div
                          key={member.id}
                          onClick={() => toggleParticipant(member.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            padding: '0.4rem 0.65rem',
                            borderRadius: '4px',
                            cursor: 'pointer',
                            backgroundColor: isSelected ? 'var(--primary-light)' : 'transparent',
                            marginBottom: '2px'
                          }}
                        >
                          <div>
                            <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{member.name}</span>
                            <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginLeft: '6px' }}>({member.email})</span>
                          </div>
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => {}}
                            style={{ cursor: 'pointer' }}
                          />
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', padding: '0.5rem 0' }}>
                    No other team members have joined yet. Share your Team ID with employees so they can register.
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="btn btn-primary"
                >
                  <span>{formSubmitting ? 'Creating...' : 'Schedule & Notify'}</span>
                  <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* VIEW DETAILS MODAL */}
      {showDetailsModal && selectedMeeting && (
        <div style={{
          position: 'fixed',
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.6)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '1rem'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: 'var(--radius-lg)',
            width: '100%',
            maxWidth: '520px',
            boxShadow: 'var(--shadow-lg)',
            border: '1px solid var(--border-color)',
            overflow: 'hidden'
          }}>
            <div style={{
              padding: '1.25rem 1.5rem',
              borderBottom: '1px solid var(--border-color)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              backgroundColor: '#f8fafc'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <code style={{ backgroundColor: 'var(--primary-light)', color: 'var(--primary-dark)', padding: '2px 8px', borderRadius: '4px', fontWeight: 700 }}>
                  {selectedMeeting.meeting_id}
                </code>
                <h2 style={{ fontSize: '1.15rem', fontWeight: 700 }}>{selectedMeeting.title}</h2>
              </div>
              <button
                onClick={() => setShowDetailsModal(false)}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={20} />
              </button>
            </div>

            <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Host / Creator</div>
                <div style={{ fontWeight: 600, marginTop: '2px' }}>{selectedMeeting.creator_name}</div>
              </div>

              {selectedMeeting.description && (
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Description</div>
                  <div style={{ fontSize: '0.88rem', marginTop: '2px', color: 'var(--text-main)' }}>{selectedMeeting.description}</div>
                </div>
              )}

              {selectedMeeting.agenda && (
                <div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, textTransform: 'uppercase' }}>Agenda</div>
                  <div style={{
                    backgroundColor: '#f8fafc',
                    padding: '0.75rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem',
                    whiteSpace: 'pre-line',
                    marginTop: '4px',
                    border: '1px solid var(--border-color)'
                  }}>
                    {selectedMeeting.agenda}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.85rem' }}>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Status: </span>
                  <span className="badge badge-employee">{selectedMeeting.status}</span>
                </div>
                <div>
                  <span style={{ color: 'var(--text-muted)' }}>Duration: </span>
                  <strong>{selectedMeeting.duration} mins</strong>
                </div>
              </div>
            </div>

            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border-color)', display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', backgroundColor: '#f8fafc' }}>
              <button
                onClick={() => copyLink(selectedMeeting.meeting_id)}
                className="btn btn-secondary btn-sm"
              >
                {copiedId === selectedMeeting.meeting_id ? <Check size={14} color="#10b981" /> : <Copy size={14} />}
                <span>{copiedId === selectedMeeting.meeting_id ? 'Link Copied' : 'Copy Link'}</span>
              </button>

              <Link
                to={`/meeting/${selectedMeeting.meeting_id}`}
                className="btn btn-primary btn-sm"
              >
                <Video size={14} />
                <span>Go to Lobby / Call</span>
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Meetings;
