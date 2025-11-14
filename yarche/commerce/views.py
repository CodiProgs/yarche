from django.db import models
from django.http import JsonResponse
from django.forms.models import model_to_dict
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
from django.db import transaction
from django.core.paginator import Paginator
from django.db.models.functions import Coalesce
from django.template.loader import render_to_string
from yarche.utils import get_model_fields
from django.contrib.auth.decorators import login_required
from .models import Product, Client, Order, OrderStatus, Contact, FileType, Document, ClientObject
from ledger.models import Transaction, BankAccount
from django.shortcuts import render, get_object_or_404
from django.views.decorators.http import require_http_methods
import json
from urllib.parse import urlparse, unquote
import os
from django.utils.timezone import localtime


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

def document_types(request):
    return entity_list(request, FileType)


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
    ).order_by("-created")
    
    data = []
    for order in orders:
        order.legal_name = order.client.legal_name if order.client else None
        order.paid_percent = int(order.paid_amount / order.amount * 100) if order.amount else 0
        data.append(order)
    
    fields = [
        {"name": "id", "verbose_name": "Заказ"},
        {"name": "status", "verbose_name": "Статус", "is_relation": True},
        {"name": "client", "verbose_name": "Клиент", "is_relation": True},
        {"name": "legal_name", "verbose_name": "Полное юринфо"},
        {"name": "product", "verbose_name": "Продукт", "is_relation": True},
        {"name": "created", "verbose_name": "Создан", "is_date": True},
        {"name": "deadline", "verbose_name": "Срок сдачи", "is_date": True},
        {"name": "required_documents", "verbose_name": "Док-ты", "is_boolean": True},
        {"name": "unit_price", "verbose_name": "Стоимость", "is_amount": True},
        {"name": "amount", "verbose_name": "Сумма", "is_amount": True},
        {"name": "paid_amount", "verbose_name": "Погашено", "is_amount": True},
        {"name": "comment", "verbose_name": "Комментарий"},
        {"name": "additional_info", "verbose_name": "Доп. инф-я"},
    ]
    
    table_id = f"product-orders-{product_id}-{client_id}-{object_id}"
    
    html = render_to_string(
        "components/table.html",
        {
            "fields": fields,
            "data": data,
            "id": table_id,
        },
    )
    
    if not data:
        html = '<div class="info debtors-office-list__row" border-left-width: 16px;>Нет заказов</div>'
    
    return JsonResponse({"html": html, "order_ids": [o.id for o in orders], "table_id": table_id})

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
        "archived_at"
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

@login_required
def clients_paginate(request):
    clients_qs = Client.objects.all()

    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "name", "verbose_name": "Клиент"},
        {"name": "legal_name", "verbose_name": "Юр. название"},
    ]

    page_number = request.GET.get("page", 1)
    paginator = Paginator(list(clients_qs), 25)
    page_obj = paginator.get_page(page_number)

    client_ids = [c.id for c in page_obj.object_list]

    html = "".join(
        render_to_string("components/table_row.html", {"item": client, "fields": fields})
        for client in page_obj.object_list
    )

    return JsonResponse(
        {
            "html": html,
            "context": {
                "total_pages": paginator.num_pages,
                "current_page": page_obj.number,
                "client_ids": client_ids,
            },
        }
    )

@login_required
def clients(request):
    clients_qs = Client.objects.all().order_by("id")[:25]

    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "name", "verbose_name": "Клиент"},
        {"name": "legal_name", "verbose_name": "Юр. название"},
    ]

    context = {
        "fields": fields,
        "data": clients_qs,
    }
    return render(request, "commerce/clients.html", context)

