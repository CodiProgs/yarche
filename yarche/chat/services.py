import re
import json
import os
from django.db.models import ForeignKey, CharField, TextField, IntegerField, DecimalField, FloatField, DateTimeField, DateField, BooleanField
from django.apps import apps
from django.utils import timezone
from dotenv import load_dotenv

load_dotenv()

from users.models import User
from ledger.models import BankAccount, BankAccountType, Transaction, TransactionCategory
from commerce.models import Client, Order
from chat.models import ChatActionLog

# ============================================================================
# НАСТРОЙКИ
# ============================================================================

OPENAI_API_KEY = os.getenv('OPENAI_API_KEY', '')
OPENAI_MODEL = os.getenv('OPENAI_MODEL', 'gpt-4o-mini')
OPENAI_MAX_TOKENS = int(os.getenv('OPENAI_MAX_TOKENS', 1000))
OPENAI_BASE_URL = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')

# ============================================================================
# РЕЕСТР МОДЕЛЕЙ
# ============================================================================
MODEL_REGISTRY = {
    'ledger.BankAccountType': {
        'keywords': [
            'тип счета', 'типы счетов', 'типа счетов', 'типу счета', 'типом счета', 'типе счета',
            'типов счетов', 'типами счетов', 'типах счетов',
            'bankaccounttype', 'bank account type', 'account type'
        ],
        'display_fields': ['id', 'name'],
        'search_fields': ['name'],
    },
    'ledger.TransactionCategory': {
        'keywords': [
            'категория', 'категории', 'категорию', 'категорий', 'категориям', 'категориями', 'категориях',
            'категория операции', 'категории операций', 'категорию операции',
            'категория транзакции', 'категории транзакций',
            'transactioncategory', 'transaction category'
        ],
        'display_fields': ['id', 'name', 'type'],
        'search_fields': ['name'],
    },
    'commerce.Client': {
        'keywords': [
            'клиент', 'клиенты', 'клиента', 'клиентов', 'клиенту', 'клиентом', 'клиенте',
            'контрагент', 'контрагенты', 'контрагента', 'контрагентов', 'контрагенту', 'контрагентом', 'контрагенте',
            'клиентка', 'клиентки', 'клиентке', 'клиенткой', 'клиентках', 'клиенток'
        ],
        'display_fields': ['id', 'name', 'inn', 'balance', 'director', 'comment'],
        'search_fields': ['name', 'inn', 'legal_name', 'director', 'comment'],
    },
    'commerce.Order': {
        'keywords': [
            'заказ', 'заказы', 'заказа', 'заказов', 'заказу', 'заказом', 'заказе',
            'сделка', 'сделки', 'сделку', 'сделкой', 'сделках', 'сделок'
        ],
        'display_fields': ['id', 'client', 'product', 'amount', 'paid_amount', 'status', 'created', 'manager'],
        'search_fields': ['comment', 'additional_info'],
        'actions': ['create', 'list', 'get'],
        'filters': {
            'manager': 'manager__username__iexact',
            'my': 'manager__id',
        },
        'creation_info': {
            'required': ['client', 'product', 'amount', 'status'],
            'optional': ['manager', 'unit_price', 'quantity', 'paid_amount',
                        'deadline', 'comment', 'additional_info', 'client_object'],
        }
    },
    'ledger.Transaction': {
        'keywords': [
            'транзакция', 'транзакции', 'транзакций', 'транзакцию', 'транзакцией', 'транзакциях',
            'оплата', 'оплаты', 'оплату', 'оплатой', 'оплатах', 'оплат',
            'платеж', 'платежи', 'платежей', 'платежу', 'платежом', 'платежах',
            'деньги', 'денег', 'деньгам', 'деньгами', 'деньгах',
            'финансы', 'финансов', 'финансам', 'финансами', 'финансах',
            'сделка', 'сделки', 'сделку', 'сделкой', 'сделках', 'сделок'
        ],
        'display_fields': ['id', 'type', 'order', 'client', 'amount', 'created', 'comment'],
        'search_fields': ['comment'],
        'actions': ['create', 'list', 'get'],
        'filters': {
            'manager': 'order__manager__username__iexact',
            'my': 'order__manager__id',
            'order': 'order__id',
        },
        'creation_info': {
            'required': ['bank_account', 'amount', 'type'],
            'optional': ['category', 'client', 'order', 'comment', 'report_date', 'completed_date'],
            'type_choices': ['income', 'expense', 'order_payment', 'transfer', 'client_account_deposit', 'client_account_payment'],
        }
    },
    'ledger.BankAccount': {
        'keywords': [
            'счет', 'счета', 'счетов', 'счету', 'счетом', 'счете',
            'банковский счет', 'банковские счета', 'банковского счета', 'банковских счетов',
            'банк', 'банка', 'банку', 'банком', 'банке'
        ],
        'display_fields': ['id', 'name', 'type', 'balance'],
        'search_fields': ['name'],
    },
    'users.User': {
        'keywords': [
            'пользователь', 'пользователи', 'пользователя', 'пользователей', 'пользователю', 'пользователем', 'пользователе',
            'менеджер', 'менеджеры', 'менеджера', 'менеджеров', 'менеджеру', 'менеджером', 'менеджере',
            'сотрудник', 'сотрудники', 'сотрудника', 'сотрудников', 'сотруднику', 'сотрудником', 'сотруднике'
        ],
        'display_fields': ['id', 'username', 'first_name', 'last_name', 'is_active', 'user_type'],
        'search_fields': ['username', 'first_name', 'last_name'],
    },
    'commerce.Department': {
        'keywords': [
            'отдел', 'отделы', 'отдела', 'отделов', 'отделу', 'отделом', 'отделе'
        ],
        'display_fields': ['id', 'name', 'slug'],
        'search_fields': ['name'],
    },
    'commerce.Product': {
        'keywords': [
            'продукция', 'продукт', 'продукты', 'продукта', 'продуктов', 'продукту', 'продуктом', 'продукте',
            'товар', 'товары', 'товара', 'товаров', 'товару', 'товаром', 'товаре'
        ],
        'display_fields': ['id', 'name'],
        'search_fields': ['name'],
    },
    'commerce.OrderStatus': {
        'keywords': [
            'статус', 'статусы', 'статуса', 'статусов', 'статусу', 'статусом', 'статусе'
        ],
        'display_fields': ['id', 'name'],
        'search_fields': ['name'],
    },
    'commerce.Document': {
        'keywords': [
            'документ', 'документы', 'документа', 'документов', 'документу', 'документом', 'документе',
            'файл', 'файлы', 'файла', 'файлов', 'файлу', 'файлом', 'файле'
        ],
        'display_fields': ['id', 'name', 'user', 'uploaded_at'],
        'search_fields': ['name'],
    },
    'commerce.Contact': {
        'keywords': [
            'контакт', 'контакты', 'контакта', 'контактов', 'контакту', 'контактом', 'контакте'
        ],
        'display_fields': ['id', 'first_name', 'last_name', 'phone1', 'email'],
        'search_fields': ['first_name', 'last_name', 'email'],
    },
}

