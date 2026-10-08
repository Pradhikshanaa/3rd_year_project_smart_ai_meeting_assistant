import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { meetingService, taskService, teamService } from '../services/api';
import { 
  Sparkles, Video, Calendar, Clock, Shield, CheckCircle2, 
  AlertCircle, Copy, Check, ArrowLeft, RefreshCw, FileText, 
  ListChecks, AlertTriangle, Play, HelpCircle, Star, Plus, Trash2, Edit3, Send
} from 'lucide-react';

const MeetingDetails = () => {
  const { meetingId } = useParams();
  const { user, isLeader } = useAuth();
  const navigate = useNavigate();

  const [meeting, setMeeting] = useState(null);
  const [decisions, setDecisions] = useState([]);
  const [suggestedTasks, setSuggestedTasks] = useState([]);
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisStep, setAnalysisStep] = useState('');
  const [error, setError] = useState('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [copiedTranscript, setCopiedTranscript] = useState(false);

  // Manual transcript fallback modal/input in case audio was muted
  const [manualText, setManualText] = useState('');
  const [showManualInput, setShowManualInput] = useState(false);

  const fetchMeetingData = async () => {
    try {
      setLoading(true);
      const res = await meetingService.getMeetingDetails(meetingId);
      if (res.success) {
        setMeeting(res.meeting);
        
        // Fetch decisions from MySQL
        const decRes = await meetingService.getDecisions(meetingId);
        if (decRes.success) {
          setDecisions(decRes.decisions);
        }

        // Fetch AI Suggested Tasks for this meeting
        const tasksRes = await taskService.getSuggestedTasks(meetingId);
        if (tasksRes.success) {
          setSuggestedTasks(tasksRes.tasks || []);
        }

        // Fetch team members for task assignment
        const teamRes = await teamService.getMyTeam();
        if (teamRes.success) {
          setTeamMembers(teamRes.members || teamRes.team?.members || []);
        }

        // If meeting is completed and has a transcript but hasn't been analyzed by Gemini yet, trigger auto-analysis
        if (res.meeting.status === 'completed' && !res.meeting.summary && res.meeting.transcript) {
          triggerGeminiAnalysis();
        }
      } else {
        setError(res.message || 'Meeting not found');
      }
    } catch (err) {
      console.error(err);
      setError(err.response?.data?.message || 'Error loading meeting details');
    } finally {
      setLoading(false);
    }
  };

  const triggerGeminiAnalysis = async (customTranscript = '') => {
    try {
      setAnalyzing(true);
      setError('');
      setAnalysisStep('Sending transcript to Google Gemini for intelligence analysis...');

      const res = await meetingService.analyzeMeeting(meetingId, customTranscript);
      if (res.success) {
        setMeeting(res.meeting);
        setDecisions(res.analysis?.decisions || []);
        
        // Refresh suggested tasks from database
        const tasksRes = await taskService.getSuggestedTasks(meetingId);
        if (tasksRes.success) {
          setSuggestedTasks(tasksRes.tasks || []);
        }

        setShowManualInput(false);
        setManualText('');
        setActionSuccess('Gemini AI meeting intelligence analysis completed!');
        setTimeout(() => setActionSuccess(''), 4000);
      } else {
        setError(res.message || 'Gemini analysis could not be completed.');
      }
    } catch (err) {
      console.error('[Gemini Analysis Error]:', err);
      setError(err.response?.data?.message || err.message || 'Error communicating with Google Gemini API.');
    } finally {
      setAnalyzing(false);
      setAnalysisStep('');
    }
  };

  useEffect(() => {
    fetchMeetingData();
  }, [meetingId]);

  const copyTranscript = () => {
    if (meeting?.transcript) {
      navigator.clipboard.writeText(meeting.transcript);
      setCopiedTranscript(true);
      setTimeout(() => setCopiedTranscript(false), 2000);
    }
  };

  // Parse structured summary JSON
  let summaryObj = null;
  if (meeting?.summary) {
    try {
      summaryObj = JSON.parse(meeting.summary);
    } catch (e) {
      summaryObj = { summary: meeting.summary, key_points: [], risks: [] };
    }
  }

  if (loading) {
    return (
      <div className="page-body" style={{ textAlign: 'center', padding: '4rem 0' }}>
        <div style={{ color: 'var(--text-muted)' }}>Loading AI meeting analysis...</div>
      </div>
    );
  }

  if (!meeting && error) {
    return (
      <div className="page-body">
        <div className="alert alert-error">{error}</div>
        <Link to="/meetings" className="btn btn-secondary btn-sm" style={{ marginTop: '1rem' }}>
          Back to Meetings
        </Link>
      </div>
    );
  }

  const audioUrl = meeting?.recording_reference ? meetingService.getAudioUrl(meetingId) : null;

  return (
    <div className="page-body">
      {/* Navigation Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
        <Link to="/meetings" className="btn btn-secondary btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <ArrowLeft size={14} />
          <span>Back to All Meetings</span>
        </Link>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={() => setShowManualInput(!showManualInput)}
            className="btn btn-secondary btn-sm"
          >
            <span>{showManualInput ? 'Hide Input' : 'Enter / Paste Transcript Manually'}</span>
          </button>

          <button
            onClick={() => triggerGeminiAnalysis()}
            disabled={analyzing}
            className="btn btn-primary btn-sm"
            style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={analyzing ? 'animate-spin' : ''} />
            <span>{analyzing ? 'Analyzing with Gemini...' : 'Re-run Gemini AI Analysis'}</span>
          </button>
        </div>
      </div>

      {/* Analyzing Banner */}
      {analyzing && (
        <div style={{
          backgroundColor: '#eff6ff',
          border: '1px solid #bfdbfe',
          borderRadius: 'var(--radius-lg)',
          padding: '1.25rem',
          marginBottom: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          gap: '1rem'
        }}>
          <Sparkles size={24} color="#3b82f6" className="animate-spin" />
          <div>
            <div style={{ fontWeight: 700, color: '#1e40af', fontSize: '0.95rem' }}>
              Gemini AI Processing in Progress
            </div>
            <div style={{ fontSize: '0.84rem', color: '#3b82f6', marginTop: '2px' }}>
              {analysisStep || 'Analyzing spoken transcript and extracting structured meeting insights...'}
            </div>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {error && !analyzing && (
        <div className="alert alert-error" style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={18} style={{ flexShrink: 0 }} />
          <div>
            <div style={{ fontWeight: 700 }}>AI Processing Notice</div>
            <div style={{ fontSize: '0.84rem', marginTop: '2px' }}>{error}</div>
            <div style={{ fontSize: '0.78rem', marginTop: '6px', color: '#7f1d1d' }}>
              Tip: If GEMINI_API_KEY is not set or no speech was recognized during the call, click "Enter / Paste Transcript Manually" above to test Gemini AI intelligence.
            </div>
          </div>
        </div>
      )}

      {/* Manual Transcript Input Form */}
      {showManualInput && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '2px solid var(--primary-light)' }}>
          <div className="card-header" style={{ backgroundColor: '#f8fafc' }}>
            <h2 className="card-title" style={{ fontSize: '0.95rem' }}>Analyze Custom / Pasted Meeting Transcript</h2>
          </div>
          <div className="card-body">
            <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>
              Paste a dialogue or meeting notes below to have Gemini generate summary, decisions, and tasks.
            </p>
            <textarea
              rows={4}
              className="form-input"
              placeholder="e.g. John: We decided to deploy the new auth service by Friday. Alice: I will handle the database migrations. Bob: I will write unit tests."
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              style={{ fontFamily: 'monospace', fontSize: '0.85rem' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.75rem' }}>
              <button
                onClick={() => triggerGeminiAnalysis(manualText)}
                disabled={!manualText.trim() || analyzing}
                className="btn btn-primary btn-sm"
              >
                <span>Analyze with Gemini</span>
                <Sparkles size={14} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Meeting Overview Header Card */}
      <div className="card" style={{ marginBottom: '1.5rem', background: 'linear-gradient(to right, #ffffff, #f8fafc)' }}>
        <div className="card-body">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <code style={{
                  backgroundColor: 'var(--primary-light)',
                  color: 'var(--primary-dark)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontWeight: 700
                }}>
                  {meeting.meeting_id}
                </code>

                <span className={`badge ${meeting.status === 'completed' ? 'badge-success' : 'badge-employee'}`}>
                  {meeting.status}
                </span>

                {meeting.effectiveness_score ? (
                  <span style={{
                    backgroundColor: '#fef3c7',
                    color: '#92400e',
                    border: '1px solid #fde68a',
                    padding: '2px 8px',
                    borderRadius: '9999px',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}>
                    <Star size={11} fill="#f59e0b" color="#f59e0b" />
                    <span>Effectiveness: {meeting.effectiveness_score} / 10</span>
                  </span>
                ) : null}
              </div>

              <h1 style={{ fontSize: '1.6rem', fontWeight: 700, color: 'var(--text-main)' }}>
                {meeting.title}
              </h1>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1.25rem', marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Calendar size={14} />
                  <span>{meeting.start_time ? new Date(meeting.start_time).toLocaleDateString() : 'N/A'}</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Clock size={14} />
                  <span>{meeting.duration || 0} minutes duration</span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <Shield size={14} color="#8b5cf6" />
                  <span>Host: {meeting.creator_name}</span>
                </div>
              </div>
            </div>

            {/* Audio Recording Player */}
            {audioUrl && (
              <div style={{
                backgroundColor: 'white',
                border: '1px solid var(--border-color)',
                padding: '0.75rem 1rem',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)'
              }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Meeting Audio Recording
                </div>
                <audio controls src={audioUrl} style={{ height: '32px', width: '260px' }}>
                  Your browser does not support audio playback.
                </audio>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Meeting Effectiveness Score Card (Phase 8) */}
      {meeting.effectiveness && (
        <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #bfdbfe', background: 'linear-gradient(to right, #ffffff, #f0f9ff)' }}>
          <div className="card-body" style={{ padding: '1.25rem 1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1.25rem' }}>
              
              {/* Left: Score Gauge & Grade */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', minWidth: '220px' }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  borderRadius: '50%',
                  backgroundColor: 'var(--primary)',
                  color: 'white',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: 'var(--shadow-md)',
                  flexShrink: 0
                }}>
                  <span style={{ fontSize: '1.4rem', fontWeight: 800, lineHeight: 1 }}>
                    {meeting.effectiveness.score}
                  </span>
                  <span style={{ fontSize: '0.65rem', opacity: 0.85, textTransform: 'uppercase' }}>/ 100</span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: 'var(--text-main)' }}>
                      Meeting Effectiveness Score
                    </h2>
                    <span className={`badge ${meeting.effectiveness.badge_class || 'badge-success'}`}>
                      {meeting.effectiveness.grade}
                    </span>
                  </div>
                  <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginTop: '4px', maxWidth: '420px' }}>
                    {meeting.effectiveness.summary_text}
                  </p>
                </div>
              </div>

              {/* Middle: 4 Rule Breakdown Metrics */}
              {meeting.effectiveness.breakdown && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', flex: 1, minWidth: '320px' }}>
                  <div style={{ backgroundColor: 'white', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Decisions</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#10b981' }}>
                      {meeting.effectiveness.breakdown.decisions_count || 0}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>+{meeting.effectiveness.breakdown.decisions_points || 0} pts</div>
                  </div>

                  <div style={{ backgroundColor: 'white', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Action Items</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#3b82f6' }}>
                      {meeting.effectiveness.breakdown.tasks_count || 0}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>+{meeting.effectiveness.breakdown.tasks_points || 0} pts</div>
                  </div>

                  <div style={{ backgroundColor: 'white', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Ownership</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#8b5cf6' }}>
                      {meeting.effectiveness.breakdown.ownership_rate || 0}%
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>+{meeting.effectiveness.breakdown.ownership_points || 0} pts</div>
                  </div>

                  <div style={{ backgroundColor: 'white', padding: '0.6rem 0.8rem', borderRadius: 'var(--radius-md)', border: '1px solid #e2e8f0', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600 }}>Deadlines</div>
                    <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f59e0b' }}>
                      {meeting.effectiveness.breakdown.deadline_rate || 0}%
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#64748b' }}>+{meeting.effectiveness.breakdown.deadline_points || 0} pts</div>
                  </div>
                </div>
              )}

            </div>

            {/* Suggestions List */}
            {meeting.effectiveness.suggestions && meeting.effectiveness.suggestions.length > 0 && (
              <div style={{ marginTop: '0.9rem', paddingTop: '0.75rem', borderTop: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8rem', color: '#475569' }}>
                <Sparkles size={14} color="var(--primary)" />
                <span><strong>Optimization Advice:</strong> {meeting.effectiveness.suggestions.join(' ')}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Main Content Grid: AI Intelligence Summary & Decisions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr', gap: '1.5rem', alignItems: 'start', marginBottom: '1.5rem' }}>
        
        {/* Left Column: Gemini AI Summary & Key Points */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={18} color="#8b5cf6" />
            <h2 className="card-title">Gemini AI Executive Summary</h2>
          </div>
          <div className="card-body">
            {summaryObj ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                <div>
                  <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                    Discussion Overview
                  </h3>
                  <p style={{ fontSize: '0.92rem', color: 'var(--text-main)', lineHeight: 1.6 }}>
                    {summaryObj.summary}
                  </p>
                </div>

                {summaryObj.key_points && summaryObj.key_points.length > 0 && (
                  <div>
                    <h3 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--text-muted)', fontWeight: 700, marginBottom: '6px' }}>
                      Key Discussion Points
                    </h3>
                    <ul style={{ paddingLeft: '1.25rem', fontSize: '0.88rem', color: '#334155', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      {summaryObj.key_points.map((pt, idx) => (
                        <li key={idx}>{pt}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {summaryObj.risks && summaryObj.risks.length > 0 && (
                  <div style={{
                    backgroundColor: '#fffbeb',
                    border: '1px solid #fde68a',
                    padding: '0.85rem',
                    borderRadius: 'var(--radius-md)',
                    fontSize: '0.85rem'
                  }}>
                    <div style={{ fontWeight: 700, color: '#92400e', display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '4px' }}>
                      <AlertTriangle size={14} />
                      <span>Identified Risks & Roadblocks</span>
                    </div>
                    <ul style={{ paddingLeft: '1.25rem', color: '#78350f' }}>
                      {summaryObj.risks.map((risk, idx) => (
                        <li key={idx}>{risk}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {summaryObj.next_meeting_date && summaryObj.next_meeting_date !== 'Not Mentioned' && (
                  <div style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
                    <strong>Target Date for Next Meeting: </strong>
                    <span style={{ color: 'var(--text-main)' }}>{summaryObj.next_meeting_date}</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <Sparkles className="empty-icon" />
                <div className="empty-title">No AI summary generated yet</div>
                <div className="empty-desc">
                  Click "Re-run Gemini AI Analysis" above or enter a transcript to extract summary and action items.
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Formal Decisions */}
        <div className="card">
          <div className="card-header" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <ListChecks size={18} color="#10b981" />
            <h2 className="card-title">Meeting Decisions ({decisions.length})</h2>
          </div>
          <div className="card-body">
            {decisions.length > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {decisions.map((d, idx) => (
                  <div
                    key={d.id || idx}
                    style={{
                      padding: '0.85rem 1rem',
                      borderRadius: 'var(--radius-md)',
                      backgroundColor: '#f8fafc',
                      border: '1px solid var(--border-color)',
                      borderLeft: '4px solid #10b981'
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', color: 'var(--text-main)' }}>
                      {d.decision_text}
                    </div>
                    {d.reason && d.reason !== 'Not Mentioned' && (
                      <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                        <strong>Rationale: </strong>{d.reason}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state" style={{ padding: '2rem 1rem' }}>
                <CheckCircle2 className="empty-icon" />
                <div className="empty-title">No formal decisions recorded</div>
                <div className="empty-desc">
                  Decisions agreed upon during the discussion will appear here.
                </div>
              </div>
            )}
          </div>
        </div>

      </div>

      {/* Action Notification */}
      {actionSuccess && (
        <div className="alert alert-success" style={{ marginBottom: '1.5rem' }}>
          {actionSuccess}
        </div>
      )}

      {/* AI Suggested Tasks Section (Phase 6) */}
      <div className="card" style={{ marginBottom: '1.5rem', border: '1px solid #c7d2fe' }}>
        <div className="card-header" style={{ backgroundColor: '#f5f3ff', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Sparkles size={18} color="#8b5cf6" />
            <h2 className="card-title" style={{ color: '#4338ca' }}>
              AI Suggested Tasks ({suggestedTasks.length})
            </h2>
          </div>

          <div style={{ fontSize: '0.78rem', color: '#6366f1', fontWeight: 600 }}>
            {isLeader ? 'Review & Confirm suggested tasks to add them to official team board' : 'Suggested action items extracted by Gemini AI'}
          </div>
        </div>

        <div className="card-body">
          {suggestedTasks.length > 0 ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '1.25rem' }}>
              {suggestedTasks.map(t => {
                const initialDeadline = t.deadline ? t.deadline.substring(0, 10) : '';
                return (
                  <SuggestedTaskCard
                    key={t.id}
                    task={t}
                    initialDeadline={initialDeadline}
                    teamMembers={teamMembers}
                    isLeader={isLeader}
                    onConfirm={async (taskId, payload) => {
                      try {
                        const res = await taskService.confirmTask(taskId, payload);
                        if (res.success) {
                          setSuggestedTasks(prev => prev.filter(item => item.id !== taskId));
                          setActionSuccess(`Task "${payload.title || t.title}" confirmed with deadline and assigned!`);
                          setTimeout(() => setActionSuccess(''), 3500);
                        } else {
                          setError(res.message || 'Could not confirm task');
                        }
                      } catch (err) {
                        console.error('Confirm task error:', err);
                        setError(err.response?.data?.message || 'Failed to confirm task.');
                      }
                    }}
                    onDiscard={async (taskId) => {
                      try {
                        await taskService.deleteTask(taskId);
                        setSuggestedTasks(prev => prev.filter(item => item.id !== taskId));
                        setActionSuccess('Suggested task discarded.');
                        setTimeout(() => setActionSuccess(''), 2500);
                      } catch (err) {
                        console.error('Discard task error:', err);
                        setError('Failed to discard task.');
                      }
                    }}
                  />
                );
              })}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '1.5rem 1rem' }}>
              <CheckCircle2 className="empty-icon" style={{ color: '#8b5cf6' }} />
              <div className="empty-title">All AI suggested tasks confirmed or none remaining</div>
              <div className="empty-desc">
                {isLeader ? 'Visit the Tasks tab to monitor team progress.' : 'Confirmed tasks will appear in your My Tasks board.'}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Verbatim Transcript Section */}
      <div className="card">
        <div className="card-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <FileText size={18} color="#3b82f6" />
            <h2 className="card-title">Spoken Transcript</h2>
          </div>

          {meeting.transcript && (
            <button
              onClick={copyTranscript}
              className="btn btn-secondary btn-sm"
              style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}
            >
              {copiedTranscript ? <Check size={13} color="#10b981" /> : <Copy size={13} />}
              <span>{copiedTranscript ? 'Copied' : 'Copy Transcript'}</span>
            </button>
          )}
        </div>

        <div className="card-body">
          {meeting.transcript ? (
            <div style={{
              backgroundColor: '#0f172a',
              color: '#f1f5f9',
              padding: '1.25rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.88rem',
              fontFamily: 'monospace',
              whiteHeight: 1.5,
              whiteSpace: 'pre-wrap',
              maxHeight: '350px',
              overflowY: 'auto'
            }}>
              {meeting.transcript}
            </div>
          ) : (
            <div className="empty-state" style={{ padding: '2rem 1rem' }}>
              <FileText className="empty-icon" />
              <div className="empty-title">No spoken transcript available</div>
              <div className="empty-desc">
                Spoken dialogue captured by Web Speech API during the meeting will be displayed here.
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
};

// Interactive Task Card for Leader Review, Assignee & Deadline Customization
const SuggestedTaskCard = ({ task, initialDeadline, teamMembers, onConfirm, onDiscard, isLeader }) => {
  const [assignedTo, setAssignedTo] = useState(task.assigned_to ? String(task.assigned_to) : '');
  const [priority, setPriority] = useState(task.priority || 'Medium');
  const [deadline, setDeadline] = useState(initialDeadline || '');
  const [title, setTitle] = useState(task.title || '');
  const [description, setDescription] = useState(task.description || '');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setAssignedTo(task.assigned_to ? String(task.assigned_to) : '');
    setPriority(task.priority || 'Medium');
    setDeadline(task.deadline ? task.deadline.substring(0, 10) : (initialDeadline || ''));
    setTitle(task.title || '');
    setDescription(task.description || '');
  }, [task, initialDeadline]);

  const handleConfirm = async () => {
    try {
      setSubmitting(true);
      await onConfirm(task.id, {
        meeting_id: task.meeting_id,
        title: title.trim(),
        description: description.trim(),
        assigned_to: assignedTo ? parseInt(assignedTo) : null,
        priority: priority,
        deadline: deadline || null,
        estimated_duration: task.estimated_duration || 'Not Mentioned'
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #e0e7ff',
      borderRadius: 'var(--radius-md)',
      padding: '1.15rem',
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'space-between',
      boxShadow: 'var(--shadow-sm)',
      position: 'relative'
    }}>
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <select
            value={priority}
            onChange={e => setPriority(e.target.value)}
            disabled={!isLeader}
            style={{
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 700,
              backgroundColor: priority === 'Urgent' || priority === 'High' ? '#fee2e2' : priority === 'Medium' ? '#fef3c7' : '#f0fdf4',
              color: priority === 'Urgent' || priority === 'High' ? '#991b1b' : priority === 'Medium' ? '#92400e' : '#166534',
              border: '1px solid rgba(0,0,0,0.1)',
              cursor: isLeader ? 'pointer' : 'default'
            }}
          >
            <option value="Low">Low Priority</option>
            <option value="Medium">Medium Priority</option>
            <option value="High">High Priority</option>
            <option value="Urgent">Urgent Priority</option>
          </select>

          {task.estimated_duration && task.estimated_duration !== 'Not Mentioned' && (
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Est: {task.estimated_duration}
            </span>
          )}
        </div>

        <div style={{ marginBottom: '8px' }}>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            readOnly={!isLeader}
            placeholder="Task Title..."
            style={{
              width: '100%',
              fontSize: '0.96rem',
              fontWeight: 700,
              color: 'var(--text-main)',
              border: isLeader ? '1px solid #cbd5e1' : 'none',
              padding: isLeader ? '5px 8px' : '0',
              borderRadius: '4px',
              backgroundColor: isLeader ? '#f8fafc' : 'transparent'
            }}
          />
        </div>

        {description && (
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)', marginBottom: '0.75rem', lineHeight: 1.4 }}>
            {description}
          </p>
        )}

        {/* Assignee Selection Field */}
        <div style={{ marginBottom: '0.65rem' }}>
          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>
            Assigned Member
          </label>
          <select
            value={assignedTo}
            onChange={e => setAssignedTo(e.target.value)}
            disabled={!isLeader}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: '4px',
              fontSize: '0.82rem',
              border: '1px solid #cbd5e1',
              backgroundColor: isLeader ? '#ffffff' : '#f8fafc',
              cursor: isLeader ? 'pointer' : 'default'
            }}
          >
            <option value="">-- Unassigned --</option>
            {teamMembers.map(m => (
              <option key={m.id} value={m.id}>
                {m.name} ({m.role === 'leader' ? 'Leader' : 'Employee'})
              </option>
            ))}
          </select>
        </div>

        {/* Deadline Selection Field */}
        <div style={{ marginBottom: '0.85rem' }}>
          <label style={{ display: 'block', fontSize: '0.74rem', fontWeight: 600, color: 'var(--text-muted)', marginBottom: '2px' }}>
            Deadline {deadline ? `(Set)` : `(Not Mentioned - Please Pick Date)`}
          </label>
          <input
            type="date"
            value={deadline}
            onChange={e => setDeadline(e.target.value)}
            disabled={!isLeader}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: '4px',
              fontSize: '0.82rem',
              border: '1px solid #cbd5e1',
              backgroundColor: isLeader ? '#ffffff' : '#f8fafc',
              cursor: isLeader ? 'pointer' : 'default'
            }}
          />
        </div>
      </div>

      {isLeader && (
        <div style={{ display: 'flex', gap: '0.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '0.75rem' }}>
          <button
            onClick={handleConfirm}
            disabled={submitting}
            className="btn btn-sm"
            style={{
              flex: 1,
              backgroundColor: '#10b981',
              color: 'white',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px',
              fontWeight: 600
            }}
          >
            <Check size={14} />
            <span>{submitting ? 'Confirming...' : 'Confirm & Finalize'}</span>
          </button>

          <button
            onClick={() => onDiscard(task.id)}
            disabled={submitting}
            className="btn btn-sm"
            style={{
              backgroundColor: '#fee2e2',
              color: '#991b1b',
              border: '1px solid #fca5a5',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '4px'
            }}
          >
            <Trash2 size={14} />
            <span>Discard</span>
          </button>
        </div>
      )}
    </div>
  );
};

export default MeetingDetails;
