from django.urls import path
from . import views

app_name = "commerce"

urlpatterns = [
    path("products/", views.product_list, name="product_list"),
    path("clients/", views.client_list, name="client_list"),
    path("clients/balances/", views.client_balances, name="client_balances"),
    path("orders/<int:pk>/debt/", views.order_debt, name="order_debt"),
    path("orders/ids/", views.order_ids, name="order_ids"),
]
