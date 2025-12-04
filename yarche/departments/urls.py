from django.urls import path
from . import views

app_name = "departments"

urlpatterns = [
    path('dizayn/', views.department_orders, {'department_slug': 'dizayn'}, name='dizayn'),
    path('montazh/', views.department_orders, {'department_slug': 'montazh'}, name='montazh'),
    path('sborka/', views.department_orders, {'department_slug': 'sborka'}, name='sborka'),
    path('svarka/', views.department_orders, {'department_slug': 'svarka'}, name='svarka'),
    path('nakatka/', views.department_orders, {'department_slug': 'nakatka'}, name='nakatka'),
    path('raskroy/', views.department_orders, {'department_slug': 'raskroy'}, name='raskroy'),
    path('pechat/', views.department_orders, {'department_slug': 'pechat'}, name='pechat'),
    
    path('users/<slug:department_slug>/', views.department_users, name='department_users'),
    path('statuses/<slug:department_slug>/', views.department_statuses, name='department_statuses'),
	path('list/', views.departments_list, name='departments_list'),
    path('<slug:department_slug>/orders/<int:order_id>/assign-executor/', 
         views.department_work_assign_executor, 
         name='department_work_assign_executor'),
    path('<slug:department_slug>/orders/<int:order_id>/update-status/', 
         views.department_work_update_status, 
         name='department_work_update_status'),
    path('<slug:department_slug>/orders/<int:order_id>/', views.department_work_detail, name='department_work_detail'),

    path('work-messages/<int:order_work_id>/', views.department_work_messages_list, name='department_work_messages_list'),
    path('work-messages/<int:order_work_id>/mark-all-read/', views.department_work_messages_mark_all_read, name='department_work_messages_mark_all_read'),
    path('work-messages/<int:pk>/mark-read/', views.department_work_message_mark_read, name='department_work_message_mark_read'),
    path('<str:department_slug>/orders/<int:order_id>/work/', views.get_order_work, name='get_order_work'),
	
    path('work-messages/create/', views.department_work_message_create, name='department_work_message_create'),
    path('work-messages/detail/<int:message_id>/', views.department_work_message_detail, name='department_work_message_detail'),
	path('work-messages/edit/<int:message_id>/', views.department_work_message_edit, name='department_work_message_edit'),
    path('work-messages/delete/<int:message_id>/', views.department_work_message_delete, name='department_work_message_delete'),
	
    path('work/create/', views.department_work_create, name='department_work_create'),
    path('work/delete/<int:work_id>/', views.department_work_delete, name='department_work_delete'),
]