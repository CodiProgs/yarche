from django.db import models
from users.models import User


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

    def __str__(self):
        return f"{self.name} ({self.user})"

    class Meta:
        verbose_name = "Документ"
        verbose_name_plural = "Документы"

