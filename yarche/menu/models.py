from django.db import models


class MenuItem(models.Model):
    title = models.CharField("Закладка", max_length=255, unique=True)
    url_name = models.CharField("Имя URL", max_length=255, unique=True)
    icon_class = models.CharField(
        "Класс иконки",
        max_length=255,
        help_text="Например: 'fa fa-home' для FontAwesome",
    )
    permissions = models.ManyToManyField(
        "users.Permission",
        blank=True,
        related_name="menu_items",
        verbose_name="Права",
        help_text="Права, связанные с этим пунктом меню",
    )

    def __str__(self):
        return self.title

    class Meta:
        verbose_name = "Пункт меню"
        verbose_name_plural = "Пункты меню"

    @property
    def full_url(self):
        if self.category:
            return f"/{self.category_slug}/{self.url_name}/"

        return f"/{self.url_name}/"