@login_required
@require_http_methods(["POST"])
def client_create(request):
    try:
        with transaction.atomic():
            name = (request.POST.get("name") or "").strip()
            legal_name = (request.POST.get("legal_name") or "").strip()

            if not name and not legal_name:
                return JsonResponse(
                    {"status": "error", "message": "Требуется указать имя или юр. название"},
                    status=400,
                )

            client = Client.objects.create(
                name=name or None,
                legal_name=legal_name or None,
            )

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "name", "verbose_name": "Клиент"},
                {"name": "legal_name", "verbose_name": "Юр. название"},
            ]

            context = {"item": client, "fields": fields}
            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": client.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST"])
def client_delete(request, pk: int):
    try:
        with transaction.atomic():
            client = get_object_or_404(Client, id=pk)

            if Order.objects.filter(client=client).exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить клиента с привязанными заказами"},
                    status=400,
                )

            if Transaction.objects.filter(client=client).exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить клиента с привязанными транзакциями"},
                    status=400,
                )

            if hasattr(client, "client_objects") and client.client_objects.exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить клиента с привязанными объектами"},
                    status=400,
                )

            client.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
def client_detail(request, pk: int):
    client = get_object_or_404(Client, id=pk)
    data = model_to_dict(client)

    for field in (
        "id",
        "name",
        "comment",
        "inn",
        "legal_name",
        "director",
        "ogrn",
        "basis",
        "legal_address",
        "actual_address",
    ):
        if field not in data and hasattr(client, field):
            data[field] = getattr(client, field)

    contact_fields = [
        {"name": "last_name", "verbose_name": "Фамилия"},
        {"name": "first_name", "verbose_name": "Имя"},
        {"name": "patronymic", "verbose_name": "Отчество"},
        {"name": "position", "verbose_name": "Должность"},
        {"name": "phone1", "verbose_name": "Телефон 1"},
        {"name": "phone2", "verbose_name": "Телефон 2"},
        {"name": "phone3", "verbose_name": "Телефон 3"},
        {"name": "email", "verbose_name": "Почта"},
        {"name": "birthday", "verbose_name": "ДР"},
        {"name": "socials", "verbose_name": "Социалки"},
    ]

    contacts_qs = client.contacts.all()
    contacts_html = render_to_string(
        "components/table.html",
        {
            "fields": contact_fields,
            "data": contacts_qs,
            "id": "contacts-table",
        },
    )

    return JsonResponse({"data": data, "contacts_html": contacts_html, "contacts_ids": list(contacts_qs.values_list("id", flat=True))})

