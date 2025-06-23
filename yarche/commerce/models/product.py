from django.db import models


class Product(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название типа продукции")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Продукция"
        verbose_name_plural = "Продукция"
