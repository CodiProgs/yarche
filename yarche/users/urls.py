from django.urls import path
from . import views

app_name = "users"

urlpatterns = [
    path("managers/", views.manager_list, name="manager_list"),
    path(
        "check-permission/",
        views.check_permission,
        name="check_permission",
    ),
]
