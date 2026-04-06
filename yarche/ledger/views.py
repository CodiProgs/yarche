from decimal import Decimal
from types import SimpleNamespace
from typing import List, Optional

import locale
import json
from django.contrib.auth.decorators import login_required
from django.core.exceptions import ValidationError
from django.core.paginator import Paginator
from django.db import transaction
from django.db.models import Sum
from django.forms.models import model_to_dict
from django.http import HttpResponse, JsonResponse
from django.shortcuts import get_object_or_404, render
from django.template.loader import render_to_string
from django.urls import reverse
from django.utils import timezone
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_http_methods

from commerce.models import Client, Order
from users.models import Notification, User
from yarche.utils import get_model_fields

from .models import BankAccount, BankAccountType, Transaction, TransactionCategory

locale.setlocale(locale.LC_ALL, "ru_RU.UTF-8")
CURRENCY_SUFFIX = " р."
DEFAULT_VALUE = f"0{CURRENCY_SUFFIX}"


# region Helpers
def parse_amount(amount_str: str) -> float:
    """
    Parse amount string to float, handling currency suffix and formatting.
    """
    if not amount_str:
        return 0.0
    clean_amount = amount_str.replace(CURRENCY_SUFFIX, "").replace(" ", "").replace(",", ".")
    try:
        return round(float(clean_amount), 0)
    except (ValueError, TypeError):
        return 0.0


def format_currency(amount: float) -> str:
    """
    Format amount as currency string.
    """
    rounded_amount = round(amount)
    sum_str = locale.format_string("%.0f", rounded_amount, grouping=True)
    return sum_str.replace('\xa0', ' ') + CURRENCY_SUFFIX


def check_permission(user, codename: str) -> bool:
    """
    Check if user has the specified permission.
    """
    if hasattr(user, "user_type") and user.user_type:
        return user.user_type.permissions.filter(codename=codename).exists()
    return False


class BankAccountData:
    """
    Data class for bank account information.
    """
    def __init__(self, name: str, balance: str, shift_amount: str, total_amount: str):
        self.name = name
        self.balance = balance
        self.shift_amount = shift_amount
        self.total_amount = total_amount


def get_transaction_fields():
    """
    Get fields for transaction table.
    """
    excluded_fields = [
        "id",
        "created",
        "amount",
        "report_date",
        "completed_date",
        "order",
        "related_transaction",
        "created_by",
        "archived_at",
    ]
    field_order = [
        "category",
        "bank_account",
        "amount",
        "client",
        "order",
        "type",
        "comment",
    ]

    fields = get_model_fields(
        model=Transaction,
        excluded_fields=excluded_fields,
        field_order=field_order
    )

    fields.insert(
        2,
        {
            "name": "amount",
            "verbose_name": "Сумма",
            "is_number": True,
        },
    )

    fields.insert(4, {"name": "order", "verbose_name": "Заказ №", "is_number": True})

    return fields


def handle_transaction_update(tr: Transaction, data: dict):
    """
    Handle updating a transaction based on provided data.
    """
    trans_type = tr.type
    comment = data.get("comment", "").strip()
    amount_str = data.get("amount")

    report_date_value = data.get("report_date", "")

    if report_date_value and len(report_date_value) == 7:
        report_date_value = f"{report_date_value}-01"
    elif not report_date_value and not tr.report_date:
        now = timezone.now()
        report_date_value = now.strftime("%Y-%m-01")
    else:
        report_date_value = tr.report_date

    if not amount_str:
        return JsonResponse(
            {"status": "error", "message": "Не указана сумма"}, status=400
        )

    amount = parse_amount(amount_str)
    if amount <= 0:
        return JsonResponse(
            {"status": "error", "message": "Сумма должна быть больше нуля"}, status=400
        )

    if trans_type == "transfer":
        source_id = data.get("source_bank_account")
        dest_id = data.get("destination_bank_account")

        if not source_id or not dest_id:
            return JsonResponse(
                {"status": "error", "message": "Не указаны счета"}, status=400
            )
        if source_id == dest_id:
            return JsonResponse(
                {"status": "error", "message": "Счета должны быть разные"}, status=400
            )

        outgoing = tr if tr.amount < 0 else tr.related_transaction
        incoming = tr.related_transaction if tr.amount < 0 else tr

        outgoing.bank_account_id = source_id
        outgoing.amount = -abs(amount)
        outgoing.comment = comment
        outgoing.save()

        incoming.bank_account_id = dest_id
        incoming.amount = abs(amount)
        incoming.comment = comment
        incoming.save()

        return outgoing, incoming
    else:
        if trans_type == "client_account_payment":
            deposit_tr = (
                Transaction.objects.filter(
                    client=tr.client, type="client_account_deposit"
                )
                .order_by("created")
                .first()
            )
            if not deposit_tr:
                return JsonResponse(
                    {"status": "error", "message": "Не найдена транзакция пополнения"},
                    status=400,
                )
            tr.bank_account_id = deposit_tr.bank_account_id
        else:
            bank_account_id = data.get("bank_account")
            if not bank_account_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указан счет"}, status=400
                )
            tr.bank_account_id = bank_account_id

        tr.amount = (
            abs(amount)
            if trans_type in ["income", "order_payment", "client_account_deposit"]
            else -abs(amount)
        )
        tr.comment = comment
        tr.report_date = report_date_value
        tr.save()
        return tr, None


# endregion


# region Bank Accounts
@login_required
def bank_accounts(request):
    """
    View for bank accounts list.
    """
    context = {
        "fields": get_model_fields(BankAccount, excluded_fields=["balance"]),
        "data": BankAccount.objects.all(),
    }
    return render(request, "ledger/bank_accounts.html", context)


@login_required
def bank_account_detail(request, pk: int):
    """
    Get bank account details.
    """
    account = get_object_or_404(BankAccount, id=pk)
    data = model_to_dict(account)
    data["balance"] = format_currency(account.balance)
    return JsonResponse({"data": data})


@login_required
def bank_account_types(request):
    """
    Get list of bank account types.
    """
    types_data = [{"id": t.id, "name": t.name} for t in BankAccountType.objects.all()]
    return JsonResponse(types_data, safe=False)


@login_required
def bank_account_list(request):
    """
    Get list of bank accounts.
    """
    accounts_data = [
        {"id": acc.id, "name": acc.name} for acc in BankAccount.objects.all()
    ]
    return JsonResponse(accounts_data, safe=False)


