from datetime import datetime
from flask import Blueprint, request, jsonify
import google.generativeai as genai
from config import Config
from models import Task, Meeting, Decision, User
from utils.auth import token_required
from services.gemini_service import get_gemini_api_key

assistant_bp = Blueprint('assistant', __name__)

def generate_local_assistant_reply(current_user, user_message, tasks_context, team_meetings, recent_decisions):
    """
    Fast rule-based intelligence fallback if Gemini API is unreachable or times out.
    Enforces 100% privacy and zero hallucinations.
    """
    msg_lower = user_message.lower()
    
    # 1. "what should I work on today?" / tasks / priority / todo
    if any(k in msg_lower for k in ['work on', 'today', 'priority', 'task', 'pending', 'todo', 'schedule', 'agenda']):
        reply_lines = [f"### 📋 Daily Task Briefing for **{current_user.name}** ({current_user.role.title()})\n"]
        if not tasks_context:
            reply_lines.append("🎉 You currently have **no pending tasks assigned to you**! You're completely up to date.\n")
        else:
            # Check rejected / rework tasks
            rejected = [t for t in tasks_context if t.get('status') == 'rejected']
            if rejected:
                reply_lines.append("⚠️ **Needs Urgent Rework (Rejected by Leader):**")
                for t in rejected:
                    feedback_str = f" *(Feedback: \"{t['rejection_feedback']}\")*" if t.get('rejection_feedback') else ""
                    reply_lines.append(f"- **{t['title']}** (Progress: {t['progress']}){feedback_str}")
                reply_lines.append("")
            
            # Check high priority / in progress
            in_prog = [t for t in tasks_context if t.get('status') in ['assigned', 'in_progress', 'submitted']]
            if in_prog:
                reply_lines.append("🚀 **Recommended Action Items for Today:**")
                for t in in_prog:
                    reply_lines.append(f"- **{t['title']}** — Priority: `{t['priority'].upper()}` | Deadline: `{t['deadline']}` | Progress: `{t['progress']}` (Status: {t['status']})")
                reply_lines.append("")

        if team_meetings:
            reply_lines.append("📅 **Upcoming Team Meetings:**")
            for m in team_meetings:
                reply_lines.append(f"- **{m['title']}** (`{m['id']}`) at `{m['start_time']}`")
            reply_lines.append("")

        return "\n".join(reply_lines)
        
    # 2. "decision" / "decisions" / "meeting"
    elif any(k in msg_lower for k in ['decision', 'decisions', 'meeting', 'discussed', 'agreed']):
        reply_lines = [f"### 🎯 Recent Team Meeting Decisions\n"]
        if not recent_decisions:
            reply_lines.append("No meeting decisions have been recorded in your team yet.")
        else:
            for d in recent_decisions:
                reason_str = f" — *Reason: {d['reason']}*" if d.get('reason') else ""
                reply_lines.append(f"- **Meeting {d['meeting_id']}**: {d['decision']}{reason_str}")
        return "\n".join(reply_lines)

    # 3. Default structured response
    else:
        return f"""I am currently operating in local workspace mode.

I can answer questions regarding your assigned tasks, team meetings, and recent decisions. For general programming or technical questions, please ensure your internet connection and Gemini API key are active."""

def query_gemini_safe(api_key, full_prompt, timeout_seconds=15):
    """
    Safely queries Gemini API with candidate model fallbacks and error logging.
    """
    if not api_key:
        print(">> [Pex Error]: No GEMINI_API_KEY set in backend/.env")
        return None

    try:
        genai.configure(api_key=api_key, transport='rest')
        candidate_models = [
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
            "gemini-1.5-pro",
            "gemini-flash-latest",
            "gemini-flash-lite-latest",
            "gemini-3.5-flash"
        ]
        for m_name in candidate_models:
            try:
                print(f">> [Pex Gemini] Querying model '{m_name}'...")
                model = genai.GenerativeModel(model_name=m_name)
                response = model.generate_content(full_prompt)
                if response and response.text:
                    print(f">> [Pex Gemini Success]: Response received from '{m_name}' ({len(response.text)} chars)")
                    return response.text.strip()
            except Exception as e:
                print(f">> [Pex Gemini Candidate '{m_name}' Failed]: {e}")
                continue
    except Exception as err:
        print(f">> [Pex Gemini Fatal Error]: {err}")
    return None

