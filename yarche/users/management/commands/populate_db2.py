from django.core.management.base import BaseCommand
from django.db import transaction
from commerce.models import Department
from users.models import UserType


class Command(BaseCommand):
    help = "Обновляет отделы: добавляет slug, главного и работника отдела"

    def handle(self, *args, **kwargs):
        self.update_departments()

    def update_departments(self):
        with transaction.atomic():
            # Данные для обновления отделов
            departments_data = [
                {"name": "Дизайн", "slug": "dizayn", "chief": "Главный Дизайн", "worker": "Дизайн"},
                {"name": "Монтаж", "slug": "montazh", "chief": "Главный Монтаж", "worker": "Монтаж"},
                {"name": "Сборка", "slug": "sborka", "chief": "Главный Сборка", "worker": "Сборка"},
                {"name": "Сварка", "slug": "svarka", "chief": "Главный Сварка", "worker": "Сварка"},
                {"name": "Раскрой", "slug": "raskroy", "chief": "Главный Раскрой", "worker": "Раскрой"},
                {"name": "Печать ИФП", "slug": "pechat", "chief": "Главный Печать ИФП", "worker": "Печать ИФП"},
                {"name": "Накатка", "slug": "nakatka", "chief": "Главный Накатка", "worker": "Накатка"},
                {"name": "Замер", "slug": "zamer", "chief": "Главный Замер", "worker": "Замер"},
            ]

            for data in departments_data:
                # Получаем или создаём типы пользователей для главного и работника
                chief_user_type, _ = UserType.objects.get_or_create(name=data["chief"])
                worker_user_type, _ = UserType.objects.get_or_create(name=data["worker"])

                # Обновляем или создаём отдел
                department, created = Department.objects.update_or_create(
                    name=data["name"],
                    defaults={
                        "slug": data["slug"],
                        "chief_user_type": chief_user_type,
                        "worker_user_type": worker_user_type,
                    },
                )

                if created:
                    self.stdout.write(self.style.SUCCESS(f"Создан отдел: {department.name}"))
                else:
                    self.stdout.write(self.style.SUCCESS(f"Обновлён отдел: {department.name}"))