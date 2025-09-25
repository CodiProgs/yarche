from django.db import models
from .client import Client
from .product import Product
from .document import Document
from users.models import User


class OrderStatus(models.Model):
    name = models.CharField(verbose_name="Статус заказа", max_length=255)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Статус заказа"
        verbose_name_plural = "Статусы заказов"


class Order(models.Model):
    status = models.ForeignKey(
        OrderStatus,
        on_delete=models.PROTECT,
        verbose_name="Статус заказа",
        related_name="orders",
    )
    manager = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        verbose_name="Менеджер",
        related_name="orders",
        blank=True,
        null=True,
    )
    client = models.ForeignKey(
        Client,
        on_delete=models.PROTECT,
        verbose_name="Клиент",
        related_name="orders",
    )
    product = models.ForeignKey(
        Product,
        on_delete=models.PROTECT,
        verbose_name="Продукция",
        related_name="orders",
    )
    amount = models.DecimalField(
        decimal_places=2, verbose_name="Сумма заказа", max_digits=12
    )
    paid_amount = models.DecimalField(
        decimal_places=2,
        verbose_name="Оплаченная сумма",
        max_digits=12,
        default=0,
        help_text="Сумма, которая уже была оплачена по данному заказу",
    )
    created = models.DateTimeField(auto_now_add=True, verbose_name="Создан")
    deadline = models.DateTimeField(verbose_name="Срок сдачи", blank=True, null=True)
    documents = models.ForeignKey(
        Document,
        on_delete=models.PROTECT,
        verbose_name="Док-ты",
        related_name="orders",
        blank=True,
        null=True,
    )
    comment = models.TextField(verbose_name="Комментарий", blank=True, null=True)
    additional_info = models.TextField(
        verbose_name="Дополнительная информация", blank=True, null=True
    )
    client_object = models.ForeignKey(
        'ClientObject',
        on_delete=models.PROTECT,
        verbose_name="Объект клиента",
        related_name="orders",
        blank=True,
        null=True,
    )

    def __str__(self):
        return f"{self.id}"

    class Meta:
        verbose_name = "Заказ"
        verbose_name_plural = "Заказы"
