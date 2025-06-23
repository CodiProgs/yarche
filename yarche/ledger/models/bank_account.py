from django.db import models
from django.core.exceptions import ValidationError


class BankAccountType(models.Model):
    name = models.CharField(max_length=255, verbose_name="Тип счета")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Тип счета"
        verbose_name_plural = "Типы счетов"

    def clean(self):
        if not self.name:
            raise ValidationError({"name": "Название типа не может быть пустым"})


class BankAccount(models.Model):
    name = models.CharField(max_length=255, verbose_name="Счет")
    type = models.ForeignKey(
        BankAccountType,
        on_delete=models.CASCADE,
        verbose_name="Тип счета",
        related_name="bank_accounts",
    )
    balance = models.DecimalField(
        max_digits=12, decimal_places=2, verbose_name="Баланс", default=0
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Счет"
        verbose_name_plural = "Счета"

    def clean(self):
        if not self.name:
            raise ValidationError({"name": "Название счета не может быть пустым"})

        if not self.type:
            raise ValidationError({"type": "Тип счета не может быть пустым"})
