from django.db import models
from django.http import JsonResponse
from django.db.models import (
    F,
    Q,
    Sum,
    Case,
    When,
    OuterRef,
    Subquery,
    ExpressionWrapper,
)
from django.db.models.functions import Coalesce
from django.template.loader import render_to_string
from yarche.utils import get_model_fields
from django.shortcuts import render, get_object_or_404
from .models import Product, Client, Order, OrderStatus
from ledger.models import Transaction, BankAccount
from django.contrib.auth.decorators import login_required
from django.core.paginator import Paginator
from django.forms.models import model_to_dict
from django.views.decorators.http import require_http_methods
from django.db import transaction

def check_permission(user, codename):
    if hasattr(user, "user_type") and user.user_type:
        return user.user_type.permissions.filter(codename=codename).exists()
    return False

# region Helpers
def get_base_order_queryset():
    transactions_sum = (
        Transaction.objects.filter(
            order_id=OuterRef("pk"),
            type__in=["order_payment", "client_account_payment"],
        )
        .annotate(
            adjusted_amount=Case(
                When(type="client_account_payment", then=-F("amount")),
                default=F("amount"),
                output_field=models.DecimalField(max_digits=12, decimal_places=2),
            )
        )
        .values("order_id")
        .annotate(total_transactions=Sum("adjusted_amount"))
        .values("total_transactions")
    )

    paid_plus_transactions = ExpressionWrapper(
        F("paid_amount") + Coalesce(F("transactions_total"), 0),
        output_field=models.DecimalField(max_digits=12, decimal_places=2),
    )

    return Order.objects.annotate(
        transactions_total=Subquery(
            transactions_sum,
            output_field=models.DecimalField(max_digits=12, decimal_places=2),
        ),
        total_paid=paid_plus_transactions,
        remaining=ExpressionWrapper(
            F("amount") - paid_plus_transactions,
            output_field=models.DecimalField(max_digits=12, decimal_places=2),
        ),
    )


def get_client_balance_data():
    first_deposit_subquery = (
        Transaction.objects.filter(
            type="client_account_deposit", client=OuterRef("client")
        )
        .order_by("created")
        .values("created")[:1]
    )

    first_deposits = dict(
        Transaction.objects.filter(
            type="client_account_deposit", created=Subquery(first_deposit_subquery)
        ).values_list("client", "bank_account")
    )

    transactions = (
        Transaction.objects.filter(
            type__in=["client_account_deposit", "client_account_payment"],
            completed_date__isnull=True,
        )
        .values("client", "type")
        .annotate(total=Sum("amount"))
    )

    deposits = {}
    payments = {}
    for t in transactions:
        if t["type"] == "client_account_deposit":
            deposits[t["client"]] = t["total"]
        else:
            payments[t["client"]] = t["total"]

    bank_accounts = dict(BankAccount.objects.values_list("id", "name"))

    return deposits, payments, first_deposits, bank_accounts


def render_client_table(clients):
    excluded_fields = [
        "id",
        "comment",
        "inn",
        "legal_name",
        "director",
        "ogrn",
        "basis",
        "legal_address",
        "actual_address",
        "bank_account",
        "balance",
    ]

    fields = get_model_fields(
        model=Client,
        excluded_fields=excluded_fields,
        field_order=["name", "bank_account_name", "total_balance"],
    )

    fields.insert(1, {"name": "bank_account_name", "verbose_name": "Счет"})
    fields.insert(
        2, {"name": "total_balance", "verbose_name": "Баланс", "is_number": True}
    )

    return render_to_string(
        "components/table.html", {"data": clients, "fields": fields}
    )


# endregion


# region Views
def entity_list(request, model_class):
    entities = model_class.objects.all().values("id", "name")
    return JsonResponse(list(entities), safe=False)


def product_list(request):
    return entity_list(request, Product)


def client_list(request):
    return entity_list(request, Client)


def order_debt(request, pk):
    try:
        order = Order.objects.get(pk=pk)
        transactions_sum = (
            Transaction.objects.filter(
                order_id=pk,
                type__in=["order_payment", "client_account_payment"],
                completed_date__isnull=True,
            )
            .annotate(
                adjusted_amount=Case(
                    When(type="client_account_payment", then=-F("amount")),
                    default=F("amount"),
                    output_field=models.DecimalField(max_digits=12, decimal_places=2),
                )
            )
            .aggregate(total=Sum("adjusted_amount"))["total"]
            or 0
        )

        debt = order.amount - order.paid_amount - transactions_sum
        return JsonResponse({"debt": debt})

    except Order.DoesNotExist:
        return JsonResponse(
            {"status": "error", "message": "Заказ не найден"}, status=404
        )


def order_ids(request):
    client_id = request.GET.get("client")
    order_id_param = request.GET.get("order")
    transaction_id = request.GET.get("transaction")

    if transaction_id:
        try:
            transaction = (
                Transaction.objects.filter(id=int(transaction_id))
                .select_related("order")
                .first()
            )
            if transaction and transaction.order:
                return JsonResponse(
                    [{"id": transaction.order.id, "name": transaction.order.id}],
                    safe=False,
                )
        except (ValueError, TypeError):
            pass
        return JsonResponse([], safe=False)

    query = get_base_order_queryset().filter(
        Q(transactions_total__isnull=True, paid_amount__lt=F("amount"))
        | Q(total_paid__lt=F("amount"))
    )

    if client_id:
        try:
            query = query.filter(client_id=int(client_id))
        except (ValueError, TypeError):
            return JsonResponse([], safe=False)

    if order_id_param:
        try:
            order_query = Order.objects.filter(id=int(order_id_param))
            if client_id:
                order_query = order_query.filter(client_id=int(client_id))
            if order_query.exists():
                query = query | get_base_order_queryset().filter(id=int(order_id_param))
        except (ValueError, TypeError):
            pass

    order_ids = query.distinct().values_list("id", flat=True)
    return JsonResponse([{"id": oid, "name": oid} for oid in order_ids], safe=False)


