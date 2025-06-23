from django.urls import path
from . import views

app_name = "ledger"

urlpatterns = [
    path("bank-accounts/types/", views.bank_account_types, name="bank_account_types"),
    path("bank-accounts/", views.bank_account_list, name="bank_account_list"),
    path(
        "bank-accounts/<int:pk>/",
        views.bank_account_detail,
        name="bank_account_detail",
    ),
    path("bank-accounts/add/", views.bank_account_create, name="bank_account_create"),
    path(
        "bank-accounts/edit/<int:pk>/",
        views.bank_account_update,
        name="bank_account_update",
    ),
    path(
        "bank-accounts/delete/<int:pk>/",
        views.bank_account_delete,
        name="bank_account_delete",
    ),
    path(
        "bank-accounts/refresh/",
        views.refresh_bank_accounts,
        name="refresh_bank_accounts",
    ),
    path(
        "transaction-categories/",
        views.transaction_category_list,
        name="transaction_category_list",
    ),
    path(
        "transaction-categories/<int:pk>/",
        views.transaction_category_detail,
        name="transaction_category_detail",
    ),
    path(
        "transaction-categories/add/",
        views.transaction_category_create,
        name="transaction_category_create",
    ),
    path(
        "transaction-categories/edit/<int:pk>/",
        views.transaction_category_update,
        name="transaction_category_update",
    ),
    path(
        "transaction-categories/delete/<int:pk>/",
        views.transaction_category_delete,
        name="transaction_category_delete",
    ),
    path(
        "transaction-categories/refresh/",
        views.refresh_transaction_categories,
        name="refresh_transaction_categories",
    ),
    path("transaction-types/", views.transaction_types, name="transaction_types"),
    path("transactions/", views.transaction_list, name="transaction_list"),
    path("transactions/add/", views.transaction_create, name="transaction_create"),
    path("transactions/<int:pk>/", views.transaction_detail, name="transaction_detail"),
    path(
        "transactions/edit/<int:pk>/",
        views.transaction_update,
        name="transaction_update",
    ),
    path(
        "transactions/delete/<int:pk>/",
        views.transaction_delete,
        name="transaction_delete",
    ),
    path("transfers/add/", views.transfer_create, name="transfer_create"),
    path(
        "order-payments/add/",
        views.order_payment_create,
        name="order_payment_create",
    ),
    path(
        "client-balance/deposit/",
        views.client_balance_deposit,
        name="client_balance_deposit",
    ),
    path(
        "client-balance/payment/",
        views.client_balance_payment,
        name="client_balance_payment",
    ),
    path(
        "close-shift/",
        views.close_shift,
        name="close_shift",
    ),
]
