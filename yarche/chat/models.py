from django.db import models
from django.contrib.auth import get_user_model
from django.utils import timezone

User = get_user_model()

def get_model_data(obj):
    """Получает данные объекта в виде словаря для сериализации"""
    if not obj:
        return None
    
    data = {}
    for field in obj._meta.get_fields():
        if field.name in ['id', 'password', '_state']:
            continue
        
        value = getattr(obj, field.name, None)
        
        if value is None:
            data[field.name] = None
        elif hasattr(value, 'pk'): 
            data[f'{field.name}_id'] = value.id
        elif hasattr(value, 'strftime'):
            data[field.name] = value.isoformat()
        elif isinstance(value, (list, dict)):
            data[field.name] = value
        elif isinstance(value, bool):
            data[field.name] = value
        elif isinstance(value, (int, float)):
            data[field.name] = value
        else:
            data[field.name] = str(value) if value is not None else None
    
    return data


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
            from django.apps import apps
            from django.utils import timezone as tz
            import json
            
            app_label, model_name = self.model_name.split('.')
            model_class = apps.get_model(app_label, model_name)
            
            data = self.data_before.copy() if isinstance(self.data_before, dict) else json.loads(self.data_before)
            
            data.pop('id', None)
            data.pop('pk', None)
            
            for field in model_class._meta.get_fields():
                if isinstance(field, (models.DateTimeField, models.DateField)):
                    if field.name in data and data[field.name]:
                        try:
                            from django.utils.dateparse import parse_datetime
                            data[field.name] = parse_datetime(data[field.name])
                            if not data[field.name]:
                                from django.utils.dateparse import parse_date
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