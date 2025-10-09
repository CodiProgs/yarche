from django.urls import path
from . import views

app_name = "commerce"

urlpatterns = [
    path("products/list/", views.product_list, name="product_list"),
	path("orders/", views.orders, name="orders"),
    path("orders/<int:pk>/debt/", views.order_debt, name="order_debt"),
    path("orders/ids/", views.order_ids, name="order_ids"),
	path("orders/statuses/", views.order_statuses, name="order_statuses"),
	path("works/", views.works, name="works"),
	path("product_orders/", views.product_orders, name="product_orders"),
    path("clients/", views.clients, name="clients"),
	path("clients/list/", views.client_list, name="client_list"),
	path("clients/list/paginate/", views.clients_paginate, name="clients_paginate"),
    path("clients/balances/", views.client_balances, name="client_balances"),
	path("clients/<int:pk>/", views.client_detail, name="client_detail"),
	path("clients/add/", views.client_create, name="client_add"),
	path("clients/edit/<int:pk>/", views.client_update, name="client_edit"),
	path("clients/delete/<int:pk>/", views.client_delete, name="client_delete"),
	path("clients/contacts/add/", views.contact_create, name="contact_add"),
	path("clients/contacts/edit/<int:pk>/", views.contact_update, name="contact_edit"),
	path("clients/contacts/delete/<int:pk>/", views.contact_delete, name="contact_delete"),
	path("clients/contacts/<int:pk>/", views.contact_detail, name="contact_detail"),
	path("products/", views.products, name="products"),
	path("products/<int:pk>/", views.product_detail, name="product_detail"),
	path("products/add/", views.product_create, name="product_add"),
	path("products/edit/<int:pk>/", views.product_update, name="product_edit"),
	path("products/delete/<int:pk>/", views.product_delete, name="product_delete"),
	path("orders/archive/", views.orders_archive, name="orders_archive"),
	path("documents/types/", views.document_types, name="document_types"),
]
