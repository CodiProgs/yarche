from django.contrib import admin
from .models import Client, Document, FileType, Order, OrderStatus, Product, ClientObject, Contact, Department, DepartmentStatus, OrderDepartmentWork, OrderDepartmentWorkMessage

admin.site.register(Client)
admin.site.register(Document)
admin.site.register(FileType)
admin.site.register(Order)
admin.site.register(OrderStatus)
admin.site.register(Product)
admin.site.register(ClientObject)
admin.site.register(Contact)
admin.site.register(Department)
admin.site.register(DepartmentStatus)
admin.site.register(OrderDepartmentWork)
admin.site.register(OrderDepartmentWorkMessage)