# ============================================================================
# ДОСТУПНЫЕ ДЕЙСТВИЯ
# ============================================================================

AVAILABLE_ACTIONS = {
    'create_bank_account': {
        'keywords': ['создай счет', 'создать счет', 'добавь счет', 'добавить счет'],
        'model': 'ledger.BankAccount',
        'required_fields': ['name', 'type'],
    },
    'create_transaction': {
        'keywords': ['создай транзакцию', 'создать транзакцию', 'добавь транзакцию', 'проведи оплату'],
        'model': 'ledger.Transaction',
        'required_fields': ['amount', 'type', 'bank_account'],
    },
    'create_category': {
        'keywords': ['создай категорию', 'создать категорию', 'добавь категорию'],
        'model': 'ledger.TransactionCategory',
        'required_fields': ['name', 'type'],
    },
    'close_shift': {
        'keywords': ['закрой смену', 'закрыть смену', 'закрытие смены'],
        'model': None,
        'required_fields': [],
    },
    'delete_bank_account': {
        'keywords': ['удали счет', 'удалить счет'],
        'model': 'ledger.BankAccount',
        'required_fields': ['id'],
    },
    'delete_transaction': {
        'keywords': ['удали транзакцию', 'удалить транзакцию'],
        'model': 'ledger.Transaction',
        'required_fields': ['id'],
    },
}

# ============================================================================
# ЗАГОЛОВКИ ПОЛЕЙ
# ============================================================================

FIELD_LABELS = {
    'id': 'ID', 'name': 'Название', 'username': 'Логин', 'type': 'Тип',
    'amount': 'Сумма', 'balance': 'Баланс', 'status': 'Статус', 'created': 'Дата',
    'client': 'Клиент', 'order': 'Заказ', 'department': 'Отдел', 'user': 'Пользователь',
    'inn': 'ИНН', 'director': 'Директор', 'comment': 'Комментарий', 'email': 'Email',
    'phone1': 'Телефон', 'first_name': 'Имя', 'last_name': 'Фамилия', 'product': 'Продукция',
    'paid_amount': 'Оплачено', 'uploaded_at': 'Загружен', 'message': 'Сообщение',
    'is_read': 'Прочитано', 'is_active': 'Активен', 'slug': 'Slug', 'codename': 'Код',
    'description': 'Описание', 'url_name': 'URL', 'title': 'Заголовок', 'display_name': 'Отображение',
    'created_at': 'Создано', 'token': 'Токен', 'expires_at': 'Истекает', 'is_blocked': 'Заблокировано',
    'menu_item': 'Пункт меню', 'user_type': 'Тип пользователя', 'category': 'Категория',
    'started_at': 'Начало', 'completed_at': 'Завершение', 'executor': 'Исполнитель',
    'deadline': 'Срок', 'quantity': 'Количество', 'unit_price': 'Цена',
    'legal_name': 'Юр.название', 'ogrn': 'ОГРН', 'basis': 'Основание',
    'position': 'Должность', 'file_type': 'Тип файла', 'bank_account': 'Счет',
    'created_by': 'Создал', 'author': 'Автор', 'recipient': 'Получатель',
    'file': 'Файл', 'size': 'Размер', 'url': 'URL', 'order_work': 'Работа',
    'column': 'Столбец', 'added_at': 'Добавлен', 'report_date': 'Месяц',
    'completed_date': 'Выполнено', 'related_transaction': 'Связанная',
    'chief_user_type': 'Главный', 'worker_user_type': 'Работник',
    'manager': 'Менеджер', 'client_object': 'Объект', 'required_documents': 'Документы',
    'archived_at': 'Архив', 'additional_info': 'Инфо', 'socials': 'Соцсети',
    'birthday': 'ДР', 'phone2': 'Телефон 2', 'phone3': 'Телефон 3',
    'legal_address': 'Юр.адрес', 'actual_address': 'Факт.адрес',
    'patronymic': 'Отчество', 'date_joined': 'Дата регистрации',
    'permissions': 'Права', 'is_valid': 'Действует',
}

# ============================================================================
# ГЕНЕРАЦИЯ СХЕМЫ БД ДЛЯ AI
# ============================================================================

DATABASE_SCHEMA = ""
for model_path, config in MODEL_REGISTRY.items():
    try:
        app_label, model_name = model_path.split('.')
        model_class = apps.get_model(app_label, model_name)
        fields = []
        for field in model_class._meta.get_fields()[:10]:
            fields.append(f"  - {field.name}: {type(field).__name__}")
        DATABASE_SCHEMA += f"\n{model_path}:\n" + "\n".join(fields) + "\n"
    except:
        pass

# ============================================================================
# ФУНКЦИИ ЛОГИРОВАНИЯ
# ============================================================================

def log_chat_action(user, action, model_name, object_id, object_repr,
                    query_text, data_before=None, data_after=None,
                    can_restore=False, error_message=None):
    try:
        ChatActionLog.objects.create(
            user=user,
            action=action,
            model_name=model_name,
            object_id=object_id,
            object_repr=object_repr,
            query_text=query_text,
            data_before=data_before,
            data_after=data_after,
            can_restore=can_restore,
            error_message=error_message
        )
    except Exception as e:
        print(f"Error logging action: {e}")


def get_model_data(obj):
    if not obj:
        return None
    
    data = {}
    for field in obj._meta.get_fields():
        if field.name in ['id', 'password', '_state']:
            continue
        
        value = getattr(obj, field.name, None)
        
        if value is None:
            data[field.name] = None
        elif hasattr(value, 'pk'):
            data[f'{field.name}_id'] = value.id
        elif hasattr(value, 'strftime'):
            data[field.name] = value.isoformat()
        elif isinstance(value, (list, dict)):
            data[field.name] = value
        elif isinstance(value, bool):
            data[field.name] = value
        elif isinstance(value, (int, float)):
            data[field.name] = value
        else:
            data[field.name] = str(value) if value is not None else None
    
    return data

# ============================================================================
# ПРОВЕРКА ПРАВ
# ============================================================================

def check_action_permission(user, action_name):
    permission_map = {
        'close_shift': 'close_shift',
    }
    
    permission = permission_map.get(action_name)
    if not permission:
        return True
    
    if hasattr(user, 'user_type') and user.user_type:
        return user.user_type.permissions.filter(codename=permission.split('.')[-1]).exists()
    
    return user.is_staff

