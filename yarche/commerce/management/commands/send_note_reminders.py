from django.core.management.base import BaseCommand

from commerce.note_notifications import notify_all_due_notes


class Command(BaseCommand):
    help = "Создает уведомления по наступившим заметкам"

    def handle(self, *args, **kwargs):
        created_count = notify_all_due_notes()
        self.stdout.write(
            self.style.SUCCESS(
                f"Создано уведомлений по заметкам: {created_count}"
            )
        )