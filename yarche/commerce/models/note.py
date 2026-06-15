from django.contrib.auth import get_user_model
from django.db import models

User = get_user_model()


class ManagerNote(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="manager_notes",
        verbose_name="Менеджер",
    )
    date = models.DateField(verbose_name="Дата")
    scheduled_time = models.TimeField(
        null=True,
        blank=True,
        verbose_name="Время выполнения",
    )
    text = models.TextField(verbose_name="Заметка")
    notified_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Напоминание отправлено",
    )
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Создано")
    updated_at = models.DateTimeField(auto_now=True, verbose_name="Обновлено")

    class Meta:
        verbose_name = "Заметка менеджера"
        verbose_name_plural = "Заметки менеджеров"
        ordering = ["date", "scheduled_time", "id"]

    def __str__(self):
        time_part = self.scheduled_time.strftime("%H:%M") if self.scheduled_time else "--:--"
        return f"{self.user} - {self.date} {time_part}"