# ============================================================================
# 🔧 ФУНКЦИЯ ПРОВЕРКИ НА ЗАПРОС ИНФОРМАЦИИ О СОЗДАНИИ (ВЫЗЫВАЕТСЯ ПЕРВОЙ!)
# ============================================================================

def is_creation_info_request(query_text):
    """
    🔧 ПРОВЕРЯЕТ: это запрос информации о создании? (например "как создать транзакцию")
    Возвращает True если это запрос информации, а не действие
    """
    query_lower = query_text.lower()
    
    creation_info_phrases = [
        'как создать',
        'что нужно чтобы создать',
        'что нужно для создания',
        'какие поля нужны',
        'какие поля обязательны',
        'какие поля для создания',
        'какие данные нужны',
        'что указать для',
        'какие поля у',
        'какие поля в',
        'какие поля для',
    ]
    
    return any(phrase in query_lower for phrase in creation_info_phrases)


def handle_creation_info_request(query_text, user):
    """Обрабатывает запросы типа 'что нужно чтобы создать транзакцию'"""
    query_lower = query_text.lower()
    
    creation_phrases = [
        'что нужно чтобы создать', 'что нужно для создания', 'как создать',
        'какие поля нужны', 'какие поля обязательны', 'какие поля для создания',
        'какие данные нужны', 'что указать для',
    ]
    
    is_creation_request = any(phrase in query_lower for phrase in creation_phrases)
    if not is_creation_request:
        return None, None
    
    found_model_path = None
    found_config = None
    
    for model_path, config in MODEL_REGISTRY.items():
        for keyword in config['keywords']:
            if keyword in query_lower:
                found_model_path = model_path
                found_config = config
                break
        if found_model_path:
            break
    
    if not found_model_path:
        return None, None
    
    template_data, error = get_model_creation_template(found_model_path)
    if error:
        return None, None
    
    try:
        app_label, model_name = found_model_path.split('.')
        model_class = apps.get_model(app_label, model_name)
        model_verbose = model_class._meta.verbose_name
        model_verbose_plural = model_class._meta.verbose_name_plural
    except:
        model_verbose = template_data['model_name']
        model_verbose_plural = model_verbose
    
    response_text = f"📋 Для создания <b>{model_verbose}</b> нужны:<br><br>"
    
    if template_data['required_fields']:
        response_text += "✅ <b>Обязательные поля:</b><br>"
        for field in template_data['required_fields']:
            choices_info = ""
            if field.get('choices'):
                choices = [c[0] for c in field['choices'][:3]]
                choices_info = f" (варианты: {', '.join(choices)})"
            response_text += f"  • {field['verbose_name']} ({field['name']}){choices_info}<br>"
        response_text += "<br>"
    
    if template_data['optional_fields']:
        response_text += "⚪ <b>Необязательные поля:</b><br>"
        for field in template_data['optional_fields'][:10]:
            response_text += f"  • {field['verbose_name']} ({field['name']})<br>"
        if len(template_data['optional_fields']) > 10:
            response_text += f"  ... и ещё {len(template_data['optional_fields']) - 10}<br>"
        response_text += "<br>"
    
    creation_prompt = generate_creation_prompt(found_model_path, template_data)
    response_text += f"📝 <b>Готовый промпт для создания (скопируйте и измените данные):</b><br>"
    response_text += f"<code style='background:#222;padding:10px;border-radius:4px;display:block;margin:10px 0;'>{creation_prompt}</code>"
    
    return response_text, ""


# ============================================================================
# ФУНКЦИИ ВЫПОЛНЕНИЯ ДЕЙСТВИЙ
# ============================================================================

def execute_action(action_name, params, user, query_text):
    if not check_action_permission(user, action_name):
        log_chat_action(
            user=user, action='delete', model_name='unknown',
            object_id=None, object_repr=action_name,
            query_text=query_text, error_message='Нет прав на выполнение действия',
            can_restore=False
        )
        return f"❌ Нет прав на выполнение действия: {action_name}", ""
    
    if action_name == 'create_bank_account':
        return create_bank_account_action(params, user, query_text)
    elif action_name == 'create_transaction':
        return create_transaction_action(params, user, query_text)
    elif action_name == 'create_category':
        return create_category_action(params, user, query_text)
    elif action_name == 'close_shift':
        return close_shift_action(user, query_text)
    elif action_name == 'delete_bank_account':
        return delete_bank_account_action(params, user, query_text)
    elif action_name == 'delete_transaction':
        return delete_transaction_action(params, user, query_text)
    else:
        return f"Действие '{action_name}' не поддерживается", ""


def create_bank_account_action(params, user, query_text):
    try:
        name = params.get('name')
        type_name = params.get('type_name')
        type_id = params.get('type_id')
        
        if not name:
            log_chat_action(
                user=user, action='create', model_name='ledger.BankAccount',
                object_id=None, object_repr=name or 'Не указано',
                query_text=query_text, error_message='Не указано название',
                can_restore=False
            )
            return "❌ Не указано название счета", ""
        
        if type_name:
            bank_type = BankAccountType.objects.filter(name__icontains=type_name).first()
            if not bank_type:
                bank_type = BankAccountType.objects.create(name=type_name)
            type_id = bank_type.id
        elif not type_id:
            bank_type = BankAccountType.objects.first()
            if bank_type:
                type_id = bank_type.id
        
        account = BankAccount.objects.create(name=name, type_id=type_id)
        
        log_chat_action(
            user=user, action='create', model_name='ledger.BankAccount',
            object_id=account.id, object_repr=f"Счет '{account.name}'",
            query_text=query_text, data_after=get_model_data(account),
            can_restore=False
        )
        
        text = f"✅ Счет '{account.name}' создан (ID: {account.id}, Тип: {account.type.name})"
        html = generate_html_table(BankAccount, [account])
        return text, html
    except Exception as e:
        log_chat_action(
            user=user, action='create', model_name='ledger.BankAccount',
            object_id=None, object_repr=params.get('name', 'Unknown'),
            query_text=query_text, error_message=str(e),
            can_restore=False
        )
        return f"❌ Ошибка при создании счета: {str(e)}", ""


