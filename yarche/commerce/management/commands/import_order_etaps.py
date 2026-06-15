import csv
import os
from datetime import datetime
from django.core.management.base import BaseCommand
from django.db import connection, transaction, IntegrityError
from django.utils import timezone

from commerce.models import Order, Department, OrderDepartmentWork, OrderWorkStatus
from users.models import User


class Command(BaseCommand):
    help = 'Импорт order_etaps.csv в OrderDepartmentWork'
    NULL_TEXT_VALUES = {'', 'NULL', 'None', 'NaN'}

    def add_arguments(self, parser):
        parser.add_argument('csv_dir', type=str, help='Путь к папке с CSV-файлами')
        parser.add_argument('--delimiter', type=str, default='\t', help='Разделитель в CSV (по умолчанию TAB)')

    def _open_csv_safely(self, filepath):
        with open(filepath, 'rb') as f:
            raw = f.read()
        for enc in ('utf-8-sig', 'cp1251', 'utf-8'):
            try:
                raw.decode(enc)
                return open(filepath, 'r', encoding=enc, newline='', errors='replace')
            except UnicodeDecodeError:
                continue
        return open(filepath, 'r', encoding='cp1251', newline='', errors='replace')

    def _normalize_field(self, name):
        if name is None:
            return None
        return str(name).strip().lstrip('\ufeff').lower()

    def _find_column(self, fieldnames, candidates):
        if not fieldnames:
            return None
        norm_map = {self._normalize_field(k): k for k in fieldnames}
        for cand in candidates:
            n = self._normalize_field(cand)
            if n in norm_map:
                return norm_map[n]
        return None

    def _ensure_reader_with_good_headers(self, f, delimiter, expected_cols):
        f.seek(0)
        reader = csv.DictReader(f, delimiter=delimiter)
        fieldnames = reader.fieldnames
        if fieldnames and any(self._normalize_field(fn) in [self._normalize_field(c) for c in expected_cols] for fn in fieldnames):
            return reader
        for d in ['\t', ';', ',', '|']:
            if d == delimiter:
                continue
            f.seek(0)
            reader = csv.DictReader(f, delimiter=d)
            fieldnames = reader.fieldnames
            if fieldnames and any(self._normalize_field(fn) in [self._normalize_field(c) for c in expected_cols] for fn in fieldnames):
                self.stdout.write(f"   ℹ️ Попробовал разделитель {repr(d)} — подходит")
                return reader
        f.seek(0)
        if fieldnames:
            self.stdout.write(f"   ⚠️ Не удалось найти ожидаемые заголовки, используем разделитель {repr(delimiter)}")
        return csv.DictReader(f, delimiter=delimiter)

    def clean_null_text(self, val):
        if val is None:
            return None
        s = str(val).strip()
        if not s or s.upper() in self.NULL_TEXT_VALUES:
            return None
        return s

    def parse_int_safe(self, val):
        if val is None:
            return None
        try:
            return int(float(str(val).strip()))
        except Exception:
            return None

    def parse_dt(self, val):
        if not val:
            return None
        s = str(val).strip()
        if not s or s.upper() in self.NULL_TEXT_VALUES:
            return None
        formats = [
            '%d.%m.%Y %H:%M:%S.%f',
            '%Y-%m-%d %H:%M:%S.%f',
            '%d.%m.%Y %H:%M:%S',
            '%d.%m.%Y %H:%M',
            '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M',
            '%d.%m.%Y',
            '%Y-%m-%d',
        ]
        for fmt in formats:
            try:
                dt = datetime.strptime(s, fmt)
                if timezone.is_naive(dt) and hasattr(timezone, 'get_current_timezone'):
                    dt = timezone.make_aware(dt, timezone=timezone.get_current_timezone())
                return dt
            except Exception:
                continue
        return None

    def reset_autoincrement(self, table_name):
        with connection.cursor() as cursor:
            cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {table_name}")
            max_id = cursor.fetchone()[0]
            cursor.execute(f"ALTER TABLE {table_name} AUTO_INCREMENT = {max_id + 1}")
            self.stdout.write(f"🔧 {table_name}: AUTO_INCREMENT = {max_id + 1}")

    @transaction.atomic
    def handle(self, *args, **options):
        csv_dir = options['csv_dir'].rstrip('\\/')
        delimiter = options['delimiter']
        if delimiter.upper() == 'TAB' or delimiter == '\\t':
            delimiter = '\t'

        self.stdout.write(f"📂 Папка импорта: {csv_dir}")
        self.stdout.write(f"📐 Разделитель: {repr(delimiter)}")

        etaps_csv = os.path.join(csv_dir, 'order_etaps.csv')
        if not os.path.exists(etaps_csv):
            self.stdout.write(self.style.WARNING('⚠️ Файл order_etaps.csv не найден, отмена'))
            return

        with connection.cursor() as cursor:
            cursor.execute('SET FOREIGN_KEY_CHECKS=0')

        try:
            created = skipped = 0
            self.stdout.write('📥 Чтение order_etaps.csv...')
            with self._open_csv_safely(etaps_csv) as f:
                expected = ['OrderEtapID', 'OrderID', 'DepartmentID', 'UserID', 'DepartmentStateID', 'DateCreate', 'DateAccept', 'DateComplete']
                reader = self._ensure_reader_with_good_headers(f, delimiter, expected)
                fieldnames = reader.fieldnames or []
                for row in reader:
                    oid_key = self._find_column(fieldnames, ['OrderEtapID', 'OrderEtapId', 'ID'])
                    order_key = self._find_column(fieldnames, ['OrderID', 'OrderId'])
                    dept_key = self._find_column(fieldnames, ['DepartmentID', 'DepartmentId'])
                    user_key = self._find_column(fieldnames, ['UserID', 'UserId'])
                    state_key = self._find_column(fieldnames, ['DepartmentStateID', 'DepartmentStateId', 'StateID', 'StateId'])
                    date_accept_key = self._find_column(fieldnames, ['DateAccept', 'AcceptedDate', 'DateAccept'])
                    date_create_key = self._find_column(fieldnames, ['DateCreate', 'CreatedDate', 'DateCreate'])
                    date_complete_key = self._find_column(fieldnames, ['DateComplete', 'CompletedDate', 'DateComplete'])

                    oid = self.parse_int_safe(row.get(oid_key) if oid_key else None)
                    order_id = self.parse_int_safe(row.get(order_key) if order_key else None)
                    dept_id = self.parse_int_safe(row.get(dept_key) if dept_key else None)
                    user_id = self.parse_int_safe(row.get(user_key) if user_key else None)
                    state_id = self.parse_int_safe(row.get(state_key) if state_key else None)
                    date_accept = self.parse_dt(row.get(date_accept_key) if date_accept_key else None)
                    date_create = self.parse_dt(row.get(date_create_key) if date_create_key else None)
                    date_complete = self.parse_dt(row.get(date_complete_key) if date_complete_key else None)

                    if not oid or not order_id or not dept_id:
                        skipped += 1
                        continue

                    order_obj = Order.objects.filter(pk=order_id).first()
                    if not order_obj:
                        self.stdout.write(f'   ⚠️ Заказ #{order_id} не найден для OrderEtapID={oid}, пропуск')
                        skipped += 1
                        continue

                    department = Department.objects.filter(pk=dept_id).first()
                    if not department:
                        self.stdout.write(f'   ⚠️ Отдел #{dept_id} не найден для OrderEtapID={oid}, пропуск')
                        skipped += 1
                        continue

                    executor = None
                    if user_id:
                        executor = User.objects.filter(pk=user_id).first()
                        if not executor:
                            self.stdout.write(f'   ⚠️ Пользователь #{user_id} не найден для OrderEtapID={oid}, игнорируем исполнителя')

                    status = None
                    if state_id:
                        status = OrderWorkStatus.objects.filter(pk=state_id).first()
                        if not status:
                            self.stdout.write(f'   ⚠️ Статус #{state_id} не найден для OrderEtapID={oid}, оставляем пустым')

                    defaults = {
                        'order': order_obj,
                        'department': department,
                        'executor': executor,
                        'status': status,
                        'started_at': date_accept or date_create,
                        'completed_at': date_complete,
                    }

                    try:
                        OrderDepartmentWork.objects.update_or_create(pk=oid, defaults=defaults)
                        created += 1
                    except IntegrityError as e:
                        self.stdout.write(self.style.WARNING(f'   ⚠️ OrderEtapID={oid}: ошибка БД: {e}'))
                        skipped += 1

            self.stdout.write(self.style.SUCCESS(f'   ✅ Создано/обновлено: {created}, пропущено: {skipped}'))
            self.reset_autoincrement(OrderDepartmentWork._meta.db_table)

            with connection.cursor() as cursor:
                cursor.execute('SET FOREIGN_KEY_CHECKS=1')

        except Exception:
            with connection.cursor() as cursor:
                cursor.execute('SET FOREIGN_KEY_CHECKS=1')
            raise
