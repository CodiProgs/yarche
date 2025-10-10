from django.db import models
from users.models import User
from urllib.parse import urlparse, unquote
import os


class FileType(models.Model):
    name = models.CharField(verbose_name="Тип файла", max_length=255)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Тип файла"
        verbose_name_plural = "Типы файлов"


class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Пользователь")
    file_type = models.ForeignKey('FileType', on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Тип файла")
    name = models.CharField(max_length=255, verbose_name="Имя файла", default='', blank=True)
    file = models.FileField(upload_to="uploads/", verbose_name="Файл", null=True, blank=True)
    size = models.BigIntegerField(verbose_name="Размер файла (в байтах)", null=True, blank=True)
    url = models.URLField(verbose_name="URL файла", blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата загрузки")

    order = models.ForeignKey(
        'Order',
        on_delete=models.CASCADE,
        related_name='documents',
        null=True,
        blank=True,
        verbose_name='Заказ'
    )

    def __str__(self):
        return f"{self.name} ({self.user})"

    def save(self, *args, **kwargs):
        if self.file and not (self.name and str(self.name).strip()):
            try:
                self.name = os.path.basename(self.file.name)
            except Exception:
                pass


        changed = False
        changed_fields = []

        if self.file:
            try:
                file_size = getattr(self.file, "size", None)
            except Exception:
                file_size = None
            if file_size is not None and (self.size is None or self.size != file_size):
                self.size = file_size
                changed = True
                changed_fields.append("size")

            try:
                file_url = getattr(self.file, "url", None)
            except Exception:
                file_url = None
            if file_url and (not self.url or self.url != file_url):
                self.url = file_url
                changed = True
                changed_fields.append("url")
        else:
            if self.url and not (self.name and str(self.name).strip()):
                try:
                    parsed = urlparse(self.url)
                    base = os.path.basename(parsed.path)
                    if base:
                        self.name = unquote(base)
                        changed = True
                        changed_fields.append("name")
                except Exception:
                    pass

        if self.pk is None:
            super().save(*args, **kwargs)
            if changed and changed_fields:
                super().save(update_fields=changed_fields)
        else:
            if changed and changed_fields:
                super().save(update_fields=changed_fields)
            else:
                super().save(*args, **kwargs)

    class Meta:
        verbose_name = "Документ"
        verbose_name_plural = "Документы"