def create_transaction_action(params, user, query_text):
    try:
        amount = params.get('amount')
        trans_type = params.get('type', 'order_payment')
        bank_account_id = params.get('bank_account_id')
        order_id = params.get('order_id')
        client_id = params.get('client_id')
        comment = params.get('comment', '')
        
        if not amount:
            log_chat_action(
                user=user, action='create', model_name='ledger.Transaction',
                object_id=None, object_repr='Не указана сумма',
                query_text=query_text, error_message='Не указана сумма',
                can_restore=False
            )
            return "❌ Не указана сумма", ""
        
        if not bank_account_id:
            bank_account = BankAccount.objects.first()
            if bank_account:
                bank_account_id = bank_account.id
            else:
                log_chat_action(
                    user=user, action='create', model_name='ledger.Transaction',
                    object_id=None, object_repr='Нет доступных счетов',
                    query_text=query_text, error_message='Нет доступных счетов',
                    can_restore=False
                )
                return "❌ Нет доступных счетов", ""
        
        if trans_type in ['expense', 'client_account_payment']:
            amount = -abs(float(amount))
        else:
            amount = abs(float(amount))
        
        transaction = Transaction.objects.create(
            bank_account_id=bank_account_id,
            amount=amount,
            type=trans_type,
            order_id=order_id,
            client_id=client_id,
            comment=comment,
            created_by=user
        )
        
        log_chat_action(
            user=user, action='create', model_name='ledger.Transaction',
            object_id=transaction.id, object_repr=f"Транзакция #{transaction.id}",
            query_text=query_text, data_after=get_model_data(transaction),
            can_restore=False
        )
        
        text = f"✅ Транзакция создана (ID: {transaction.id}, Сумма: {transaction.amount})"
        html = generate_html_table(Transaction, [transaction])
        return text, html
    except Exception as e:
        log_chat_action(
            user=user, action='create', model_name='ledger.Transaction',
            object_id=None, object_repr='Ошибка',
            query_text=query_text, error_message=str(e),
            can_restore=False
        )
        return f"❌ Ошибка при создании транзакции: {str(e)}", ""


def create_category_action(params, user, query_text):
    try:
        name = params.get('name')
        category_type = params.get('type', 'income')
        
        if not name:
            log_chat_action(
                user=user, action='create', model_name='ledger.TransactionCategory',
                object_id=None, object_repr='Не указано название категории',
                query_text=query_text, error_message='Не указано название категории',
                can_restore=False
            )
            return "❌ Не указано название категории", ""
        
        if category_type not in ['income', 'expense']:
            category_type = 'income'
        
        category = TransactionCategory.objects.create(name=name, type=category_type)
        
        log_chat_action(
            user=user, action='create', model_name='ledger.TransactionCategory',
            object_id=category.id, object_repr=f"Категория '{category.name}'",
            query_text=query_text, data_after=get_model_data(category),
            can_restore=False
        )
        
        text = f"✅ Категория '{category.name}' создана (ID: {category.id})"
        html = generate_html_table(TransactionCategory, [category])
        return text, html
    except Exception as e:
        log_chat_action(
            user=user, action='create', model_name='ledger.TransactionCategory',
            object_id=None, object_repr='Ошибка',
            query_text=query_text, error_message=str(e),
            can_restore=False
        )
        return f"❌ Ошибка при создании категории: {str(e)}", ""


def close_shift_action(user, query_text):
    from ledger.views import close_shift
    from django.http import HttpRequest
    
    try:
        request = HttpRequest()
        request.user = user
        request.method = 'POST'
        
        response = close_shift(request)
        
        if hasattr(response, 'content'):
            import json as json_module
            data = json_module.loads(response.content)
            if data.get('status') == 'success':
                log_chat_action(
                    user=user, action='close', model_name='ledger.Shift',
                    object_id=None, object_repr='Смена закрыта',
                    query_text=query_text, can_restore=False
                )
                return "✅ Смена успешно закрыта", ""
            else:
                log_chat_action(
                    user=user, action='close', model_name='ledger.Shift',
                    object_id=None, object_repr='Ошибка при закрытии смены',
                    query_text=query_text,
                    error_message=data.get('message', 'Ошибка при закрытии смены'),
                    can_restore=False
                )
                return f"❌ {data.get('message', 'Ошибка при закрытии смены')}", ""
        
        return "✅ Смена закрыта", ""
    except Exception as e:
        log_chat_action(
            user=user, action='close', model_name='ledger.Shift',
            object_id=None, object_repr='Ошибка',
            query_text=query_text, error_message=str(e),
            can_restore=False
        )
        return f"❌ Ошибка при закрытии смены: {str(e)}", ""


def delete_bank_account_action(params, user, query_text):
    try:
        account_id = params.get('id')
        
        if not account_id:
            return "❌ Не указан ID счета", ""
        
        account = BankAccount.objects.get(id=account_id)
        data_before = get_model_data(account)
        object_repr = f"Счет '{account.name}' (ID: {account_id})"
        
        account.delete()
        
        log_chat_action(
            user=user, action='delete', model_name='ledger.BankAccount',
            object_id=account_id, object_repr=object_repr,
            query_text=query_text, data_before=data_before,
            data_after=None, can_restore=True
        )
        
        return f"✅ Счет '{object_repr}' удален. Можно восстановить из логов.", ""
    except BankAccount.DoesNotExist:
        log_chat_action(
            user=user, action='delete', model_name='ledger.BankAccount',
            object_id=account_id, object_repr=f'Счет ID {account_id}',
            query_text=query_text, error_message='Счет не найден',
            can_restore=False
        )
        return f"❌ Счет с ID {account_id} не найден", ""
    except Exception as e:
        log_chat_action(
            user=user, action='delete', model_name='ledger.BankAccount',
            object_id=params.get('id'), object_repr='Unknown',
            query_text=query_text, error_message=str(e),
            can_restore=False
        )
        return f"❌ Ошибка при удалении счета: {str(e)}", ""


def delete_transaction_action(params, user, query_text):
    try:
        trans_id = params.get('id')
        
        if not trans_id:
            return "❌ Не указан ID транзакции", ""
        
        transaction = Transaction.objects.get(id=trans_id)
        data_before = get_model_data(transaction)
        object_repr = f"Транзакция #{transaction.id} ({transaction.amount})"
        
        transaction.delete()
        
        log_chat_action(
            user=user, action='delete', model_name='ledger.Transaction',
            object_id=trans_id, object_repr=object_repr,
            query_text=query_text, data_before=data_before,
            can_restore=True
        )
        
        return f"✅ Транзакция {object_repr} удалена. Можно восстановить.", ""
    except Transaction.DoesNotExist:
        return f"❌ Транзакция с ID {trans_id} не найдена", ""
    except Exception as e:
        return f"❌ Ошибка: {str(e)}", ""

# ============================================================================
# ШАБЛОНЫ СОЗДАНИЯ МОДЕЛЕЙ
# ============================================================================