@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def client_update(request, pk: int):
    try:
        with transaction.atomic():
            client = get_object_or_404(Client, id=pk)
            data = (
                json.loads(request.body) if request.method in ["PUT", "PATCH"] else request.POST.dict()
            )

            updatable = [
                "name",
                "comment",
                "inn",
                "legal_name",
                "director",
                "ogrn",
                "basis",
                "legal_address",
                "actual_address",
            ]

            for field in updatable:
                if field in data:
                    val = data[field]
                    if isinstance(val, str):
                        val = val.strip()
                        if val == "":
                            val = None
                    setattr(client, field, val)

            name_val = client.name.strip() if client.name else ""
            legal_val = client.legal_name.strip() if client.legal_name else ""
            if not name_val and not legal_val:
                return JsonResponse(
                    {"status": "error", "message": "Требуется указать имя или юр. название"},
                    status=400,
                )

            client.save()

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "name", "verbose_name": "Клиент"},
                {"name": "legal_name", "verbose_name": "Юр. название"},
            ]
            context = {"item": client, "fields": fields}

            return JsonResponse(
                {
                    "id": client.id,
                    "html": render_to_string("components/table_row.html", context),
                }
            )
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST"])
def contact_create(request):
    try:
        with transaction.atomic():
            client_id = request.POST.get("client") or request.POST.get("client_id") or request.POST.get("client_form_id")
            if not client_id:
                return JsonResponse({"status": "error", "message": "Не указан клиент"}, status=400)

            client = get_object_or_404(Client, id=client_id)

            last_name = (request.POST.get("last_name") or "").strip() or None
            first_name = (request.POST.get("first_name") or "").strip() or None
            patronymic = (request.POST.get("patronymic") or "").strip() or None
            position = (request.POST.get("position") or "").strip() or None
            phone1 = (request.POST.get("phone1") or "").strip() or None
            phone2 = (request.POST.get("phone2") or "").strip() or None
            phone3 = (request.POST.get("phone3") or "").strip() or None
            email = (request.POST.get("email") or "").strip() or None
            birthday_str = (request.POST.get("birthday") or "").strip()
            birthday = (request.POST.get("birthday") or "").strip() or None
            socials = (request.POST.get("socials") or "").strip() or None

            if not any([last_name, first_name, patronymic, position, phone1, phone2, phone3, email, birthday, socials]):
                return JsonResponse(
                    {"status": "error", "message": "Требуется указать хотя бы одно поле контакта"},
                    status=400,
                )

            contact = Contact.objects.create(
                client=client,
                last_name=last_name,
                first_name=first_name,
                patronymic=patronymic,
                position=position,
                phone1=phone1,
                phone2=phone2,
                phone3=phone3,
                email=email,
                birthday=birthday,
                socials=socials,
            )

            contact_fields = [
                {"name": "last_name", "verbose_name": "Фамилия"},
                {"name": "first_name", "verbose_name": "Имя"},
                {"name": "patronymic", "verbose_name": "Отчество"},
                {"name": "position", "verbose_name": "Должность"},
                {"name": "phone1", "verbose_name": "Телефон 1"},
                {"name": "phone2", "verbose_name": "Телефон 2"},
                {"name": "phone3", "verbose_name": "Телефон 3"},
                {"name": "email", "verbose_name": "Почта"},
                {"name": "birthday", "verbose_name": "ДР"},
                {"name": "socials", "verbose_name": "Социалки"},
            ]

            context = {"item": contact, "fields": contact_fields}
            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": contact.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def contact_update(request, pk: int):
    try:
        with transaction.atomic():
            contact = get_object_or_404(Contact, id=pk)
            data = (
                json.loads(request.body) if request.method in ["PUT", "PATCH"] else request.POST.dict()
            )

            updatable = [
                "last_name",
                "first_name",
                "patronymic",
                "position",
                "phone1",
                "phone2",
                "phone3",
                "email",
                "birthday",
                "socials",
            ]

            for field in updatable:
                if field in data:
                    val = data[field]
                    if isinstance(val, str):
                        val = val.strip()
                        if val == "":
                            val = None
                    setattr(contact, field, val)

            contact.save()

            contact_fields = [
                {"name": "last_name", "verbose_name": "Фамилия"},
                {"name": "first_name", "verbose_name": "Имя"},
                {"name": "patronymic", "verbose_name": "Отчество"},
                {"name": "position", "verbose_name": "Должность"},
                {"name": "phone1", "verbose_name": "Телефон 1"},
                {"name": "phone2", "verbose_name": "Телефон 2"},
                {"name": "phone3", "verbose_name": "Телефон 3"},
                {"name": "email", "verbose_name": "Почта"},
                {"name": "birthday", "verbose_name": "ДР"},
                {"name": "socials", "verbose_name": "Социалки"},
            ]
            context = {"item": contact, "fields": contact_fields}
            return JsonResponse(
                {
                    "id": contact.id,
                    "html": render_to_string("components/table_row.html", context),
                }
            )
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    
@login_required
@require_http_methods(["POST"])
def contact_delete(request, pk: int):
    try:
        with transaction.atomic():
            contact = get_object_or_404(Contact, id=pk)
            contact.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    
