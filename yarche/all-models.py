import json
import os
import uuid
from urllib.parse import unquote, urlparse

from django.apps import apps
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AbstractUser
from django.core.exceptions import ValidationError
from django.db import models
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_date, parse_datetime
from django.utils.timezone import localtime

from chat.models import get_model_data
from commerce.models import (
    Client,
    Department,
    Order,
    OrderDepartmentWork,
    OrderStatus,
    OrderWorkStatus,
    Product,
)
from ledger.models import (
    BankAccount,
    BankAccountType,
    TransactionCategory,
)
from menu.models import MenuCategory, MenuItem
from users.models import Permission, User, UserType

tz = timezone

class ChatMessage(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Пользователь", blank=True, null=True)
    message = models.TextField(verbose_name="Сообщение пользователя", blank=True, null=True)
    response = models.TextField(verbose_name="Ответ системы", blank=True, null=True) 
    response_html = models.TextField(verbose_name="HTML ответ (таблицы)", blank=True, null=True) 
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата", blank=True, null=True)
    is_processed = models.BooleanField(default=False, verbose_name="Обработано", blank=True, null=True)

    class Meta:
        verbose_name = "Сообщение чата"
        verbose_name_plural = "Сообщения чата"
        ordering = ['created_at']

    def __str__(self):
        return f"{self.user.username}: {self.message[:30]}"
    

class ChatActionLog(models.Model):
    """Лог всех действий выполненных через чат-бота"""
    
    ACTION_CHOICES = [
        ('create', 'Создание'),
        ('update', 'Обновление'),
        ('delete', 'Удаление'),
        ('query', 'Запрос данных'),
    ]
    
    user = models.ForeignKey(
        'users.User',
        on_delete=models.CASCADE,
        verbose_name="Пользователь",
        related_name="chat_action_logs"
    )
    action = models.CharField(
        max_length=20,
        choices=ACTION_CHOICES,
        verbose_name="Действие"
    )
    model_name = models.CharField(
        max_length=100,
        verbose_name="Модель"
    )
    object_id = models.IntegerField(
        verbose_name="ID объекта",
        null=True,
        blank=True
    )
    object_repr = models.CharField(
        max_length=255,
        verbose_name="Представление объекта",
        help_text="Например: 'Счет 4' или 'Транзакция №10'"
    )
    query_text = models.TextField(
        verbose_name="Запрос пользователя"
    )
    data_before = models.JSONField(
        verbose_name="Данные до",
        null=True,
        blank=True,
        help_text="Состояние объекта до изменения"
    )
    data_after = models.JSONField(
        verbose_name="Данные после",
        null=True,
        blank=True,
        help_text="Состояние объекта после изменения"
    )
    created_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Дата и время"
    )
    can_restore = models.BooleanField(
        default=False,
        verbose_name="Можно восстановить"
    )
    restored = models.BooleanField(
        default=False,
        verbose_name="Восстановлено"
    )
    restored_at = models.DateTimeField(
        null=True,
        blank=True,
        verbose_name="Дата восстановления"
    )
    error_message = models.TextField(
        verbose_name="Ошибка",
        null=True,
        blank=True
    )
    
    class Meta:
        verbose_name = "Лог действия чата"
        verbose_name_plural = "Логи действий чата"
        ordering = ['-created_at']
    
    def __str__(self):
        return f"{self.get_action_display()}: {self.object_repr} ({self.user.username})"

    def restore(self):
        """Восстанавливает удаленный объект из data_before"""
        if not self.can_restore or self.action != 'delete':
            return False, "Восстановление невозможно"
        
        if self.restored:
            return False, "Уже восстановлено"
        
        try:
            
            app_label, model_name = self.model_name.split('.')
            model_class = apps.get_model(app_label, model_name)
            
            data = self.data_before.copy() if isinstance(self.data_before, dict) else json.loads(self.data_before)
            
            data.pop('id', None)
            data.pop('pk', None)
            
            for field in model_class._meta.get_fields():
                if isinstance(field, (models.DateTimeField, models.DateField)):
                    if field.name in data and data[field.name]:
                        try:
                            data[field.name] = parse_datetime(data[field.name])
                            if not data[field.name]:
                                data[field.name] = parse_date(data[field.name])
                        except:
                            data[field.name] = tz.now()
            
            for field in model_class._meta.get_fields():
                if isinstance(field, models.ForeignKey):
                    field_id_name = f'{field.name}_id'
                    if field_id_name in data and data[field_id_name]:
                        related_model = field.related_model
                        try:
                            related_model.objects.get(id=data[field_id_name])
                        except related_model.DoesNotExist:
                            data[field_id_name] = None
            
            obj = model_class.objects.create(**data)
            
            self.restored = True
            self.restored_at = tz.now()
            self.save()
            
            ChatActionLog.objects.create(
                user=self.user,
                action='create',
                model_name=self.model_name,
                object_id=obj.id,
                object_repr=f"Восстановлено: {self.object_repr}",
                query_text=f"Восстановление из лога #{self.id}",
                data_after=get_model_data(obj),
                can_restore=False
            )
            
            return True, f"Объект восстановлен (ID: {obj.id})"
        except Exception as e:
            return False, f"Ошибка восстановления: {str(e)}"

