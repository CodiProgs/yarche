from django.db import models
from django.urls import reverse


class MenuCategory(models.Model):
    CATEGORY_CHOICES = [
        ('ledger', 'Бухгалтерия'),
        ('commerce', 'Продажи'),
        ('departments', 'Отделы'),
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