@login_required
@require_http_methods(["GET"])
def contact_detail(request, pk: int):
    contact = get_object_or_404(Contact, id=pk)
    data = model_to_dict(contact)

    contact_fields = [
        {"name": "last_name", "verbose_name": "Фамилия"},
        {"name": "first_name", "verbose_name": "Имя"},
        {"name": "patronymic", "verbose_name": "Отчество"},
        {"name": "position", "verbose_name": "Должность"},
        {"name": "phone1", "verbose_name": "Телефон 1"},
        {"name": "phone2", "verbose_name": "Телефон 2"},
        {"name": "phone3", "verbose_name": "Телефон 3"},
        {"name": "email", "verbose_name": "Почта"},
        {"name": "birthday", "verbose_name": "ДР"},
        {"name": "socials", "verbose_name": "Социалки"},
    ]

    html = render_to_string("components/table_row.html", {"item": contact, "fields": contact_fields})
    return JsonResponse({"data": data, "html": html})

@login_required
def products(request):
    products_qs = Product.objects.all().order_by('id')

    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "name", "verbose_name": "Название"},
    ]

    context = {
        "fields": fields,
        "data": products_qs,
    }
    return render(request, "commerce/products.html", context)

@login_required
@require_http_methods(["GET"])
def product_detail(request, pk: int):
    product = get_object_or_404(Product, id=pk)
    data = model_to_dict(product)

    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "name", "verbose_name": "Название"},
    ]

    html = render_to_string("components/table_row.html", {"item": product, "fields": fields})
    return JsonResponse({"data": data, "html": html})

@login_required
@require_http_methods(["POST"])
def product_create(request):
    try:
        with transaction.atomic():
            name = (request.POST.get("name") or "").strip()
            if not name:
                return JsonResponse(
                    {"status": "error", "message": "Требуется указать название продукта"},
                    status=400,
                )

            product = Product.objects.create(name=name)

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "name", "verbose_name": "Название"},
            ]
            context = {"item": product, "fields": fields}

            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": product.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@require_http_methods(["PUT", "PATCH", "POST"])
def product_update(request, pk: int):
    try:
        with transaction.atomic():
            product = get_object_or_404(Product, id=pk)
            data = json.loads(request.body) if request.method in ["PUT", "PATCH"] else request.POST.dict()

            if "name" in data:
                name = data["name"]
                if isinstance(name, str):
                    name = name.strip()
                else:
                    name = str(name).strip()

                if not name:
                    return JsonResponse(
                        {"status": "error", "message": "Требуется указать название продукта"},
                        status=400,
                    )

                product.name = name

            if not product.name or (isinstance(product.name, str) and not product.name.strip()):
                return JsonResponse(
                    {"status": "error", "message": "Требуется указать название продукта"},
                    status=400,
                )

            product.save()

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "name", "verbose_name": "Название"},
            ]
            context = {"item": product, "fields": fields}

            return JsonResponse(
                {
                    "id": product.id,
                    "html": render_to_string("components/table_row.html", context),
                }
            )
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST"])
def product_delete(request, pk: int):
    try:
        with transaction.atomic():
            product = get_object_or_404(Product, id=pk)
            if Order.objects.filter(product=product).exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить продукт с привязанными заказами"},
                    status=400,
                )
            product.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
def orders_archive(request):
    orders_qs = Order.objects.filter(archived_at__isnull=False).order_by("-archived_at")

    page_number = request.GET.get("page", 1)
    paginator = Paginator(list(orders_qs), 25)
    page_obj = paginator.get_page(page_number)

    data = []
    for o in page_obj.object_list:
        o.legal_name = o.client.legal_name if o.client else None
        data.append(o)

    fields = [
        {"name": "id", "verbose_name": "Заказ"},
        {"name": "archived_at", "verbose_name": "Архив", "is_date": True},
        {"name": "manager", "verbose_name": "Менеджер", "is_relation": True},
        {"name": "client", "verbose_name": "Клиент", "is_relation": True},
        {"name": "legal_name", "verbose_name": "Фирма"},
        {"name": "product", "verbose_name": "Продукция", "is_relation": True},
        {"name": "amount", "verbose_name": "Сумма", "is_amount": True},
        {"name": "created", "verbose_name": "Создан", "is_date": True},
        {"name": "additional_info", "verbose_name": "Доп. инф-я"},
    ]

    context = {
        "fields": fields,
        "data": data,
        "pagination": {
            "total_pages": paginator.num_pages,
            "current_page": page_obj.number,
        },
    }
    return render(request, "commerce/orders_archive.html", context)

