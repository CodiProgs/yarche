from django.db import models


class Client(models.Model):
    name = models.CharField(max_length=255, verbose_name="Клиент")
    comment = models.TextField(verbose_name="Комментарий", blank=True, null=True)
    inn = models.CharField(max_length=12, verbose_name="ИНН", blank=True, null=True)
    legal_name = models.CharField(
        max_length=255, verbose_name="Юр. название", blank=True, null=True
    )
    director = models.CharField(
        max_length=255, verbose_name="Директор", blank=True, null=True
    )
    ogrn = models.CharField(max_length=13, verbose_name="ОГРН", blank=True, null=True)
    basis = models.CharField(
        max_length=255, verbose_name="Основание", blank=True, null=True
    )
    legal_address = models.TextField(
        verbose_name="Адрес юридический", blank=True, null=True
    )
    actual_address = models.TextField(
        verbose_name="Адрес фактический", blank=True, null=True
    )
    balance = models.DecimalField(
        decimal_places=2, verbose_name="Баланс", default=0, max_digits=12
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Клиент"
        verbose_name_plural = "Клиенты"