def client_balances(request):
    deposits, payments, first_deposits, bank_accounts = get_client_balance_data()
    client_id_param = request.GET.get("client")

    clients = []
    for client in Client.objects.prefetch_related("transaction_set").all():
        deposit_sum = deposits.get(client.id, 0)
        payment_sum = payments.get(client.id, 0)
        total_balance = client.balance + deposit_sum + payment_sum

        if (
            total_balance == 0
            and str(client.id) != client_id_param
            and str(client.name) != client_id_param
        ):
            continue

        bank_account_id = first_deposits.get(client.id)
        if not bank_account_id:
            bank_account_id = (
                BankAccount.objects.order_by("id").values_list("id", flat=True).first()
            )

        client.bank_account_name = bank_accounts.get(bank_account_id, "")
        client.total_balance = total_balance
        clients.append(client)

    return JsonResponse(
        {
            "html": render_client_table(clients),
            "ids": [{"id": c.id, "name": c.name} for c in clients],
        }
    )
# endregion


@login_required
def orders(request):
    user = request.user
    has_perm = check_permission(user, "view_all_orders")

    orders = Order.objects.all().select_related("client", "manager", "product")

    if not has_perm:
        orders = orders.filter(manager=user)

    fields = get_order_fields()
    data = prepare_order_data(orders)

    context = {
        "fields": fields,
        "data": data,
        "restricted_user": user.last_name if not has_perm else None,
    }

    return render(request, "commerce/orders.html", context)

def get_order_fields():
    excluded = [
        "documents",
        "comment",
    ]
    field_order = [
        "id",
        "status",
        "manager",
        "client",
        "client_legal_name",
        "product",
        "amount",
        "created",
        "deadline",
        "documents_required",
        "paid_amount",
        "paid_percent",
        "additional_info"
    ]
    verbose_names = {
        "paid_amount": "Оплачено",
    }

    fields = get_model_fields(
        Order,
        excluded_fields=excluded,
        custom_verbose_names=verbose_names,
        field_order=field_order,
    )

    insertions = [
        (4, {"name": "client_legal_name", "verbose_name": "Юрлицо"}),
        (10, {"name": "paid_percent", "verbose_name": "Погашен %", "is_number": True})
    ]

    for pos, field in insertions:
        fields.insert(pos, field)

    return fields

def prepare_order_data(orders):
    data = []
    for order in orders:
        if order.client:
            order.client_legal_name = order.client.legal_name
        else:
            order.client_legal_name = None
        
        if order.manager:
            order.manager_name = order.manager.last_name or order.manager.username
        else:
            order.manager_name = None
            
        if order.amount and order.amount > 0:
            order.paid_percent = int((order.paid_amount / order.amount) * 100)
        else:
            order.paid_percent = 0
            
        data.append(order)
    return data

def order_statuses(request):
    return entity_list(request, OrderStatus)

@login_required
def clients(request):
    clients_queryset = Client.objects.all().order_by('name')

    page_number = request.GET.get("page", 1)
    paginator = Paginator(list(clients_queryset), 25)
    page_obj = paginator.get_page(page_number)
    
    fields = get_client_detail_fields()
    client_data = page_obj.object_list

    context = {
        "fields": fields,
        "data": client_data,
        "pagination": {
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number,
        }
    }

    return render(request, "commerce/clients.html", context)

@login_required
def client_table(request):
    clients_queryset = Client.objects.all().order_by('name')

    page_number = request.GET.get("page", 1)
    paginator = Paginator(list(clients_queryset), 25)
    page_obj = paginator.get_page(page_number)

    transaction_ids = [tr.id for tr in page_obj.object_list]

    html = "".join(
        render_to_string(
            "components/table_row.html",
            {"item": tr, "fields": get_client_detail_fields()},
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


def get_client_detail_fields():
    excluded_fields = [
        "comment",
        "inn",
        "director",
        "ogrn",
        "basis",
        "legal_address",
        "actual_address",
        "balance",
    ]

    field_order = [
        "id",
        "name",
        "legal_name",
    ]

    fields = get_model_fields(
        model=Client, 
        excluded_fields=excluded_fields, 
        field_order=field_order,
    )

    return fields


@login_required
def client_detail(request, pk: int):
    tr = get_object_or_404(Client, id=pk)
    data = model_to_dict(tr)

    return JsonResponse({"data": data})

@login_required
@require_http_methods(["POST"])
def client_add(request):
    try:
        with transaction.atomic():
            data = {
                "name": request.POST.get("name", ""),
                "comment": request.POST.get("comment", ""),
                "inn": request.POST.get("inn", "") or None,
                "legal_name": request.POST.get("legal_name", "") or None,
                "director": request.POST.get("director", "") or None,
                "ogrn": request.POST.get("ogrn", "") or None,
                "basis": request.POST.get("basis", "") or None,
                "legal_address": request.POST.get("legal_address", "") or None,
                "actual_address": request.POST.get("actual_address", "") or None,
            }

            if not data["name"]:
                return JsonResponse(
                    {"status": "error", "message": "Название клиента не может быть пустым"}, 
                    status=400
                )

            client = Client.objects.create(**data)

            fields = get_client_detail_fields()
            context = {"item": client, "fields": fields}

            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": client.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

#transaction_update
@login_required
def client_edit(request, pk: int):
    return JsonResponse({"status": "ok", "message": "ok"}, status=200)

#transaction_delete
@login_required
def client_delete(request, pk: int):
    return JsonResponse({"status": "ok", "message": "ok"}, status=200)