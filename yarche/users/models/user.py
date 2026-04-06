from django.db import models
from django.apps import apps
from django.contrib.auth.models import AbstractUser, UserManager
from .user_type import UserType


class CustomUserManager(UserManager):
    def _create_user(self, username, email, password, **extra_fields):
        GlobalUserModel = apps.get_model(
            self.model._meta.app_label, self.model._meta.object_name
        )

        username = GlobalUserModel.normalize_username(username)

        user = self.model(username=username, **extra_fields)
        user.password = password
        user.save(using=self._db)
        return user

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

    objects = CustomUserManager()

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