@login_required
@require_http_methods(["GET"])
def order_documents_table(request, pk: int):
    order = get_object_or_404(Order, id=pk)

    docs_qs = Document.objects.filter(order=order)

    docs = list(docs_qs.order_by("uploaded_at"))

    def human_size(n):
        if not n:
            return ""
        n = float(n)
        for unit in ["Б", "КБ", "МБ", "ГБ", "ТБ"]:
            if n < 1024:
                if unit == "Б":
                    return f"{int(n)} {unit}"
                return f"{n:.2f} {unit}"
            n /= 1024.0
        return f"{n:.2f} ТБ"

    for d in docs:
        d.file_type_name = d.file_type.name if d.file_type else ""
        try:
            d.user_name = d.user.last_name if d.user.last_name else d.user.username
        except Exception:
            d.user_name = str(d.user) if d.user else ""

        d.file_display = d.name

        try:
            d.uploaded = (
                localtime(d.uploaded_at).strftime("%d.%m.%Y %H:%M")
                if getattr(d, "uploaded_at", None)
                else ""
            )
        except Exception:
            d.uploaded = str(d.uploaded_at) if getattr(d, "uploaded_at", None) else ""

        d.size_display = human_size(d.size)

    fields = [
        {"name": "file_type_name", "verbose_name": "Тип файла"},
        {"name": "user_name", "verbose_name": "Пользователь"},
        {"name": "file_display", "verbose_name": "Файл"},
        {"name": "uploaded", "verbose_name": "Загружен", "is_date": True},
        {"name": "size_display", "verbose_name": "Размер"},
    ]

    html = render_to_string(
        "components/table.html",
        {"fields": fields, "data": docs, "id": f"order-documents-{order.id}"},
    )

    urls = []
    for d in docs:
        try:
            file_url = getattr(d, "url", None) or getattr(getattr(d, "file", None), "url", None)
            if file_url:
                try:
                    file_url = request.build_absolute_uri(file_url)
                except Exception:
                    pass
            else:
                file_url = ""
        except Exception:
            file_url = ""
        urls.append(file_url)
    return JsonResponse({"html": html, "urls": urls})

