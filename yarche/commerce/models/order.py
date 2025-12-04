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

class Department(models.Model):
    name = models.CharField(verbose_name="Название отдела", max_length=255)
    slug = models.SlugField(
        verbose_name="Slug",
        max_length=255,
        unique=True,
        help_text="URL-идентификатор отдела (например: printing, cutting)",
        blank=True,
        null=True,
    )
    
    def __str__(self):
        return self.name

    def get_department_users(self):
        """
        Возвращает пользователей, у которых тип пользователя совпадает с названием отдела
        """
        from users.models import User
        return User.objects.filter(user_type__name=self.name)
    
    @property
    def users(self):
        """
        Свойство для удобного доступа к пользователям отдела
        """
        return self.get_department_users()

    class Meta:
        verbose_name = "Отдел"
        verbose_name_plural = "Отделы"

class OrderWorkStatus(models.Model):
    name = models.CharField(verbose_name="Название статуса", max_length=255)
    department = models.ForeignKey(
        'Department',
        on_delete=models.CASCADE,
        verbose_name="Отдел (если статус уникален для отдела)",
        related_name="unique_statuses",
        blank=True,
        null=True,
        help_text="Оставьте пустым для общих статусов"
    )

    def __str__(self):
        if self.department:
            return f"{self.department.name} - {self.name}"
        return self.name

    class Meta:
        verbose_name = "Статус работы отдела"
        verbose_name_plural = "Статусы работ отделов"
        ordering = ['name']

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
    unit_price = models.DecimalField(
        decimal_places=0, 
        verbose_name="Цена за единицу", 
        max_digits=12,
        blank=True,
        null=True,
        help_text="Цена за одну единицу продукции"
    )
    quantity = models.DecimalField(
        decimal_places=0,
        verbose_name="Количество",
        max_digits=12,
        blank=True,
        null=True,
        help_text="Количество единиц продукции"
    )
    amount = models.DecimalField(
        decimal_places=0, verbose_name="Сумма", max_digits=12
    )
    paid_amount = models.DecimalField(
        decimal_places=0,
        verbose_name="Оплаченная сумма",
        max_digits=12,
        default=0,
        help_text="Сумма, которая уже была оплачена по данному заказу",
    )
    created = models.DateTimeField(auto_now_add=True, verbose_name="Создан")
    deadline = models.DateTimeField(verbose_name="Срок сдачи", blank=True, null=True)
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
    required_documents = models.BooleanField(
        verbose_name="Документы",
        default=False,
        help_text="Документы"
    )
    archived_at = models.DateTimeField(
        verbose_name="Отправлено в архив", null=True, blank=True
    )

    viewers = models.ManyToManyField(
        User,
        verbose_name="Доп. пользователи с доступом",
        related_name="viewable_orders",
        blank=True,
        help_text="Пользователи, которые могут просматривать этот заказ"
    )

    def __str__(self):
        return f"{self.id}"

    class Meta:
        verbose_name = "Заказ"
        verbose_name_plural = "Заказы"

class OrderDepartmentWork(models.Model):
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        verbose_name="Заказ",
        related_name="department_works",
    )
    department = models.ForeignKey(
        Department,
        on_delete=models.PROTECT,
        verbose_name="Отдел",
        related_name="order_works",
    )
    executor = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        verbose_name="Исполнитель",
        related_name="department_works",
        blank=True,
        null=True,
        help_text="Ответственный исполнитель в отделе"
    )
    started_at = models.DateTimeField(
        verbose_name="Начало работы",
        blank=True,
        null=True,
        help_text="Когда работа была начата в отделе"
    )
    completed_at = models.DateTimeField(
        verbose_name="Окончание работы",
        blank=True,
        null=True,
        help_text="Когда работа была завершена в отделе"
    )
    status = models.ForeignKey(
        OrderWorkStatus,
        on_delete=models.PROTECT,
        verbose_name="Статус работы",
        related_name="order_works",
        blank=True,
        null=True,
    )

    def __str__(self):
        return f"Заказ {self.order.id} - {self.department.name}"

    def get_current_status(self):
        """Возвращает текущий статус работы отдела"""
        return self.status.name if self.status else "Не назначен"
    
    def get_formatted_started_at(self):
        """Возвращает отформатированную дату начала работы"""
        from django.utils.timezone import localtime
        if self.started_at:
            return localtime(self.started_at).strftime('%d.%m.%Y %H:%M')
        return None
    
    def get_formatted_completed_at(self):
        """Возвращает отформатированную дату завершения работы"""
        from django.utils.timezone import localtime
        if self.completed_at:
            return localtime(self.completed_at).strftime('%d.%m.%Y %H:%M')
        return None
    
    def is_completed(self):
        """Проверяет, завершена ли работа"""
        return self.completed_at is not None
    
    def is_in_progress(self):
        """Проверяет, находится ли работа в процессе"""
        return self.started_at is not None and self.completed_at is None

    class Meta:
        verbose_name = "Работа отдела по заказу"
        verbose_name_plural = "Работы отделов по заказам"
        unique_together = [['order', 'department']]
        ordering = ['order', 'department']

class OrderDepartmentWorkMessage(models.Model):
    order_work = models.ForeignKey(
        OrderDepartmentWork,
        on_delete=models.CASCADE,
        verbose_name="Работа отдела",
        related_name="messages",
    )
    author = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        verbose_name="Автор",
        related_name="sent_messages",
    )
    recipient = models.ForeignKey(
        User,
        on_delete=models.PROTECT,
        verbose_name="Получатель",
        related_name="received_messages",
        blank=True,
        null=True,
        help_text="Конкретный получатель сообщения (если указан)"
    )
    created = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Создано"
    )
    message = models.TextField(
        verbose_name="Сообщение"
    )
    is_read = models.BooleanField(
        verbose_name="Прочитано",
        default=False,
        help_text="Отметка о прочтении сообщения"
    )
    
    def __str__(self):
        return f"Сообщение от {self.author} для заказа {self.order_work.order.id}"
    
    def get_formatted_created(self):
        """Возвращает отформатированную дату создания"""
        from django.utils.timezone import localtime
        return localtime(self.created).strftime('%d.%m.%Y %H:%M')
    
    def mark_as_read(self):
        """Отмечает сообщение как прочитанное"""
        if not self.is_read:
            self.is_read = True
            self.save(update_fields=['is_read'])

    class Meta:
        verbose_name = "Сообщение по работе отдела"
        verbose_name_plural = "Сообщения по работам отделов"
        ordering = ['-created']
