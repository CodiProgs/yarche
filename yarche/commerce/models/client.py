from django.db import models


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
