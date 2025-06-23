from django.db import models


class Permission(models.Model):
    codename = models.CharField(max_length=255, unique=True, verbose_name="Название")
    description = models.CharField(max_length=255, verbose_name="Описание", unique=True)

    def __str__(self):
        return self.description

    class Meta:
        verbose_name = "Право"
        verbose_name_plural = "Права"
