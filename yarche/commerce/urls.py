from django.urls import path
from . import views

app_name = "commerce"

urlpatterns = [
    path("products/", views.product_list, name="product_list"),
    path("clients/list/", views.client_list, name="client_list"),
	path("clients/table/", views.client_table, name="client_table"),
    path("clients/balances/", views.client_balances, name="client_balances"),
	path("clients/<int:pk>/", views.client_detail, name="client_detail"),
	path("clients/add/", views.client_add, name="client_add"),
    path("clients/edit/<int:pk>/", views.client_edit, name="client_edit"),
    path("clients/delete/<int:pk>/", views.client_delete, name="client_delete"),
    path("orders/<int:pk>/debt/", views.order_debt, name="order_debt"),
    path("orders/ids/", views.order_ids, name="order_ids"),
	path("orders/statuses/", views.order_statuses, name="order_statuses"),
]
