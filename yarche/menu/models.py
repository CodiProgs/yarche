from django.db import models
from django.urls import reverse

class MenuItem(models.Model):
    title = models.CharField("Закладка", max_length=255, unique=True)
    url_name = models.CharField("Имя URL", max_length=255, unique=True)

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = "Пункт меню"
        verbose_name_plural = "Пункты меню"

    @property
    def full_url(self):
        try:
            return reverse(self.url_name)
        except Exception:
            return f"/{self.url_name}/"