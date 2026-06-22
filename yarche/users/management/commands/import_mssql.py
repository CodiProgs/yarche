import csv
import os
import re
from decimal import Decimal, InvalidOperation
from datetime import datetime
from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone
from commerce.models import Client, Product, Order  # 👈 замените myapp на имя вашего приложения, если отличается

class Command(BaseCommand):
    help = 'Импорт данных из MSSQL с сохранением оригинальных ID'
    NULL_TEXT_VALUES = {'', 'NULL', 'None', 'NaN'}
    CLIENT_TEXT_FIELDS = (
        'comment',
        'inn',
        'legal_name',
        'director',
        'ogrn',
        'basis',
        'legal_address',
        'actual_address',
    )

    def add_arguments(self, parser):
        parser.add_argument('csv_dir', type=str, help='Путь к папке с CSV')

    def _open_csv_safely(self, filepath):
        # Читаем сырые байты для точного определения кодировки
        with open(filepath, 'rb') as f:
            raw = f.read()

        # Порядок проверки: UTF-8 с BOM → CP1251 (Windows/Russian) → UTF-8
        for enc in ('utf-8-sig', 'cp1251', 'utf-8'):
            try:
                raw.decode(enc)
                self.stdout.write(f"🔍 {os.path.basename(filepath)}: кодировка {enc}")
                return open(filepath, 'r', encoding=enc, newline='', errors='replace')
            except UnicodeDecodeError:
                continue

        # Фоллбэк: принудительно cp1251 с заменой битых байтов
        self.stdout.write(f"⚠️ {os.path.basename(filepath)}: не удалось определить. Используем cp1251.")
        return open(filepath, 'r', encoding='cp1251', newline='', errors='replace')

    def _get_col(self, row, col_name, available):
        normalized = col_name.lower().strip()
        for key in available:
            if key.lower().strip() == normalized:
                return row[key]
        raise Exception(f"❌ Колонка '{col_name}' не найдена. Доступные: {list(row.keys())}")

    def _get_col_any(self, row, col_names, available):
        for col_name in col_names:
            normalized = col_name.lower().strip()
            for key in available:
                if key.lower().strip() == normalized:
                    return row[key]
        raise Exception(f"❌ Колонки {col_names} не найдены. Доступные: {list(row.keys())}")

    def _has_col(self, available, col_name):
        normalized = col_name.lower().strip()
        return any(key.lower().strip() == normalized for key in available)

    def parse_positive_int(self, val):
        """Возвращает положительное целое число или None, если значение невалидно."""
        if val is None:
            return None
        val_str = str(val).strip()
        if not val_str or val_str in self.NULL_TEXT_VALUES or val_str.upper() in self.NULL_TEXT_VALUES:
            return None
        try:
            parsed = int(float(val_str))
        except (TypeError, ValueError):
            return None
        return parsed if parsed > 0 else None

    def parse_client_id(self, row, cols):
        """Пытается получить валидный ID клиента из нескольких возможных колонок."""
        for col_name in ("CliendID", "ClientID", "FirmID"):
            if not self._has_col(cols, col_name):
                continue
            raw = self._get_col_any(row, (col_name,), cols)
            cid = self.parse_positive_int(raw)
            if cid is not None:
                return cid
        return None

    def parse_decimal(self, val):
        if not val or str(val).strip() in self.NULL_TEXT_VALUES:
            return None
        try:
            return Decimal(str(val).replace(',', '.'))
        except (InvalidOperation, ValueError):
            return None

    def parse_dt(self, val):
        if not val or str(val).strip() in self.NULL_TEXT_VALUES:
            return None
        val = str(val).strip()
        formats = [
            '%d.%m.%Y %H:%M', '%d.%m.%Y %H:%M:%S', '%Y-%m-%d %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S', '%Y-%m-%d', '%d.%m.%Y'
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

    def clean_null_text(self, val):
        """Заменяет текст 'NULL' и пустые строки на None для текстовых полей"""
        if not val:
            return None
        val_str = str(val).strip()
        if val_str in self.NULL_TEXT_VALUES or val_str.upper() in self.NULL_TEXT_VALUES:
            return None
        return val_str

    def normalize_numeric_identifier(self, val, max_length):
        """Нормализует ИНН/ОГРН: поддерживает обычный формат и научную нотацию."""
        cleaned = self.clean_null_text(val)
        if cleaned is None:
            return None

        candidate = cleaned.replace(' ', '')
        number_candidate = candidate.replace(',', '.')

        # Числовые значения и scientific notation (например 4,34E+09)
        if re.fullmatch(r'[+-]?\d+(\.\d+)?([eE][+-]?\d+)?', number_candidate):
            try:
                decimal_value = Decimal(number_candidate)
                integer_value = decimal_value.to_integral_value()
                if decimal_value == integer_value:
                    digits = str(abs(int(integer_value)))
                    if len(digits) > max_length:
                        digits = digits[:max_length]
                    return digits or None
            except (InvalidOperation, ValueError):
                pass

        digits = ''.join(ch for ch in candidate if ch.isdigit())
        if not digits:
            return None
        if len(digits) > max_length:
            digits = digits[:max_length]
        return digits

    def normalize_client_null_texts(self):
        """Удаляет строковые значения NULL/None/NaN из текстовых полей клиента."""
        fixed = 0
        for client in Client.objects.all().iterator():
            changed = False
            for field in self.CLIENT_TEXT_FIELDS:
                current = getattr(client, field)
                normalized = self.clean_null_text(current)
                if current != normalized:
                    setattr(client, field, normalized)
                    changed = True
            if changed:
                client.save(update_fields=list(self.CLIENT_TEXT_FIELDS))
                fixed += 1
        return fixed

    def parse_bool(self, val):
        """Парсит boolean значение из текста (0/1, True/False, yes/no)"""
        if not val:
            return False
        val_str = str(val).strip().lower()
        return val_str in ('1', 'true', 'yes', 'y')

    def reset_autoincrement(self, table_name):
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")
            max_id = cursor.fetchone()[0]
            cursor.execute(f"ALTER TABLE {table_name} AUTO_INCREMENT = {max_id + 1}")
            self.stdout.write(f"🔧 {table_name}: AUTO_INCREMENT = {max_id + 1}")

    @transaction.atomic
    def handle(self, *args, **options):
        csv_dir = options['csv_dir'].rstrip('\\/')
        self.stdout.write(f"📂 Папка импорта: {csv_dir}")

        with connection.cursor() as cursor:
            cursor.execute("SET FOREIGN_KEY_CHECKS=0")

        try:
            # 1. Продукты
            self.stdout.write("📦 Импорт продуктов...")
            with self._open_csv_safely(os.path.join(csv_dir, "products.csv")) as f:
                reader = csv.DictReader(f, delimiter=";")
                count = 0
                for row in reader:
                    cols = reader.fieldnames
                    pid = int(self._get_col(row, "ProductTypeID", cols))
                    pname = self._get_col(row, "ProductTypeName", cols)
                    Product.objects.update_or_create(pk=pid, defaults={"name": pname.strip()})
                    count += 1
                self.stdout.write(f"   ✅ Загружено/обновлено: {count}")

            # 2a. Клиенты — имена из clients.csv
            clients_csv_path = os.path.join(csv_dir, "clients.csv")
            if os.path.exists(clients_csv_path):
                self.stdout.write("👥 Импорт клиентов (имена из clients.csv)...")
                with self._open_csv_safely(clients_csv_path) as f:
                    reader = csv.DictReader(f, delimiter=";")
                    count = 0
                    for row in reader:
                        cols = reader.fieldnames
                        cid = self.parse_positive_int(self._get_col(row, "ClientID", cols))
                        if not cid:
                            continue
                        cname = self.clean_null_text(self._get_col(row, "ClientName", cols))
                        comment = self.clean_null_text(self._get_col(row, "Comment", cols)) if self._has_col(cols, "Comment") else None
                        defaults = {"name": cname or f"Клиент #{cid}"}
                        if comment is not None:
                            defaults["comment"] = comment
                        Client.objects.update_or_create(pk=cid, defaults=defaults)
                        count += 1
                    self.stdout.write(f"   ✅ Загружено/обновлено: {count}")
            else:
                self.stdout.write(self.style.WARNING("   ⚠️ clients.csv не найден, имена будут взяты из clients-firm.csv"))

            # 2b. Клиенты — доп. поля из clients-firm.csv (name не перезаписывается)
            client_firm_csv_path = os.path.join(csv_dir, "clients-firm.csv")
            if os.path.exists(client_firm_csv_path):
                self.stdout.write("👥 Импорт клиентов (доп. поля из clients-firm.csv)...")
                with self._open_csv_safely(client_firm_csv_path) as f:
                    reader = csv.DictReader(f, delimiter=";")
                    count = 0
                    skipped = 0
                    for idx, row in enumerate(reader, start=2):
                        cols = reader.fieldnames
                        cid = self.parse_client_id(row, cols)
                        if cid is None:
                            skipped += 1
                            continue

                        full_name = self.clean_null_text(self._get_col_any(row, ("FirmFullName",), cols)) if self._has_col(cols, "FirmFullName") else None

                        defaults = {
                            "inn": self.normalize_numeric_identifier(self._get_col_any(row, ("INN",), cols), max_length=12) if self._has_col(cols, "INN") else None,
                            "legal_name": full_name,
                            "director": self.clean_null_text(self._get_col_any(row, ("Director",), cols)) if self._has_col(cols, "Director") else None,
                            "ogrn": self.normalize_numeric_identifier(self._get_col_any(row, ("OGRN",), cols), max_length=13) if self._has_col(cols, "OGRN") else None,
                            "basis": self.clean_null_text(self._get_col_any(row, ("Osn",), cols)) if self._has_col(cols, "Osn") else None,
                            "legal_address": self.clean_null_text(self._get_col_any(row, ("AddressUr",), cols)) if self._has_col(cols, "AddressUr") else None,
                            "actual_address": self.clean_null_text(self._get_col_any(row, ("AddressFakt",), cols)) if self._has_col(cols, "AddressFakt") else None,
                        }

                        client, created = Client.objects.update_or_create(pk=cid, defaults=defaults)
                        # Имя ставим только если клиент только что создан (не было в clients.csv)
                        if created:
                            short_name = self.clean_null_text(self._get_col_any(row, ("FirmShortName",), cols)) if self._has_col(cols, "FirmShortName") else None
                            client.name = short_name or full_name or f"Клиент #{cid}"
                            client.save(update_fields=["name"])
                        count += 1
                    self.stdout.write(f"   ✅ Загружено/обновлено: {count}")
                    if skipped:
                        self.stdout.write(self.style.WARNING(f"   ⚠️ Пропущено строк: {skipped}"))

            cleaned_clients = self.normalize_client_null_texts()
            self.stdout.write(f"   🧹 Очищено клиентов от строкового NULL: {cleaned_clients}")

            # 3. Заказы
            self.stdout.write("📋 Импорт заказов...")
            with self._open_csv_safely(os.path.join(csv_dir, "orders.csv")) as f:
                reader = csv.DictReader(f, delimiter=";")
                count = 0
                for row in reader:
                    cols = reader.fieldnames
                    oid = int(self._get_col(row, "OrderID", cols))
                    
                    archived_raw = self._get_col(row, "Archived", cols).strip()
                    archived_at = self.parse_dt(archived_raw)
                    if archived_raw and archived_raw.upper() != 'NULL' and archived_at is None:
                        self.stdout.write(f"⚠️ OrderID={oid}: Поле Archived не распознано как дата: '{archived_raw}'")

                    created_raw = self._get_col(row, "DateCreate", cols)
                    created_dt = self.parse_dt(created_raw)
                    if created_dt is None:
                        self.stdout.write(f"⚠️ OrderID={oid}: DateCreate не распознан. Использую текущее время.")
                        created_dt = timezone.now()

                    deadline_dt = self.parse_dt(self._get_col(row, "DateEndCalc", cols))

                    comment = self.clean_null_text(self._get_col(row, "Comment", cols))
                    additional_info = self.clean_null_text(self._get_col(row, "DopInfo", cols))
                    required_documents = self.parse_bool(self._get_col(row, "Documents", cols))

                    Order.objects.update_or_create(
                        pk=oid,
                        defaults={
                            "client_id": int(self._get_col(row, "ClientID", cols)),
                            "product_id": int(self._get_col(row, "ProductTypeID", cols)),
                            "unit_price": self.parse_decimal(self._get_col(row, "Cost", cols)),
                            "quantity": self.parse_decimal(self._get_col(row, "Quantity", cols)),
                            "amount": self.parse_decimal(self._get_col(row, "OrderSum", cols)),
                            "created": created_dt,
                            "deadline": deadline_dt,
                            "comment": comment,
                            "additional_info": additional_info,
                            "paid_amount": Decimal("0"),
                            "required_documents": required_documents,
                            "archived_at": archived_at,
                        }
                    )
                    count += 1
                self.stdout.write(f"   ✅ Загружено/обновлено: {count}")

            with connection.cursor() as cursor:
                cursor.execute("SET FOREIGN_KEY_CHECKS=1")

            self.reset_autoincrement(Product._meta.db_table)
            self.reset_autoincrement(Client._meta.db_table)
            self.reset_autoincrement(Order._meta.db_table)

            self.stdout.write(self.style.SUCCESS("✅ Импорт завершён. Текст корректно восстановлен."))

        except Exception as e:
            with connection.cursor() as cursor:
                cursor.execute("SET FOREIGN_KEY_CHECKS=1")
            raise e