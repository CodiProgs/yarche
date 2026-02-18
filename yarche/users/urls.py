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
	path("notifications/", views.notifications_list, name="notifications_list"),
    path(
        "notifications/mark-all-read/",
        views.notifications_mark_all_read,
        name="notifications_mark_all_read",
    ),
	
	path('orders/<int:order_id>/users/', views.order_related_users, name='order_related_users'),
	path('departments/<int:department_id>/workers/', views.department_workers, name='department_workers'),
]
