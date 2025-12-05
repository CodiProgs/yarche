from django.db import models
from django.utils import timezone
import uuid

class FileAccessToken(models.Model):
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    file = models.ForeignKey('commerce.Document', on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey('users.User', on_delete=models.CASCADE, null=True, blank=True)  # добавлено null=True, blank=True

    def is_valid(self):
        return timezone.now() < self.expires_at