def get_model_creation_template(model_path):
    try:
        app_label, model_name = model_path.split('.')
        model_class = apps.get_model(app_label, model_name)
    except:
        return None, "Модель не найдена"
    
    required_fields = []
    optional_fields = []
    foreign_key_fields = []
    
    for field in model_class._meta.get_fields():
        if field.name in ['id', 'password', 'last_login', 'is_superuser', 'groups',
                          'user_permissions', 'created', 'updated', 'modified']:
            continue
        if field.many_to_one and field.related_model == model_class:
            continue
        if field.one_to_many or field.many_to_many:
            continue
        
        field_info = {
            'name': field.name,
            'type': type(field).__name__,
            'verbose_name': getattr(field, 'verbose_name', field.name),
            'blank': getattr(field, 'blank', False),
            'null': getattr(field, 'null', False),
            'default': field.default if field.default is not None else None,
            'choices': getattr(field, 'choices', None),
            'max_length': getattr(field, 'max_length', None),
        }
        
        is_required = not field.blank and not field.null and field.default is None
        
        if isinstance(field, ForeignKey):
            foreign_key_fields.append({
                **field_info,
                'related_model': f"{field.related_model._meta.app_label}.{field.related_model.__name__}"
            })
            if is_required:
                required_fields.append(field_info)
            else:
                optional_fields.append(field_info)
        elif is_required:
            required_fields.append(field_info)
        else:
            optional_fields.append(field_info)
    
    return {
        'model_name': model_name,
        'model_path': model_path,
        'required_fields': required_fields,
        'optional_fields': optional_fields,
        'foreign_key_fields': foreign_key_fields,
    }, None


def generate_creation_prompt(model_path, template_data):
    """Генерирует готовый промпт для создания объекта с тестовыми данными"""
    try:
        app_label, model_name = model_path.split('.')
        model_class = apps.get_model(app_label, model_name)
    except:
        return "Модель не найдена"
    
    model_verbose = model_class._meta.verbose_name
    
    test_values = {}
    
    for field in model_class._meta.get_fields():
        if field.name in ['id', 'password', 'last_login', 'is_superuser', 'groups',
                          'user_permissions', 'created', 'updated', 'modified']:
            continue
        if field.one_to_many or field.many_to_many:
            continue
        
        if isinstance(field, ForeignKey):
            try:
                first_obj = field.related_model.objects.first()
                
                test_values[field.name] = f"{first_obj}" if first_obj else "1"
            except:
                test_values[field.name] = "1"
        
        elif isinstance(field, (CharField, TextField)):
            if field.choices:
                test_values[field.name] = field.choices[0][0]
            elif field.name == 'name':
                test_values[field.name] = f"Тестовый {model_verbose}"
            elif field.name == 'comment':
                test_values[field.name] = "Комментарий"
            elif field.name == 'username':
                test_values[field.name] = "user_test"
            elif field.name == 'type':
                test_values[field.name] = 'income'
            else:
                test_values[field.name] = f"Тест {field.name}"
        
        elif isinstance(field, (IntegerField, DecimalField, FloatField)):
            if field.name == 'amount':
                test_values[field.name] = 1000
            elif field.name == 'balance':
                test_values[field.name] = 0
            elif field.name == 'quantity':
                test_values[field.name] = 1
            else:
                test_values[field.name] = 1
        
        elif isinstance(field, (DateTimeField, DateField)):
            test_values[field.name] = timezone.now().strftime('%Y-%m-%d')
        
        elif isinstance(field, BooleanField):
            test_values[field.name] = False
        
        elif hasattr(field, 'default') and field.default is not None:
            test_values[field.name] = field.default
    
    prompt = f"создай {model_verbose.lower()} с полями:<br>"
    for field_name, value in test_values.items():
        if isinstance(value, str):
            prompt += f"  {field_name}: &quot;{value}&quot;<br>"
        else:
            prompt += f"  {field_name}: {value}<br>"
    
    return prompt

# ============================================================================
# ОБРАБОТКА ОБЩИХ ВОПРОСОВ (МАТЕМАТИКА, ДАТА, ПРИВЕТСТВИЯ)
# ============================================================================

import operator
import re
from datetime import datetime

def handle_general_question(query_text, user):
    """Обрабатывает общие вопросы: математика, дата, приветствия"""
    query_lower = query_text.lower().strip()
    
    greetings = ['привет', 'здравствуйте', 'добрый день', 'доброе утро', 'добрый вечер', 'hi', 'hello', 'hey']
    if any(re.search(r'\b' + re.escape(greet) + r'\b', query_lower) for greet in greetings):
        return f"👋 Привет! Я чат-бот CRM. Чем могу помочь?<br><br>Введите <b>помощь</b> для списка команд.", ""
    
    goodbyes = ['пока', 'до свидания', 'спасибо', 'благодарю', 'bye', 'goodbye', 'thanks']
    if any(re.search(r'\b' + re.escape(goodbye) + r'\b', query_lower) for goodbye in goodbyes):
        return "👋 Всего доброго! Обращайтесь если что-то понадобится.", ""
    
    math_match = re.search(r'(сколько\s*)?([\d\s\+\-\*\/\.\(\)]+)', query_lower)
    if math_match and any(op in query_lower for op in ['+', '-', '*', '/', '**', '%']):
        try:
            expr = math_match.group(2).strip()
            expr_clean = re.sub(r'[^\d\s\+\-\*\/\.\(\)]', '', expr)
            if expr_clean and len(expr_clean) <= 50:
                result = safe_eval(expr_clean)
                return f"🧮 <code>{expr_clean}</code> = <b>{result}</b>", ""
        except:
            pass
    
    time_phrases = [
        'какая сейчас дата', 'какое сегодня число', 'текущая дата', 'сегодня',
        'какое время', 'который час', 'сколько времени', 'сколько сейчас времени'
    ]
    if any(phrase in query_lower for phrase in time_phrases):
        now = datetime.now()
        date_str = now.strftime('%d.%m.%Y')
        time_str = now.strftime('%H:%M')
        weekday = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'][now.weekday()]
        return f"📅 Сегодня: <b>{date_str}</b> ({weekday})<br>🕐 Время: <b>{time_str}</b>", ""
    
    identity_phrases = [
        'кто ты', 'что ты', 'как тебя зовут', 'ты кто', 'your name', 'who are you',
        'что ты умеешь', 'что можешь', 'какие у тебя функции'
    ]
    if any(phrase in query_lower for phrase in identity_phrases):
        return (
            "🤖 Я — чат-бот CRM системы.<br><br>"
            "Могу:<br>"
            "• Показывать данные (клиенты, заказы, транзакции)<br>"
            "• Создавать и удалять объекты<br>"
            "• Отвечать на вопросы по базе<br>"
            "• Считать математику и показывать дату<br><br>"
            "Введите <b>помощь</b> для подробной инструкции."
        ), ""
    
    system_phrases = [
        'какие модели', 'что в базе', 'какие данные', 'что есть в системе',
        'какие объекты', 'что можно посмотреть', 'что доступно'
    ]
    if any(phrase in query_lower for phrase in system_phrases):
        models_list = ", ".join([
            "Клиенты", "Заказы", "Транзакции", "Счета", "Отделы",
            "Продукция", "Контакты", "Документы", "Пользователи"
        ])
        return f"📊 В системе доступны:<br>{models_list}<br><br>Введите <b>помощь</b> для списка команд.", ""
    
    return None, None


