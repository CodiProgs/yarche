from django.core.management.base import BaseCommand
from django.db import transaction
from users.models import UserType, Permission, User, UserTypeMenuItem
from menu.models import MenuCategory, MenuItem
from commerce.models import FileType, Client, Product, OrderStatus, OrderWorkStatus, Department
from ledger.models import BankAccountType, BankAccount, TransactionCategory


class Command(BaseCommand):
    help = "Заполняет базу данных начальными данными"

    def handle(self, *args, **kwargs):
        self.populate_data()

    def populate_data(self):
        with transaction.atomic():
            # Типы пользователей
            user_types = [
                "Администратор", "Менеджер по работе с клиентами", "Главный Печать ИФП", "Печать ИФП",
                "Главный Раскрой", "Раскрой", "Главный Накатка", "Накатка", "Главный Сварка", "Сварка",
                "Главный Сборка", "Сборка", "Главный Монтаж", "Монтаж", "Главный Дизайн", "Дизайн",
                "Главный Замер", "Замер"
            ]
            user_type_objects = {}
            for user_type in user_types:
                obj, _ = UserType.objects.get_or_create(name=user_type)
                user_type_objects[user_type] = obj

            # Создание пользователей для каждого типа (кроме администратора)
            for user_type in user_types[1:]:
                username = user_type.lower().replace(" ", "_")
                User.objects.get_or_create(
                    username=username,
                    defaults={
                        "password": "password",
                        "user_type": user_type_objects[user_type],
                        "is_active": True,
                    },
                )

            # Связывание пользователя admin с типом "Администратор"
            admin_user = User.objects.get(username="admin")
            admin_user.user_type = user_type_objects["Администратор"]
            admin_user.save()

            # Создание правил
            permissions = [
                ("view_all_payments", "Просмотр всех транзакций в разделе «Приход денежных средств»"),
                ("edit_closed_transactions", "Редактирование закрытых транзакций"),
                ("close_current_shift", "Закрыть расходы текущего дня"),
                ("view_all_shift_transactions", "Просмотр всех транзакций смены"),
            ]
            for codename, description in permissions:
                Permission.objects.get_or_create(codename=codename, description=description)

            # Выдача всех прав типу "Администратор"
            all_permissions = Permission.objects.all()
            admin_user_type = user_type_objects["Администратор"]
            admin_user_type.permissions.set(all_permissions)

            # Категории меню
            menu_categories = [
                ("ledger", "Бухгалтерия", 1),
                ("commerce", "Продажи", 2),
                ("departments", "Отделы", 3),
                ("report", "Отчет", 4),
            ]
            for code, name, order in menu_categories:
                MenuCategory.objects.get_or_create(name=code, display_name=name, order=order)

            # Пункты меню
            menu_items = [
                ("Денежные средства", "ledger:current_shift", "ledger"),
                ("Транзакции", "ledger:transactions", "ledger"),
                ("Счета", "ledger:bank-accounts", "ledger"),
                ("Категории транзакций", "ledger:transaction-categories", "ledger"),
                ("Приход денежных средств", "ledger:payments", "ledger"),
                ("Остатки на счетах", "ledger:bank_accounts_balances", "ledger"),
                ("ДДС", "ledger:all_transactions", "ledger"),
                ("Работа", "commerce:works", "commerce"),
                ("Контроль заказов", "commerce:orders", "commerce"),
                ("Клиенты", "commerce:clients", "commerce"),
                ("Типы продукции", "commerce:products", "commerce"),
                ("Архив заказов", "commerce:orders_archive", "commerce"),
                ("Клиенты 2", "commerce:kanban_board", "commerce"),
                ("Печать ИФП", "departments:pechat", "departments"),
                ("Раскрой", "departments:raskroy", "departments"),
                ("Накатка", "departments:nakatka", "departments"),
                ("Сварка", "departments:svarka", "departments"),
                ("Сборка", "departments:sborka", "departments"),
                ("Монтаж", "departments:montazh", "departments"),
                ("Дизайн", "departments:dizayn", "departments"),
                ("Замер", "departments:zamer", "departments"),
                ("Отчет денежных средств", "ledger:cash_report_table", "report"),
            ]
            menu_item_objects = []
            for order, (title, url_name, category_code) in enumerate(menu_items, start=1):
                category = MenuCategory.objects.get(name=category_code)
                menu_item, _ = MenuItem.objects.get_or_create(
                    title=title, url_name=url_name, category=category
                )
                menu_item_objects.append((menu_item, order))

            # Связывание типа "Администратор" со всеми пунктами меню
            for menu_item, order in menu_item_objects:
                UserTypeMenuItem.objects.get_or_create(
                    user_type=admin_user_type,
                    menu_item=menu_item,
                    defaults={"name": menu_item.title, "order": order},
                )

            # Типы файлов
            file_types = ["PDF", "Макеты", "Договоры"]
            for file_type in file_types:
                FileType.objects.get_or_create(name=file_type)

            # Отделы
            departments = [
                "Дизайн", "Монтаж", "Сборка", "Сварка", "Раскрой", "Печать ИФП", "Накатка", "Замер"
            ]
            for department in departments:
                Department.objects.get_or_create(name=department)

            # Продукция
            products = ["Продукт 1", "Продукт 2"]
            for product in products:
                Product.objects.get_or_create(name=product)

            # Статусы заказов
            order_statuses = ["В производстве", "Готово", "Отменен"]
            for status in order_statuses:
                OrderStatus.objects.get_or_create(name=status)

            # Статусы работ отделов
            work_statuses = [
                ("В работе", None),
                ("Готово", None),
                ("Ожидает", None),
                ("Дизайн - Дизайн", "Дизайн"),
            ]
            for name, department_name in work_statuses:
                department = Department.objects.filter(name=department_name).first() if department_name else None
                OrderWorkStatus.objects.get_or_create(name=name, department=department)

            # Типы счетов
            account_types = ["Банковская карта", "Банковский счет"]
            for account_type in account_types:
                BankAccountType.objects.get_or_create(name=account_type)

            # Счета
            accounts = [
                ("Р/с Втб", "Банковский счет", 2000),
                ("Р/с Авангард", "Банковский счет", 22100),
            ]
            for name, account_type, balance in accounts:
                account_type_obj = BankAccountType.objects.get(name=account_type)
                BankAccount.objects.get_or_create(name=name, type=account_type_obj, balance=balance)

            # Категории операций
            transaction_categories = [
                ("Налог", "expense"),
                ("Зарплата", "income"),
                ("Аренда", "expense"),
                ("Продажа", "income"),
            ]
            for name, type_ in transaction_categories:
                TransactionCategory.objects.get_or_create(name=name, type=type_)

            # Клиенты
            clients = ["Клиент 1", "Клиент 2", "Клиент 3", "Клиент 4"]
            for client in clients:
                Client.objects.get_or_create(name=client)