@login_required
@require_http_methods(["POST"])
def document_upload(request):
    try:
        with transaction.atomic():
            uploaded_file = request.FILES.get("file")
            order_id = request.POST.get("order") or request.POST.get("order_id")
            file_type_id = request.POST.get("file_type")

            if not uploaded_file:
                return JsonResponse({"status": "error", "message": "Файл не передан"}, status=400)

            if not order_id:
                return JsonResponse({"status": "error", "message": "Не указан order"}, status=400)

            if not file_type_id:
                return JsonResponse({"status": "error", "message": "Не указан file_type"}, status=400)

            try:
                order = get_object_or_404(Order, id=int(order_id))
            except (ValueError, TypeError):
                return JsonResponse({"status": "error", "message": "Неверный id заказа"}, status=400)

            try:
                file_type = get_object_or_404(FileType, id=int(file_type_id))
            except (ValueError, TypeError):
                return JsonResponse({"status": "error", "message": "Неверный id типа файла"}, status=400)

            doc = Document(user=request.user, order=order, file_type=file_type)

            if hasattr(doc, "store_file") and callable(getattr(doc, "store_file")):
                doc = doc.store_file(uploaded_file, replace_existing=True)
            else:
                doc.file.save(uploaded_file.name, uploaded_file, save=False)
                doc.name = os.path.basename(doc.file.name) or uploaded_file.name
                try:
                    doc.size = getattr(uploaded_file, "size", None) or getattr(doc.file, "size", None)
                except Exception:
                    doc.size = None
                doc.save()

                try:
                    file_url = getattr(doc.file, "url", None)
                    if file_url and (not doc.url or doc.url != file_url):
                        doc.url = file_url
                        doc.save(update_fields=["url"])
                except Exception:
                    pass

            def human_size(n):
                if not n:
                    return ""
                n = float(n)
                for unit in ["Б", "КБ", "МБ", "ГБ", "ТБ"]:
                    if n < 1024:
                        if unit == "Б":
                            return f"{int(n)} {unit}"
                        return f"{n:.2f} {unit}"
                    n /= 1024.0
                return f"{n:.2f} ТБ"

            doc.file_type_name = doc.file_type.name if doc.file_type else ""
            try:
                doc.user_name = doc.user.last_name if doc.user and getattr(doc.user, "last_name", "") else doc.user.username
            except Exception:
                doc.user_name = str(doc.user) if doc.user else ""
            doc.file_display = doc.name or ""
            try:
                doc.uploaded = (
                    localtime(doc.uploaded_at).strftime("%d.%m.%Y %H:%M")
                    if getattr(doc, "uploaded_at", None)
                    else ""
                )
            except Exception:
                doc.uploaded = str(doc.uploaded_at) if getattr(doc, "uploaded_at", None) else ""
            doc.size_display = human_size(doc.size)

            fields = [
                {"name": "file_type_name", "verbose_name": "Тип файла"},
                {"name": "user_name", "verbose_name": "Пользователь"},
                {"name": "file_display", "verbose_name": "Файл"},
                {"name": "uploaded", "verbose_name": "Загружен", "is_date": True},
                {"name": "size_display", "verbose_name": "Размер"},
            ]

            html = render_to_string("components/table_row.html", {"item": doc, "fields": fields})

            return JsonResponse(
                {
                    "status": "success",
                    "id": doc.id,
                    "html": html,
                    "url": getattr(doc, "url", None) or getattr(getattr(doc, "file", None), "url", None) or "",
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@login_required
@require_http_methods(["POST"])
def client_object_create(request):
    try:
        with transaction.atomic():
            client_id = request.POST.get("client") or request.POST.get("client_id") or request.POST.get("client_form_id")
            name = (request.POST.get("name") or "").strip()

            if not client_id:
                return JsonResponse({"status": "error", "message": "Не указан клиент"}, status=400)

            if not name:
                return JsonResponse({"status": "error", "message": "Требуется указать название объекта"}, status=400)

            client = get_object_or_404(Client, id=client_id)

            obj = ClientObject.objects.create(client=client, name=name)

            products = Product.objects.all()
            
            products_html = ""
            for product in products:
                products_html += f'''
                    <li class="debtors-office-list__item">
                        <div class="debtors-office-list__row" data-target="product-{client_id}-{obj.id}-{product.id}" data-product-id="{product.id}" data-client-id="{client_id}" data-object-id="{obj.id}" style="border-left-width: 24px;">
                            <button class="debtors-office-list__toggle" type="button" aria-label="Подробнее">+</button>
                            <span class="debtors-office-list__title">{product.name}</span>
                        </div>
                        <div class="debtors-office-list__details" id="product-{client_id}-{obj.id}-{product.id}">
                        </div>
                    </li>
                '''
            
            object_html = f'''
                <li class="debtors-office-list__item">
                    <div class="debtors-office-list__row" data-target="object-{client_id}-{obj.id}" style="border-left-width: 16px;">
                        <button class="debtors-office-list__toggle" type="button" aria-label="Подробнее">+</button>
                        <h4>{obj.name}</h4>
                    </div>
                    <div class="debtors-office-list__details" id="object-{client_id}-{obj.id}">
                        <ul>
                            {products_html}
                        </ul>
                    </div>
                </li>
            '''

            return JsonResponse(
                {
                    "status": "success",
                    "id": obj.id,
                    "html": object_html,
                    "client_id": client_id,
                    "object": {
                        "id": obj.id,
                        "name": obj.name,
                    }
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST"])
def client_object_delete(request, pk: int):
    try:
        with transaction.atomic():
            client_object = get_object_or_404(ClientObject, id=pk)
            
            if Order.objects.filter(client_object=client_object).exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить объект с привязанными заказами"},
                    status=400,
                )
            
            client_object.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def client_object_update(request, pk: int):
    try:
        with transaction.atomic():
            client_object = get_object_or_404(ClientObject, id=pk)
            data = (
                json.loads(request.body) if request.method in ["PUT", "PATCH"] else request.POST.dict()
            )

            if "name" in data:
                name = data["name"]
                if isinstance(name, str):
                    name = name.strip()
                else:
                    name = str(name).strip()

                if not name:
                    return JsonResponse(
                        {"status": "error", "message": "Требуется указать название объекта"},
                        status=400,
                    )

                client_object.name = name

            if not client_object.name or (isinstance(client_object.name, str) and not client_object.name.strip()):
                return JsonResponse(
                    {"status": "error", "message": "Требуется указать название объекта"},
                    status=400,
                )

            client_object.save()

            products = Product.objects.all()
            client_id = client_object.client.id
            
            products_html = ""
            for product in products:
                products_html += f'''
                    <li class="debtors-office-list__item">
                        <div class="debtors-office-list__row" data-target="product-{client_id}-{client_object.id}-{product.id}" data-product-id="{product.id}" data-client-id="{client_id}" data-object-id="{client_object.id}" style="border-left-width: 24px;">
                            <button class="debtors-office-list__toggle" type="button" aria-label="Подробнее">+</button>
                            <span class="debtors-office-list__title">{product.name}</span>
                        </div>
                        <div class="debtors-office-list__details" id="product-{client_id}-{client_object.id}-{product.id}">
                        </div>
                    </li>
                '''
            
            object_html = f'''
                <li class="debtors-office-list__item">
                    <div class="debtors-office-list__row" data-target="object-{client_id}-{client_object.id}" style="border-left-width: 16px;">
                        <button class="debtors-office-list__toggle" type="button" aria-label="Подробнее">+</button>
                        <h4>{client_object.name}</h4>
                    </div>
                    <div class="debtors-office-list__details" id="object-{client_id}-{client_object.id}">
                        <ul>
                            {products_html}
                        </ul>
                    </div>
                </li>
            '''

            return JsonResponse(
                {
                    "status": "success",
                    "id": client_object.id,
                    "html": object_html,
                    "client_id": client_id,
                    "object": {
                        "id": client_object.id,
                        "name": client_object.name,
                    }
                }
            )
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["GET"])
def client_object_detail(request, pk: int):
    client_object = get_object_or_404(ClientObject, id=pk)
    data = model_to_dict(client_object)

    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "name", "verbose_name": "Название объекта"},
    ]

    html = render_to_string("components/table_row.html", {"item": client_object, "fields": fields})
    return JsonResponse({"data": data, "html": html})

