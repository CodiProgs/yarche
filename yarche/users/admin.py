from django.contrib import admin
from .models import Permission, User, UserType, UserTypeMenuItem

admin.site.register(Permission)
admin.site.register(User)
admin.site.register(UserType)
admin.site.register(UserTypeMenuItem)
