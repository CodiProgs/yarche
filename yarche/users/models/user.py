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


class User(AbstractUser):
    username = models.CharField(max_length=255, unique=True, verbose_name="Логин")
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
