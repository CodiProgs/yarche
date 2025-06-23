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
    file_type = models.ForeignKey(
        FileType,
        on_delete=models.PROTECT,
        verbose_name="Тип файла",
        related_name="documents",
    )
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        verbose_name="Пользователь",
        related_name="documents",
    )
    file = models.FileField(upload_to="orders/", verbose_name="Файл")
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name="Загружен")
    size = models.PositiveIntegerField(verbose_name="Размер")

    def __str__(self):
        return f"{self.file.name} ({self.file_type.name})"

    class Meta:
        verbose_name = "Документ"
        verbose_name_plural = "Документы"