@login_required
@require_http_methods(["POST"])
def bank_account_create(request):
    """
    Create a new bank account.
    """
    try:
        with transaction.atomic():
            name = request.POST.get("name", "")
            if not name:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Название счета не может быть пустым",
                    },
                    status=400,
                )

            account = BankAccount.objects.create(
                name=name, type_id=request.POST.get("type") or None
            )

            context = {
                "item": account,
                "fields": get_model_fields(BankAccount, excluded_fields=["balance"]),
            }

            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": account.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def bank_account_update(request, pk: int):
    """
    Update a bank account.
    """
    try:
        account = get_object_or_404(BankAccount, id=pk)
        data = (
            json.loads(request.body)
            if request.method in ["PUT", "PATCH"]
            else request.POST.dict()
        )

        if "name" in data:
            account.name = data["name"]
        if "type" in data:
            account.type_id = data["type"] or None

        account.save()

        context = {
            "item": account,
            "fields": get_model_fields(BankAccount, excluded_fields=["balance"]),
        }

        return JsonResponse(
            {
                "id": account.id,
                "html": render_to_string("components/table_row.html", context),
            }
        )
    except json.JSONDecodeError:
        return JsonResponse(
            {"status": "error", "message": "Неверный формат JSON"}, status=400
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def bank_account_delete(request, pk: int):
    """
    Delete a bank account.
    """
    try:
        with transaction.atomic():
            account = get_object_or_404(BankAccount, id=pk)
            if Transaction.objects.filter(bank_account=account).exists():
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Нельзя удалить счет у которого есть связанные транзакции",
                    },
                    status=400,
                )
            if account.balance != 0:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "На счете есть средства, нельзя удалить счет",
                    },
                    status=400,
                )

            account.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
def refresh_bank_accounts(request):
    """
    Refresh bank accounts table.
    """
    accounts = BankAccount.objects.all()
    html = "".join(
        render_to_string(
            "components/table_row.html",
            {
                "item": acc,
                "fields": get_model_fields(BankAccount, excluded_fields=["balance"]),
            },
        )
        for acc in accounts
    )
    return HttpResponse(html)


# endregion


# region Transaction Categories
@login_required
def transaction_categories(request):
    """
    View for transaction categories list.
    """
    context = {
        "fields": get_model_fields(TransactionCategory),
        "data": TransactionCategory.objects.all(),
    }
    return render(request, "ledger/transaction_categories.html", context)


@login_required
def transaction_category_list(request):
    """
    Get list of transaction categories, filtered by type if provided.
    """
    transaction_type = request.GET.get("type")
    categories = TransactionCategory.objects.all()

    if transaction_type in ["expense", "income"]:
        categories = categories.filter(type=transaction_type)

    return JsonResponse(
        [{"id": cat.id, "name": cat.name} for cat in categories], safe=False
    )


@login_required
def transaction_category_detail(request, pk: int):
    """
    Get transaction category details.
    """
    category = get_object_or_404(TransactionCategory, id=pk)
    return JsonResponse({"data": model_to_dict(category)})


@login_required
@require_http_methods(["POST"])
def transaction_category_create(request):
    """
    Create a new transaction category.
    """
    try:
        with transaction.atomic():
            name = request.POST.get("name", "")
            category_type = request.POST.get("type")

            if not name:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Название категории не может быть пустым",
                    },
                    status=400,
                )

            if category_type not in dict(TransactionCategory.TYPE_CHOICES):
                return JsonResponse(
                    {"status": "error", "message": "Неверный тип категории"}, status=400
                )

            category = TransactionCategory.objects.create(name=name, type=category_type)

            context = {
                "item": category,
                "fields": get_model_fields(TransactionCategory),
            }

            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": category.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def transaction_category_update(request, pk: int):
    """
    Update a transaction category.
    """
    try:
        category = get_object_or_404(TransactionCategory, id=pk)
        data = (
            json.loads(request.body)
            if request.method in ["PUT", "PATCH"]
            else request.POST.dict()
        )

        if "name" in data:
            category.name = data["name"]
        if "type" in data:
            if data["type"] not in dict(TransactionCategory.TYPE_CHOICES):
                return JsonResponse(
                    {"status": "error", "message": "Неверный тип категории"}, status=400
                )
            category.type = data["type"]

        category.save()

        context = {"item": category, "fields": get_model_fields(TransactionCategory)}

        return JsonResponse(
            {
                "id": category.id,
                "html": render_to_string("components/table_row.html", context),
            }
        )
    except json.JSONDecodeError:
        return JsonResponse(
            {"status": "error", "message": "Неверный формат JSON"}, status=400
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def transaction_category_delete(request, pk: int):
    """
    Delete a transaction category.
    """
    try:
        with transaction.atomic():
            category = get_object_or_404(TransactionCategory, id=pk)
            if Transaction.objects.filter(category=category).exists():
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Нельзя удалить категорию с транзакциями",
                    },
                    status=400,
                )

            category.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
def refresh_transaction_categories(request):
    """
    Refresh transaction categories table.
    """
    categories = TransactionCategory.objects.all()
    html = "".join(
        render_to_string(
            "components/table_row.html",
            {"item": cat, "fields": get_model_fields(TransactionCategory)},
        )
        for cat in categories
    )
    return HttpResponse(html)


# endregion


# region Transactions
@login_required
def transaction_types(request):
    """
    Get list of transaction types.
    """
    types_data = [
        {"id": t[0], "name": t[1]} for t in Transaction.TransactionType.choices
    ]
    return JsonResponse(types_data, safe=False)


@login_required
def transactions(request):
    """
    View for transactions list.
    """
    context = {"fields": get_transaction_fields(), "data": None}
    return render(request, "ledger/transactions.html", context)


@login_required
def transaction_list(request):
    """
    Get paginated list of transactions.
    """
    start_date = parse_date(request.GET.get("start_date", ""))
    end_date = parse_date(request.GET.get("end_date", ""))

    if not start_date or not end_date:
        return JsonResponse({"error": "Необходимо указать даты"}, status=400)

    transactions = Transaction.objects.filter(
        completed_date__range=(start_date, end_date), completed_date__isnull=False
    )

    page_number = request.GET.get("page", 1)
    paginator = Paginator(list(transactions), 25)
    page_obj = paginator.get_page(page_number)

    transaction_ids = [tr.id for tr in page_obj.object_list]

    html = "".join(
        render_to_string(
            "components/table_row.html",
            {"item": tr, "fields": get_transaction_fields()},
        )
        for tr in page_obj.object_list
    )

    return JsonResponse(
        {
            "html": html,
            "context": {
                "total_pages": paginator.num_pages,
                "current_page": page_obj.number,
                "transaction_ids": transaction_ids,
            },
        }
    )


