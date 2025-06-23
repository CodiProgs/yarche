from django.shortcuts import render, get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.template.loader import render_to_string
from django.db import transaction
from django.forms.models import model_to_dict
from django.core.paginator import Paginator
from django.utils.dateparse import parse_date
from django.views.decorators.http import require_http_methods
from django.contrib.auth.decorators import login_required
from django.utils import timezone
from django.core.exceptions import ValidationError
from django.db.models import Sum
import locale
import json

from commerce.models import Order, Client
from yarche.utils import get_model_fields
from .models import BankAccount, BankAccountType, TransactionCategory, Transaction

locale.setlocale(locale.LC_ALL, "ru_RU.UTF-8")
CURRENCY_SUFFIX = " р."
DEFAULT_VALUE = f"0,00{CURRENCY_SUFFIX}"


# region Helpers
def parse_amount(amount_str: str) -> float:
    if not amount_str:
        return 0.00
    clean_amount = amount_str.replace(CURRENCY_SUFFIX, "").replace(" ", "")
    return round(float(clean_amount.replace(",", ".")), 2)


def format_currency(amount: float) -> str:

    sum = locale.format_string("%.2f", amount, grouping=True)
    return sum


def check_permission(user, codename):
    if hasattr(user, "user_type") and user.user_type:
        return user.user_type.permissions.filter(codename=codename).exists()
    return False


class BankAccountData:
    def __init__(self, name, balance, shift_amount, total_amount):
        self.name = name
        self.balance = balance
        self.shift_amount = shift_amount
        self.total_amount = total_amount


def get_transaction_fields():
    excluded_fields = [
        "id",
        "created",
        "amount",
        "report_date",
        "completed_date",
        "order",
        "related_transaction",
        "created_by",
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
        model=Transaction, excluded_fields=excluded_fields, field_order=field_order
    )

    fields.insert(
        2,
        {
            "name": "amount",
            "verbose_name": "Сумма",
            "is_number": True,
            "is_currency": True,
        },
    )

    fields.insert(4, {"name": "orderId", "verbose_name": "Заказ №", "is_number": True})

    return fields


def handle_transaction_update(tr, data):
    trans_type = tr.type
    comment = data.get("comment", "").strip()
    amount_str = data.get("amount")

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
        tr.save()
        return tr, None


# endregion


# region Bank Accounts
@login_required
def bank_accounts(request):
    context = {
        "fields": get_model_fields(BankAccount, excluded_fields=["balance"]),
        "data": BankAccount.objects.all(),
    }
    return render(request, "ledger/bank_accounts.html", context)


@login_required
def bank_account_types(request):
    types_data = [{"id": t.id, "name": t.name} for t in BankAccountType.objects.all()]
    return JsonResponse(types_data, safe=False)


@login_required
def bank_account_list(request):
    accounts_data = [
        {"id": acc.id, "name": acc.name} for acc in BankAccount.objects.all()
    ]
    return JsonResponse(accounts_data, safe=False)


@login_required
def bank_account_detail(request, pk: int):
    account = get_object_or_404(BankAccount, id=pk)
    return JsonResponse({"data": model_to_dict(account)})


@login_required
@require_http_methods(["POST"])
def bank_account_create(request):
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
@require_http_methods(["DELETE"])
def bank_account_delete(request, pk: int):
    try:
        with transaction.atomic():
            account = get_object_or_404(BankAccount, id=pk)
            if Transaction.objects.filter(bank_account=account).exists():
                return JsonResponse(
                    {
                        "status": "error",
                        "message": "Нельзя удалить счет с транзакциями",
                    },
                    status=400,
                )

            account.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
def refresh_bank_accounts(request):
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
    context = {
        "fields": get_model_fields(TransactionCategory),
        "data": TransactionCategory.objects.all(),
    }
    return render(request, "ledger/transaction_categories.html", context)


@login_required
def transaction_category_list(request):
    transaction_type = request.GET.get("type")
    categories = TransactionCategory.objects.all()

    if transaction_type in ["expense", "income"]:
        categories = categories.filter(type=transaction_type)

    return JsonResponse(
        [{"id": cat.id, "name": cat.name} for cat in categories], safe=False
    )


@login_required
def transaction_category_detail(request, pk: int):
    category = get_object_or_404(TransactionCategory, id=pk)
    return JsonResponse({"data": model_to_dict(category)})


@login_required
@require_http_methods(["POST"])
def transaction_category_create(request):
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
@require_http_methods(["DELETE"])
def transaction_category_delete(request, pk: int):
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
    types_data = [
        {"id": t[0], "name": t[1]} for t in Transaction.TransactionType.choices
    ]
    return JsonResponse(types_data, safe=False)


