from django.urls import path
from . import views

app_name = "commerce"

urlpatterns = [
    path("products/list/", views.product_list, name="product_list"),
    path("clients/list/", views.client_list, name="client_list"),
    path("clients/balances/", views.client_balances, name="client_balances"),
	path("orders/", views.orders, name="orders"),
    path("orders/<int:pk>/debt/", views.order_debt, name="order_debt"),
    path("orders/ids/", views.order_ids, name="order_ids"),
	path("orders/statuses/", views.order_statuses, name="order_statuses"),
	path("works/", views.works, name="works"),
	path("product_orders/", views.product_orders, name="product_orders"),
    
]