def safe_eval(expr):
    """
    Безопасное вычисление математических выражений
    """
    operators = {
        '+': operator.add,
        '-': operator.sub,
        '*': operator.mul,
        '/': operator.truediv,
        '**': operator.pow,
        '%': operator.mod,
        '//': operator.floordiv,
    }
    
    expr = expr.replace(' ', '')
    
    if not re.match(r'^[\d\.\+\-\*\/\(\)\%\*\*]+$', expr):
        raise ValueError("Недопустимые символы")
    
    if expr.count('(') > 5:
        raise ValueError("Слишком сложное выражение")
    
    result = eval(expr, {"__builtins__": {}}, {})
    
    if isinstance(result, float):
        if result == int(result):
            return int(result)
        return round(result, 4)
    return result

# ============================================================================
# AI ФУНКЦИИ
# ============================================================================

def get_ai_response(query_text, user, original_query=None):
    """
    🔧 ПРИНИМАЕТ 3 АРГУМЕНТА (query_text, user, original_query)
    """
    if not original_query:
        original_query = query_text
    
    
    help_response, help_html = handle_help_request(query_text, user)
    if help_response:
        return help_response, help_html

    creation_response, creation_html = handle_creation_info_request(query_text, user)
    if creation_response:
        return creation_response, creation_html
    
    general_response, general_html = handle_general_question(query_text, user)
    if general_response:
        return general_response, general_html

    if not OPENAI_API_KEY:
        return analyze_and_respond_local(query_text, user, original_query)
    
    try:
        from openai import OpenAI
        client = OpenAI(api_key=OPENAI_API_KEY, base_url=OPENAI_BASE_URL)
        
        actions_schema = "\n".join([
            f"- {action}: {', '.join(config['keywords'])}"
            for action, config in AVAILABLE_ACTIONS.items()
        ])
        
        system_prompt = f"""
Ты — ассистент CRM. Возвращай СТРОГО JSON:
{{
    "mode": "query"|"action"|"creation_info"|"info",
    "action": "action_name"|null,
    "model": "app.ModelName"|null,
    "filters": {{}},
    "params": {{}},
    "limit": int,
    "text_response": str,
    "needs_html_table": bool,
    "show_creation_template": bool
}}

Доступные действия:
{actions_schema}

Доступные модели:
{DATABASE_SCHEMA}

Правила:
- "что нужно чтобы создать транзакцию" → {{"mode":"creation_info","model":"ledger.Transaction","show_creation_template":true}}
- "как создать заказ" → {{"mode":"creation_info","model":"commerce.Order","show_creation_template":true}}
- "создай счет 'Счет 4' с типом Банковский счет" → {{"mode":"action","action":"create_bank_account","params":{{"name":"Счет 4","type_name":"Банковский счет"}}}}
- "транзакции" → {{"mode":"query","model":"ledger.Transaction","filters":{{}},"limit":20,"needs_html_table":true}}
- "клиент 5" → {{"mode":"query","model":"commerce.Client","filters":{{"id":5}},"limit":1}}

Возвращай только JSON!
"""
        response = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": query_text}
            ],
            max_tokens=OPENAI_MAX_TOKENS,
            temperature=0.1,
            response_format={"type": "json_object"}
        )
        parsed = json.loads(response.choices[0].message.content)
        return process_ai_response(parsed, user, original_query)
    except Exception as e:
        print(f"AI Error: {e}")
        return analyze_and_respond_local(query_text, user, original_query)


def process_ai_response(ai_parsed, user, original_query):
    mode = ai_parsed.get('mode', 'query')
    show_creation_template = ai_parsed.get('show_creation_template', False)
    model_path = ai_parsed.get('model')
    
    if mode == 'creation_info' or show_creation_template:
        if model_path:
            template_data, error = get_model_creation_template(model_path)
            if error:
                return error, ""
            
            response_text = f"📋 Для создания {template_data['model_name']} нужны:\n\n"
            
            if template_data['required_fields']:
                response_text += "✅ **Обязательные поля:**\n"
                for field in template_data['required_fields']:
                    choices_info = ""
                    if field.get('choices'):
                        choices = [c[0] for c in field['choices'][:3]]
                        choices_info = f" (варианты: {', '.join(choices)})"
                    response_text += f"  • {field['verbose_name']} ({field['name']}){choices_info}\n"
                response_text += "\n"
            
            if template_data['optional_fields']:
                response_text += "⚪ **Необязательные поля:**\n"
                for field in template_data['optional_fields'][:10]:
                    response_text += f"  • {field['verbose_name']} ({field['name']})\n"
                if len(template_data['optional_fields']) > 10:
                    response_text += f"  ... и ещё {len(template_data['optional_fields']) - 10}\n"
                response_text += "\n"
            
            creation_prompt = generate_creation_prompt(model_path, template_data)
            response_text += f"📝 **Готовый промпт для создания (скопируйте и измените данные):**\n"
            response_text += f"```\n{creation_prompt}\n```"
            
            return response_text, ""
        else:
            return "Модель не указана", ""
    
    elif mode == 'action':
        action_name = ai_parsed.get('action')
        params = ai_parsed.get('params', {})
        if action_name:
            return execute_action(action_name, params, user, original_query)
        else:
            return "Действие не указано", ""
    
    elif mode == 'query':
        return execute_db_query(ai_parsed, user, original_query)
    
    else:
        return ai_parsed.get('text_response', 'Запрос обработан'), ""