@login_required
def transactions(request):
    context = {"fields": get_transaction_fields(), "data": None}

    return render(request, "ledger/transactions.html", context)


@login_required
def transaction_list(request):
    start_date = parse_date(request.GET.get("start_date", ""))
    end_date = parse_date(request.GET.get("end_date", ""))

    if not start_date or not end_date:
        return JsonResponse({"error": "Необходимо указать даты"}, status=400)

    transactions = Transaction.objects.filter(
        created__date__range=(start_date, end_date), completed_date__isnull=False
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
    try:
        with transaction.atomic():
            report_date_value = request.POST.get("report_date", "")

            if report_date_value and len(report_date_value) == 7:
                report_date_value = f"{report_date_value}-01"

            data = {
                "bank_account_id": request.POST.get("bank_account"),
                "category_id": request.POST.get("category"),
                "amount": parse_amount(request.POST.get("amount")),
                "type": request.POST.get("type"),
                "comment": request.POST.get("comment", ""),
                "created_by": request.user,
                "report_date": report_date_value or None,
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
                    {"status": "error", "message": "Неверная сумма"}, status=400
                )

            if data["type"] == "expense":
                data["amount"] = -data["amount"]

            tr = Transaction.objects.create(**data)
            tr.orderId = tr.order.id if tr.order else None

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
                    {"status": "error", "message": "Неверная сумма"}, status=400
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
    tr = get_object_or_404(Transaction, id=pk)
    data = model_to_dict(tr)

    if tr.client:
        data["client"] = tr.client.id
    if tr.type == "transfer":
        data.update(handle_transfer_details(tr))

    return JsonResponse({"data": data})


def handle_transfer_details(tr):
    data = {}
    if tr.amount < 0:
        data["source_bank_account"] = tr.bank_account.id
        data["destination_bank_account"] = tr.related_transaction.bank_account.id
    else:
        data["source_bank_account"] = tr.related_transaction.bank_account.id
        data["destination_bank_account"] = tr.bank_account.id
    data["amount"] = abs(tr.amount)
    return data


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def transaction_update(request, pk: int):
    try:
        with transaction.atomic():
            tr = Transaction.objects.select_for_update().get(id=pk)
            data = (
                json.loads(request.body)
                if request.method in ["PUT", "PATCH"]
                else request.POST.dict()
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
@require_http_methods(["DELETE"])
def transaction_delete(request, pk: int):
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


# endregion


# region Payments
@login_required
def payments(request):
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
    ]
    field_order = [
        "id",
        "manager",
        "completed_date",
        "product",
        "amount",
        "orderId",
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
        (5, {"name": "orderId", "verbose_name": "Заказ", "is_number": True}),
        (6, {"name": "client", "verbose_name": "Клиент", "is_relation": True}),
        (7, {"name": "legal_name", "verbose_name": "Фирма"}),
    ]

    for pos, field in insertions:
        fields.insert(pos, field)

    return fields


def prepare_payment_data(transactions):
    data = []
    for tr in transactions:
        tr.product = tr.order.product if tr.order else None
        tr.client = tr.order.client if tr.order and tr.order.client else None
        tr.legal_name = (
            tr.order.client.legal_name if tr.order and tr.order.client else None
        )
        tr.orderId = tr.order.id if tr.order else None
        tr.manager = tr.order.manager.last_name if tr.order else None
        data.append(tr)
    return data


# endregion


# region Current Shift
@login_required
def current_shift(request):
    user = request.user
    accounts = BankAccount.objects.all().order_by("type")
    transactions = Transaction.objects.filter(completed_date__isnull=True)

    if not check_permission(user, "view_all_shift_transactions"):
        transactions = transactions.filter(created_by=user)

    accounts_data = prepare_accounts_data(accounts, transactions)
    transactions_data = prepare_shift_transactions(transactions)

    context = {
        "fields": {
            "bank_accounts": [
                {"name": "name", "verbose_name": "Название счета"},
                {"name": "balance", "verbose_name": "Учтено", "is_number": True},
                {"name": "shift_amount", "verbose_name": "Сегодня", "is_number": True},
                {"name": "total_amount", "verbose_name": "Сумма", "is_number": True},
            ],
            "transactions": get_transaction_fields(),
        },
        "data": {"bank_accounts": accounts_data, "transactions": transactions_data},
        "is_grouped": {"bank-accounts-table": True},
        "transaction_ids": [tr.id for tr in transactions],
    }
    return render(request, "ledger/current_shift.html", context)


def prepare_accounts_data(accounts, transactions):
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
    data = []
    for tr in transactions:
        tr.orderId = tr.order.id if tr.order else None
        data.append(tr)
    return data


@login_required
@require_http_methods(["POST"])
def close_shift(request):
    try:
        with transaction.atomic():
            user = request.user
            if not check_permission(user, "close_current_shift"):
                return JsonResponse(
                    {"status": "error", "message": "Нет прав на закрытие смены"},
                    status=403,
                )

            transactions = Transaction.objects.filter(completed_date__isnull=True)
            if not check_permission(user, "view_all_shift_transactions"):
                transactions = transactions.filter(created_by=user)

            if not transactions.exists():
                return JsonResponse(
                    {"status": "error", "message": "Нет открытых транзакций"},
                    status=400,
                )

            current_date = timezone.now().date()
            update_balances(transactions)
            transactions.update(completed_date=current_date)

            return JsonResponse({"html": render_updated_accounts_table()})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def update_balances(transactions):
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
            "id": "bank-accounts-table",
            "is_grouped": {"bank-accounts-table": True},
        },
    )


