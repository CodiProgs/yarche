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
    path("permissions/", views.permissions_list, name="permissions_list"),
	path("notifications/", views.notifications_list, name="notifications_list"),
    path(
        "notifications/mark-all-read/",
        views.notifications_mark_all_read,
        name="notifications_mark_all_read",
    ),
	
	path('orders/<int:order_id>/users/', views.order_related_users, name='order_related_users'),
	path('departments/<int:department_id>/workers/', views.department_workers, name='department_workers'),

    path("list/", views.users_list, name="users"),

    path("create/", views.create_user, name="create_user"),
	path("update/<int:user_id>/", views.update_user, name="update_user"),
	path("delete/<int:user_id>/", views.delete_user, name="delete_user"),
	path("<int:user_id>/", views.user_detail, name="user_detail"),

    path("types/", views.user_types_list, name="user_types_list"),
    path("types/table/", views.user_types, name="user_types_page"),

    path("types/create/", views.create_user_type, name="create_user_type"),
	path("types/update/<int:type_id>/", views.update_user_type, name="update_user_type"),
    path("types/delete/<int:type_id>/", views.delete_user_type, name="delete_user_type"),
	path("types/<int:type_id>/", views.user_type_detail, name="user_type_detail"),

    path("menu_items/", views.menu_items_list, name="menu_items_list"),
    path("types/<int:type_id>/menu_items/", views.user_type_menu_items, name="user_type_menu_items"),
    path("types/<int:type_id>/menu_items/update/", views.update_user_type_menu_items, name="update_user_type_menu_items"),
    path("types/<int:type_id>/menu_items/available/", views.available_menu_items, name="available_menu_items"),
]