@login_required
@require_http_methods(["POST"])
def transaction_create(request):
    """
    Create a new transaction.
    """
    try:
        with transaction.atomic():
            report_date_value = request.POST.get("report_date", "")

            if report_date_value and len(report_date_value) == 7:
                report_date_value = f"{report_date_value}-01"
            elif not report_date_value:
                now = timezone.now()
                report_date_value = now.strftime("%Y-%m-01")

            data = {
                "bank_account_id": request.POST.get("bank_account"),
                "category_id": request.POST.get("category"),
                "amount": parse_amount(request.POST.get("amount")),
                "type": request.POST.get("type"),
                "comment": request.POST.get("comment", ""),
                "created_by": request.user,
                "report_date": report_date_value,
            }

            if not data["type"]:
                return JsonResponse(
                    {"status": "error", "message": "Не указан тип"}, status=400
                )

            if not data["bank_account_id"]:
                return JsonResponse(
                    {"status": "error", "message": "Не указан счет"}, status=400
                )

            if not data["category_id"]:
                return JsonResponse(
                    {"status": "error", "message": "Не указана категория"}, status=400
                )

            if data["amount"] <= 0:
                return JsonResponse(
                    {"status": "error", "message": "Сумма должна быть больше нуля"}, status=400
                )

            if data["type"] == "expense":
                data["amount"] = -data["amount"]

            tr = Transaction.objects.create(**data)
            tr.order = tr.order.id if tr.order else None
            tr.amount = format_currency(tr.amount)

            context = {"item": tr, "fields": get_transaction_fields()}

            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": tr.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def transfer_create(request):
    """
    Create a transfer transaction.
    """
    try:
        with transaction.atomic():
            source_id = request.POST.get("source_bank_account")
            dest_id = request.POST.get("destination_bank_account")
            amount = parse_amount(request.POST.get("amount"))
            comment = request.POST.get("comment", "")

            if not source_id or not dest_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указаны счета"}, status=400
                )
            if source_id == dest_id:
                return JsonResponse(
                    {"status": "error", "message": "Счета должны быть разные"},
                    status=400,
                )
            if amount <= 0:
                return JsonResponse(
                    {"status": "error", "message": "Сумма должна быть больше нуля"}, status=400
                )

            outgoing = Transaction.objects.create(
                bank_account_id=source_id,
                amount=-amount,
                type="transfer",
                comment=comment,
                created_by=request.user,
            )

            incoming = Transaction.objects.create(
                bank_account_id=dest_id,
                amount=amount,
                type="transfer",
                comment=comment,
                created_by=request.user,
            )

            outgoing.related_transaction = incoming
            incoming.related_transaction = outgoing
            outgoing.save()
            incoming.save()

            fields = get_transaction_fields()
            return JsonResponse(
                {
                    "incoming_transaction": {
                        "id": incoming.id,
                        "html": render_to_string(
                            "components/table_row.html",
                            {"item": incoming, "fields": fields},
                        ),
                    },
                    "outgoing_transaction": {
                        "id": outgoing.id,
                        "html": render_to_string(
                            "components/table_row.html",
                            {"item": outgoing, "fields": fields},
                        ),
                    },
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
def transaction_detail(request, pk: int):
    """
    Get transaction details.
    """
    tr = get_object_or_404(Transaction, id=pk)
    data = model_to_dict(tr)

    if tr.client:
        data["client"] = tr.client.id
    if tr.type == "transfer":
        data.update(handle_transfer_details(tr))

    return JsonResponse({"data": data})


def handle_transfer_details(tr: Transaction) -> dict:
    """
    Handle details for transfer transactions.
    """
    data = {}
    if tr.amount < 0:
        data["source_bank_account"] = tr.bank_account.id
        data["destination_bank_account"] = tr.related_transaction.bank_account.id
    else:
        data["source_bank_account"] = tr.related_transaction.bank_account.id
        data["destination_bank_account"] = tr.bank_account.id
    data["amount"] = format_currency(abs(tr.amount))
    return data


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def transaction_update(request, pk: int):
    """
    Update a transaction.
    """
    try:
        with transaction.atomic():
            tr = Transaction.objects.select_for_update().get(id=pk)
            data = (
                json.loads(request.body)
                if request.method in ["PUT", "PATCH"]
                else request.POST.dict()
            )

            if tr.type == "client_account_payment":
                client = tr.client
                if client:
                    deposits = (
                        Transaction.objects.filter(
                            client=client,
                            type="client_account_deposit",
                            completed_date__isnull=True
                        ).exclude(id=tr.id).aggregate(total=Sum("amount"))["total"]
                        or 0
                    )
                    payments = (
                        Transaction.objects.filter(
                            client=client,
                            type="client_account_payment",
                            completed_date__isnull=True
                        ).exclude(id=tr.id).aggregate(total=Sum("amount"))["total"]
                        or 0
                    )
                    current_balance = client.balance + deposits + payments
                    amount_str = data.get("amount")
                    amount = parse_amount(amount_str)
                    if abs(amount) > current_balance:
                        return JsonResponse(
                            {
                                "status": "error",
                                "message": f"Недостаточно средств: {format_currency(current_balance)} р.",
                            },
                            status=400,
                        )

            result = handle_transaction_update(tr, data)
            if isinstance(result, JsonResponse):
                return result

            updated_tr, related_tr = result
            fields = get_transaction_fields()

            if tr.type == "transfer":
                return JsonResponse(
                    {
                        "incoming_transaction": {
                            "id": related_tr.id,
                            "html": render_to_string(
                                "components/table_row.html",
                                {"item": related_tr, "fields": fields},
                            ),
                        },
                        "outgoing_transaction": {
                            "id": updated_tr.id,
                            "html": render_to_string(
                                "components/table_row.html",
                                {"item": updated_tr, "fields": fields},
                            ),
                        },
                    }
                )
            else:
                return JsonResponse(
                    {
                        "id": updated_tr.id,
                        "html": render_to_string(
                            "components/table_row.html",
                            {"item": updated_tr, "fields": fields},
                        ),
                    }
                )
    except Transaction.DoesNotExist:
        return JsonResponse(
            {"status": "error", "message": "Транзакция не найдена"}, status=404
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def closed_transaction_update(request, pk: int):
    """
    Update a closed transaction.
    """
    try:
        with transaction.atomic():
            tr = Transaction.objects.select_for_update().get(id=pk)

            old_amount = tr.amount
            old_bank_account = tr.bank_account

            related_tr = tr.related_transaction
            old_related_amount = related_tr.amount if related_tr else None
            old_related_bank_account = related_tr.bank_account if related_tr else None

            old_order = tr.order if hasattr(tr, "order") else None

            data = (
                json.loads(request.body)
                if request.method in ["PUT", "PATCH"]
                else request.POST.dict()
            )

            result = handle_transaction_update(tr, data)
            if isinstance(result, JsonResponse):
                return result

            updated_tr, related_tr = result

            table = request.GET.get('table', 'transactions')
            if table == 'all':
                fields = [
                    {"name": "created", "verbose_name": "Дата"},
                    {"name": "type", "verbose_name": "Тип"},
                    {"name": "category", "verbose_name": "Категория"},
                    {"name": "bank_account", "verbose_name": "Счет"},
                    {"name": "amount", "verbose_name": "Сумма", "is_number": True},
                    {"name": "comment", "verbose_name": "Комментарий"},
                    {"name": "created_by", "verbose_name": "Пользователь"},
                ]
            else:
                fields = get_transaction_fields()

            if tr.type != "transfer":
                if old_bank_account:
                    old_bank_account.balance -= Decimal(str(old_amount))
                    old_bank_account.save()
                if updated_tr and updated_tr.bank_account:
                    updated_tr.bank_account.balance += Decimal(str(updated_tr.amount))
                    updated_tr.bank_account.save()

                if old_related_bank_account:
                    old_related_bank_account.balance -= Decimal(str(old_related_amount))
                    old_related_bank_account.save()
                if related_tr and related_tr.bank_account:
                    related_tr.bank_account.balance += Decimal(str(related_tr.amount))
                    related_tr.bank_account.save()

            if old_order and tr.type == "order_payment":
                old_order.paid_amount -= abs(Decimal(str(old_amount)))
                old_order.save()
            if updated_tr and updated_tr.type == "order_payment" and updated_tr.order:
                updated_tr.order.paid_amount += abs(Decimal(str(updated_tr.amount)))
                updated_tr.order.save()

            if old_order and tr.type == "client_account_payment":
                old_order.paid_amount -= abs(Decimal(str(old_amount)))
                old_order.save()
            if updated_tr and updated_tr.type == "client_account_payment" and updated_tr.order:
                updated_tr.order.paid_amount += abs(Decimal(str(updated_tr.amount)))
                updated_tr.order.save()

            if tr.type == "client_account_payment" and tr.client:
                tr.client.balance += abs(Decimal(str(old_amount)))
                tr.client.save()
            if updated_tr and updated_tr.type == "client_account_payment" and updated_tr.client:
                updated_tr.client.balance -= abs(Decimal(str(updated_tr.amount)))
                updated_tr.client.save()

            if tr.type == "client_account_deposit" and tr.client:
                tr.client.balance -= abs(Decimal(str(old_amount)))
                tr.client.save()
            if updated_tr and updated_tr.type == "client_account_deposit" and updated_tr.client:
                updated_tr.client.balance += abs(Decimal(str(updated_tr.amount)))
                updated_tr.client.save()

            if tr.type == "transfer":
                if old_bank_account:
                    old_bank_account.balance -= Decimal(str(old_amount))
                    old_bank_account.save()
                if old_related_bank_account:
                    old_related_bank_account.balance -= Decimal(str(old_related_amount))
                    old_related_bank_account.save()
                if updated_tr and updated_tr.bank_account:
                    updated_tr.bank_account.balance += Decimal(str(updated_tr.amount))
                    updated_tr.bank_account.save()
                if related_tr and related_tr.bank_account:
                    related_tr.bank_account.balance += Decimal(str(related_tr.amount))
                    related_tr.bank_account.save()

            if tr.type == "transfer":
                return JsonResponse(
                    {
                        "incoming_transaction": {
                            "id": related_tr.id,
                            "html": render_to_string(
                                "components/table_row.html",
                                {"item": related_tr, "fields": fields},
                            ),
                        },
                        "outgoing_transaction": {
                            "id": updated_tr.id,
                            "html": render_to_string(
                                "components/table_row.html",
                                {"item": updated_tr, "fields": fields},
                            ),
                        },
                    }
                )
            else:
                return JsonResponse(
                    {
                        "id": updated_tr.id,
                        "html": render_to_string(
                            "components/table_row.html",
                            {"item": updated_tr, "fields": fields},
                        ),
                    }
                )
    except Transaction.DoesNotExist:
        return JsonResponse(
            {"status": "error", "message": "Транзакция не найдена"}, status=404
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def transaction_delete(request, pk: int):
    """
    Delete a transaction.
    """
    try:
        with transaction.atomic():
            tr = get_object_or_404(Transaction, id=pk)
            if tr.completed_date:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Нельзя удалить завершенную транзакцию",
                    },
                    status=400,
                )

            related_id = None
            if tr.type == "transfer" and tr.related_transaction:
                related_id = tr.related_transaction.id
                tr.related_transaction.delete()

            tr.delete()
            return JsonResponse(
                {"status": "success", "related_transaction_id": related_id}
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


@login_required
@require_http_methods(["POST"])
def closed_transaction_delete(request, pk: int):
    """
    Delete a closed transaction.
    """
    try:
        with transaction.atomic():
            tr = get_object_or_404(Transaction, id=pk)
            if not tr.completed_date:
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Нельзя удалить незавершенную транзакцию этим методом",
                    },
                    status=400,
                )

            if tr.bank_account:
                tr.bank_account.balance -= Decimal(str(tr.amount))
                tr.bank_account.save()

            if tr.type == "order_payment" and tr.order:
                tr.order.paid_amount -= abs(Decimal(str(tr.amount)))
                tr.order.save()
            elif tr.type == "client_account_deposit" and tr.client:
                tr.client.balance -= abs(Decimal(str(tr.amount)))
                tr.client.save()
            elif tr.type == "client_account_payment" and tr.client and tr.order:
                tr.client.balance += abs(Decimal(str(tr.amount)))
                tr.client.save()
                tr.order.paid_amount -= abs(Decimal(str(tr.amount)))
                tr.order.save()

            related_id = None
            if tr.type == "transfer" and tr.related_transaction:
                related_tr = tr.related_transaction
                related_id = related_tr.id
                if related_tr.bank_account:
                    related_tr.bank_account.balance -= Decimal(str(related_tr.amount))
                    related_tr.bank_account.save()
                related_tr.delete()

            tr.delete()
            return JsonResponse(
                {"status": "success", "related_transaction_id": related_id}
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=500)


# endregion


# region Payments
@login_required
def payments(request):
    """
    View for payments list.
    """
    user = request.user
    has_perm = check_permission(user, "view_all_payments")

    transactions = Transaction.objects.filter(
        completed_date__isnull=False, type="order_payment"
    ).select_related("order__client", "order__manager")

    if not has_perm:
        transactions = transactions.filter(order__manager=user)

    fields = get_payment_fields()
    data = prepare_payment_data(transactions)

    context = {
        "fields": fields,
        "data": data,
        "restricted_user": user.last_name if not has_perm else None,
    }
    return render(request, "ledger/payments.html", context)


def get_payment_fields():
    """
    Get fields for payment table.
    """
    excluded = [
        "category",
        "type",
        "bank_account",
        "report_date",
        "created",
        "order",
        "related_transaction",
        "created_by",
        "client",
        "archived_at",
    ]
    field_order = [
        "id",
        "manager",
        "completed_date",
        "product",
        "amount",
        "remaining_debt",
        "order",
        "client",
        "legal_name",
        "comment",
    ]
    verbose_names = {
        "manager": "Менеджер",
        "completed_date": "Дата",
        "comment": "Доп. инфо",
        "client": "Клиент",
    }

    fields = get_model_fields(
        Transaction,
        excluded_fields=excluded,
        custom_verbose_names=verbose_names,
        field_order=field_order,
    )

    insertions = [
        (1, {"name": "manager", "verbose_name": "Менеджер", "is_relation": True}),
        (3, {"name": "product", "verbose_name": "Продукция", "is_relation": True}),
        (5, {"name": "remaining_debt", "verbose_name": "Остаток", "is_amount": True, "is_currency": True}),
        (6, {"name": "order", "verbose_name": "Заказ", "is_number": True}),
        (7, {"name": "client", "verbose_name": "Клиент", "is_relation": True}),
        (8, {"name": "legal_name", "verbose_name": "Фирма"}),
    ]

    for pos, field in insertions:
        fields.insert(pos, field)

    for field in fields:
        if field.get("name") == "amount":
            field["is_currency"] = True
            break

    return fields


def prepare_payment_data(transactions):
    """
    Prepare data for payments table.
    """
    data = []
    for tr in transactions:
        tr.product = tr.order.product if tr.order else None
        tr.client = tr.order.client if tr.order and tr.order.client else None
        tr.legal_name = (
            tr.order.client.legal_name if tr.order and tr.order.client else None
        )
        tr.manager = tr.order.manager.last_name or tr.order.manager.username if tr.order and tr.order.manager else None
        tr.remaining_debt = tr.order.amount - tr.order.paid_amount if tr.order else 0
        data.append(tr)
    return data


# endregion


# region Current Shift
@login_required
def current_shift(request):
    """
    View for current shift.
    """
    user = request.user
    accounts = BankAccount.objects.all().order_by("type")
    transactions = Transaction.objects.filter(completed_date__isnull=True, created_by=user)

    accounts_data = prepare_accounts_data(accounts, transactions)

    for tr in transactions:
        tr.amount = format_currency(tr.amount)

    fields = get_transaction_fields()
    for field in fields:
        if field['name'] == 'amount':
            field.pop('is_currency', None)

    context = {
        "fields": {
            "bank_accounts": [
                {"name": "name", "verbose_name": "Название счета"},
                {"name": "balance", "verbose_name": "Учтено", "is_number": True},
                {"name": "shift_amount", "verbose_name": "Сегодня", "is_number": True},
                {"name": "total_amount", "verbose_name": "Сумма", "is_number": True},
            ],
            "transactions": fields,
        },
        "data": {"bank_accounts": accounts_data, "transactions": transactions},
        "is_grouped": {"transactions-bank-accounts-table": True},
        "transaction_ids": [tr.id for tr in transactions],
    }
    return render(request, "ledger/current_shift.html", context)

def prepare_accounts_data(accounts, transactions):
    """
    Prepare data for bank accounts in current shift.
    """
    data = {}
    for acc in accounts:
        sum_tr = (
            transactions.filter(bank_account=acc).aggregate(total=Sum("amount"))[
                "total"
            ]
            or 0
        )
        acc_data = BankAccountData(
            name=acc.name,
            balance=format_currency(acc.balance),
            shift_amount=format_currency(sum_tr),
            total_amount=format_currency(acc.balance + sum_tr),
        )
        acc_type = str(acc.type) if acc.type else "Без типа"
        data.setdefault(acc_type, []).append(acc_data)
    return data


def prepare_shift_transactions(transactions):
    """
    Prepare data for shift transactions.
    """
    data = []
    for tr in transactions:
        data.append(tr)
    return data


def update_balances(transactions):
    """
    Update balances based on transactions.
    """
    for tr in transactions:
        if tr.bank_account:
            tr.bank_account.balance += tr.amount
            tr.bank_account.save()

        if tr.type == "order_payment" and tr.order:
            tr.order.paid_amount += abs(tr.amount)
            tr.order.save()
        elif tr.type == "client_account_deposit" and tr.client:
            tr.client.balance += abs(tr.amount)
            tr.client.save()
        elif tr.type == "client_account_payment" and tr.client and tr.order:
            tr.client.balance -= abs(tr.amount)
            tr.client.save()
            tr.order.paid_amount += abs(tr.amount)
            tr.order.save()


def render_updated_accounts_table():
    """
    Render updated accounts table after shift close.
    """
    accounts = BankAccount.objects.all().order_by("type")
    data = prepare_accounts_data(accounts, Transaction.objects.none())

    return render_to_string(
        "components/table.html",
        {
            "fields": [
                {"name": "name", "verbose_name": "Название счета"},
                {"name": "balance", "verbose_name": "Учтено", "is_number": True},
                {"name": "shift_amount", "verbose_name": "Сегодня", "is_number": True},
                {"name": "total_amount", "verbose_name": "Сумма", "is_number": True},
            ],
            "data": data,
            "id": "transactions-bank-accounts-table",
            "is_grouped": {"transactions-bank-accounts-table": True},
        },
    )


# endregion


# region Client Payments
@login_required
@require_http_methods(["POST"])
def order_payment_create(request):
    """
    Create an order payment.
    """
    try:
        with transaction.atomic():
            report_date_value = request.POST.get("report_date", "")

            if report_date_value and len(report_date_value) == 7:
                report_date_value = f"{report_date_value}-01"
            elif not report_date_value:
                now = timezone.now()
                report_date_value = now.strftime("%Y-%m-01")

            data = {
                "order_id": request.POST.get("order"),
                "bank_account_id": request.POST.get("bank_account"),
                "amount": parse_amount(request.POST.get("amount")),
                "comment": request.POST.get("comment", ""),
                "type": "order_payment",
                "created_by": request.user,
                "report_date": report_date_value,
            }

            validate_payment_data(data, request.user)
            tr = Transaction.objects.create(**data)
            return render_transaction_response(tr)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def validate_payment_data(data, user):
    """
    Validate payment data.
    """
    if not data["bank_account_id"]:
        raise ValidationError("Не указан счет")
    if data["amount"] <= 0:
        raise ValidationError("Сумма должна быть больше нуля")
    if not data["order_id"]:
        raise ValidationError("Не указан заказ")

    order = Order.objects.get(id=data["order_id"])
    debt = calculate_remaining_debt(order, user)

    if data["amount"] > debt:
        raise ValidationError(f"Сумма превышает долг ({format_currency(debt)})")


def calculate_remaining_debt(order, user):
    """
    Calculate remaining debt for an order.
    """
    payments = (
        Transaction.objects.filter(
            order=order, type="order_payment", completed_date__isnull=True, created_by=user
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    client_payments = (
        Transaction.objects.filter(
            order=order, type="client_account_payment", completed_date__isnull=True, created_by=user
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return order.amount - (payments - client_payments + order.paid_amount)


@login_required
@require_http_methods(["POST"])
def client_balance_payment(request):
    """
    Create a client balance payment.
    """
    try:
        with transaction.atomic():
            data = {
                "client_id": request.POST.get("client"),
                "order_id": request.POST.get("order"),
                "amount": parse_amount(request.POST.get("amount")),
                "comment": request.POST.get("comment", ""),
                "type": "client_account_payment",
                "created_by": request.user,
            }

            validate_client_payment(data, request.user)

            first_deposit_transaction = (
                Transaction.objects.filter(
                    client_id=request.POST.get("client"), type="client_account_deposit"
                )
                .order_by("created")
                .first()
            )

            if first_deposit_transaction and first_deposit_transaction.bank_account:
                bank_account = first_deposit_transaction.bank_account
            else:
                bank_account = BankAccount.objects.order_by("id").first()
                if not bank_account:
                    return JsonResponse(
                        {"status": "error", "message": "Нет доступных счетов"},
                        status=400,
                    )

            data["bank_account_id"] = bank_account.id
            data["amount"] = -abs(data["amount"])

            tr = Transaction.objects.create(**data)
            return render_transaction_response(tr)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def validate_client_payment(data, user):
    """
    Validate client payment data.
    """
    if not data["client_id"]:
        raise ValidationError("Не указан клиент")
    if data["amount"] <= 0:
        raise ValidationError("Сумма должна быть больше нуля")
    if not data["order_id"]:
        raise ValidationError("Не указан заказ")

    client = Client.objects.get(id=data["client_id"])
    order = Order.objects.get(id=data["order_id"])

    balance = calculate_client_balance(client, user)

    if data["amount"] > balance:
        raise ValidationError(f"Недостаточно средств: {format_currency(balance)}")

    debt = calculate_order_debt(order, user)
    if data["amount"] > debt:
        raise ValidationError(f"Сумма превышает долг ({format_currency(debt)})")


def calculate_client_balance(client, user):
    """
    Calculate client balance.
    """
    deposits = (
        Transaction.objects.filter(
            client=client, type="client_account_deposit", completed_date__isnull=True, created_by=user
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )
    payments = (
        Transaction.objects.filter(
            client=client, type="client_account_payment", completed_date__isnull=True, created_by=user
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return client.balance + deposits + payments


def calculate_order_debt(order, user):
    """
    Calculate order debt.
    """
    order_payments = (
        Transaction.objects.filter(order=order, type="order_payment", created_by=user).aggregate(
            total=Sum("amount")
        )["total"]
        or 0
    )

    client_payments = (
        Transaction.objects.filter(
            order=order, type="client_account_payment", created_by=user
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return order.amount - (order_payments - client_payments)


@login_required
@require_http_methods(["POST"])
def client_balance_deposit(request):
    """
    Create a client balance deposit.
    """
    try:
        with transaction.atomic():
            data = {
                "client_id": request.POST.get("client"),
                "bank_account_id": request.POST.get("bank_account"),
                "amount": parse_amount(request.POST.get("amount")),
                "comment": request.POST.get("comment", ""),
                "type": "client_account_deposit",
                "created_by": request.user,
            }

            if not data["client_id"]:
                return JsonResponse(
                    {"status": "error", "message": "Не указан клиент"}, status=400
                )
            if not data["bank_account_id"]:
                return JsonResponse(
                    {"status": "error", "message": "Не указан счет"}, status=400
                )
            if data["amount"] <= 0:
                return JsonResponse(
                    {"status": "error", "message": "Сумма должна быть больше нуля"}, status=400
                )

            tr = Transaction.objects.create(**data)
            return render_transaction_response(tr)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def render_transaction_response(transaction):
    """
    Render response for transaction creation.
    """
    context = {"item": transaction, "fields": get_transaction_fields()}
    return JsonResponse(
        {
            "html": render_to_string("components/table_row.html", context),
            "id": transaction.id,
        }
    )


# endregion


class BankAccountDataBalance:
    """
    Data class for bank account balance.
    """
    def __init__(self, name: str, balance: str):
        self.name = name
        self.balance = balance


@login_required
def bank_accounts_balances(request):
    """
    View for bank accounts balances.
    """
    accounts = BankAccount.objects.select_related('type').order_by('type__name', 'name')
    grouped = {}
    for acc in accounts:
        acc_type = acc.type.name if acc.type else "Без типа"
        acc.balance = format_currency(acc.balance)
        grouped.setdefault(acc_type, []).append(acc)
    fields = [
        {"name": "name", "verbose_name": "Название счета"},
        {"name": "balance", "verbose_name": "Баланс", "is_number": True},
    ]
    context = {
        "fields": fields,
        "data": grouped,
        "is_grouped": {"bank_accounts_balances-table": True},
        "id": "bank_accounts_balances-table",
    }
    return render(request, "ledger/bank_accounts_balances.html", context)


@login_required
def all_transactions(request):
    """
    View for all transactions.
    """
    page_number = request.GET.get("page", 1)
    transactions = (
        Transaction.objects
        .select_related("bank_account", "created_by", "category")
        .order_by("-created")
    )
    paginator = Paginator(transactions, 200)
    page_obj = paginator.get_page(page_number)

    for tr in page_obj.object_list:
        tr.type = tr.get_type_display()

    fields = [
        {"name": "created", "verbose_name": "Дата"},
        {"name": "type", "verbose_name": "Тип"},
        {"name": "category", "verbose_name": "Категория"},
        {"name": "bank_account", "verbose_name": "Счет"},
        {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        {"name": "comment", "verbose_name": "Комментарий"},
        {"name": "created_by", "verbose_name": "Пользователь"},
    ]

    context = {
        "fields": fields,
        "data": page_obj,
        "context": {
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "transaction_ids": [tr.id for tr in page_obj.object_list],
        },
    }
    return render(request, "ledger/all_transactions.html", context)


@login_required
def all_transactions_table(request):
    """
    Get paginated table for all transactions.
    """
    page_number = request.GET.get("page", 1)
    transactions = (
        Transaction.objects
        .select_related("bank_account", "created_by", "category")
        .order_by("-created")
    )
    paginator = Paginator(transactions, 200)
    page_obj = paginator.get_page(page_number)

    for tr in page_obj.object_list:
        tr.type = tr.get_type_display()

    fields = [
        {"name": "created", "verbose_name": "Дата"},
        {"name": "type", "verbose_name": "Тип"},
        {"name": "category", "verbose_name": "Категория"},
        {"name": "bank_account", "verbose_name": "Счет"},
        {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        {"name": "comment", "verbose_name": "Комментарий"},
        {"name": "created_by", "verbose_name": "Пользователь"},
    ]

    html = "".join(
        render_to_string(
            "components/table_row.html",
            {"item": tr, "fields": fields},
        )
        for tr in page_obj.object_list
    )

    return JsonResponse({
        "html": html,
        "context": {
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number,
            "transaction_ids": [tr.id for tr in page_obj.object_list],
        }
    })


@login_required
@require_http_methods(["POST"])
def close_shift(request):
    """
    Close the current shift.
    """
    try:
        with transaction.atomic():
            user = request.user
            if not check_permission(user, "close_current_shift"):
                return JsonResponse(
                    {"status": "error", "message": "Нет прав на закрытие смены"},
                    status=403,
                )

            transactions = Transaction.objects.filter(completed_date__isnull=True, created_by=user)

            if not transactions.exists():
                return JsonResponse(
                    {"status": "error", "message": "Нет открытых транзакций"},
                    status=400,
                )

            orders_to_check = transactions.filter(
                type__in=["order_payment", "client_account_payment"]
            ).values_list("order", flat=True).distinct()

            for order_id in orders_to_check:
                order = Order.objects.get(id=order_id)
                involved_transactions = transactions.filter(
                    order=order, type__in=["order_payment", "client_account_payment"]
                )
                total_payment = sum(
                    abs(tr.amount) for tr in involved_transactions
                )
                current_debt = order.amount - order.paid_amount
                if total_payment > current_debt:
                    return JsonResponse(
                        {
                            "status": "error",
                            "message": f"Сумма платежей по заказу {order.id} превышает долг ({format_currency(current_debt)})",
                        },
                        status=400,
                    )

            orders_affected = set()
            for tr in transactions:
                if tr.type in ["order_payment", "client_account_payment"] and tr.order:
                    orders_affected.add(tr.order)
            old_paid = {order: order.paid_amount for order in orders_affected}

            current_date = timezone.now().date()
            update_balances(transactions)
            transactions.update(completed_date=current_date)

            for order in orders_affected:
                new_paid = order.paid_amount
                old = old_paid[order]
                if new_paid > old:
                    payment_amount = new_paid - old
                    percentage = (new_paid / order.amount) * 100 if order.amount else 0
                    message = f"По заказу №{order.id} поступил платеж в размере {format_currency(payment_amount)}. Оплачено {percentage:.2f}%."
                    client_id = order.client.id if order.client else ""
                    product_id = order.product.id if order.product else ""
                    client_object_id = order.client_object.id if order.client_object else ""
                    Notification.objects.create(
                        user=order.manager,
                        message=message,
                        url=f"/commerce/works/?order_id={order.id}&client_id={client_id}&product_id={product_id}&client_object_id={client_object_id}",
                        type="Оплата по заказу",
                        order=order
                    )

            return JsonResponse({"html": render_updated_accounts_table()})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
def enterprise_economy_report(request):
    """
    Render enterprise economy report.
    """
    year = int(request.GET.get("year", timezone.now().year))
    months = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ]

    fields = [{"name": "category", "verbose_name": "Категория"}]
    for i, mname in enumerate(months, start=1):
        fields.append({"name": f"m{i}", "verbose_name": mname, "is_number": True, "is_currency": True})
    fields.append({"name": "total", "verbose_name": "Итого", "is_number": True, "is_currency": True})

    incomes = list(TransactionCategory.objects.filter(type="income").exclude(name="Возврат от поставщиков").order_by("name"))
    refund_category = TransactionCategory.objects.filter(type="income", name="Возврат от поставщиков").first()

    rows = []
    monthly_totals = [0] * 12
    grand_total = 0

    for cat in incomes:
        month_values = []
        row_total = 0
        for m in range(1, 13):
            s = (
                Transaction.objects.filter(
                    category=cat,
                    report_date__year=year,
                    report_date__month=m,
                    completed_date__isnull=False
                )
                .aggregate(total=Sum("amount"))["total"]
                or 0
            )
            val = float(s)
            month_values.append(val)
            row_total += val
            monthly_totals[m - 1] += val
        grand_total += row_total

        row = {"category": cat.name}
        for idx, v in enumerate(month_values, start=1):
            row[f"m{idx}"] = format_currency(v)
        row["total"] = format_currency(row_total)
        rows.append(SimpleNamespace(**row))

    total_row = {"category": "Итого"}
    for idx, v in enumerate(monthly_totals, start=1):
        total_row[f"m{idx}"] = format_currency(v)
    total_row["total"] = format_currency(grand_total)
    rows.append(SimpleNamespace(**total_row))

    if refund_category:
        month_values = []
        row_total = 0
        for m in range(1, 13):
            s = (
                Transaction.objects.filter(
                    refund_category,
                    report_date__year=year,
                    report_date__month=m,
                    completed_date__isnull=False
                )
                .aggregate(total=Sum("amount"))["total"]
                or 0
            )
            val = float(s)
            month_values.append(val)
            row_total += val

        row = {"category": refund_category.name}
        for idx, v in enumerate(month_values, start=1):
            row[f"m{idx}"] = format_currency(v)
        row["total"] = format_currency(row_total)
        rows.append(SimpleNamespace(**row))

    table_html = render_to_string(
        "components/table.html",
        {
            "fields": fields,
            "data": rows,
            "id": "enterprise-economy-table",
        },
    )

    context = {
        "year": year,
        "table_html": table_html,
        "fields": fields,
        "data": rows,
    }
    return render(request, "ledger/enterprise_economy_report.html", context)

from commerce.models import (
    FixedAsset, InventoryItem, Credit, AccountsPayable, ShortTermLiability, Bonus, Order
)
from django.db import models

@login_required
def cash_report_table(request):
    """
    Страница: суммы по категориям сделок по месяцам за год.
    """
    year = int(request.GET.get("year", timezone.now().year))
    months = [
        "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
        "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"
    ]

    # Формируем поля таблицы
    fields = [{"name": "category", "verbose_name": "Категория"}]
    for i, mname in enumerate(months, start=1):
        fields.append({"name": f"m{i}", "verbose_name": mname, "is_number": True, "is_currency": True})
    fields.append({"name": "total", "verbose_name": "Итого", "is_number": True, "is_currency": True})

    categories = TransactionCategory.objects.order_by("name")
    rows = []

    for cat in categories:
        row = {"category": cat.name}
        total = 0
        for m in range(1, 13):
            s = (
                Transaction.objects.filter(
                    category=cat,
                    report_date__year=year,
                    report_date__month=m,
                    completed_date__isnull=False
                )
                .aggregate(total=Sum("amount"))["total"]
                or 0
            )
            row[f"m{m}"] = format_currency(s)
            total += s
        row["total"] = format_currency(total)
        rows.append(SimpleNamespace(**row))

    total_row = {"category": "Итого"}
    for m in range(1, 13):
        total_row[f"m{m}"] = format_currency(sum(
            float(getattr(row, f"m{m}").replace(" р.", "").replace(" ", "")) for row in rows
        ))
    total_row["total"] = format_currency(sum(
        float(row.total.replace(" р.", "").replace(" ", "")) for row in rows
    ))
    rows.append(SimpleNamespace(**total_row))

    context = {
        "fields": fields,
        "data": rows,
        "year": year,
        "months": months,
        "id": "cash-report-table",
        "is_grouped": {"cash-report-table": False},
    }
    return render(request, "ledger/cash_report.html", context)


@login_required
def enterprise_balance_report(request):
    # Активы
    fixed_assets_sum = FixedAsset.objects.aggregate(total=Sum("amount"))["total"] or 0
    inventory_sum = InventoryItem.objects.aggregate(total=Sum("amount"))["total"] or 0
    receivables_sum = (
        Order.objects.aggregate(
            total=Sum(models.F("amount") - models.F("paid_amount"))
        )["total"] or 0
    )
    bank_sum = BankAccount.objects.aggregate(total=Sum("balance"))["total"] or 0

    # Пассивы
    credit_sum = Credit.objects.aggregate(total=Sum("amount"))["total"] or 0
    payable_sum = AccountsPayable.objects.aggregate(total=Sum("amount"))["total"] or 0
    short_term_sum = ShortTermLiability.objects.aggregate(total=Sum("amount"))["total"] or 0
    bonus_sum = Bonus.objects.aggregate(total=Sum("amount"))["total"] or 0

    # Группировка
    non_current_assets = fixed_assets_sum
    current_assets = inventory_sum + receivables_sum + bank_sum
    assets = non_current_assets + current_assets

    liabilities = credit_sum + payable_sum + short_term_sum + bonus_sum
    capital = assets - liabilities

    # Структура для шаблона
    # Внутри enterprise_balance_report
    data = [
        {
            "name": "Активы",
            "key": "assets",
            "total": assets,
            "children": [
                {
                    "name": "Внеоборотные активы",
                    "key": "non_current_assets",
                    "total": non_current_assets,
                    "children": [
                        {
                            "name": "Основные средства",
                            "key": "fixed_assets",
                            "total": fixed_assets_sum,
                            "expandable": True,
                            "type": "fixed_asset",
                        },
                    ],
                },
                {
                    "name": "Оборотные активы",
                    "key": "current_assets",
                    "total": current_assets,
                    "children": [
                        {
                            "name": "Товарные остатки",
                            "key": "inventory",
                            "total": inventory_sum,
                            "expandable": True,
                            "type": "inventory_item",
                        },
                        {
                            "name": "Дебиторская задолженность",
                            "key": "receivables",
                            "total": receivables_sum,
                            "expandable": False,
                        },
                        {
                            "name": "Денежные средства",
                            "key": "cash",
                            "total": bank_sum,
                            "expandable": True,
                            "type": "cash",
                        },
                    ],
                },
            ],
        },
        {
            "name": "Пассивы",
            "key": "liabilities",
            "total": liabilities,
            "children": [
                {
                    "name": "Обязательства",
                    "key": "liabilities_group",
                    "total": liabilities,
                    "children": [
                        {
                            "name": "Кредит",
                            "key": "credit",
                            "total": credit_sum,
                            "expandable": True,
                            "type": "credit",
                        },
                        {
                            "name": "Кредиторская задолженность",
                            "key": "payable",
                            "total": payable_sum,
                            "expandable": True,
                            "type": "accounts_payable",
                        },
                        {
                            "name": "Краткосрочные обязательства",
                            "key": "short_term",
                            "total": short_term_sum,
                            "expandable": True,
                            "type": "short_term_liability",
                        },
                        {
                            "name": "Бонусы",
                            "key": "bonus",
                            "total": bonus_sum,
                            "expandable": True,
                            "type": "bonus",
                        },
                    ],
                },
                {
                    "name": "Капитал",
                    "key": "capital",
                    "total": capital,
                    "children": [],
                },
            ],
        },
    ]
    
    # Форматирование сумм для вывода
    def format_node(node):
        node["total"] = format_currency(node["total"])
        if "children" in node:
            node["children"] = [format_node(child) for child in node["children"]]
        return node

    data = [format_node(node) for node in data]

    return render(request, "ledger/enterprise_balance_report.html", {"data": data})

from django.http import JsonResponse
from django.template.loader import render_to_string
from django.db.models import Sum
from commerce.models import (
    FixedAsset, InventoryItem, Credit, AccountsPayable, ShortTermLiability, Bonus
)
from ledger.models import BankAccount

def enterprise_balance_expand(request):
    item_type = request.GET.get('type')

    if item_type == 'fixed_asset':
        items = FixedAsset.objects.all()
        for obj in items:
            obj.amount = format_currency(obj.amount)
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        ]
        html = render_to_string('components/table.html', {
            'fields': fields,
            'data': items,
            'id': 'fixed-asset-table',
        })
    elif item_type == 'inventory_item':
        items = InventoryItem.objects.all()
        for obj in items:
            obj.amount = format_currency(obj.amount)
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        ]
        html = render_to_string('components/table.html', {
            'fields': fields,
            'data': items,
            'id': 'inventory-item-table',
        })
    elif item_type == 'credit':
        items = Credit.objects.all()
        for obj in items:
            obj.amount = format_currency(obj.amount)
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        ]
        html = render_to_string('components/table.html', {
            'fields': fields,
            'data': items,
            'id': 'credit-table',
        })
    elif item_type == 'accounts_payable':
        items = AccountsPayable.objects.all()
        for obj in items:
            obj.amount = format_currency(obj.amount)
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        ]
        html = render_to_string('components/table.html', {
            'fields': fields,
            'data': items,
            'id': 'accounts-payable-table',
        })
    elif item_type == 'short_term_liability':
        items = ShortTermLiability.objects.all()
        for obj in items:
            obj.amount = format_currency(obj.amount)
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        ]
        html = render_to_string('components/table.html', {
            'fields': fields,
            'data': items,
            'id': 'short-term-liability-table',
        })
    elif item_type == 'bonus':
        items = Bonus.objects.all()
        for obj in items:
            obj.amount = format_currency(obj.amount)
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "amount", "verbose_name": "Сумма", "is_number": True, "is_currency": True},
        ]
        html = render_to_string('components/table.html', {
            'fields': fields,
            'data': items,
            'id': 'bonus-table',
        })
    elif item_type == 'cash':
        total = BankAccount.objects.aggregate(total=Sum('balance'))['total'] or 0
        
        try:
            total_formatted = format_currency(total)
        except ImportError:
            total_formatted = str(total)
        html = f'''
            <ul class="debtors-office-list">
                <li class="debtors-office-list__item">
                    <div class="debtors-office-list__row">
                        <span class="debtors-office-list__title">Счета, Карта и Сейф</span>
                        <span class="debtors-office-list__amount">{total_formatted}</span>
                    </div>
                </li>
            </ul>
        '''
    else:
        html = ''

    return JsonResponse({'html': html})