def execute_db_query(ai_parsed, user, original_query):
    action = ai_parsed.get('action', 'info')
    model_path = ai_parsed.get('model')
    filters = ai_parsed.get('filters', {})
    limit = ai_parsed.get('limit', 10)
    text_response = ai_parsed.get('text_response', '')
    needs_html_table = ai_parsed.get('needs_html_table', False)
    filter_by_user = ai_parsed.get('filter_by_user', False)
    
    if action == 'query' and model_path:
        try:
            app_label, model_name = model_path.split('.')
            model_class = apps.get_model(app_label, model_name)
            
            queryset = model_class.objects.all()
            config = MODEL_REGISTRY.get(model_path, {})
            model_filters = config.get('filters', {})
            
            for field, value in filters.items():
                if field in model_filters:
                    queryset = queryset.filter(**{model_filters[field]: value})
                else:
                    queryset = queryset.filter(**{field: value})
            
            if filter_by_user and 'manager' in config.get('filters', {}):
                queryset = queryset.filter(**{config['filters']['my']: user.id})
            
            queryset = queryset.order_by('-id')[:limit]
            results = list(queryset)
            
            if not results:
                return f"По запросу '{original_query}' ничего не найдено", ""
            
            response_html = generate_html_table(model_class, results) if needs_html_table else ""
            return text_response or f"Найдено: {len(results)}", response_html
        except Exception as e:
            return f"Ошибка: {str(e)}", ""
    
    return text_response or "Запрос обработан", ""


def generate_html_table(model_class, queryset):
    model_path = f"{model_class._meta.app_label}.{model_class.__name__}"
    config = MODEL_REGISTRY.get(model_path, {})
    fields = config.get('display_fields', ['id', 'name'])

    html = '<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:13px;background-color:#333;color:white;">'
    html += '<thead><tr style="background-color:#444;color:white;text-align:left;">'

    for field_name in fields:
        label = FIELD_LABELS.get(field_name, field_name.replace('_', ' ').title())
        html += f'<th style="padding:8px;border:1px solid #444;">{label}</th>'
    html += '</tr></thead><tbody>'

    for obj in queryset:
        html += '<tr>'
        for field_name in fields:
            try:
                value = getattr(obj, field_name, None)

                if value is None:
                    display_value = '-'
                elif hasattr(value, 'pk'):
                    display_value = f"{value}"
                    if field_name == 'order' and hasattr(value, 'id'):
                        display_value = f'<a href="/commerce/order/{value.id}/" style="color:#3b82f6;">#{value.id}</a>'
                    elif field_name == 'client' and hasattr(value, 'name'):
                        display_value = f'{value.name}'
                    elif field_name == 'department' and hasattr(value, 'name'):
                        display_value = f'{value.name}'
                    elif field_name == 'user' and hasattr(value, 'username'):
                        display_value = f'{value.username}'
                    elif field_name == 'manager' and hasattr(value, 'username'):
                        display_value = f'{value.username}'
                    elif field_name == 'type' and hasattr(value, 'name'):
                        display_value = f'{value.name}'
                elif hasattr(value, 'strftime'):
                    display_value = value.strftime('%d.%m.%Y %H:%M')
                elif isinstance(value, bool):
                    display_value = '✅' if value else '❌'
                elif isinstance(value, str) and len(value) > 50:
                    display_value = value[:50] + '…'
                else:
                    display_value = str(value)

                style = ''
                if field_name in ['amount', 'balance', 'paid_amount']:
                    style = 'color:lightgreen;font-weight:bold;'
                elif field_name == 'type' and str(value) in ['expense', 'расход']:
                    style = 'color:lightcoral;'

                html += f'<td style="padding:8px;border:1px solid #444;{style}">{display_value}</td>'
            except:
                html += '<td style="padding:8px;border:1px solid #444;">-</td>'
        html += '</tr>'

    html += '</tbody></table></div>'
    return html


# ============================================================================
# ЛОКАЛЬНАЯ ФУНКЦИЯ (РЕЗЕРВНАЯ)
# ============================================================================

def analyze_and_respond_local(query_text, user, original_query=None):
    """Локальная логика без AI"""
    if not original_query:
        original_query = query_text
    
    query_lower = query_text.lower()
    
    
    help_response, help_html = handle_help_request(query_text, user)
    if help_response:
        return help_response, help_html

    creation_response, creation_html = handle_creation_info_request(query_text, user)
    if creation_response:
        return creation_response, creation_html

    general_response, general_html = handle_general_question(query_text, user)
    if general_response:
        return general_response, general_html
    
    STOP_PHRASES = [
        'с полем', 'с колонкой', 'где есть', 'которые', 'в которых',
        'покажи', 'показать', 'выведи', 'дай', 'найди', 'посмотри',
        'отобрази', 'отобразить', 'список', 'таблицу', 'мне', 'я', 'хочу', 'нужно',
        'последние', 'все', 'всех', 'вся', 'всё', 'были', 'ли', 'какой', 'какие'
    ]
    
    STOP_WORDS = {
        'c', 'с', 'полем', 'колонкой', 'комментарий', 'комментарии',
        'поле', 'поля', 'колонка', 'колонки', 'от', 'по', 'для', 'на', 'в'
    }
    
    def clean_query(text):
        result = text
        for phrase in STOP_PHRASES:
            result = re.sub(r'\b' + re.escape(phrase) + r'\b', '', result, flags=re.IGNORECASE)
        for word in STOP_WORDS:
            result = re.sub(r'\b' + re.escape(word) + r'\b', '', result, flags=re.IGNORECASE)
        result = re.sub(r'[^\w\sа-яё\-]', ' ', result)
        result = re.sub(r'\s+', ' ', result).strip()
        return result
    
    for action_name, action_config in AVAILABLE_ACTIONS.items():
        for keyword in action_config['keywords']:
            if keyword in query_lower:
                params = extract_params_from_query(query_text, action_name)
                return execute_action(action_name, params, user, original_query)
    
    found_model_path = None
    found_config = None
    
    for model_path, config in MODEL_REGISTRY.items():
        for keyword in config['keywords']:
            if keyword in query_lower:
                found_model_path = model_path
                found_config = config
                break
        if found_model_path:
            break
    
    if not found_model_path:
        return "Не понял запрос. Попробуйте: 'Клиенты', 'Создай счет Тест', 'Закрой смену'.", ""
    
    try:
        app_label, model_name = found_model_path.split('.')
        model_class = apps.get_model(app_label, model_name)
    except:
        return f"Модель {found_model_path} не найдена.", ""
    
    verbose_name = model_class._meta.verbose_name
    verbose_name_plural = model_class._meta.verbose_name_plural
    model_filters = found_config.get('filters', {})
    
    numbers = re.findall(r'\b(\d+)\b', query_text)
    words_count = len(query_lower.split())
    
    if numbers and words_count <= 4:
        try:
            obj = model_class.objects.get(id=numbers[0])
            text = f"{verbose_name} №{obj.id}: {obj}"
            html = generate_html_table(model_class, [obj])
            return text, html
        except model_class.DoesNotExist:
            return f"{verbose_name} с ID {numbers[0]} не найден.", ""
    
    if any(phrase in query_lower for phrase in ['мои сделки', 'мои заказы', 'моя сделка', 'мой заказ']):
        if 'my' in model_filters:
            queryset = model_class.objects.filter(**{model_filters['my']: user.id}).order_by('-id')[:20]
            if queryset:
                text = f"Ваши {verbose_name_plural} (всего {queryset.count()}):"
                html = generate_html_table(model_class, queryset)
                return text, html
            else:
                return f"У вас нет {verbose_name_plural}.", ""
    
    manager_match = re.search(r'(менеджера|менеджер)\s+([\w\-]+)', query_lower)
    if manager_match and 'manager' in model_filters:
        manager_username = manager_match.group(2)
        queryset = model_class.objects.filter(**{model_filters['manager']: manager_username}).order_by('-id')[:20]
        if queryset:
            text = f"{verbose_name_plural} менеджера '{manager_username}' (всего {queryset.count()}):"
            html = generate_html_table(model_class, queryset)
            return text, html
        else:
            return f"У менеджера '{manager_username}' нет {verbose_name_plural}.", ""
    
    clean = clean_query(query_lower)
    
    def matches_keyword(query, keywords):
        """Проверяет совпадение запроса с ключевыми словами (включая составные)"""
        query_words = set(query.split())
        for kw in keywords:
            kw_words = set(kw.split())
            if query == kw or kw_words.issubset(query_words) or query_words.issubset(kw_words):
                return True
        return False

    is_show_all = (
        not clean or
        len(clean) < 3 or
        clean in found_config['keywords'] or
        matches_keyword(clean, found_config['keywords']) or
        any(kw in query_lower for kw in found_config['keywords'])
    )

    if is_show_all:
        queryset = model_class.objects.order_by('-id')[:20]
        if queryset:
            text = f"Показываю {verbose_name_plural} (всего {queryset.count()}):"
            html = generate_html_table(model_class, queryset)
            return text, html
        else:
            return f"{verbose_name_plural} не найдены.", ""
        
    return f"Ничего не найдено по запросу '{clean}'.", ""