# ===== END: chat/models.py =====

# ===== BEGIN: menu/models.py =====



class MenuCategory(models.Model):
    CATEGORY_CHOICES = [
        ('ledger', 'Бухгалтерия'),
        ('commerce', 'Продажи'),
        ('departments', 'Отделы'),
        ('report', 'Отчет'),
        ('settings', 'Настройки')
    ]
    
    name = models.CharField("Название категории", max_length=50, choices=CATEGORY_CHOICES, unique=True)
    display_name = models.CharField("Отображаемое название", max_length=100)
    order = models.IntegerField("Порядок", default=0)
    
    class Meta:
        verbose_name = "Категория меню"
        verbose_name_plural = "Категории меню"
        ordering = ['order', 'name']
    
    def __str__(self):
        return self.display_name

class MenuItem(models.Model):
    title = models.CharField("Закладка", max_length=255, unique=True)
    url_name = models.CharField("Имя URL", max_length=255, unique=True)
    category = models.ForeignKey(
        MenuCategory, 
        on_delete=models.CASCADE, 
        related_name='menu_items',
        verbose_name="Категория",
        null=True,
        blank=True
    )

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
    
    @property
    def app_name(self):
        if ':' in self.url_name:
            return self.url_name.split(':')[0]
        return None

# ===== END: menu/models.py =====

# ===== BEGIN: commerce/models/client.py =====



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

class ClientObject(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name='client_objects')
    name = models.CharField(max_length=255, verbose_name="Название объекта")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Объект клиента"
        verbose_name_plural = "Объекты клиентов"

class Contact(models.Model):
    client = models.ForeignKey(
        Client, on_delete=models.CASCADE, related_name='contacts', verbose_name="Клиент"
    )

    last_name = models.CharField(max_length=150, verbose_name="Фамилия", blank=True, null=True)
    first_name = models.CharField(max_length=150, verbose_name="Имя", blank=True, null=True)
    patronymic = models.CharField(max_length=150, verbose_name="Отчество", blank=True, null=True)
    position = models.CharField(max_length=255, verbose_name="Должность", blank=True, null=True)

    phone1 = models.CharField(max_length=30, verbose_name="Телефон 1", blank=True, null=True)
    phone2 = models.CharField(max_length=30, verbose_name="Телефон 2", blank=True, null=True)
    phone3 = models.CharField(max_length=30, verbose_name="Телефон 3", blank=True, null=True)

    email = models.EmailField(verbose_name="Почта", blank=True, null=True)
    birthday = models.DateField(verbose_name="ДР", blank=True, null=True)

    socials = models.TextField(verbose_name="Социалки", blank=True, null=True)

    def __str__(self):
        parts = [self.last_name, self.first_name]
        name = " ".join([p for p in parts if p])
        return f"{name} ({self.position})" if name else f"Контакт #{self.pk}"

    class Meta:
        verbose_name = "Контакт клиента"
        verbose_name_plural = "Контакты клиентов"

