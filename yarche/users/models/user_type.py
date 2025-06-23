from django.db import models
from menu.models import MenuItem
from .permission import Permission


class UserType(models.Model):
    name = models.CharField(max_length=255, verbose_name="Группа пользователей")
    menu_items = models.ManyToManyField(
        MenuItem, through="users.UserTypeMenuItem", verbose_name="Пункты меню"
    )
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
