from datetime import datetime, date

def calculate_task_risk(task):
    """
    Calculates a rule-based risk indicator ('High', 'Medium', 'Low', 'None')
    and provides a human-readable reason based on deadline proximity, progress, and status.
    """
    status = (task.status or 'pending').lower()
    progress = task.progress or 0

    if status == 'completed':
        return {
            'level': 'None',
            'label': 'Completed',
            'color': '#10b981',
            'badge_class': 'badge-success',
            'reason': 'Task is completed and verified.'
        }

    if not task.deadline:
        return {
            'level': 'Medium',
            'label': 'Medium Risk',
            'color': '#f59e0b',
            'badge_class': 'badge-warning',
            'reason': 'No deadline set. Unscheduled task risk.'
        }

    today = datetime.utcnow().date()
    deadline_date = task.deadline.date() if isinstance(task.deadline, datetime) else task.deadline
    delta_days = (deadline_date - today).days

    # 1. Overdue
    if delta_days < 0:
        days_past = abs(delta_days)
        return {
            'level': 'High',
            'label': 'High Risk (Overdue)',
            'color': '#ef4444',
            'badge_class': 'badge-danger',
            'reason': f'Overdue by {days_past} day(s) with {progress}% progress!'
        }

    # 2. Due Today or Tomorrow (0 - 1 days)
    if delta_days <= 1:
        if progress < 50:
            return {
                'level': 'High',
                'label': 'High Risk (Due Soon)',
                'color': '#ef4444',
                'badge_class': 'badge-danger',
                'reason': f'Due in {delta_days} day(s) with only {progress}% progress.'
            }
        else:
            return {
                'level': 'Medium',
                'label': 'Medium Risk',
                'color': '#f59e0b',
                'badge_class': 'badge-warning',
                'reason': f'Due in {delta_days} day(s) with {progress}% progress.'
            }

    # 3. Due within 2-3 days
    if delta_days <= 3:
        if status == 'rejected':
            return {
                'level': 'High',
                'label': 'High Risk (Needs Rework)',
                'color': '#ef4444',
                'badge_class': 'badge-danger',
                'reason': f'Leader rejected submission. Due in {delta_days} days!'
            }
        if progress < 25:
            return {
                'level': 'High',
                'label': 'High Risk',
                'color': '#ef4444',
                'badge_class': 'badge-danger',
                'reason': f'Due in {delta_days} days with only {progress}% progress.'
            }
        if progress < 75:
            return {
                'level': 'Medium',
                'label': 'Medium Risk',
                'color': '#f59e0b',
                'badge_class': 'badge-warning',
                'reason': f'Due in {delta_days} days ({progress}% progress).'
            }
        return {
            'level': 'Low',
            'label': 'Low Risk',
            'color': '#10b981',
            'badge_class': 'badge-success',
            'reason': f'On track for deadline in {delta_days} days.'
        }

    # 4. Due within 4-7 days
    if delta_days <= 7:
        if progress == 0:
            return {
                'level': 'Medium',
                'label': 'Medium Risk (Not Started)',
                'color': '#f59e0b',
                'badge_class': 'badge-warning',
                'reason': f'Due in {delta_days} days and not started yet (0%).'
            }
        return {
            'level': 'Low',
            'label': 'Low Risk',
            'color': '#10b981',
            'badge_class': 'badge-success',
            'reason': f'Healthy progress ({progress}%) for deadline in {delta_days} days.'
        }

    # 5. Over a week away
    return {
        'level': 'Low',
        'label': 'Low Risk',
        'color': '#10b981',
        'badge_class': 'badge-success',
        'reason': f'Comfortable timeline with {delta_days} days remaining.'
    }
