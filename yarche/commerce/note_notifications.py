import datetime

from django.apps import apps
from django.db import transaction
from django.db.models import Q
from django.utils import timezone


def _note_due_at(note):
    if not note.scheduled_time:
        return None

    due_at = datetime.datetime.combine(note.date, note.scheduled_time)
    if timezone.is_naive(due_at):
        due_at = timezone.make_aware(due_at, timezone.get_current_timezone())
    return due_at


def create_due_notification_for_note(note, now=None):
    due_at = _note_due_at(note)
    if not due_at:
        return False

    now = now or timezone.now()
    if due_at > now:
        return False

    ManagerNote = apps.get_model("commerce", "ManagerNote")
    Notification = apps.get_model("users", "Notification")

    with transaction.atomic():
        updated = ManagerNote.objects.filter(
            pk=note.pk,
            notified_at__isnull=True,
        ).update(notified_at=now)

        if not updated:
            return False

        note_time = note.scheduled_time.strftime("%H:%M") if note.scheduled_time else "без времени"
        Notification.objects.create(
            user=note.user,
            message=f"Напоминание на {note.date.strftime('%d.%m.%Y')} {note_time}: {note.text}",
            url="/commerce/notes/",
            type="Заметки",
        )

    return True


def notify_due_notes_for_user(user, now=None):
    if not getattr(user, "is_authenticated", False):
        return 0

    now = now or timezone.now()
    local_now = timezone.localtime(now)
    today = local_now.date()
    current_time = local_now.time().replace(second=0, microsecond=0)

    ManagerNote = apps.get_model("commerce", "ManagerNote")
    due_notes = ManagerNote.objects.filter(
        user=user,
        scheduled_time__isnull=False,
        notified_at__isnull=True,
    ).filter(
        Q(date__lt=today)
        | Q(date=today, scheduled_time__lte=current_time)
    ).order_by("date", "scheduled_time", "id")

    created_count = 0
    for note in due_notes:
        if create_due_notification_for_note(note, now=now):
            created_count += 1

    return created_count


def notify_all_due_notes(now=None):
    now = now or timezone.now()
    local_now = timezone.localtime(now)
    today = local_now.date()
    current_time = local_now.time().replace(second=0, microsecond=0)

    ManagerNote = apps.get_model("commerce", "ManagerNote")
    due_notes = ManagerNote.objects.filter(
        scheduled_time__isnull=False,
        notified_at__isnull=True,
    ).filter(
        Q(date__lt=today)
        | Q(date=today, scheduled_time__lte=current_time)
    ).select_related("user").order_by("date", "scheduled_time", "id")

    created_count = 0
    for note in due_notes:
        if create_due_notification_for_note(note, now=now):
            created_count += 1

    return created_count