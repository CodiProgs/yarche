from django.contrib import admin
from .models import Client, Document, FileType, Order, OrderStatus, Product, ClientObject, Contact

admin.site.register(Client)
admin.site.register(Document)
admin.site.register(FileType)
admin.site.register(Order)
admin.site.register(OrderStatus)
admin.site.register(Product)
admin.site.register(ClientObject)
admin.site.register(Contact)