import csv
import os
from datetime import datetime
from django.core.management.base import BaseCommand
from django.db import connection, transaction
from django.utils import timezone

from commerce.models import Department, OrderWorkStatus


class Command(BaseCommand):
    help = 'Импорт Department.csv и DepartmentState.csv'
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
        # remove BOM and whitespace, lower
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
        # Try provided delimiter first; if headers don't contain expected columns,
        # try common delimiters
        f.seek(0)
        reader = csv.DictReader(f, delimiter=delimiter)
        fieldnames = reader.fieldnames
        if fieldnames and any(self._normalize_field(fn) in [self._normalize_field(c) for c in expected_cols] for fn in fieldnames):
            return reader
        # try sniffing common delimiters
        for d in ['\t', ';', ',', '|']:
            if d == delimiter:
                continue
            f.seek(0)
            reader = csv.DictReader(f, delimiter=d)
            fieldnames = reader.fieldnames
            if fieldnames and any(self._normalize_field(fn) in [self._normalize_field(c) for c in expected_cols] for fn in fieldnames):
                self.stdout.write(f"   ℹ️ Попробовал разделитель {repr(d)} — подходит")
                return reader
        # fallback to original reader
        f.seek(0)
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

    @transaction.atomic
    def handle(self, *args, **options):
        csv_dir = options['csv_dir'].rstrip('\\/')
        delimiter = options['delimiter']
        if delimiter.upper() == 'TAB' or delimiter == '\\t':
            delimiter = '\t'

        self.stdout.write(f"📂 Папка импорта: {csv_dir}")
        self.stdout.write(f"📐 Разделитель: {repr(delimiter)}")

        dept_csv = os.path.join(csv_dir, 'Department.csv')
        dept_state_csv = os.path.join(csv_dir, 'DepartmentState.csv')

        if not os.path.exists(dept_csv) and not os.path.exists(dept_state_csv):
            self.stdout.write(self.style.WARNING('⚠️ Файлы Department.csv и DepartmentState.csv не найдены, отмена'))
            return

        with connection.cursor() as cursor:
            cursor.execute('SET FOREIGN_KEY_CHECKS=0')

        try:
            created_d = skipped_d = 0
            if os.path.exists(dept_csv):
                self.stdout.write('📥 Чтение Department.csv...')
                with self._open_csv_safely(dept_csv) as f:
                    expected = ['DepartmentID', 'DepartmentName']
                    reader = self._ensure_reader_with_good_headers(f, delimiter, expected)
                    fieldnames = reader.fieldnames or []
                    for row in reader:
                        # find actual keys
                        did_key = self._find_column(fieldnames, ['DepartmentID', 'DepartmentId', 'ID'])
                        name_key = self._find_column(fieldnames, ['DepartmentName', 'Name'])
                        did = self.parse_int_safe(row.get(did_key) if did_key else None)
                        name = self.clean_null_text(row.get(name_key) if name_key else None)
                        if not did or not name:
                            skipped_d += 1
                            continue
                        Department.objects.update_or_create(pk=did, defaults={'name': name})
                        created_d += 1
                self.stdout.write(f'   ✅ Загружено/обновлено отделов: {created_d}, пропущено: {skipped_d}')
                # reset autoinc
                with connection.cursor() as cursor:
                    cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {Department._meta.db_table}")
                    max_id = cursor.fetchone()[0]
                    cursor.execute(f"ALTER TABLE {Department._meta.db_table} AUTO_INCREMENT = {max_id + 1}")

            created_s = skipped_s = 0
            if os.path.exists(dept_state_csv):
                self.stdout.write('📥 Чтение DepartmentState.csv...')
                with self._open_csv_safely(dept_state_csv) as f:
                    expected = ['DepartmentStateID', 'DepartmentID', 'DepartmentStateName']
                    reader = self._ensure_reader_with_good_headers(f, delimiter, expected)
                    fieldnames = reader.fieldnames or []
                    for row in reader:
                        sid_key = self._find_column(fieldnames, ['DepartmentStateID', 'ID'])
                        dept_key = self._find_column(fieldnames, ['DepartmentID'])
                        name_key = self._find_column(fieldnames, ['DepartmentStateName', 'Name'])
                        sid = self.parse_int_safe(row.get(sid_key) if sid_key else None)
                        dept_id = self.parse_int_safe(row.get(dept_key) if dept_key else None)
                        name = self.clean_null_text(row.get(name_key) if name_key else None)
                        if not sid or not dept_id or not name:
                            skipped_s += 1
                            continue
                        # привязка к отделу
                        try:
                            dept = Department.objects.get(pk=dept_id)
                        except Department.DoesNotExist:
                            self.stdout.write(f"   ⚠️ Отдел #{dept_id} не найден для StateID={sid}, пропуск")
                            skipped_s += 1
                            continue
                        OrderWorkStatus.objects.update_or_create(pk=sid, defaults={'name': name, 'department': dept})
                        created_s += 1
                self.stdout.write(f'   ✅ Загружено/обновлено состояний: {created_s}, пропущено: {skipped_s}')
                with connection.cursor() as cursor:
                    cursor.execute(f"SELECT COALESCE(MAX(id), 0) FROM {OrderWorkStatus._meta.db_table}")
                    max_id = cursor.fetchone()[0]
                    cursor.execute(f"ALTER TABLE {OrderWorkStatus._meta.db_table} AUTO_INCREMENT = {max_id + 1}")

            with connection.cursor() as cursor:
                cursor.execute('SET FOREIGN_KEY_CHECKS=1')

            self.stdout.write(self.style.SUCCESS('✅ Импорт отделов завершён.'))

        except Exception as e:
            with connection.cursor() as cursor:
                cursor.execute('SET FOREIGN_KEY_CHECKS=1')
            raise
