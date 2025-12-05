from django.core.management.base import BaseCommand
from users.models.access_token import FileAccessToken
from django.utils import timezone

class Command(BaseCommand):
    help = 'Удаляет просроченные токены доступа к файлам'

    def handle(self, *args, **kwargs):
        expired = FileAccessToken.objects.filter(expires_at__lt=timezone.now())
        count = expired.count()
        expired.delete()
        self.stdout.write(self.style.SUCCESS(f'Удалено {count} просроченных токенов'))