class KanbanColumn(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название столбца")
    order = models.PositiveIntegerField(default=0, verbose_name="Порядок")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Столбец Kanban"
        verbose_name_plural = "Столбцы Kanban"
        ordering = ['order']

class KanbanClientPlacement(models.Model):
    client = models.ForeignKey(Client, on_delete=models.CASCADE, related_name="kanban_placements", verbose_name="Клиент")
    column = models.ForeignKey(KanbanColumn, on_delete=models.CASCADE, related_name="clients", verbose_name="Столбец")
    order = models.PositiveIntegerField(default=0, verbose_name="Порядок в столбце")
    added_at = models.DateTimeField(auto_now_add=True, verbose_name="Добавлен")

    def __str__(self):
        return f"{self.client.name} в {self.column.name}"

    class Meta:
        verbose_name = "Клиент на доске"
        verbose_name_plural = "Клиенты на доске"
        unique_together = ('client',)
        ordering = ['order']


# ===== END: commerce/models/client.py =====

# ===== BEGIN: commerce/models/document.py =====



class FileType(models.Model):
    name = models.CharField(verbose_name="Тип файла", max_length=255)
    user_type = models.ForeignKey(UserType, on_delete=models.CASCADE, verbose_name="Тип пользователя", null=True, blank=True)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Тип файла"
        verbose_name_plural = "Типы файлов"


class Document(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, verbose_name="Пользователь")
    file_type = models.ForeignKey('FileType', on_delete=models.SET_NULL, null=True, blank=True, verbose_name="Тип файла")
    name = models.CharField(max_length=255, verbose_name="Имя файла", default='', blank=True)
    file = models.FileField(upload_to="uploads/", verbose_name="Файл", null=True, blank=True)
    size = models.BigIntegerField(verbose_name="Размер файла (в байтах)", null=True, blank=True)
    url = models.CharField(verbose_name="URL файла", max_length=1024, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата загрузки")
    comment = models.TextField(verbose_name="Комментарий", blank=True, null=True)

    order = models.ForeignKey(
        'Order',
        on_delete=models.CASCADE,
        related_name='documents',
        null=True,
        blank=True,
        verbose_name='Заказ'
    )

    def __str__(self):
        return f"{self.name} ({self.user}) ({self.id})"

    def save(self, *args, **kwargs):
        if self.file and not (self.name and str(self.name).strip()):
            try:
                self.name = os.path.basename(self.file.name)
            except Exception:
                pass


        changed = False
        changed_fields = []

        if self.file:
            try:
                file_size = getattr(self.file, "size", None)
            except Exception:
                file_size = None
            if file_size is not None and (self.size is None or self.size != file_size):
                self.size = file_size
                changed = True
                changed_fields.append("size")

            try:
                file_url = getattr(self.file, "url", None)
            except Exception:
                file_url = None
            if file_url and (not self.url or self.url != file_url):
                self.url = file_url
                changed = True
                changed_fields.append("url")
        else:
            if self.url and not (self.name and str(self.name).strip()):
                try:
                    parsed = urlparse(self.url)
                    base = os.path.basename(parsed.path)
                    if base:
                        self.name = unquote(base)
                        changed = True
                        changed_fields.append("name")
                except Exception:
                    pass

        if self.pk is None:
            super().save(*args, **kwargs)
            if changed and changed_fields:
                super().save(update_fields=changed_fields)
        else:
            if changed and changed_fields:
                super().save(update_fields=changed_fields)
            else:
                super().save(*args, **kwargs)

    class Meta:
        verbose_name = "Документ"
        verbose_name_plural = "Документы"

# ===== END: commerce/models/document.py =====

# ===== BEGIN: commerce/models/note.py =====


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

# ===== END: commerce/models/note.py =====

# ===== BEGIN: commerce/models/order.py =====



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
    chief_user_type = models.ForeignKey(
        UserType,
        on_delete=models.SET_NULL,
        verbose_name="Главный в отделе (тип пользователя)",
        blank=True,
        null=True,
        related_name="chief_departments",
        help_text="Тип пользователя, который считается главным в отделе"
    )
    worker_user_type = models.ForeignKey(
        UserType,
        on_delete=models.SET_NULL,
        verbose_name="Работник отдела (тип пользователя)",
        blank=True,
        null=True,
        related_name="worker_departments",
        help_text="Тип пользователя, который считается работником отдела"
    )
    
    def __str__(self):
        return self.name

    def get_department_users(self):
        """
        Возвращает пользователей, у которых тип пользователя совпадает с названием отдела
        """
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
        verbose_name="Отдел",
        related_name="unique_statuses",
        blank=True,
        null=True,
    )
    is_initial = models.BooleanField(
        verbose_name="Автоматический при добавлении отдела",
        default=False,
        help_text="Этот статус назначается автоматически при добавлении работы отдела"
    )
    is_final = models.BooleanField(
        verbose_name="Статус закрытия работы отдела",
        default=False,
        help_text="Этот статус назначается при закрытии работы отдела"
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
        blank=True,
        null=True,
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
    # created = models.DateTimeField(auto_now_add=True, verbose_name="Создан")
    created = models.DateTimeField(verbose_name="Создан")
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
        if self.started_at:
            return localtime(self.started_at).strftime('%d.%m.%Y %H:%M')
        return None
    
    def get_formatted_completed_at(self):
        """Возвращает отформатированную дату завершения работы"""
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
        blank=True,
        null=True,
    )
    order = models.ForeignKey(
        Order,
        on_delete=models.CASCADE,
        verbose_name="Заказ",
        related_name="department_work_messages",
        blank=True,
        null=True,
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


class EmergencyIncident(models.Model):
    order_department_work = models.ForeignKey(
        OrderDepartmentWork,
        on_delete=models.CASCADE,
        verbose_name="Работа отдела по заказу",
        related_name="emergencies",
        help_text="Авария связана с этой работой отдела"
    )
    started_at = models.DateTimeField(
        auto_now_add=True,
        verbose_name="Начало аварии",
        help_text="Когда была зафиксирована авария"
    )
    description = models.TextField(
        verbose_name="Описание аварии",
        blank=True,
        null=True,
        help_text="Подробное описание аварии"
    )
    resolver = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        verbose_name="Работник по устранению",
        related_name="resolved_emergencies",
        blank=True,
        null=True,
        help_text="Пользователь, назначенный для устранения аварии"
    )
    resolved_at = models.DateTimeField(
        verbose_name="Закрытие аварии",
        blank=True,
        null=True,
        help_text="Когда авария была закрыта"
    )

    def __str__(self):
        return f"Авария для {self.order_department_work} - {self.started_at.strftime('%d.%m.%Y %H:%M')}"

    def is_active(self):
        """Проверяет, активна ли авария"""
        return self.resolved_at is None

    def resolve(self):
        """Метод для закрытия аварии"""
        self.resolved_at = timezone.now()
        self.save()

    class Meta:
        verbose_name = "Авария"
        verbose_name_plural = "Аварии"
        ordering = ['-started_at']

class FixedAsset(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название основного средства")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Основное средство"
        verbose_name_plural = "Основные средства"

class InventoryItem(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название товара")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Товарный остаток"
        verbose_name_plural = "Товарные остатки"

class Credit(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название кредита")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Кредит"
        verbose_name_plural = "Кредиты"

class AccountsPayable(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название задолженности")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Кредиторская задолженность"
        verbose_name_plural = "Кредиторские задолженности"
    

class ShortTermLiability(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название обязательства")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Краткосрочное обязательство"
        verbose_name_plural = "Краткосрочные обязательства"

class Bonus(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название бонуса")
    amount = models.DecimalField(max_digits=15, decimal_places=2, verbose_name="Сумма")
    created_at = models.DateTimeField(auto_now_add=True, verbose_name="Дата создания")

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Бонус"
        verbose_name_plural = "Бонусы"

# ===== END: commerce/models/order.py =====

# ===== BEGIN: commerce/models/product.py =====


class Product(models.Model):
    name = models.CharField(max_length=255, verbose_name="Название типа продукции")
    departments = models.ManyToManyField(
        'Department',
        through='ProductDepartment',
        related_name='products',
        verbose_name="Доступные отделы"
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Продукция"
        verbose_name_plural = "Продукция"

class ProductDepartment(models.Model):
    product = models.ForeignKey(Product, on_delete=models.CASCADE, verbose_name="Продукция")
    department = models.ForeignKey('Department', on_delete=models.CASCADE, verbose_name="Отдел")

    class Meta:
        unique_together = ('product', 'department')
        verbose_name = "Отдел продукции"
        verbose_name_plural = "Отделы продукции"
        # добавляет отделы работы для заказа автоматом

# ===== END: commerce/models/product.py =====

# ===== BEGIN: ledger/models/bank_account.py =====



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

# ===== END: ledger/models/bank_account.py =====

# ===== BEGIN: ledger/models/transaction.py =====



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
    amount = models.DecimalField(decimal_places=0, verbose_name="Сумма", max_digits=12)
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


class MonthlyCapital(models.Model):
    year = models.IntegerField()
    month = models.IntegerField()
    capital = models.DecimalField(max_digits=20, decimal_places=2)
    calculated_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('year', 'month')

# ===== END: ledger/models/transaction.py =====

# ===== BEGIN: users/models/access_token.py =====


class FileAccessToken(models.Model):
    token = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    file = models.ForeignKey('commerce.Document', on_delete=models.CASCADE)
    expires_at = models.DateTimeField()
    created_by = models.ForeignKey('users.User', on_delete=models.CASCADE, null=True, blank=True)  # добавлено null=True, blank=True

    def is_valid(self):
        return timezone.now() < self.expires_at

# ===== END: users/models/access_token.py =====

# ===== BEGIN: users/models/permission.py =====



class Permission(models.Model):
    codename = models.CharField(max_length=255, unique=True, verbose_name="Название")
    description = models.CharField(max_length=255, verbose_name="Описание", unique=True)

    def __str__(self):
        return self.description

    class Meta:
        verbose_name = "Право"
        verbose_name_plural = "Права"

# ===== END: users/models/permission.py =====

# ===== BEGIN: users/models/user.py =====



class SiteBlock(models.Model):
    is_blocked = models.BooleanField(default=False)

class User(AbstractUser):
    username = models.CharField(max_length=255, unique=True, verbose_name="Логин")
    email = models.EmailField(
        max_length=254, blank=True, null=True, verbose_name="Почта"
    )
    password = models.CharField(max_length=255, verbose_name="Пароль")
    last_name = models.CharField(
        max_length=255, blank=True, null=True, verbose_name="Фамилия"
    )
    first_name = models.CharField(
        max_length=255, blank=True, null=True, verbose_name="Имя"
    )
    patronymic = models.CharField(
        max_length=255, blank=True, null=True, verbose_name="Отчество"
    )
    date_joined = models.DateTimeField(auto_now_add=True, verbose_name="Создан")
    is_active = models.BooleanField(default=True, verbose_name="Активен")
    user_type = models.ForeignKey(
        UserType,
        on_delete=models.CASCADE,
        verbose_name="Тип пользователя",
        null=True,
        blank=True,
    )

    user_permissions = None
    groups = None

    def __str__(self):
        return self.username

    class Meta:
        default_permissions = ()
        verbose_name = "Пользователь"
        verbose_name_plural = "Пользователи"

class Notification(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="notifications",
        verbose_name="Получатель"
    )
    created = models.DateTimeField(auto_now_add=True, verbose_name="Создано")
    message = models.TextField(verbose_name="Текст уведомления")
    url = models.CharField(max_length=512, blank=True, null=True, verbose_name="Ссылка")
    is_read = models.BooleanField(default=False, verbose_name="Прочитано")
    type = models.CharField(max_length=64, blank=True, null=True, verbose_name="Тип уведомления")
    order = models.ForeignKey(
        'commerce.Order',
        on_delete=models.CASCADE,
        blank=True,
        null=True,
        related_name="notifications",
        verbose_name="Заказ"
    )

    class Meta:
        verbose_name = "Уведомление"
        verbose_name_plural = "Уведомления"
        ordering = ['-created']

    def __str__(self):
        return f"Уведомление для {self.user}: {self.message[:50]}"

# ===== END: users/models/user.py =====

# ===== BEGIN: users/models/user_type.py =====



class UserType(models.Model):
    name = models.CharField(max_length=255, verbose_name="Группа пользователей")
    permissions = models.ManyToManyField(
        Permission,
        blank=True,
        related_name="user_types",
        verbose_name="Права",
        help_text="Права, связанные с этим типом пользователя",
    )

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "Тип пользователя"
        verbose_name_plural = "Типы пользователей"

# ===== END: users/models/user_type.py =====

# ===== BEGIN: users/models/userTypeMenuItem.py =====


class UserTypeMenuItem(models.Model):
    user_type = models.ForeignKey(
        UserType, on_delete=models.CASCADE, related_name="type_menu_items"
    )
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE)
    category = models.ForeignKey(MenuCategory, on_delete=models.CASCADE, null=True, blank=True)
    name = models.CharField("Название", max_length=255, blank=True, null=True)
    order = models.PositiveIntegerField("Порядок", default=0)

    class Meta:
        verbose_name = "Связь типа пользователя с пунктом меню"
        verbose_name_plural = "Связи типов пользователей с пунктами меню"
        unique_together = (
            "user_type",
            "menu_item",
        )
        ordering = ["order"]

    def __str__(self):
        return f"{self.user_type} - {self.menu_item} ({self.category})"

# ===== END: users/models/userTypeMenuItem.py =====