@login_required
@require_http_methods(["POST"])
def order_create(request):
    try:
        with transaction.atomic():
            client_id = request.POST.get("client") or request.POST.get("client_id")
            product_id = request.POST.get("product") or request.POST.get("product_id")
            
            if not client_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указан клиент"},
                    status=400,
                )
            
            if not product_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указана продукция"},
                    status=400,
                )
            
            try:
                client = get_object_or_404(Client, id=int(client_id))
            except (ValueError, TypeError):
                return JsonResponse(
                    {"status": "error", "message": "Неверный ID клиента"},
                    status=400,
                )
            
            try:
                product = get_object_or_404(Product, id=int(product_id))
            except (ValueError, TypeError):
                return JsonResponse(
                    {"status": "error", "message": "Неверный ID продукции"},
                    status=400,
                )
            
            deadline_str = (request.POST.get("deadline") or "").strip()
            deadline = None
            if deadline_str:
                from django.utils.dateparse import parse_datetime
                from django.utils import timezone
                
                deadline = parse_datetime(deadline_str)
                if deadline and timezone.is_naive(deadline):
                    deadline = timezone.make_aware(deadline)
            
            required_documents = request.POST.get("required_documents") == "on" or request.POST.get("required_documents") == "true"
            
            unit_price_str = (request.POST.get("unit_price") or "").strip()
            unit_price = None
            if unit_price_str:
                try:
                    cleaned_price = unit_price_str.replace(" р.", "").replace("р.", "").replace(" ", "").replace(",", ".")
                    unit_price = float(cleaned_price)
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный формат цены за единицу"},
                        status=400,
                    )
            
            quantity_str = (request.POST.get("quantity") or "").strip()
            quantity = None
            if quantity_str:
                try:
                    quantity = float(quantity_str.replace(" ", "").replace(",", "."))
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный формат количества"},
                        status=400,
                    )
            
            amount_str = (request.POST.get("amount") or "").strip()
            if not amount_str:
                if unit_price is not None and quantity is not None:
                    amount = unit_price * quantity
                else:
                    return JsonResponse(
                        {"status": "error", "message": "Требуется указать цену и количество"},
                        status=400,
                    )
            else:
                try:
                    cleaned_amount = amount_str.replace(" р.", "").replace("р.", "").replace(" ", "").replace(",", ".")
                    amount = float(cleaned_amount)
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный формат суммы"},
                        status=400,
                    )
            
            comment = (request.POST.get("comment") or "").strip() or None
            additional_info = (request.POST.get("additional_info") or "").strip() or None
            
            client_object_id = request.POST.get("client_object") or request.POST.get("client_object_id")
            client_object = None
            if client_object_id:
                try:
                    client_object = get_object_or_404(ClientObject, id=int(client_object_id))
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный ID объекта клиента"},
                        status=400,
                    )
            
            default_status = OrderStatus.objects.first()
            if not default_status:
                return JsonResponse(
                    {"status": "error", "message": "В системе не настроены статусы заказов"},
                    status=400,
                )
            
            order = Order.objects.create(
                status=default_status,
                manager=request.user,
                client=client,
                product=product,
                unit_price=unit_price,
                quantity=quantity,
                amount=amount,
                deadline=deadline,
                comment=comment,
                additional_info=additional_info,
                client_object=client_object,
                required_documents=required_documents,
            )
            
            order.legal_name = order.client.legal_name if order.client else None
            order.paid_percent = int(order.paid_amount / order.amount * 100) if order.amount else 0
            
            fields = [
                {"name": "id", "verbose_name": "Заказ"},
                {"name": "status", "verbose_name": "Статус", "is_relation": True},
                {"name": "client", "verbose_name": "Клиент", "is_relation": True},
                {"name": "legal_name", "verbose_name": "Полное юринфо"},
                {"name": "product", "verbose_name": "Продукт", "is_relation": True},
                {"name": "created", "verbose_name": "Создан", "is_date": True},
                {"name": "deadline", "verbose_name": "Срок сдачи", "is_date": True},
                {"name": "required_documents", "verbose_name": "Док-ты", "is_boolean": True},
                {"name": "unit_price", "verbose_name": "Стоимость", "is_amount": True},
                {"name": "amount", "verbose_name": "Сумма", "is_amount": True},
                {"name": "paid_amount", "verbose_name": "Погашено", "is_amount": True},
                {"name": "comment", "verbose_name": "Комментарий"},
                {"name": "additional_info", "verbose_name": "Доп. инф-я"},
            ]
            
            object_id = client_object.id if client_object else "noobject"
            table_id = f"product-orders-{product_id}-{client_id}-{object_id}"
            
            html = render_to_string(
                "components/table_row.html",
                {
                    "item": order,
                    "fields": fields,
                },
            )
            
            return JsonResponse(
                {
                    "status": "success",
                    "id": order.id,
                    "html": html,
                    "table_id": table_id,
                }
            )
            
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


