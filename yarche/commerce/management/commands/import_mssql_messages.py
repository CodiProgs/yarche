import csv
import os
import re
from datetime import datetime
from django.core.management.base import BaseCommand
from django.db import connection, transaction, IntegrityError
from django.utils import timezone

from commerce.models import Order, OrderDepartmentWorkMessage
from users.models import User


class Command(BaseCommand):
    help = 'Импорт сообщений из MSSQL-дампа: messages.csv + order_messages.csv'
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
                self.stdout.write(f"🔍 {os.path.basename(filepath)}: кодировка {enc}")
                return open(filepath, 'r', encoding=enc, newline='', errors='replace')
            except UnicodeDecodeError:
                continue
        self.stdout.write(f"⚠️ {os.path.basename(filepath)}: кодировка не определена, используем cp1251.")
        return open(filepath, 'r', encoding='cp1251', newline='', errors='replace')

    def clean_null_text(self, val):
        if val is None:
            return None
        s = str(val).strip()
        if not s or s.upper() in self.NULL_TEXT_VALUES:
            return None
        return s

    def parse_dt(self, val):
        if not val:
            return None
        s = str(val).strip()
        if not s or s.upper() in self.NULL_TEXT_VALUES:
            return None
        formats = [
            '%d.%m.%Y %H:%M:%S.%f', '%Y-%m-%d %H:%M:%S.%f',
            '%d.%m.%Y %H:%M:%S', '%d.%m.%Y %H:%M', '%Y-%m-%d %H:%M:%S',
            '%Y-%m-%d %H:%M', '%d.%m.%Y', '%Y-%m-%d'
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

        messages_csv = os.path.join(csv_dir, 'messages.csv')
        order_messages_csv = os.path.join(csv_dir, 'order_messages.csv')

        if not os.path.exists(messages_csv) or not os.path.exists(order_messages_csv):
            self.stdout.write(self.style.WARNING('⚠️ Файлы messages.csv или order_messages.csv не найдены, отмена'))
            return

        with connection.cursor() as cursor:
            cursor.execute('SET FOREIGN_KEY_CHECKS=0')

        try:
            msgs = self._load_messages(messages_csv, delimiter)
            created, skipped = self._import_order_messages(order_messages_csv, msgs, delimiter)

            with connection.cursor() as cursor:
                cursor.execute('SET FOREIGN_KEY_CHECKS=1')

            self.stdout.write(self.style.SUCCESS(f'✅ Импорт завершён. Создано/обновлено: {created}, пропущено: {skipped}'))
            self.reset_autoincrement(OrderDepartmentWorkMessage._meta.db_table)

        except Exception as e:
            with connection.cursor() as cursor:
                cursor.execute('SET FOREIGN_KEY_CHECKS=1')
            raise

    def _load_messages(self, messages_csv, delimiter):
        self.stdout.write('📥 Чтение messages.csv...')
        msgs = {}
        with self._open_csv_safely(messages_csv) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            for row in reader:
                cols = reader.fieldnames
                try:
                    mid_raw = row.get('MessageID') or row.get('MessageId') or row.get('ID')
                    if mid_raw is None:
                        continue
                    mid = int(float(str(mid_raw).strip()))
                except Exception:
                    continue

                created = self.parse_dt(row.get('Created'))
                author_id = self.parse_int_safe(row.get('FromUserID'))
                recipient_id = self.parse_int_safe(row.get('ToUserID'))
                message_text = self.clean_null_text(row.get('MessageText')) or ''
                viewed = self.clean_null_text(row.get('Viewed'))
                deleted = self.clean_null_text(row.get('Deleted'))

                msgs[mid] = {
                    'created': created,
                    'author_id': author_id,
                    'recipient_id': recipient_id,
                    'message': message_text,
                    'viewed': viewed,
                    'deleted': deleted,
                }
        self.stdout.write(f'   🔢 Сообщений во входном файле: {len(msgs)}')
        return msgs

    def parse_int_safe(self, val):
        if val is None:
            return None
        try:
            return int(float(str(val).strip()))
        except Exception:
            return None

    def _import_order_messages(self, order_messages_csv, msgs, delimiter):
        self.stdout.write('📥 Чтение order_messages.csv и создание сообщений...')
        created = skipped = 0
        with self._open_csv_safely(order_messages_csv) as f:
            reader = csv.DictReader(f, delimiter=delimiter)
            for row in reader:
                try:
                    oid_raw = row.get('OrderMessageID') or row.get('ID')
                    omid = int(float(str(oid_raw).strip()))
                except Exception:
                    skipped += 1
                    continue

                # MessageID в mapping
                mid_raw = row.get('MessageID')
                try:
                    mid = int(float(str(mid_raw).strip()))
                except Exception:
                    # Иногда CSV из MSSQL может иметь смещённые колонки: пробуем взять второй столбец
                    self.stdout.write(f'   ⚠️ Невалидный MessageID в строке OrderMessageID={omid}, пропуск')
                    skipped += 1
                    continue

                order_id = self.parse_int_safe(row.get('OrderID'))

                msg = msgs.get(mid)
                if not msg:
                    self.stdout.write(f'   ⚠️ MessageID={mid} не найден в messages.csv, пропуск')
                    skipped += 1
                    continue

                # Автор обязателен
                author = None
                if msg['author_id']:
                    author = User.objects.filter(pk=msg['author_id']).first()
                if not author:
                    self.stdout.write(f"   ⚠️ Автор MessageID={mid} UserID={msg['author_id']} не найден, пропуск")
                    skipped += 1
                    continue

                recipient = None
                if msg['recipient_id']:
                    recipient = User.objects.filter(pk=msg['recipient_id']).first()

                order_obj = None
                if order_id:
                    order_obj = Order.objects.filter(pk=order_id).first()
                    if not order_obj:
                        self.stdout.write(f'   ⚠️ Order #{order_id} не найден для MessageID={mid}, создаём сообщение без заказа')

                defaults = {
                    'order': order_obj,
                    'author': author,
                    'recipient': recipient,
                    'created': msg['created'] or timezone.now(),
                    'message': msg['message'],
                    'is_read': bool(msg['viewed']),
                }

                try:
                    OrderDepartmentWorkMessage.objects.update_or_create(pk=omid, defaults=defaults)
                    created += 1
                except IntegrityError as e:
                    self.stdout.write(self.style.WARNING(f'   ⚠️ OrderMessageID={omid}: ошибка БД: {e}'))
                    skipped += 1
        return created, skipped
