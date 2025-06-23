from django.db import models
from .user_type import UserType
from menu.models import MenuItem


class UserTypeMenuItem(models.Model):
    user_type = models.ForeignKey(
        UserType, on_delete=models.CASCADE, related_name="type_menu_items"
    )
    menu_item = models.ForeignKey(MenuItem, on_delete=models.CASCADE)
    name = models.CharField("Название", max_length=255, blank=True, null=True)
    category = models.CharField("Папка в меню", max_length=255, blank=True, null=True)
    category_slug = models.SlugField(
        "Slug категории", max_length=255, blank=True, null=True
    )
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
        return f"{self.user_type} - {self.menu_item}"