# endregion


# region Client Payments
@login_required
@require_http_methods(["POST"])
def order_payment_create(request):
    try:
        with transaction.atomic():
            report_date_value = request.POST.get("report_date", "")

            if report_date_value and len(report_date_value) == 7:
                report_date_value = f"{report_date_value}-01"

            data = {
                "order_id": request.POST.get("order"),
                "bank_account_id": request.POST.get("bank_account"),
                "amount": parse_amount(request.POST.get("amount")),
                "comment": request.POST.get("comment", ""),
                "type": "order_payment",
                "created_by": request.user,
                "report_date": report_date_value or None,
            }

            validate_payment_data(data)
            tr = Transaction.objects.create(**data)
            return render_transaction_response(tr)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def validate_payment_data(data):
    if not data["bank_account_id"]:
        raise ValidationError("Не указан счет")
    if data["amount"] <= 0:
        raise ValidationError("Неверная сумма")
    if not data["order_id"]:
        raise ValidationError("Не указан заказ")

    order = Order.objects.get(id=data["order_id"])
    debt = calculate_remaining_debt(order)

    if data["amount"] > debt:
        raise ValidationError(f"Сумма превышает долг ({format_currency(debt)} р.)")


def calculate_remaining_debt(order):
    payments = (
        Transaction.objects.filter(
            order=order, type="order_payment", completed_date__isnull=True
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    client_payments = (
        Transaction.objects.filter(
            order=order, type="client_account_payment", completed_date__isnull=True
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return order.amount - (payments - client_payments + order.paid_amount)


@login_required
@require_http_methods(["POST"])
def client_balance_payment(request):
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

            validate_client_payment(data)

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


def validate_client_payment(data):
    if not data["client_id"]:
        raise ValidationError("Не указан клиент")
    if data["amount"] <= 0:
        raise ValidationError("Неверная сумма")
    if not data["order_id"]:
        raise ValidationError("Не указан заказ")

    client = Client.objects.get(id=data["client_id"])
    order = Order.objects.get(id=data["order_id"])

    balance = calculate_client_balance(client)
    if data["amount"] > balance:
        raise ValidationError(f"Недостаточно средств: {format_currency(balance)} р.")

    debt = calculate_order_debt(order)
    if data["amount"] > debt:
        raise ValidationError(f"Сумма превышает долг ({format_currency(debt)} р.)")


def calculate_client_balance(client):
    deposits = (
        Transaction.objects.filter(
            client=client, type="client_account_deposit"
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    payments = (
        Transaction.objects.filter(
            client=client, type="client_account_payment"
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return client.balance + deposits + payments


def calculate_order_debt(order):
    order_payments = (
        Transaction.objects.filter(order=order, type="order_payment").aggregate(
            total=Sum("amount")
        )["total"]
        or 0
    )

    client_payments = (
        Transaction.objects.filter(
            order=order, type="client_account_payment"
        ).aggregate(total=Sum("amount"))["total"]
        or 0
    )

    return order.amount - (order_payments - client_payments)


@login_required
@require_http_methods(["POST"])
def client_balance_deposit(request):
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
                    {"status": "error", "message": "Неверная сумма"}, status=400
                )

            tr = Transaction.objects.create(**data)
            return render_transaction_response(tr)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


def render_transaction_response(transaction):
    context = {"item": transaction, "fields": get_transaction_fields()}
    return JsonResponse(
        {
            "html": render_to_string("components/table_row.html", context),
            "id": transaction.id,
        }
    )


# endregion
