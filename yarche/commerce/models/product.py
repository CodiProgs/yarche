from django.db import models

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