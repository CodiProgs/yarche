from django.db import models
from .bank_account import BankAccount
from commerce.models import Order, Client
from django.core.exceptions import ValidationError


class TransactionCategory(models.Model):
    TYPE_CHOICES = (
        ("income", "+"),
        ("expense", "-"),
    )

    name = models.CharField(max_length=255, verbose_name="Категория операции")
    type = models.CharField(
        max_length=255, choices=TYPE_CHOICES, verbose_name="Знак (+/-)"
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Категория операции"
        verbose_name_plural = "Категории операций"
        ordering = ["-type", "name"]

    def clean(self):
        if not self.name:
            raise ValidationError({"name": "Название категории не может быть пустым"})

        if self.type not in dict(self.TYPE_CHOICES):
            raise ValidationError({"type": "Неверный тип категории"})


class Transaction(models.Model):
    class TransactionType(models.TextChoices):
        INCOME = "income", "Приход"
        EXPENSE = "expense", "Расход"
        ORDER_PAYMENT = "order_payment", "Оплата заказа"
        TRANSFER = "transfer", "Перевод между счетами"
        CLIENT_ACCOUNT_DEPOSIT = "client_account_deposit", "Внос на ЛС клиента"
        CLIENT_ACCOUNT_PAYMENT = "client_account_payment", "Оплата с ЛС клиента"

    category = models.ForeignKey(
        TransactionCategory,
        on_delete=models.SET_NULL,
        verbose_name="Категория",
        blank=True,
        null=True,
    )
    type = models.CharField(
        max_length=255,
        choices=TransactionType.choices,
        verbose_name="Тип операции",
    )
    bank_account = models.ForeignKey(
        BankAccount, on_delete=models.CASCADE, verbose_name="Счет"
    )
    amount = models.DecimalField(decimal_places=2, verbose_name="Сумма", max_digits=12)
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, verbose_name="Клиент", blank=True, null=True
    )
    order = models.ForeignKey(
        Order, on_delete=models.CASCADE, verbose_name="Заказ №", null=True, blank=True
    )
    comment = models.TextField(verbose_name="Комментарий", null=True, blank=True)
    created = models.DateTimeField(auto_now_add=True, verbose_name="Создан")
    report_date = models.DateField(verbose_name="Месяц реализации", null=True, blank=True)
    completed_date = models.DateField(
        verbose_name="Дата выполнения", null=True, blank=True
    )
    
    created_by = models.ForeignKey(
        "users.User",
        on_delete=models.SET_NULL,
        verbose_name="Создал",
        null=True,
        blank=True,
    )
    related_transaction = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        verbose_name="Связанная транзакция",
        null=True,
        blank=True,
        related_name="linked_transaction",
    )

    def __str__(self):
        return f"{self.get_type_display()} - {self.category.name if self.category else (self.order if self.order else (self.client.name if self.client else 'Без данных'))}"

    class Meta:
        verbose_name = "Транзакция"
        verbose_name_plural = "Транзакции"

    def clean(self):
        if self.type in ["income", "expense"] and not self.category:
            raise ValidationError(
                {"category": "Для доходов и расходов категория обязательна"}
            )

        if (
            self.category
            and self.type in ["income", "expense"]
            and self.category.type != self.type
        ):
            raise ValidationError(
                {"category": "Тип категории должен соответствовать типу транзакции"}
            )

        if self.type == "order_payment" and not self.order:
            raise ValidationError({"order": "Для оплаты заказа нужно указать заказ"})

        if self.type in ["income", "order_payment"] and self.amount <= 0:
            raise ValidationError({"amount": "Сумма должна быть положительной"})

        if self.type == "expense" and self.amount >= 0:
            raise ValidationError({"amount": "Сумма должна быть отрицательной"})
