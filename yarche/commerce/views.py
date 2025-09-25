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
from django.contrib.auth.decorators import login_required
from .models import Product, Client, Order, OrderStatus
from ledger.models import Transaction, BankAccount
from django.shortcuts import render


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
def works(request):
    clients = Client.objects.prefetch_related('client_objects').all()
    products = Product.objects.all()

    context = {
        "clients": clients,
        "products": products,
    }

    return render(request, "commerce/works.html", context)

@login_required
def product_orders(request):
    product_id = request.GET.get("product_id")
    client_id = request.GET.get("client_id")
    object_id = request.GET.get("object_id")
    orders = Order.objects.filter(
        product_id=product_id,
        client_id=client_id,
        client_object_id=object_id,
    )
    html = ""
    for order in orders:
        html += f'<li class="debtors-office-list__item"><div class="debtors-office-list__row" style="border-left-width: 52px;">Заказ №{order.id} — {order.amount} р.</div></li>'
    if not html:
        html = "<li class='debtors-office-list__item'><div class='debtors-office-list__row' style='border-left-width: 52px;'>Нет заказов</div></li>"
    return JsonResponse({"html": html})

@login_required
def orders(request):

    orders = Order.objects.all()

    fields = get_order_fields()
    data = prepare_orders_data(orders)

    context = {
        "fields": fields,
        "data": data,
    }
    return render(request, "commerce/orders.html", context)


def get_order_fields():
    excluded = [
        "client_object",
        "amount",
        "created",
        "deadline",
        "documents",
        "paid_amount",
        "comment",
    ]
    field_order = [
        "id",
        "status",
        "manager",
        "client",
        "legal_name",
        "product",
        "amount",
        "created",
        "deadline",
        "documents",
        "paid_amount",
        "paid_percent",
        "additional_info"
    ]
    verbose_names = {
        
    }

    fields = get_model_fields(
        Order,
        excluded_fields=excluded,
        custom_verbose_names=verbose_names,
        field_order=field_order,
    )

    insertions = [
        (4, {"name": "legal_name", "verbose_name": "Юрлицо"}),
        (6, {"name": "amount", "verbose_name": "Сумма заказа", "is_amount": True}),
        (7, {"name": "created", "verbose_name": "Создан", "is_date": True}),
        (8, {"name": "deadline", "verbose_name": "Срок сдачи", "is_date": True}),
        (9, {"name": "documents", "verbose_name": "Документы", "is_boolean": True}),
        (10, {"name": "paid_amount", "verbose_name": "Оплачено", "is_amount": True}),
        (11, {"name": "paid_percent", "verbose_name": "% Оплаты", "is_percent": True}),
    ]

    for pos, field in insertions:
        fields.insert(pos, field)

    return fields

def prepare_orders_data(orders):
    data = []
    for tr in orders:
        tr.legal_name = tr.client.legal_name if tr.client else None
        tr.paid_percent = int(tr.paid_amount / tr.amount * 100) if tr.amount else 0
        data.append(tr)
    return data

@login_required
def order_statuses(request):
    statuses = [
        {"id": acc.id, "name": acc.name} for acc in OrderStatus.objects.all()
    ]
    return JsonResponse(statuses, safe=False)
