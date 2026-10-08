import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { useAuth } from '../context/AuthContext';
import { meetingService } from '../services/api';
import { 
  Mic, MicOff, Video as VideoIcon, VideoOff, PhoneOff, 
  Users, Clock, Shield, AlertCircle, Sparkles, CheckCircle2, ChevronRight, X,
  Captions, FileText, Radio, MessageSquare, Volume2, Globe, Send, RotateCw, Info
} from 'lucide-react';

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

const MeetingRoom = () => {
  const { meetingId } = useParams();
  const { user, isLeader } = useAuth();
  const navigate = useNavigate();

  // Meeting & Participant State
  const [meeting, setMeeting] = useState(null);
  const [allParticipants, setAllParticipants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Media Controls State
  const [micEnabled, setMicEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [showDrawer, setShowDrawer] = useState(false);
  const [drawerTab, setDrawerTab] = useState('attendance'); // 'attendance' | 'transcript'
  const [showCaptions, setShowCaptions] = useState(true);

  // Live Captions & Real-Time Transcript State
  const [liveCaptions, setLiveCaptions] = useState([]);
  const [activeSubtitle, setActiveSubtitle] = useState(null); // { speaker, text, isInterim }
  const liveSpeechAccumulatorRef = useRef('');
  const recognitionRef = useRef(null);
  const isRecognizingRef = useRef(false);
  const shouldListenRef = useRef(true);
  const restartTimeoutRef = useRef(null);
  const meetingActiveRef = useRef(true);
  const micEnabledRef = useRef(true);
  const consecutiveErrorsRef = useRef(0);
  const [sttStatus, setSttStatus] = useState('initializing'); // 'listening' | 'reconnecting' | 'paused' | 'error' | 'unsupported'

  // STT Language & Manual Transcript Input State
  const [selectedLanguage, setSelectedLanguage] = useState('en-US');
  const selectedLanguageRef = useRef('en-US');
  const [manualTranscriptInput, setManualTranscriptInput] = useState('');
  const [showSTTDiagnostics, setShowSTTDiagnostics] = useState(false);

  // Real-Time Audio Clip AI Recording State (Hardware Mic -> Whisper/Gemini)
  const [isRecordingAudioClip, setIsRecordingAudioClip] = useState(false);
  const [isTranscribingClip, setIsTranscribingClip] = useState(false);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // Timer State
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // WebRTC & Socket State
  const socketRef = useRef(null);
  const localStreamRef = useRef(null);
  const localVideoRef = useRef(null);
  const peerConnections = useRef({}); // { [socket_id]: RTCPeerConnection }
  const remoteStreamsRef = useRef({}); // { [socket_id]: MediaStream } persistent stream per peer
  const peersRef = useRef({}); // { [socket_id]: peer_info }
  const [peers, setPeers] = useState({}); // { [socket_id]: { stream, user_name, user_id, audio_enabled, video_enabled } }

  // Web Audio Context & Analyser for Live VU Meter & VAD
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const [micVolume, setMicVolume] = useState(0);
  const [isSpeakingLocal, setIsSpeakingLocal] = useState(false);

  // Helper: Append a new finalized transcript entry with speaker name and timestamp
  const addTranscriptEntry = (speakerName, text, timeStr) => {
    const cleanText = (text || '').trim();
    if (!cleanText) return;
    const time = timeStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const formattedLine = `[${time}] ${speakerName}: ${cleanText}\n`;
    liveSpeechAccumulatorRef.current += formattedLine;

    const entry = {
      id: Date.now() + Math.random(),
      speaker: speakerName,
      text: cleanText,
      time: time,
      isFinal: true
    };
    setLiveCaptions(prev => [...prev, entry]);
    console.log(`[Transcript Collected] ${formattedLine.trim()}`);
  };

  const getInitials = (name) => {
    if (!name) return 'U';
    return name.split(' ').map(n => n[0]).join('').toUpperCase().substring(0, 2);
  };

  // Format Elapsed Time
  const formatTimer = (totalSeconds) => {
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Media Stream State (Stored in React State for reactive UI & video binding)
  const [localStream, setLocalStream] = useState(null);
  const [micActive, setMicActive] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [micStatusText, setMicStatusText] = useState('Checking Mic...');
  const [speechError, setSpeechError] = useState('');

  // Attach localStream to localVideoRef reactively whenever stream or video ref becomes ready
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      console.log('[Media] Binding localStream to video element. Video tracks:', localStream.getVideoTracks().length);
      localVideoRef.current.srcObject = localStream;
      localVideoRef.current.play().catch(e => {
        console.warn('[Media] Video auto-play notice:', e.message);
      });
    }
  }, [localStream]);

  // Unlock AudioContext on user interaction if browser policy suspended it
  useEffect(() => {
    const unlockAudio = () => {
      if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume().then(() => {
          console.log('[Media] AudioContext resumed successfully by user gesture');
        }).catch(err => console.warn('[Media] AudioContext resume error:', err));
      }
    };
    window.addEventListener('click', unlockAudio, { once: true });
    window.addEventListener('touchstart', unlockAudio, { once: true });
    return () => {
      window.removeEventListener('click', unlockAudio);
      window.removeEventListener('touchstart', unlockAudio);
    };
  }, []);

  // 1. Initial Meeting & Attendance Setup (Runs once on mount)
  useEffect(() => {
    let timerInterval = null;

    const initMeeting = async () => {
      try {
        setLoading(true);
        // Call join session API in MySQL to mark attendance as present
        await meetingService.joinSession(meetingId);

        // Fetch meeting details and initial participant list
        const res = await meetingService.getMeetingDetails(meetingId);
        if (res.success) {
          setMeeting(res.meeting);
          setAllParticipants(res.participants || []);
        } else {
          setError(res.message || 'Meeting not found');
        }
      } catch (err) {
        console.error('[MeetingInit] Failed to join meeting session:', err);
        setError(err.response?.data?.message || 'Error connecting to meeting session');
      } finally {
        setLoading(false);
      }
    };

    initMeeting();

    timerInterval = setInterval(() => {
      setElapsedSeconds(prev => prev + 1);
    }, 1000);

    return () => {
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [meetingId]);

  const interimClearTimeoutRef = useRef(null);

  // Speech Recognition Controller with Clean Recovery, Backoff & Error Limits
  const initSpeechRecognizer = (targetLang) => {
    const langToUse = targetLang || selectedLanguageRef.current || 'en-US';
    selectedLanguageRef.current = langToUse;

    const SpeechClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechClass) {
      setSpeechError('Web Speech API is not supported in this browser. Please use Google Chrome, Microsoft Edge, or use the AI Voice Recorder / Quick Test buttons below.');
      setSttStatus('unsupported');
      return null;
    }

    try {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.stop();
        } catch (e) {}
        recognitionRef.current = null;
      }

      console.log('[STT] Initializing fresh SpeechRecognition instance with lang:', langToUse);
      const recognizer = new SpeechClass();
      recognizer.continuous = true;
      recognizer.interimResults = true;
      recognizer.lang = langToUse;
      recognizer.maxAlternatives = 1;

      recognizer.onstart = () => {
        isRecognizingRef.current = true;
        consecutiveErrorsRef.current = 0;
        setSttStatus('listening');
        setSpeechError('');
        console.log('[STT] SpeechRecognition active & listening (Lang:', recognizer.lang, ')');
      };

      recognizer.onaudiostart = () => {
        console.log('[STT] Audio capture pipe connected');
      };

      recognizer.onsoundstart = () => {
        console.log('[STT] Sound energy detected');
      };

      recognizer.onspeechstart = () => {
        console.log('[STT] Human speech pattern detected');
      };

      recognizer.onspeechend = () => {
        console.log('[STT] Human speech paused');
      };

      recognizer.onaudioend = () => {
        console.log('[STT] Audio stream paused');
      };

      recognizer.onresult = (evt) => {
        setSttStatus('listening');
        consecutiveErrorsRef.current = 0;
        let interimText = '';
        console.log(`[STT] onresult fired! Total result segments: ${evt.results.length}, resultIndex: ${evt.resultIndex}`);

        if (interimClearTimeoutRef.current) {
          clearTimeout(interimClearTimeoutRef.current);
          interimClearTimeoutRef.current = null;
        }

        for (let i = evt.resultIndex; i < evt.results.length; i++) {
          const item = evt.results[i];
          const text = item[0]?.transcript || '';
          const confidence = item[0]?.confidence !== undefined ? (item[0].confidence * 100).toFixed(1) + '%' : 'N/A';
          
          if (item.isFinal) {
            const trimmed = text.trim();
            console.log(`[STT] onresult -> FINAL transcript received [Confidence: ${confidence}]: "${trimmed}"`);
            if (trimmed) {
              const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
              const speakerName = user?.name || 'You';
              addTranscriptEntry(speakerName, trimmed, timeStr);
              setActiveSubtitle({ speaker: speakerName, text: trimmed, isInterim: false });

              if (socketRef.current) {
                socketRef.current.emit('live-caption', {
                  meeting_id: meetingId,
                  speaker_name: speakerName,
                  speaker_id: user?.id,
                  text: trimmed,
                  is_final: true,
                  timestamp: timeStr
                });
              }

              // Auto-clear final subtitle after 5s
              interimClearTimeoutRef.current = setTimeout(() => {
                setActiveSubtitle(null);
              }, 5000);
            }
          } else {
            interimText += text;
          }
        }

        if (interimText.trim()) {
          console.log(`[STT] onresult -> INTERIM transcript: "${interimText.trim()}"`);
          setActiveSubtitle({ speaker: user?.name || 'You', text: interimText.trim(), isInterim: true });
          if (socketRef.current) {
            socketRef.current.emit('live-caption', {
              meeting_id: meetingId,
              speaker_name: user?.name || 'Participant',
              speaker_id: user?.id,
              text: interimText.trim(),
              is_final: false,
              timestamp: new Date().toLocaleTimeString()
            });
          }

          // Auto-clear interim subtitle after 4 seconds of silence
          interimClearTimeoutRef.current = setTimeout(() => {
            setActiveSubtitle(null);
          }, 4000);
        }
      };

      recognizer.onerror = (e) => {
        console.warn('[STT] SpeechRecognition error event:', e.error, e.message || '');
        
        let errorMsg = '';
        switch (e.error) {
          case 'no-speech':
            // Silence / paused - normal waiting, do not count as fatal error
            return;
          case 'audio-capture':
            consecutiveErrorsRef.current += 1;
            errorMsg = 'Audio capture failed. Ensure your microphone is plugged in and set as default in OS/browser.';
            setSttStatus('error');
            break;
          case 'network':
            consecutiveErrorsRef.current += 1;
            if (consecutiveErrorsRef.current >= 4) {
              errorMsg = 'Google Cloud Speech STT is unreachable on this connection. You can use the AI Voice Recorder, Quick Speech test, or manual input below.';
              setSttStatus('error');
            } else {
              errorMsg = 'Reconnecting Google STT cloud speech service...';
              setSttStatus('reconnecting');
            }
            break;
          case 'not-allowed':
            consecutiveErrorsRef.current += 5;
            isRecognizingRef.current = false;
            shouldListenRef.current = false;
            setSttStatus('error');
            errorMsg = 'Microphone permission denied for speech recognition in browser settings.';
            break;
          case 'service-not-allowed':
            consecutiveErrorsRef.current += 5;
            isRecognizingRef.current = false;
            shouldListenRef.current = false;
            setSttStatus('error');
            errorMsg = 'Speech recognition service blocked by browser. Please open in Google Chrome / Edge or use the AI Voice Recorder below.';
            break;
          case 'aborted':
            isRecognizingRef.current = false;
            break;
          default:
            consecutiveErrorsRef.current += 1;
            errorMsg = `Speech recognition status: ${e.error}`;
            setSttStatus('error');
            break;
        }

        if (errorMsg) {
          setSpeechError(errorMsg);
        }
      };

      recognizer.onend = () => {
        isRecognizingRef.current = false;
        console.log('[STT] SpeechRecognition onend event fired. shouldListen:', shouldListenRef.current, 'errors:', consecutiveErrorsRef.current);

        if (meetingActiveRef.current && micEnabledRef.current && shouldListenRef.current && consecutiveErrorsRef.current < 4) {
          setSttStatus('reconnecting');
          if (restartTimeoutRef.current) clearTimeout(restartTimeoutRef.current);
          restartTimeoutRef.current = setTimeout(() => {
            if (meetingActiveRef.current && micEnabledRef.current && shouldListenRef.current && !isRecognizingRef.current && consecutiveErrorsRef.current < 4) {
              console.log('[STT] Auto-recreating fresh SpeechRecognition after onend...');
              initSpeechRecognizer(selectedLanguageRef.current);
            }
          }, 600);
        } else if (consecutiveErrorsRef.current >= 4) {
          setSttStatus('error');
        } else {
          setSttStatus('paused');
        }
      };

      recognitionRef.current = recognizer;
      shouldListenRef.current = true;
      try {
        recognizer.start();
      } catch (startErr) {
        if (startErr.name !== 'InvalidStateError') {
          console.warn('[STT] Initial start error:', startErr);
        }
      }
      return recognizer;
    } catch (sErr) {
      console.warn('[STT] Recognition initialization failed:', sErr.message);
      setSpeechError('Speech recognition engine initialization: ' + sErr.message);
      setSttStatus('error');
      return null;
    }
  };

  // Change Speech Recognition Language dynamically
  const handleLanguageChange = (newLang) => {
    setSelectedLanguage(newLang);
    selectedLanguageRef.current = newLang;
    consecutiveErrorsRef.current = 0;
    if (micEnabled && meetingActiveRef.current) {
      initSpeechRecognizer(newLang);
    }
  };

  // Send Manual Spoken Line into Live Transcript & Subtitles
  const handleSendManualTranscript = (e) => {
    if (e) e.preventDefault();
    const text = manualTranscriptInput.trim();
    if (!text) return;

    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const speakerName = user?.name || 'You';

    addTranscriptEntry(speakerName, text, timeStr);
    setActiveSubtitle({ speaker: speakerName, text: text, isInterim: false });

    if (socketRef.current) {
      socketRef.current.emit('live-caption', {
        meeting_id: meetingId,
        speaker_name: speakerName,
        speaker_id: user?.id,
        text: text,
        is_final: true,
        timestamp: timeStr
      });
    }

    setManualTranscriptInput('');
  };

  // Quick Speech Simulation (Tests Subtitles, VU activity, Socket.IO broadcast, and Gemini transcript end-to-end)
  const handleQuickSpeechTest = (testPhrase) => {
    const phrase = testPhrase || "Hello, good morning team! Let's review our sprint updates.";
    const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const speakerName = user?.name || 'You';

    // 1. Visually trigger speaking indicator on local video tile
    setIsSpeakingLocal(true);
    setMicVolume(85);

    // 2. Show live interim subtitle briefly, then final subtitle
    setActiveSubtitle({ speaker: speakerName, text: phrase, isInterim: true });

    setTimeout(() => {
      setActiveSubtitle({ speaker: speakerName, text: phrase, isInterim: false });
      addTranscriptEntry(speakerName, phrase, timeStr);

      // 3. Broadcast to all peers in room via Socket.IO
      if (socketRef.current) {
        socketRef.current.emit('live-caption', {
          meeting_id: meetingId,
          speaker_name: speakerName,
          speaker_id: user?.id,
          text: phrase,
          is_final: true,
          timestamp: timeStr
        });
      }

      setTimeout(() => {
        setIsSpeakingLocal(false);
        setMicVolume(0);
      }, 2000);
    }, 600);
  };

  // Start Hardware Audio Clip Recording (Direct Mic -> Whisper/Gemini AI)
  const startAudioClipRecording = () => {
    const stream = localStreamRef.current;
    if (!stream || stream.getAudioTracks().length === 0) {
      alert('No microphone track available to record.');
      return;
    }
    try {
      audioChunksRef.current = [];
      const mimeType = (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm;codecs=opus'))
        ? 'audio/webm;codecs=opus'
        : (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported('audio/webm'))
        ? 'audio/webm'
        : 'audio/ogg';

      // Create clean audio-only stream for AI transcription recording
      const audioOnlyStream = new MediaStream(stream.getAudioTracks());
      const recorder = new MediaRecorder(audioOnlyStream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        if (audioChunksRef.current.length === 0) return;
        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        audioChunksRef.current = [];
        setIsTranscribingClip(true);
        try {
          console.log(`[AudioClip] Sending ${audioBlob.size} bytes to backend AI transcription...`);
          const res = await meetingService.transcribeAudioChunk(meetingId, audioBlob);
          if (res.success && res.transcript && res.transcript !== 'No audible speech detected in recording.' && !res.transcript.includes('empty audio payload')) {
            const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            const speakerName = user?.name || 'You';
            addTranscriptEntry(speakerName, res.transcript, timeStr);
            setActiveSubtitle({ speaker: speakerName, text: res.transcript, isInterim: false });
            if (socketRef.current) {
              socketRef.current.emit('live-caption', {
                meeting_id: meetingId,
                speaker_name: speakerName,
                speaker_id: user?.id,
                text: res.transcript,
                is_final: true,
                timestamp: timeStr
              });
            }
          } else {
            setSpeechError(res.transcript || 'No clear speech detected in recorded audio clip. Try speaking louder.');
          }
        } catch (err) {
          console.error('[AudioClip] AI Transcription error:', err);
          setSpeechError('Backend AI Transcription: ' + (err.response?.data?.message || err.message));
        } finally {
          setIsTranscribingClip(false);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start(250);
      setIsRecordingAudioClip(true);
      setSpeechError('');
    } catch (recErr) {
      console.error('[AudioClip] Failed to start MediaRecorder:', recErr);
      alert('Audio recording error: ' + recErr.message);
    }
  };

  // Stop Hardware Audio Clip Recording & Trigger AI Transcription
  const stopAudioClipRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecordingAudioClip(false);
    }
  };

  // 2. Clean Media Acquisition & WebRTC Setup (Executes once loading is complete)
  useEffect(() => {
    if (!user || loading || error) return;

    let streamInstance = null;

    const initializeMediaAndSignaling = async () => {
      try {
        console.log('[Media] Step 1: Requesting getUserMedia (mic & camera)...');
        
        // Step A: Request Camera & Microphone with graceful constraint fallback
        try {
          streamInstance = await navigator.mediaDevices.getUserMedia({
            video: true,
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true,
            }
          });
          console.log('[Media] getUserMedia with advanced constraints SUCCESS.');
        } catch (advErr) {
          console.warn('[Media] Advanced audio constraints failed, trying basic audio+video:', advErr.message);
          try {
            streamInstance = await navigator.mediaDevices.getUserMedia({
              video: true,
              audio: true
            });
            console.log('[Media] Basic video+audio SUCCESS.');
          } catch (fullErr) {
            console.warn('[Media] Video+Audio failed, attempting audio only:', fullErr.message);
            try {
              streamInstance = await navigator.mediaDevices.getUserMedia({
                video: false,
                audio: true
              });
              console.log('[Media] Audio-only getUserMedia SUCCESS.');
            } catch (audioErr) {
              console.error('[Media] Audio & Video access denied or unavailable:', audioErr.message);
              streamInstance = new MediaStream();
              setMicStatusText('Mic Access Denied');
            }
          }
        }

        // Store in State & Ref BEFORE initiating any Socket.IO or WebRTC peer connections
        localStreamRef.current = streamInstance;
        setLocalStream(streamInstance);

        // Inspect Tracks
        const audioTracks = streamInstance.getAudioTracks();
        const videoTracks = streamInstance.getVideoTracks();

        const hasAudio = audioTracks.length > 0 && audioTracks[0].readyState === 'live';
        const hasVideo = videoTracks.length > 0 && videoTracks[0].readyState === 'live';

        setMicActive(hasAudio && audioTracks[0].enabled);
        setCameraActive(hasVideo && videoTracks[0].enabled);
        setMicStatusText(hasAudio ? 'Mic Active' : 'No Microphone Found');

        console.log(`[Media] Local media stream confirmed. Audio tracks: ${audioTracks.length} (Live: ${hasAudio}), Video tracks: ${videoTracks.length} (Live: ${hasVideo})`);

        // Step B: Set up Live Audio VU Meter & VAD if mic is active
        if (hasAudio) {
          try {
            const AudioContextClass = window.AudioContext || window.webkitAudioContext;
            if (AudioContextClass) {
              const ctx = new AudioContextClass();
              audioContextRef.current = ctx;
              if (ctx.state === 'suspended') {
                ctx.resume().catch(() => {});
              }
              const source = ctx.createMediaStreamSource(streamInstance);
              const analyser = ctx.createAnalyser();
              analyser.fftSize = 256;
              analyser.smoothingTimeConstant = 0.3;
              source.connect(analyser);
              analyserRef.current = analyser;

              const timeData = new Uint8Array(analyser.fftSize);
              const checkVolume = () => {
                if (analyserRef.current && meetingActiveRef.current) {
                  if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                    audioContextRef.current.resume().catch(() => {});
                  }
                  analyserRef.current.getByteTimeDomainData(timeData);
                  let sumSquares = 0;
                  for (let i = 0; i < timeData.length; i++) {
                    const norm = (timeData[i] - 128) / 128;
                    sumSquares += norm * norm;
                  }
                  const rms = Math.sqrt(sumSquares / timeData.length);
                  // Scale RMS accurately to 0-100% volume for speech
                  const vol = Math.min(100, Math.round(rms * 280));
                  setMicVolume(vol);
                  setIsSpeakingLocal(vol > 8);
                }
                requestAnimationFrame(checkVolume);
              };
              checkVolume();
            }
          } catch (audioCtxErr) {
            console.warn('[Media] AudioContext VU meter note:', audioCtxErr.message);
          }
        }

        // Step C: Start Web Speech Recognition with single persistent instance & auto-recovery
        initSpeechRecognizer();

        // Step D: Connect to Socket.IO Signaling Server ONLY after local media stream is fully resolved
        const getSocketUrl = () => {
          if (import.meta.env.VITE_SOCKET_URL) return import.meta.env.VITE_SOCKET_URL;
          if (import.meta.env.VITE_API_URL) {
            return import.meta.env.VITE_API_URL.replace(/\/api\/?$/, '');
          }
          return window.location.origin;
        };

        const socketUrl = getSocketUrl();
        console.log(`[WebRTC] Local media ready. Connecting to Socket.IO signaling server at ${socketUrl}...`);
        const socket = io(socketUrl, {
          path: '/socket.io',
          transports: ['websocket', 'polling'],
          reconnection: true,
        });
        socketRef.current = socket;

        socket.on('connect', () => {
          console.log(`[WebRTC] Connected to Socket.IO signaling server with socket ID: ${socket.id}`);
          // Join meeting room with guaranteed local stream present
          socket.emit('join-room', {
            meeting_id: meetingId,
            user_id: user.id,
            user_name: user.name,
            audio_enabled: micEnabled && hasAudio,
            video_enabled: videoEnabled && hasVideo
          });
        });

        // Event: List of already existing participants in the room
        socket.on('existing-participants', async ({ participants }) => {
          console.log(`[WebRTC] Received ${participants.length} existing participants in room:`, participants);

          // For every existing participant, initiate RTCPeerConnection and create offer (Full Mesh)
          for (const peer of participants) {
            await createPeerOffer(peer.socket_id, peer.user_id, peer.user_name, peer.audio_enabled, peer.video_enabled);
          }
        });

        // Event: A new user joined room
        socket.on('user-joined', ({ socket_id, user_id, user_name, audio_enabled, video_enabled }) => {
          console.log(`[WebRTC] New user joined room: ${user_name} (${socket_id}). Waiting for their offer...`);
          // Update allParticipants list in drawer
          setAllParticipants(prev => {
            const exists = prev.some(p => p.user_id === user_id);
            if (exists) {
              return prev.map(p => p.user_id === user_id ? { ...p, attendance_status: 'present' } : p);
            } else {
              return [...prev, { user_id, name: user_name, attendance_status: 'present', role: 'employee' }];
            }
          });
        });

        // Event: Receive SDP Offer from another peer
        socket.on('receive-offer', async ({ from_socket_id, offer, user_id, user_name }) => {
          console.log(`[WebRTC] Received SDP Offer from: ${user_name} (${from_socket_id})`);
          await handleReceiveOffer(from_socket_id, offer, user_id, user_name);
        });

        // Event: Receive SDP Answer from another peer
        socket.on('receive-answer', async ({ from_socket_id, answer }) => {
          console.log(`[WebRTC] Received SDP Answer from: ${from_socket_id}`);
          const pc = peerConnections.current[from_socket_id];
          if (pc) {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
            console.log(`[WebRTC] Remote description successfully set for peer: ${from_socket_id}`);
          }
        });

        // Event: Receive ICE Candidate from another peer
        socket.on('receive-ice-candidate', async ({ from_socket_id, candidate }) => {
          const pc = peerConnections.current[from_socket_id];
          if (pc && candidate) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(candidate));
              console.log(`[WebRTC] Added ICE candidate from peer: ${from_socket_id}`);
            } catch (err) {
              console.error(`[WebRTC] Error adding ICE candidate from ${from_socket_id}:`, err);
            }
          }
        });

        // Event: Peer media state toggled
        socket.on('peer-media-toggle', ({ socket_id, type, enabled }) => {
          setPeers(prev => {
            if (!prev[socket_id]) return prev;
            return {
              ...prev,
              [socket_id]: {
                ...prev[socket_id],
                [type === 'audio' ? 'audio_enabled' : 'video_enabled']: enabled
              }
            };
          });
        });

        // Event: A peer left room
        socket.on('user-left', ({ socket_id, user_id }) => {
          console.log(`[WebRTC] Peer left room: ${socket_id} (User ID: ${user_id})`);
          if (peerConnections.current[socket_id]) {
            peerConnections.current[socket_id].close();
            delete peerConnections.current[socket_id];
          }
          if (remoteStreamsRef.current[socket_id]) {
            remoteStreamsRef.current[socket_id].getTracks().forEach(track => track.stop());
            delete remoteStreamsRef.current[socket_id];
          }
          setPeers(prev => {
            const next = { ...prev };
            delete next[socket_id];
            return next;
          });
          // Update drawer attendance
          setAllParticipants(prev =>
            prev.map(p => p.user_id === user_id ? { ...p, attendance_status: 'left' } : p)
          );
        });

        // Event: Live Speech Caption received from any peer in the room
        socket.on('live-caption', (data) => {
          if (data.speaker_id !== user?.id) {
            setActiveSubtitle({ speaker: data.speaker_name, text: data.text, isInterim: !data.is_final });
            if (data.is_final) {
              addTranscriptEntry(data.speaker_name, data.text, data.timestamp);
            }
          }
        });

        // Event: Meeting ended by host
        socket.on('meeting-ended', async () => {
          try {
            const finalTranscript = liveSpeechAccumulatorRef.current.trim();
            if (finalTranscript) {
              await meetingService.saveTranscript(meetingId, finalTranscript);
            }
          } catch (e) {}
          alert('This meeting has been ended by the Team Leader / Host.');
          cleanupAndExit(`/meeting/${meetingId}/details`);
        });

      } catch (err) {
        console.error('[WebRTC] Initialization error:', err);
      }
    };

    initializeMediaAndSignaling();

    return () => {
      // Teardown WebRTC & STT on unmount
      shouldListenRef.current = false;
      if (restartTimeoutRef.current) {
        clearTimeout(restartTimeoutRef.current);
      }
      if (recognitionRef.current) {
        try {
          recognitionRef.current.onstart = null;
          recognitionRef.current.onresult = null;
          recognitionRef.current.onerror = null;
          recognitionRef.current.onend = null;
          recognitionRef.current.abort();
          recognitionRef.current = null;
        } catch (e) {}
      }
      if (socketRef.current) {
        socketRef.current.emit('leave-room', { meeting_id: meetingId, user_id: user.id });
        socketRef.current.disconnect();
      }
      Object.values(peerConnections.current).forEach(pc => pc.close());
      peerConnections.current = {};
      Object.values(remoteStreamsRef.current).forEach(stream => {
        stream.getTracks().forEach(track => track.stop());
      });
      remoteStreamsRef.current = {};
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, [meetingId, user, loading]);

  // Helper: Create RTCPeerConnection and send Offer to target peer
  const createPeerOffer = async (targetSocketId, targetUserId, targetUserName, audioEnabled, videoEnabled) => {
    try {
      console.log(`[WebRTC] Creating RTCPeerConnection for existing peer: ${targetUserName} (${targetSocketId})`);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnections.current[targetSocketId] = pc;

      // Add local media tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      } else {
        console.warn(`[WebRTC] localStreamRef.current not available when creating offer for ${targetUserName}`);
      }

      // Add renegotiation support: auto-renegotiate if tracks change
      pc.onnegotiationneeded = async () => {
        try {
          console.log(`[WebRTC] onnegotiationneeded triggered for existing peer: ${targetUserName} (${targetSocketId})`);
          const renegotiatedOffer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          if (pc.signalingState !== 'closed') {
            await pc.setLocalDescription(renegotiatedOffer);
            console.log(`[WebRTC] Sending renegotiated SDP Offer to peer: ${targetSocketId}`);
            socketRef.current?.emit('signal-offer', {
              to_socket_id: targetSocketId,
              offer: renegotiatedOffer,
              user_id: user.id,
              user_name: user.name,
            });
          }
        } catch (negErr) {
          console.error(`[WebRTC] Renegotiation error for ${targetSocketId}:`, negErr);
        }
      };

      // Log ICE and Connection State changes for real-device debugging
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE Connection State with peer ${targetUserName} (${targetSocketId}): ${pc.iceConnectionState}`);
      };
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer Connection State with peer ${targetUserName} (${targetSocketId}): ${pc.connectionState}`);
      };

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log(`[WebRTC] Sending ICE Candidate to peer: ${targetSocketId} (Type: ${event.candidate.type}, Protocol: ${event.candidate.protocol})`);
          socketRef.current.emit('signal-ice-candidate', {
            to_socket_id: targetSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle Incoming Remote Media Stream: Accumulate into persistent MediaStream per peer
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received remote ${event.track.kind} track from peer: ${targetUserName} (${targetSocketId}), readyState: ${event.track.readyState}`);
        
        if (!remoteStreamsRef.current[targetSocketId]) {
          remoteStreamsRef.current[targetSocketId] = new MediaStream();
        }
        const persistentStream = remoteStreamsRef.current[targetSocketId];

        const existingTracks = persistentStream.getTracks();
        if (!existingTracks.some(t => t.id === event.track.id)) {
          persistentStream.addTrack(event.track);
          console.log(`[WebRTC] Added ${event.track.kind} track to stream for ${targetUserName} (${targetSocketId}). Current Audio tracks: ${persistentStream.getAudioTracks().length}, Video tracks: ${persistentStream.getVideoTracks().length}`);
        }

        setPeers(prev => ({
          ...prev,
          [targetSocketId]: {
            ...(prev[targetSocketId] || {}),
            stream: persistentStream,
            user_name: targetUserName,
            user_id: targetUserId,
            audio_enabled: prev[targetSocketId]?.audio_enabled !== undefined ? prev[targetSocketId].audio_enabled : (audioEnabled !== false),
            video_enabled: prev[targetSocketId]?.video_enabled !== undefined ? prev[targetSocketId].video_enabled : (videoEnabled !== false),
            _update: Date.now()
          }
        }));
      };

      // Create and send SDP Offer
      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true
      });
      await pc.setLocalDescription(offer);
      console.log(`[WebRTC] Sending initial SDP Offer to peer: ${targetSocketId}`);

      socketRef.current.emit('signal-offer', {
        to_socket_id: targetSocketId,
        offer: offer,
        user_id: user.id,
        user_name: user.name,
      });

    } catch (err) {
      console.error(`[WebRTC] Failed to create offer for ${targetSocketId}:`, err);
    }
  };

  // Helper: Receive SDP Offer, create RTCPeerConnection (or renegotiate existing), and send Answer
  const handleReceiveOffer = async (fromSocketId, offer, fromUserId, fromUserName) => {
    try {
      // Check if peer connection already exists (renegotiation offer)
      if (peerConnections.current[fromSocketId]) {
        const pc = peerConnections.current[fromSocketId];
        console.log(`[WebRTC] Processing incoming renegotiation offer from: ${fromUserName} (${fromSocketId})`);
        await pc.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log(`[WebRTC] Sending renegotiated SDP Answer back to: ${fromSocketId}`);

        socketRef.current.emit('signal-answer', {
          to_socket_id: fromSocketId,
          answer: answer,
        });
        return;
      }

      console.log(`[WebRTC] Initializing new RTCPeerConnection for incoming offer from: ${fromUserName} (${fromSocketId})`);
      const pc = new RTCPeerConnection(ICE_SERVERS);
      peerConnections.current[fromSocketId] = pc;

      // Add local media tracks to peer connection
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => {
          pc.addTrack(track, localStreamRef.current);
        });
      } else {
        console.warn(`[WebRTC] localStreamRef.current not available when handling offer from ${fromUserName}`);
      }

      // Add renegotiation support: auto-renegotiate if tracks change
      pc.onnegotiationneeded = async () => {
        try {
          console.log(`[WebRTC] onnegotiationneeded triggered for peer: ${fromUserName} (${fromSocketId})`);
          const renegotiatedOffer = await pc.createOffer({
            offerToReceiveAudio: true,
            offerToReceiveVideo: true
          });
          if (pc.signalingState !== 'closed') {
            await pc.setLocalDescription(renegotiatedOffer);
            console.log(`[WebRTC] Sending renegotiated SDP Offer to peer: ${fromSocketId}`);
            socketRef.current?.emit('signal-offer', {
              to_socket_id: fromSocketId,
              offer: renegotiatedOffer,
              user_id: user.id,
              user_name: user.name,
            });
          }
        } catch (negErr) {
          console.error(`[WebRTC] Renegotiation error for ${fromSocketId}:`, negErr);
        }
      };

      // Log ICE and Connection State changes
      pc.oniceconnectionstatechange = () => {
        console.log(`[WebRTC] ICE Connection State with peer ${fromUserName} (${fromSocketId}): ${pc.iceConnectionState}`);
      };
      pc.onconnectionstatechange = () => {
        console.log(`[WebRTC] Peer Connection State with peer ${fromUserName} (${fromSocketId}): ${pc.connectionState}`);
      };

      // Handle ICE Candidates
      pc.onicecandidate = (event) => {
        if (event.candidate && socketRef.current) {
          console.log(`[WebRTC] Sending ICE Candidate back to peer: ${fromSocketId} (Type: ${event.candidate.type}, Protocol: ${event.candidate.protocol})`);
          socketRef.current.emit('signal-ice-candidate', {
            to_socket_id: fromSocketId,
            candidate: event.candidate,
          });
        }
      };

      // Handle Incoming Remote Stream: Accumulate into persistent MediaStream per peer
      pc.ontrack = (event) => {
        console.log(`[WebRTC] Received remote ${event.track.kind} track from peer: ${fromUserName} (${fromSocketId}), readyState: ${event.track.readyState}`);
        
        if (!remoteStreamsRef.current[fromSocketId]) {
          remoteStreamsRef.current[fromSocketId] = new MediaStream();
        }
        const persistentStream = remoteStreamsRef.current[fromSocketId];

        const existingTracks = persistentStream.getTracks();
        if (!existingTracks.some(t => t.id === event.track.id)) {
          persistentStream.addTrack(event.track);
          console.log(`[WebRTC] Added ${event.track.kind} track to stream for ${fromUserName} (${fromSocketId}). Current Audio tracks: ${persistentStream.getAudioTracks().length}, Video tracks: ${persistentStream.getVideoTracks().length}`);
        }

        setPeers(prev => ({
          ...prev,
          [fromSocketId]: {
            ...(prev[fromSocketId] || {}),
            stream: persistentStream,
            user_name: fromUserName,
            user_id: fromUserId,
            audio_enabled: prev[fromSocketId]?.audio_enabled !== undefined ? prev[fromSocketId].audio_enabled : true,
            video_enabled: prev[fromSocketId]?.video_enabled !== undefined ? prev[fromSocketId].video_enabled : true,
            _update: Date.now()
          }
        }));
      };

      // Set Remote Description from incoming offer
      await pc.setRemoteDescription(new RTCSessionDescription(offer));

      // Create and send SDP Answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log(`[WebRTC] Sending initial SDP Answer back to: ${fromSocketId}`);

      socketRef.current.emit('signal-answer', {
        to_socket_id: fromSocketId,
        answer: answer,
      });

    } catch (err) {
      console.error(`[WebRTC] Failed to handle offer from ${fromSocketId}:`, err);
    }
  };


  // Helper: Start Speech Recognition safely
  const startRecognition = () => {
    if (!recognitionRef.current || !shouldListenRef.current || isRecognizingRef.current) return;
    try {
      recognitionRef.current.start();
    } catch (err) {
      if (err.name !== 'InvalidStateError') {
        console.warn('[STT] Start error:', err.name, err.message);
      }
    }
  };

  // Helper: Stop Speech Recognition safely
  const stopRecognition = (permanent = false) => {
    if (permanent) {
      shouldListenRef.current = false;
    }
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
    if (recognitionRef.current && isRecognizingRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (err) {
        // ignore
      }
    }
  };

  // Toggle Microphone (Driven directly by hardware track enabled state)
  const toggleMic = () => {
    const stream = localStream || localStreamRef.current;
    if (stream) {
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        const nextState = !audioTracks[0].enabled;
        audioTracks.forEach(track => { track.enabled = nextState; });
        setMicActive(nextState);
        setMicEnabled(nextState);
        micEnabledRef.current = nextState;
        shouldListenRef.current = nextState && meetingActiveRef.current;
        setMicStatusText(nextState ? 'Mic Active' : 'Mic Muted');
        console.log(`[Media] Microphone toggled. Hardware enabled=${nextState}`);

        // Resume AudioContext if suspended
        if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
          audioContextRef.current.resume().catch(() => {});
        }

        if (nextState) {
          setSttStatus('listening');
          initSpeechRecognizer(selectedLanguageRef.current);
        } else {
          setSttStatus('paused');
          stopRecognition(false);
        }

        if (socketRef.current) {
          socketRef.current.emit('user-media-toggle', {
            meeting_id: meetingId,
            type: 'audio',
            enabled: nextState
          });
        }
      } else {
        console.warn('[Media] No microphone audio track available to toggle.');
      }
    }
  };

  // Toggle Camera (Driven directly by hardware track enabled state)
  const toggleVideo = () => {
    const stream = localStream || localStreamRef.current;
    if (stream) {
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        const nextState = !videoTracks[0].enabled;
        videoTracks.forEach(track => { track.enabled = nextState; });
        setCameraActive(nextState);
        setVideoEnabled(nextState);
        console.log(`[Media] Camera toggled. Hardware enabled=${nextState}`);

        if (socketRef.current) {
          socketRef.current.emit('user-media-toggle', {
            meeting_id: meetingId,
            type: 'video',
            enabled: nextState
          });
        }
      } else {
        console.warn('[Media] No camera video track available to toggle.');
      }
    }
  };

  // Leave Meeting Call
  const handleLeaveMeeting = async () => {
    const confirmLeave = window.confirm("Are you sure you want to leave this meeting call?");
    if (confirmLeave) {
      meetingActiveRef.current = false;
      shouldListenRef.current = false;
      stopRecognition(true);

      try {
        const finalTranscript = liveSpeechAccumulatorRef.current.trim();
        if (finalTranscript) {
          console.log(`[MeetingLeave] Saving spoken transcript (${finalTranscript.length} chars)...`);
          await meetingService.saveTranscript(meetingId, finalTranscript);
        }
        await meetingService.leaveSession(meetingId);
      } catch (err) {
        console.error("Error logging leave status:", err);
      }
      cleanupAndExit(`/meeting/${meetingId}/details`);
    }
  };

  // End Meeting Call (Host/Leader Only)
  const handleEndMeeting = async () => {
    const confirmEnd = window.confirm("Are you sure you want to END this meeting for all participants? (Spoken transcript will be saved and analyzed by Gemini AI)");
    if (confirmEnd) {
      meetingActiveRef.current = false;
      shouldListenRef.current = false;
      stopRecognition(true);

      try {
        const finalTranscript = liveSpeechAccumulatorRef.current.trim();
        console.log(`[MeetingEnd] Ending meeting and saving spoken transcript (${finalTranscript.length} chars)...`);

        // 1. Mark meeting completed and persist official Spoken Transcript
        await meetingService.endSession(meetingId, finalTranscript);

        // 2. Send transcript TEXT to Gemini for post-meeting analysis
        if (finalTranscript) {
          console.log('[MeetingEnd] Sending transcript text directly to Gemini for intelligence analysis...');
          try {
            await meetingService.analyzeMeeting(meetingId, finalTranscript);
          } catch (aiErr) {
            console.warn('[MeetingEnd] Immediate Gemini analysis notification:', aiErr);
          }
        }
      } catch (err) {
        console.error("Error ending meeting:", err);
      }
      cleanupAndExit(`/meeting/${meetingId}/details`);
    }
  };

  const cleanupAndExit = (targetRoute = '/meetings') => {
    shouldListenRef.current = false;
    if (restartTimeoutRef.current) {
      clearTimeout(restartTimeoutRef.current);
    }
    if (recognitionRef.current) {
      try {
        recognitionRef.current.onstart = null;
        recognitionRef.current.onresult = null;
        recognitionRef.current.onerror = null;
        recognitionRef.current.onend = null;
        recognitionRef.current.abort();
        recognitionRef.current = null;
      } catch (e) {}
    }
    if (socketRef.current) {
      socketRef.current.emit('leave-room', { meeting_id: meetingId, user_id: user?.id });
      socketRef.current.disconnect();
    }
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach(track => track.stop());
    }
    navigate(targetRoute);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f172a', color: 'white' }}>
        <div>Connecting to WebRTC Meeting Room {meetingId}...</div>
      </div>
    );
  }

  if (error || !meeting) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center' }}>
        <div className="alert alert-error">{error || 'Meeting not found'}</div>
        <button onClick={() => navigate('/meetings')} className="btn btn-primary" style={{ marginTop: '1rem' }}>
          Back to Meetings
        </button>
      </div>
    );
  }

  const isHost = meeting?.created_by === user?.id || isLeader;
  const peerList = Object.entries(peers);
  const totalRoomParticipants = 1 + peerList.length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#090d16',
      color: '#f8fafc',
      overflow: 'hidden'
    }}>
      {/* 1. TOP HEADER BAR */}
      <div style={{
        padding: '0.75rem 1.5rem',
        backgroundColor: '#0f172a',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.75rem',
        zIndex: 10
      }}>
        {/* Left: Meeting Info */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            backgroundColor: '#1e3a8a',
            color: '#93c5fd',
            padding: '2px 8px',
            borderRadius: '4px',
            fontWeight: 700,
            fontSize: '0.85rem'
          }}>
            {meeting.meeting_id}
          </div>

          <h2 style={{ fontSize: '1.05rem', fontWeight: 700, margin: 0 }}>
            {meeting.title}
          </h2>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: '#1e293b',
            padding: '3px 10px',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            color: '#94a3b8'
          }}>
            <Clock size={13} color="#38bdf8" />
            <span>{formatTimer(elapsedSeconds)}</span>
          </div>
        </div>

        {/* Center: Live Recording & Voice VU Meter */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          backgroundColor: 'rgba(15, 23, 42, 0.95)',
          border: `1px solid ${micActive ? 'rgba(59, 130, 246, 0.5)' : 'rgba(239, 68, 68, 0.4)'}`,
          padding: '4px 14px',
          borderRadius: '9999px',
          fontSize: '0.78rem',
          fontWeight: 600,
          color: '#f8fafc'
        }}>
          {/* Recording / Mic Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{
              width: '8px',
              height: '8px',
              borderRadius: '50%',
              backgroundColor: micActive ? '#22c55e' : '#ef4444',
              boxShadow: micActive ? '0 0 8px #22c55e' : 'none',
              animation: micActive ? 'pulse 1.5s infinite' : 'none'
            }} />
            <span>
              {micActive ? 'Web Speech API: Live' : micStatusText}
            </span>
          </div>

          {/* Real-time Voice Volume Activity VU Meter */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: '#1e293b',
            padding: '2px 8px',
            borderRadius: '6px',
            border: '1px solid #334155'
          }}>
            <Mic size={12} color={micActive && micVolume > 5 ? '#22c55e' : '#94a3b8'} />
            <div style={{ width: '48px', height: '6px', backgroundColor: '#334155', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{
                width: `${micActive ? Math.max(4, micVolume) : 0}%`,
                height: '100%',
                backgroundColor: micVolume > 30 ? '#22c55e' : micVolume > 10 ? '#38bdf8' : '#64748b',
                transition: 'width 0.06s ease-out'
              }} />
            </div>
            <span style={{ fontSize: '0.7rem', color: micActive && micVolume > 5 ? '#86efac' : '#64748b', minWidth: '24px' }}>
              {!micActive ? 'Muted' : micVolume > 5 ? `${micVolume}%` : 'Silent'}
            </span>
          </div>

          {/* Real-time STT Recognition Live Badge */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '5px',
            backgroundColor: sttStatus === 'listening' ? 'rgba(34, 197, 94, 0.15)' : sttStatus === 'reconnecting' ? 'rgba(234, 179, 8, 0.15)' : 'rgba(100, 116, 139, 0.2)',
            border: `1px solid ${sttStatus === 'listening' ? '#22c55e' : sttStatus === 'reconnecting' ? '#eab308' : '#475569'}`,
            padding: '2px 8px',
            borderRadius: '6px',
            fontSize: '0.7rem',
            color: sttStatus === 'listening' ? '#86efac' : sttStatus === 'reconnecting' ? '#fde047' : '#94a3b8'
          }}>
            <Radio size={11} color={sttStatus === 'listening' ? '#22c55e' : sttStatus === 'reconnecting' ? '#eab308' : '#94a3b8'} />
            <span>
              {sttStatus === 'listening' ? 'STT: Listening' : sttStatus === 'reconnecting' ? 'STT: Reconnecting...' : sttStatus === 'paused' ? 'STT: Paused' : sttStatus === 'error' ? 'STT: Error' : 'STT: Standby'}
            </span>
          </div>
        </div>

        {/* Right: Participants Drawer Button */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => setShowDrawer(!showDrawer)}
            className="btn btn-secondary btn-sm"
            style={{
              backgroundColor: showDrawer ? '#3b82f6' : '#1e293b',
              color: 'white',
              border: '1px solid #334155'
            }}
          >
            <Users size={15} />
            <span>Participants ({totalRoomParticipants})</span>
          </button>
        </div>
      </div>

      {/* 2. MAIN MEETING BODY (VIDEO GRID & PARTICIPANTS DRAWER) */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        
        {/* Video Grid */}
        <div style={{
          flex: 1,
          padding: '1.25rem',
          display: 'grid',
          gridTemplateColumns: totalRoomParticipants <= 1 ? '1fr' : totalRoomParticipants <= 2 ? 'repeat(2, 1fr)' : 'repeat(auto-fit, minmax(360px, 1fr))',
          gap: '1rem',
          alignItems: 'center',
          justifyContent: 'center',
          overflowY: 'auto'
        }}>
          
          {/* Tile 1: Local User Video */}
          <div style={{
            position: 'relative',
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            overflow: 'hidden',
            aspectRatio: '16/9',
            border: isSpeakingLocal ? '2px solid #22c55e' : '2px solid #334155',
            boxShadow: isSpeakingLocal ? '0 0 16px rgba(34, 197, 94, 0.4)' : '0 4px 12px rgba(0,0,0,0.4)',
            transition: 'border 0.2s ease, box-shadow 0.2s ease',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transform: 'scaleX(-1)', // Mirror local video
                display: cameraActive && videoEnabled ? 'block' : 'none'
              }}
            />

            {(!cameraActive || !videoEnabled) && (
              <div style={{ textAlign: 'center' }}>
                <div className="avatar" style={{ width: '72px', height: '72px', fontSize: '1.6rem', margin: '0 auto 8px', backgroundColor: '#3b82f6', color: 'white' }}>
                  {getInitials(user?.name)}
                </div>
                <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{user?.name} (You)</div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Camera Off</div>
              </div>
            )}

            {/* Local User Name Tag & Status Badges */}
            <div style={{
              position: 'absolute',
              bottom: '10px',
              left: '10px',
              backgroundColor: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(4px)',
              padding: '3px 10px',
              borderRadius: '6px',
              fontSize: '0.8rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              color: 'white',
              fontWeight: 600
            }}>
              <span>{user?.name} (You)</span>
              {micActive ? <Mic size={13} color={isSpeakingLocal ? '#22c55e' : '#94a3b8'} /> : <MicOff size={13} color="#ef4444" />}
            </div>

            {isHost && (
              <div style={{
                position: 'absolute',
                top: '10px',
                left: '10px',
                backgroundColor: 'rgba(139, 92, 246, 0.85)',
                color: 'white',
                padding: '2px 8px',
                borderRadius: '4px',
                fontSize: '0.72rem',
                fontWeight: 700
              }}>
                Host
              </div>
            )}
          </div>

          {/* Remote Peer Video Tiles */}
          {peerList.map(([socketId, peer]) => (
            <RemoteVideoTile
              key={socketId}
              socketId={socketId}
              peer={peer}
              getInitials={getInitials}
            />
          ))}

          {/* Floating Real-Time Subtitle Banner */}
          {showCaptions && activeSubtitle && (
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '50%',
              transform: 'translateX(-50%)',
              backgroundColor: 'rgba(15, 23, 42, 0.9)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(59, 130, 246, 0.4)',
              color: '#ffffff',
              padding: '10px 24px',
              borderRadius: '14px',
              maxWidth: '750px',
              width: '85%',
              textAlign: 'center',
              boxShadow: '0 10px 35px rgba(0, 0, 0, 0.6)',
              zIndex: 30,
              animation: 'fadeIn 0.2s ease'
            }}>
              <div style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#38bdf8',
                marginBottom: '3px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px'
              }}>
                <Radio size={12} color="#22c55e" />
                <span>{activeSubtitle.speaker} {activeSubtitle.isInterim ? '(speaking live...)' : ''}</span>
              </div>
              <div style={{ fontSize: '1.08rem', fontWeight: 500, lineHeight: 1.35, color: '#f8fafc' }}>
                "{activeSubtitle.text}"
              </div>
            </div>
          )}

        </div>

        {/* Right Drawer: Attendance & Live Transcript */}
        {showDrawer && (
          <div style={{
            width: '360px',
            backgroundColor: '#0f172a',
            borderLeft: '1px solid #1e293b',
            display: 'flex',
            flexDirection: 'column',
            flexShrink: 0
          }}>
            {/* Drawer Header with Tabs */}
            <div style={{
              padding: '0.75rem 1rem',
              borderBottom: '1px solid #1e293b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '0.5rem'
            }}>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button
                  onClick={() => setDrawerTab('attendance')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: drawerTab === 'attendance' ? '#3b82f6' : '#1e293b',
                    color: drawerTab === 'attendance' ? 'white' : '#94a3b8'
                  }}
                >
                  Attendance ({allParticipants.length})
                </button>

                <button
                  onClick={() => setDrawerTab('transcript')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '6px',
                    fontSize: '0.8rem',
                    fontWeight: 700,
                    border: 'none',
                    cursor: 'pointer',
                    backgroundColor: drawerTab === 'transcript' ? '#3b82f6' : '#1e293b',
                    color: drawerTab === 'transcript' ? 'white' : '#94a3b8',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px'
                  }}
                >
                  <Sparkles size={12} />
                  <span>Live Transcript</span>
                </button>
              </div>

              <button
                onClick={() => setShowDrawer(false)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Tab 1: Attendance List */}
            {drawerTab === 'attendance' ? (
              <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem' }}>
                <div style={{ fontSize: '0.72rem', color: '#64748b', textTransform: 'uppercase', fontWeight: 700, marginBottom: '8px' }}>
                  All Invited Members ({allParticipants.length})
                </div>

                {allParticipants.map((p) => {
                  const isOnline = p.user_id === user?.id || Object.values(peers).some(peer => peer.user_id === p.user_id);
                  const isPresent = isOnline || p.attendance_status === 'present';
                  const hasLeft = p.attendance_status === 'left' && !isOnline;

                  return (
                    <div
                      key={p.user_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.6rem 0.75rem',
                        backgroundColor: '#1e293b',
                        borderRadius: '8px',
                        marginBottom: '6px'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <div className="avatar" style={{ width: '28px', height: '28px', fontSize: '0.75rem', backgroundColor: '#334155' }}>
                          {getInitials(p.name)}
                        </div>
                        <div>
                          <div style={{ fontWeight: 600, fontSize: '0.84rem' }}>
                            {p.name} {p.user_id === user?.id && <span style={{ color: '#38bdf8', fontSize: '0.72rem' }}>(You)</span>}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                            {p.role === 'leader' ? 'Team Leader' : 'Employee'}
                          </div>
                        </div>
                      </div>

                      <span className={`badge ${
                        isPresent ? 'badge-success' : hasLeft ? 'badge-warning' : 'badge-employee'
                      }`} style={{ fontSize: '0.7rem', padding: '2px 6px' }}>
                        {isPresent ? 'Joined' : hasLeft ? 'Left' : 'Not Joined'}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* Tab 2: Real-Time Live Transcript */
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                {/* 1. Transcript Controls & Language Bar */}
                <div style={{
                  padding: '8px 10px',
                  backgroundColor: '#1e293b',
                  borderBottom: '1px solid #334155',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    {/* Status Indicator */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.74rem' }}>
                      <span style={{
                        width: '7px',
                        height: '7px',
                        borderRadius: '50%',
                        backgroundColor: sttStatus === 'listening' ? '#22c55e' : sttStatus === 'reconnecting' ? '#eab308' : '#ef4444',
                        boxShadow: sttStatus === 'listening' ? '0 0 6px #22c55e' : 'none'
                      }} />
                      <span style={{ color: '#f8fafc', fontWeight: 600 }}>
                        {sttStatus === 'listening' ? 'STT Listening' : sttStatus === 'reconnecting' ? 'Reconnecting...' : sttStatus === 'paused' ? 'STT Paused' : 'STT Standby'}
                      </span>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      {/* Restart STT Button */}
                      <button
                        onClick={() => {
                          if (audioContextRef.current && audioContextRef.current.state === 'suspended') {
                            audioContextRef.current.resume().catch(() => {});
                          }
                          initSpeechRecognizer(selectedLanguage);
                        }}
                        className="btn-sm"
                        style={{
                          backgroundColor: '#334155',
                          color: '#38bdf8',
                          border: '1px solid #475569',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '3px'
                        }}
                        title="Restart Voice Recognition"
                      >
                        <RotateCw size={11} />
                        <span>Restart STT</span>
                      </button>

                      {/* Info / Diagnostics Toggle */}
                      <button
                        onClick={() => setShowSTTDiagnostics(!showSTTDiagnostics)}
                        style={{
                          backgroundColor: showSTTDiagnostics ? '#3b82f6' : '#334155',
                          color: 'white',
                          border: '1px solid #475569',
                          borderRadius: '4px',
                          padding: '2px 6px',
                          fontSize: '0.7rem',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '2px'
                        }}
                        title="Voice Diagnostics Info"
                      >
                        <Info size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Language Selector Dropdown */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.72rem', color: '#94a3b8' }}>
                      <Globe size={12} color="#38bdf8" />
                      <span>Recognition Accent:</span>
                    </div>
                    <select
                      value={selectedLanguage}
                      onChange={(e) => handleLanguageChange(e.target.value)}
                      style={{
                        backgroundColor: '#0f172a',
                        color: '#f8fafc',
                        border: '1px solid #475569',
                        borderRadius: '4px',
                        padding: '2px 6px',
                        fontSize: '0.72rem',
                        cursor: 'pointer'
                      }}
                    >
                      <option value="en-US">English (US)</option>
                      <option value="en-IN">English (India)</option>
                      <option value="en-GB">English (UK)</option>
                      <option value="ta-IN">Tamil (தமிழ்)</option>
                      <option value="hi-IN">Hindi (हिंदी)</option>
                    </select>
                  </div>
                </div>

                {/* Diagnostics Help Card */}
                {showSTTDiagnostics && (
                  <div style={{
                    padding: '8px 10px',
                    backgroundColor: '#0f172a',
                    borderBottom: '1px solid #334155',
                    fontSize: '0.72rem',
                    color: '#cbd5e1',
                    lineHeight: 1.4
                  }}>
                    <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '4px' }}>
                      🎙️ Microphone & Speech Diagnostics:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '16px' }}>
                      <li><strong>Hardware Mic:</strong> {micActive ? `Active (${micVolume}% volume detected)` : 'Muted / Inactive'}</li>
                      <li><strong>Speech Engine:</strong> {window.SpeechRecognition || window.webkitSpeechRecognition ? 'Web Speech API Available (Chrome/Edge)' : 'Not Supported (Use Chrome/Edge)'}</li>
                      <li><strong>Speech Language:</strong> {selectedLanguage}</li>
                      <li><strong>Tip:</strong> If speaking isn't detected, check Chrome mic permission in the URL address bar or type directly below!</li>
                    </ul>
                  </div>
                )}

                {/* Error Banner */}
                {speechError && (
                  <div style={{
                    margin: '8px 10px 0',
                    backgroundColor: 'rgba(239, 68, 68, 0.15)',
                    border: '1px solid #ef4444',
                    color: '#fca5a5',
                    padding: '6px 8px',
                    borderRadius: '6px',
                    fontSize: '0.72rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '6px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <AlertCircle size={13} color="#ef4444" style={{ flexShrink: 0 }} />
                      <span>{speechError}</span>
                    </div>
                    <button
                      onClick={() => initSpeechRecognizer(selectedLanguage)}
                      style={{
                        backgroundColor: '#ef4444',
                        color: 'white',
                        border: 'none',
                        borderRadius: '3px',
                        padding: '2px 5px',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      Retry
                    </button>
                  </div>
                )}

                {/* 2. Scrollable Transcript List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {liveCaptions.length > 0 ? (
                    liveCaptions.map((c) => (
                      <div
                        key={c.id}
                        style={{
                          backgroundColor: '#1e293b',
                          border: '1px solid #334155',
                          borderRadius: '8px',
                          padding: '8px 10px',
                          fontSize: '0.82rem'
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                          <span style={{ fontWeight: 700, color: '#38bdf8', fontSize: '0.78rem' }}>{c.speaker}</span>
                          <span style={{ fontSize: '0.68rem', color: '#64748b' }}>{c.time}</span>
                        </div>
                        <div style={{ color: '#f1f5f9', lineHeight: 1.35 }}>{c.text}</div>
                      </div>
                    ))
                  ) : (
                    <div style={{ textAlign: 'center', padding: '1.5rem 1rem', color: '#64748b', fontSize: '0.82rem' }}>
                      <Mic size={24} style={{ margin: '0 auto 8px', color: '#475569' }} />
                      <div style={{ fontWeight: 600, color: '#94a3b8', marginBottom: '4px' }}>Real-Time Meeting Transcript</div>
                      <div>Speak live, record an AI voice clip, or use quick speech test buttons below.</div>
                    </div>
                  )}
                </div>

                {/* 3. Quick Speech Test Presets & AI Mic Voice Clip Recorder Toolbar */}
                <div style={{
                  padding: '6px 10px',
                  backgroundColor: '#0f172a',
                  borderTop: '1px solid #334155',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '6px'
                }}>
                  {/* Quick Speech Simulation Chips */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: '0.68rem', color: '#94a3b8', fontWeight: 600 }}>⚡ Quick Speech Test:</span>
                  </div>
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => handleQuickSpeechTest("Hello, good morning team! Let's start the meeting.")}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#1e293b',
                        color: '#93c5fd',
                        border: '1px solid #3b82f6',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                      title="Simulate speech: Hello, good morning team!"
                    >
                      "Hello, good morning team"
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickSpeechTest("I have completed the user authentication and WebRTC integration tasks.")}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#1e293b',
                        color: '#86efac',
                        border: '1px solid #22c55e',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                      title="Simulate speech: Sprint update"
                    >
                      "Sprint update"
                    </button>

                    <button
                      type="button"
                      onClick={() => handleQuickSpeechTest("Let's decide to deploy the system on the cloud server today.")}
                      style={{
                        padding: '3px 8px',
                        backgroundColor: '#1e293b',
                        color: '#fde047',
                        border: '1px solid #eab308',
                        borderRadius: '4px',
                        fontSize: '0.68rem',
                        cursor: 'pointer',
                        transition: 'all 0.1s ease'
                      }}
                      title="Simulate speech: Team decision"
                    >
                      "Team decision"
                    </button>
                  </div>

                  {/* AI Mic Voice Clip Recorder Button */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                    {!isRecordingAudioClip ? (
                      <button
                        type="button"
                        onClick={startAudioClipRecording}
                        disabled={isTranscribingClip}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          backgroundColor: '#1e293b',
                          color: '#f8fafc',
                          border: '1px solid #6366f1',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 600,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px'
                        }}
                        title="Record your voice and transcribe with Gemini/Whisper AI"
                      >
                        <Radio size={12} color="#818cf8" />
                        <span>{isTranscribingClip ? 'Transcribing Audio Clip...' : '🎙️ Record Voice Clip (AI STT)'}</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={stopAudioClipRecording}
                        style={{
                          flex: 1,
                          padding: '5px 8px',
                          backgroundColor: '#ef4444',
                          color: 'white',
                          border: 'none',
                          borderRadius: '6px',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '5px',
                          animation: 'pulse 1s infinite'
                        }}
                        title="Stop recording and transcribe with AI"
                      >
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'white' }} />
                        <span>Recording... Click to Transcribe with AI</span>
                      </button>
                    )}
                  </div>
                </div>

                {/* 4. Manual Spoken Line Input Fallback Form */}
                <form
                  onSubmit={handleSendManualTranscript}
                  style={{
                    padding: '8px 10px',
                    backgroundColor: '#1e293b',
                    borderTop: '1px solid #334155',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <input
                    type="text"
                    value={manualTranscriptInput}
                    onChange={(e) => setManualTranscriptInput(e.target.value)}
                    placeholder="Type spoken speech or comment..."
                    style={{
                      flex: 1,
                      backgroundColor: '#0f172a',
                      border: '1px solid #475569',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      color: '#f8fafc',
                      fontSize: '0.8rem',
                      outline: 'none'
                    }}
                  />
                  <button
                    type="submit"
                    disabled={!manualTranscriptInput.trim()}
                    style={{
                      backgroundColor: manualTranscriptInput.trim() ? '#3b82f6' : '#334155',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      padding: '6px 10px',
                      cursor: manualTranscriptInput.trim() ? 'pointer' : 'default',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                      fontSize: '0.78rem',
                      fontWeight: 600
                    }}
                    title="Send to Live Transcript & Subtitles"
                  >
                    <Send size={13} />
                    <span>Send</span>
                  </button>
                </form>
              </div>
            )}
          </div>
        )}

      </div>

      {/* 3. BOTTOM CONTROL TOOLBAR */}
      <div style={{
        padding: '1rem',
        backgroundColor: '#0f172a',
        borderTop: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.85rem',
        zIndex: 10
      }}>
        {/* Microphone Toggle */}
        <button
          onClick={toggleMic}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: micActive ? '#1e293b' : '#ef4444',
            color: 'white',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title={micActive ? 'Mute Microphone' : 'Unmute Microphone'}
        >
          {micActive ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        {/* Video Camera Toggle */}
        <button
          onClick={toggleVideo}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: cameraActive && videoEnabled ? '#1e293b' : '#ef4444',
            color: 'white',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title={cameraActive && videoEnabled ? 'Turn Off Camera' : 'Turn On Camera'}
        >
          {cameraActive && videoEnabled ? <VideoIcon size={20} /> : <VideoOff size={20} />}
        </button>

        {/* Live Captions Toggle (CC) */}
        <button
          onClick={() => setShowCaptions(!showCaptions)}
          style={{
            width: '48px',
            height: '48px',
            borderRadius: '50%',
            backgroundColor: showCaptions ? '#3b82f6' : '#1e293b',
            color: 'white',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
            transition: 'all 0.15s ease'
          }}
          title={showCaptions ? 'Hide Live Captions' : 'Show Live Captions'}
        >
          <Captions size={20} />
        </button>

        {/* Real-Time Transcript Drawer Toggle */}
        <button
          onClick={() => {
            setShowDrawer(true);
            setDrawerTab('transcript');
          }}
          style={{
            padding: '0 16px',
            height: '48px',
            borderRadius: '9999px',
            backgroundColor: showDrawer && drawerTab === 'transcript' ? '#6366f1' : '#1e293b',
            color: 'white',
            border: '1px solid #334155',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer',
            fontSize: '0.85rem',
            fontWeight: 600
          }}
          title="Open Live Transcript"
        >
          <FileText size={16} />
          <span>Live Transcript</span>
        </button>

        {/* Leave Meeting Button */}
        <button
          onClick={handleLeaveMeeting}
          style={{
            padding: '0.65rem 1.4rem',
            borderRadius: '9999px',
            backgroundColor: '#dc2626',
            color: 'white',
            border: 'none',
            fontWeight: 600,
            fontSize: '0.88rem',
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            cursor: 'pointer'
          }}
          title="Leave Meeting"
        >
          <PhoneOff size={16} />
          <span>Leave Call</span>
        </button>

        {/* End Meeting Button (Host / Leader Only) */}
        {isHost && (
          <button
            onClick={handleEndMeeting}
            style={{
              padding: '0.65rem 1.4rem',
              borderRadius: '9999px',
              backgroundColor: '#7f1d1d',
              color: '#fecaca',
              border: '1px solid #991b1b',
              fontWeight: 600,
              fontSize: '0.88rem',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              cursor: 'pointer'
            }}
            title="End meeting for all participants"
          >
            <span>End Meeting for All</span>
          </button>
        )}
      </div>

    </div>
  );
};

// Subcomponent: Remote Participant Video Tile with attached Stream, dedicated Audio playback & VAD
const RemoteVideoTile = ({ socketId, peer, getInitials }) => {
  const videoRef = useRef(null);
  const audioRef = useRef(null);
  const [isSpeakingRemote, setIsSpeakingRemote] = useState(false);

  useEffect(() => {
    let animFrame = null;
    let audioCtx = null;

    if (peer.stream) {
      console.log(`[RemoteTile] Attaching remote stream from ${peer.user_name} (${socketId}). Audio tracks:`, peer.stream.getAudioTracks().length, 'Video tracks:', peer.stream.getVideoTracks().length);
      
      if (videoRef.current) {
        videoRef.current.srcObject = peer.stream;
        videoRef.current.play().catch(e => {
          console.warn(`[RemoteTile] Video auto-play blocked for ${peer.user_name}:`, e.message);
        });
      }

      if (audioRef.current) {
        audioRef.current.srcObject = peer.stream;
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.then(() => {
            console.log(`[RemoteTile] Audio playback started successfully for ${peer.user_name} (${socketId})`);
          }).catch(err => {
            console.warn(`[RemoteTile] Audio auto-play BLOCKED by browser policy for ${peer.user_name}:`, err.name, err.message);
          });
        }
      }

      // Voice Activity Detection for Remote Peer
      try {
        const audioTracks = peer.stream.getAudioTracks();
        if (audioTracks.length > 0) {
          const AudioContextClass = window.AudioContext || window.webkitAudioContext;
          if (AudioContextClass) {
            audioCtx = new AudioContextClass();
            if (audioCtx.state === 'suspended') {
              audioCtx.resume().catch(() => {});
            }
            const source = audioCtx.createMediaStreamSource(peer.stream);
            const analyser = audioCtx.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.3;
            source.connect(analyser);

            const timeData = new Uint8Array(analyser.fftSize);
            const checkRemoteSpeaking = () => {
              if (audioCtx && audioCtx.state === 'suspended') {
                audioCtx.resume().catch(() => {});
              }
              analyser.getByteTimeDomainData(timeData);
              let sumSquares = 0;
              for (let i = 0; i < timeData.length; i++) {
                const norm = (timeData[i] - 128) / 128;
                sumSquares += norm * norm;
              }
              const rms = Math.sqrt(sumSquares / timeData.length);
              const vol = Math.min(100, Math.round(rms * 280));
              setIsSpeakingRemote(vol > 8 && peer.audio_enabled);
              animFrame = requestAnimationFrame(checkRemoteSpeaking);
            };
            checkRemoteSpeaking();
          }
        }
      } catch (vadErr) {
        console.warn(`[RemoteTile] VAD error for ${peer.user_name}:`, vadErr.message);
      }
    }

    return () => {
      if (animFrame) cancelAnimationFrame(animFrame);
      if (audioCtx) {
        audioCtx.close().catch(() => {});
      }
    };
  }, [peer.stream, peer.user_name, peer.audio_enabled, socketId]);

  return (
    <div style={{
      position: 'relative',
      backgroundColor: '#1e293b',
      borderRadius: '12px',
      overflow: 'hidden',
      aspectRatio: '16/9',
      border: isSpeakingRemote ? '2px solid #22c55e' : '2px solid #334155',
      boxShadow: isSpeakingRemote ? '0 0 16px rgba(34, 197, 94, 0.4)' : '0 4px 12px rgba(0,0,0,0.4)',
      transition: 'border 0.2s ease, box-shadow 0.2s ease',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      {/* Dedicated audio element ensuring voice audio ALWAYS plays regardless of video status */}
      <audio ref={audioRef} autoPlay playsInline />

      <video
        ref={videoRef}
        autoPlay
        playsInline
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: peer.video_enabled ? 'block' : 'none'
        }}
      />

      {!peer.video_enabled && (
        <div style={{ textAlign: 'center' }}>
          <div className="avatar" style={{ width: '72px', height: '72px', fontSize: '1.6rem', margin: '0 auto 8px', backgroundColor: '#8b5cf6', color: 'white' }}>
            {getInitials(peer.user_name)}
          </div>
          <div style={{ fontWeight: 600, fontSize: '0.95rem' }}>{peer.user_name}</div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Camera Off</div>
        </div>
      )}

      <div style={{
        position: 'absolute',
        bottom: '10px',
        left: '10px',
        backgroundColor: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(4px)',
        padding: '3px 10px',
        borderRadius: '6px',
        fontSize: '0.8rem',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: 'white',
        fontWeight: 600
      }}>
        <span>{peer.user_name}</span>
        {peer.audio_enabled ? (
          <Mic size={13} color={isSpeakingRemote ? '#22c55e' : '#94a3b8'} />
        ) : (
          <MicOff size={13} color="#ef4444" />
        )}
      </div>
    </div>
  );
};

export default MeetingRoom;