@assistant_bp.route('/chat', methods=['POST'])
@token_required
def chat_with_assistant(current_user):
    data = request.get_json() or {}
    user_message = data.get('message', '').strip()
    history = data.get('history', [])

    if not user_message:
        return jsonify({'success': False, 'message': 'Message cannot be empty'}), 400

    # 1. Fetch strictly ONLY this user's assigned tasks (Privacy enforcement)
    user_tasks = Task.query.filter(
        Task.assigned_to == current_user.id,
        Task.status != 'suggested'
    ).order_by(Task.deadline.asc(), Task.priority.desc()).all()

    tasks_context = []
    for t in user_tasks:
        tasks_context.append({
            'title': t.title,
            'description': t.description,
            'status': t.status,
            'progress': f"{t.progress}%",
            'priority': t.priority,
            'deadline': t.deadline.strftime('%Y-%m-%d') if t.deadline else 'No deadline set',
            'rejection_feedback': t.rejection_feedback if t.status == 'rejected' else None
        })

    # 2. Fetch user's team upcoming meetings
    team_meetings = []
    if current_user.team_id:
        meetings = Meeting.query.filter(
            Meeting.team_id == current_user.team_id,
            Meeting.status.in_(['scheduled', 'live'])
        ).order_by(Meeting.start_time.asc()).limit(5).all()

        for m in meetings:
            team_meetings.append({
                'id': m.meeting_id,
                'title': m.title,
                'status': m.status,
                'start_time': m.start_time.strftime('%Y-%m-%d %H:%M') if m.start_time else 'Scheduled'
            })

    # 3. Fetch recent team decisions
    recent_decisions = []
    if current_user.team_id:
        meetings_all = Meeting.query.filter_by(team_id=current_user.team_id).all()
        m_ids = [m.meeting_id for m in meetings_all]
        if m_ids:
            decs = Decision.query.filter(Decision.meeting_id.in_(m_ids)).order_by(Decision.created_at.desc()).limit(8).all()
            for d in decs:
                recent_decisions.append({
                    'decision': d.decision_text,
                    'reason': d.reason,
                    'meeting_id': d.meeting_id
                })

    # Query Gemini or Fallback
    api_key = get_gemini_api_key()
    ai_reply = None

    if api_key:
        today_str = datetime.utcnow().strftime('%A, %B %d, %Y')
        system_context = f"""You are 'Pex', a highly capable, intelligent, and helpful AI assistant for {current_user.name} ({current_user.role.title()}).
Today's date is: {today_str}.

USER WORKSPACE CONTEXT (LIVE DATA):
- User Name: {current_user.name}
- Role: {current_user.role}
- Assigned Tasks: {tasks_context}
- Upcoming Meetings: {team_meetings}
- Recent Decisions: {recent_decisions}

CAPABILITIES & GUIDELINES:
1. You can answer ALL types of questions:
   - General technical & software development questions (e.g. Flutter, React, Python, Git, Docker, API design, debugging, best practices, etc.).
   - Workspace & productivity questions (e.g. "What should I work on today?", "Summarize my meetings", "What were our decisions?").
   - General knowledge, explanations, writing, and problem-solving.
2. If the user asks about their tasks, schedule, priorities, meetings, or decisions, reference their USER WORKSPACE CONTEXT above to give precise and personalized answers.
3. If the user asks general or technical questions (like how to install Flutter, write code, or explain concepts), provide comprehensive, detailed, step-by-step answers with clear formatting and code blocks where helpful.
4. Format all responses cleanly using Markdown (bold text, numbered lists, bullet points, headers, and code blocks).
"""
        history_str = ""
        if isinstance(history, list) and history:
            history_str = "\nRECENT CONVERSATION:\n"
            for h in history[-6:]:
                sender = "User" if h.get("sender") == "user" else "Pex"
                text = h.get("text", "").strip()
                if text:
                    history_str += f"{sender}: {text}\n"

        full_prompt = f"{system_context}\n{history_str}\nUSER MESSAGE: {user_message}\n\nASSISTANT RESPONSE:"
        ai_reply = query_gemini_safe(api_key, full_prompt, timeout_seconds=15)

    # If Gemini timed out or had no response, use local contextual intelligence
    if not ai_reply:
        ai_reply = generate_local_assistant_reply(current_user, user_message, tasks_context, team_meetings, recent_decisions)

    return jsonify({
        'success': True,
        'reply': ai_reply,
        'context_summary': {
            'tasks_count': len(user_tasks),
            'meetings_count': len(team_meetings)
        }
    }), 200