def extract_params_from_query(query_text, action_name):
    params = {}
    query_lower = query_text.lower()
    
    name_match = re.search(r'["\']([^"\']+)["\']', query_text)
    if name_match:
        params['name'] = name_match.group(1)
    
    amount_match = re.search(r'(\d+(?:[.,]\d+)?)\s*(?:руб|рублей|₽|r)', query_lower)
    if amount_match:
        params['amount'] = float(amount_match.group(1).replace(',', '.'))
    
    type_match = re.search(r'(?:с\s+)?тип(?:ом)?\s+["\']?([^\s"\',.]+)["\']?', query_lower)
    if type_match:
        params['type_name'] = type_match.group(1).strip()
    
    id_match = re.search(r'(?:счет|заказ|клиент)\s*(\d+)', query_lower)
    if id_match:
        params['id'] = int(id_match.group(1))
    
    return params

# ============================================================================
# ФУНКЦИЯ ПОМОЩИ
# ============================================================================

def get_help_text():
    """Возвращает текст справки по возможностям чат-бота"""
    help_text = (
        "🤖 Чат-бот CRM — Возможности<br><br>"
        "Я могу помочь вам с управлением данными в CRM системе. Вот что я умею:<br><br>"
        "📋 Просмотр данных:<br>"
        "• Показать список объектов: клиенты, заказы, транзакции, счета, отделы<br>"
        "• Показать объект по ID: клиент 5, заказ 10, счет 3<br>"
        "• Фильтрация: мои заказы, заказы менеджера ivan, транзакции за сегодня, оплаты по заказу 5<br><br>"
        "➕ Создание объектов:<br>"
        "• Создать счет: создай счет \"Мой счет\" с типом Банковский<br>"
        "• Создать транзакцию: создай транзакцию на 1000 рублей, проведи оплату по заказу 5<br>"
        "• Создать категорию: создай категорию \"Реклама\" тип расход<br>"
        "• Узнать поля для создания: как создать транзакцию, что нужно для создания счета, какие поля у заказа<br><br>"
        "🗑️ Удаление объектов:<br>"
        "• Удалить счет: удали счет 5<br>"
        "• Удалить транзакцию: удали транзакцию 10<br>"
        "⚠️ Все удаления логируются и могут быть восстановлены через /chat/logs/<br><br>"
        "📊 Другие команды:<br>"
        "• Закрыть смену: закрой смену<br>"
        "• Посмотреть логи действий: /chat/logs/<br>"
        "• Восстановить удаленное: Кнопка \"Восстановить\" в логах<br><br>"
        "📝 Примеры запросов:<br>"
        "Клиенты: покажи всех клиентов, клиент 5, найди клиента ООО Ромашка<br>"
        "Заказы: покажи заказы, заказ 10, мои заказы, заказы менеджера admin<br>"
        "Транзакции: покажи транзакции, оплаты по заказу 5, последние платежи<br>"
        "Счета: покажи счета, создай счет \"Расчетный\" с типом Банковский, удали счет 3<br>"
        "Справка: помощь — эта справка, как создать транзакцию — поля для создания, что нужно для создания заказа — обязательные поля<br><br>"
        "💡 Советы:<br>"
        "1. Для создания используйте готовые промпты (команда \"как создать...\")<br>"
        "2. Все действия логируются — можно откатить изменения<br>"
        "3. Для сложных запросов используйте фильтры (\"мои...\", \"менеджера...\")<br>"
        "4. Чат понимает естественный язык — пишите как удобно<br>"
    )
    return help_text


def is_help_request(query_text):
    """Проверяет является ли запрос запросом помощи"""
    query_lower = query_text.lower()
    
    help_phrases = [
        'помощь', 'help', 'что ты умеешь', 'что можешь',
        'как тебя использовать', 'команды', 'список команд',
        'что ты можешь', 'возможности', 'функционал',
        'как работать', 'инструкция', 'справка',
    ]
    
    return any(phrase in query_lower for phrase in help_phrases)


def handle_help_request(query_text, user):
    """Обрабатывает запрос помощи"""
    if not is_help_request(query_text):
        return None, None
    
    return get_help_text(), ""

# ============================================================================
# ВОССТАНОВЛЕНИЕ ИЗ ЛОГА
# ============================================================================

def restore_from_log(log_id, user):
    try:
        log = ChatActionLog.objects.get(id=log_id)
        
        if not log.can_restore:
            return False, "Это действие нельзя восстановить"
        
        if log.restored:
            return False, "Уже восстановлено"
        
        success, message = log.restore()
        
        if success:
            return True, f"✅ Восстановлено: {log.object_repr}. {message}"
        else:
            return False, f"❌ {message}"
    except ChatActionLog.DoesNotExist:
        return False, "❌ Лог не найден"
    except Exception as e:
        return False, f"❌ Ошибка: {str(e)}"