import csv
import os
import re
from datetime import datetime
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection, transaction, IntegrityError
from django.utils import timezone
from commerce.models import Client, Contact, Department
from users.models import Permission, User, UserType, UserTypeMenuItem


class Command(BaseCommand):
    help = 'Импорт контактов клиентов, типов пользователей и пользователей из CSV'
    NULL_TEXT_VALUES = {'', 'NULL', 'None', 'NaN'}

    def add_arguments(self, parser):
        parser.add_argument('csv_dir', type=str, help='Путь к папке с CSV-файлами')
        parser.add_argument(
            '--delimiter',
            type=str,
            default=';',
            help='Разделитель в CSV-файлах (по умолчанию ;). Используйте TAB для TSV.',
        )

    # ── Утилиты ──────────────────────────────────────────────────────────────

    def _open_csv_safely(self, filepath):
        with open(filepath, 'rb') as f:
            raw = f.read()
        for enc in ('utf-8-sig', 'cp1251', 'utf-8'):
            try:
                raw.decode(enc)
                self.stdout.write(f"🔍 {os.path.basename(filepath)}: кодировка {enc}")
                return open(filepath, 'r', encoding=enc, newline='', errors='replace')
            except UnicodeDecodeError:
                continue
        self.stdout.write(f"⚠️ {os.path.basename(filepath)}: кодировка не определена, используем cp1251.")
        return open(filepath, 'r', encoding='cp1251', newline='', errors='replace')

    def _get_col(self, row, col_name, available):
        normalized = col_name.lower().strip()
        for key in available:
            if key.lower().strip() == normalized:
                return row[key]
        raise Exception(f"❌ Колонка '{col_name}' не найдена. Доступные: {list(row.keys())}")

    def _has_col(self, available, col_name):
        normalized = col_name.lower().strip()
        return any(key.lower().strip() == normalized for key in available)

    def parse_positive_int(self, val):
        if val is None:
            return None
        val_str = str(val).strip()
        if not val_str or val_str.upper() in self.NULL_TEXT_VALUES:
            return None
        try:
            parsed = int(float(val_str))
        except (TypeError, ValueError):
            return None
        return parsed if parsed > 0 else None

    def parse_bool(self, val):
        if not val:
            return False
        return str(val).strip().lower() in ('1', 'true', 'yes', 'y')

    def clean_null_text(self, val):
        if not val:
            return None
        val_str = str(val).strip()
        if val_str.upper() in self.NULL_TEXT_VALUES:
            return None
        return val_str

    def parse_date(self, val):
        if not val or str(val).strip().upper() in self.NULL_TEXT_VALUES:
            return None
        val = str(val).strip()
        for fmt in ('%d.%m.%Y', '%Y-%m-%d', '%d.%m.%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S'):
            try:
                return datetime.strptime(val, fmt).date()
            except ValueError:
                continue
        return None

    def parse_dt(self, val):
        if not val or str(val).strip().upper() in self.NULL_TEXT_VALUES:
            return None
        val = str(val).strip()
        formats = [
            '%d.%m.%Y %H:%M', '%d.%m.%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d.%m.%Y',
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(val, fmt)
                if settings.USE_TZ and timezone.is_naive(dt):
                    dt = timezone.make_aware(dt, timezone=timezone.get_current_timezone())
                return dt
            except ValueError:
                continue
        return None

    def clean_email(self, val):
        cleaned = self.clean_null_text(val)
        if not cleaned:
            return None
        if re.match(r'^[^@\s]+@[^@\s]+\.[^@\s]+$', cleaned):
            return cleaned
        return None

    def reset_autoincrement(self, table_name):
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")
            max_id = cursor.fetchone()[0]
            cursor.execute(f"ALTER TABLE {table_name} AUTO_INCREMENT = {max_id + 1}")
            self.stdout.write(f"🔧 {table_name}: AUTO_INCREMENT = {max_id + 1}")

    # ── Основная логика ───────────────────────────────────────────────────────

    @transaction.atomic
    def handle(self, *args, **options):
        csv_dir = options['csv_dir'].rstrip('\\/')
        delimiter = options['delimiter']
        # Поддержка передачи TAB как строки "TAB" или "\t"
        if delimiter.upper() == 'TAB':
            delimiter = '\t'

        self.stdout.write(f"📂 Папка импорта: {csv_dir}")
        self.stdout.write(f"📐 Разделитель: {repr(delimiter)}")

        with connection.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS=0")

        try:
            self._import_contacts(csv_dir, delimiter)
            self._import_users_and_types(csv_dir, delimiter)

            with connection.cursor() as cursor:
                cursor.execute("SET FOREIGN_KEY_CHECKS=1")

            self.stdout.write(self.style.SUCCESS("✅ Импорт завершён."))

        except Exception as e:
            with connection.cursor() as cursor:
                cursor.execute("SET FOREIGN_KEY_CHECKS=1")
            raise e

    # ── Импорт контактов ─────────────────────────────────────────────────────

    def _import_contacts(self, csv_dir, delimiter):
        contacts_csv = os.path.join(csv_dir, "clients-contact.csv")
        if not os.path.exists(contacts_csv):
            self.stdout.write(self.style.WARNING("⚠️ clients-contact.csv не найден, пропуск"))
            return

        self.stdout.write("📇 Импорт контактов клиентов...")
        existing_client_ids = set(Client.objects.values_list('pk', flat=True))

        with self._open_csv_safely(contacts_csv) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            count = skipped = 0

            for row in reader:
                cols = reader.fieldnames
                cid = self.parse_positive_int(self._get_col(row, "ContactID", cols))
                client_id = self.parse_positive_int(self._get_col(row, "ClientID", cols))

                if not cid or not client_id:
                    skipped += 1
                    continue

                if client_id not in existing_client_ids:
                    self.stdout.write(self.style.WARNING(
                        f"   ⚠️ ContactID={cid}: Клиент #{client_id} не найден, пропуск"
                    ))
                    skipped += 1
                    continue

                Contact.objects.update_or_create(
                    pk=cid,
                    defaults={
                        "client_id": client_id,
                        "last_name": self.clean_null_text(self._get_col(row, "Fam", cols)),
                        "first_name": self.clean_null_text(self._get_col(row, "Im", cols)),
                        "patronymic": self.clean_null_text(self._get_col(row, "Ot", cols)),
                        "position": self.clean_null_text(self._get_col(row, "Position", cols)),
                        "phone1": self.clean_null_text(self._get_col(row, "Phone1", cols)),
                        "phone2": self.clean_null_text(self._get_col(row, "Phone2", cols)),
                        "phone3": self.clean_null_text(self._get_col(row, "Phone3", cols)),
                        "email": self.clean_email(self._get_col(row, "Email", cols)),
                        "birthday": self.parse_date(self._get_col(row, "Birthdate", cols)),
                        "socials": self.clean_null_text(self._get_col(row, "SocialMedia", cols)),
                    }
                )
                count += 1

        self.stdout.write(f"   ✅ Загружено/обновлено: {count}, пропущено: {skipped}")
        self.reset_autoincrement(Contact._meta.db_table)

    # ── Импорт пользователей и типов пользователей ───────────────────────────

    def _import_users_and_types(self, csv_dir, delimiter):
        user_types_csv = os.path.join(csv_dir, "user-types.csv")
        users_csv = os.path.join(csv_dir, "users.csv")

        if not os.path.exists(user_types_csv) and not os.path.exists(users_csv):
            self.stdout.write(self.style.WARNING(
                "⚠️ user-types.csv и users.csv не найдены, пропуск импорта пользователей"
            ))
            return

        # Шаг 1: сохраняем связи меню текущего admin
        admin_menu_links = self._save_admin_menu_links()

        # Шаг 2: сбрасываем chief_user_type у всех отделов
        self.stdout.write("🏢 Сброс главного у всех отделов...")
        Department.objects.all().update(chief_user_type=None)
        self.stdout.write("   ✅ chief_user_type сброшен")

        # Шаг 3: удаляем всех пользователей и типы через raw SQL
        # (Django ORM не позволяет удалять через коллектор при PROTECT FK,
        #  даже с SET FOREIGN_KEY_CHECKS=0 — поэтому используем cursor)
        self.stdout.write("🗑️ Удаление всех пользователей...")
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM {User._meta.db_table}")
        self.stdout.write("   ✅ Удалено")

        self.stdout.write("🗑️ Удаление всех типов пользователей...")
        with connection.cursor() as cursor:
            cursor.execute(f"DELETE FROM {UserType._meta.db_table}")
            # ManyToMany-таблица прав типов
            m2m_table = UserType.permissions.through._meta.db_table
            cursor.execute(f"DELETE FROM {m2m_table}")
            # UserTypeMenuItem каскадно удалится через FK, но на всякий случай:
            cursor.execute(f"DELETE FROM {UserTypeMenuItem._meta.db_table}")
        self.stdout.write("   ✅ Удалено")

        # Шаг 4: импорт типов пользователей
        if os.path.exists(user_types_csv):
            self._import_user_types(user_types_csv, delimiter)

        # Шаг 5: импорт пользователей
        if os.path.exists(users_csv):
            self._import_users(users_csv, delimiter)

        # Шаг 6: восстанавливаем связи меню для нового admin
        if admin_menu_links:
            self._restore_admin_menu_links(admin_menu_links)

        # Шаг 7: выдаём admin все Permission
        self._grant_admin_all_permissions()

        # Шаг 8: ставим "Начальники производства" главными во всех отделах
        self._set_chief_user_type()

    def _save_admin_menu_links(self):
        self.stdout.write("💾 Сохранение связей меню администратора...")
        links = []
        try:
            old_admin = User.objects.get(username='admin')
            if old_admin.user_type:
                for link in UserTypeMenuItem.objects.filter(user_type=old_admin.user_type):
                    links.append({
                        'menu_item_id': link.menu_item_id,
                        'category_id': link.category_id,
                        'name': link.name,
                        'order': link.order,
                    })
                self.stdout.write(f"   💾 Сохранено связей: {len(links)}")
            else:
                self.stdout.write("   ℹ️ У admin нет типа пользователя, связи меню не сохранены")
        except User.DoesNotExist:
            self.stdout.write("   ℹ️ Пользователь admin не найден до импорта")
        return links

    def _import_user_types(self, user_types_csv, delimiter):
        self.stdout.write("👔 Импорт типов пользователей...")
        with self._open_csv_safely(user_types_csv) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            count = 0
            for row in reader:
                cols = reader.fieldnames
                tid = self.parse_positive_int(self._get_col(row, "UserTypeID", cols))
                tname = self.clean_null_text(self._get_col(row, "UserTypeName", cols))
                if not tid or not tname:
                    continue
                UserType.objects.update_or_create(pk=tid, defaults={"name": tname})
                count += 1
        self.stdout.write(f"   ✅ Загружено/обновлено типов: {count}")
        self.reset_autoincrement(UserType._meta.db_table)

    def _import_users(self, users_csv, delimiter):
        self.stdout.write("👤 Импорт пользователей...")
        with self._open_csv_safely(users_csv) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            count = skipped = 0
            for row in reader:
                cols = reader.fieldnames
                uid = self.parse_positive_int(self._get_col(row, "UserID", cols))
                login = self.clean_null_text(self._get_col(row, "Login", cols))
                if not uid or not login:
                    skipped += 1
                    continue

                password = self.clean_null_text(self._get_col(row, "Password", cols)) or ''
                type_id = self.parse_positive_int(self._get_col(row, "UserTypeID", cols))
                is_active = self.parse_bool(self._get_col(row, "Active", cols))
                created_dt = self.parse_dt(self._get_col(row, "Created", cols))

                is_admin = login.lower() == 'admin'

                try:
                    with transaction.atomic():
                        User.objects.update_or_create(
                            pk=uid,
                            defaults={
                                "username": login,
                                "password": password,
                                "last_name": self.clean_null_text(self._get_col(row, "Fam", cols)),
                                "first_name": self.clean_null_text(self._get_col(row, "Im", cols)),
                                "patronymic": self.clean_null_text(self._get_col(row, "Ot", cols)),
                                "is_active": is_active,
                                "is_staff": is_admin,
                                "is_superuser": is_admin,
                                "user_type_id": type_id,
                            }
                        )
                        # date_joined — обходим auto_now_add через update()
                        if created_dt:
                            User.objects.filter(pk=uid).update(date_joined=created_dt)
                        count += 1
                except IntegrityError as e:
                    self.stdout.write(self.style.WARNING(
                        f"   ⚠️ UserID={uid} login='{login}': пропущен (дубликат или ошибка БД): {e}"
                    ))
                    skipped += 1

        self.stdout.write(f"   ✅ Загружено/обновлено: {count}, пропущено: {skipped}")
        self.reset_autoincrement(User._meta.db_table)

    def _restore_admin_menu_links(self, admin_menu_links):
        self.stdout.write("🔗 Восстановление связей меню для нового admin...")
        try:
            new_admin = User.objects.get(username='admin')
        except User.DoesNotExist:
            self.stdout.write(self.style.WARNING(
                "   ⚠️ Пользователь admin не найден после импорта, связи меню не восстановлены"
            ))
            return

        if not new_admin.user_type:
            self.stdout.write(self.style.WARNING(
                "   ⚠️ У нового admin нет типа пользователя, связи меню не восстановлены"
            ))
            return

        restored = 0
        for link_data in admin_menu_links:
            _, created = UserTypeMenuItem.objects.get_or_create(
                user_type=new_admin.user_type,
                menu_item_id=link_data['menu_item_id'],
                defaults={
                    'category_id': link_data['category_id'],
                    'name': link_data['name'],
                    'order': link_data['order'],
                },
            )
            if created:
                restored += 1
        self.stdout.write(f"   ✅ Восстановлено связей: {restored}")

    def _grant_admin_all_permissions(self):
        self.stdout.write("🔐 Выдача admin всех прав доступа...")
        try:
            admin_user = User.objects.get(username='admin')
        except User.DoesNotExist:
            self.stdout.write(self.style.WARNING("   ⚠️ admin не найден, права не выданы"))
            return

        if not admin_user.user_type:
            self.stdout.write(self.style.WARNING(
                "   ⚠️ У admin нет типа пользователя, права не выданы"
            ))
            return

        all_perms = Permission.objects.all()
        admin_user.user_type.permissions.set(all_perms)
        self.stdout.write(f"   ✅ Выдано прав: {all_perms.count()}")

    def _set_chief_user_type(self):
        chief_type_name = "Начальники производства"
        self.stdout.write(f"🏢 Установка '{chief_type_name}' главными во всех отделах...")
        try:
            chief_type = UserType.objects.get(name=chief_type_name)
        except UserType.DoesNotExist:
            self.stdout.write(self.style.WARNING(
                f"   ⚠️ Тип пользователя '{chief_type_name}' не найден в базе"
            ))
            return

        updated = Department.objects.all().update(chief_user_type=chief_type)
        self.stdout.write(f"   ✅ Обновлено отделов: {updated}")
