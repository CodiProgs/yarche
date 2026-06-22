from django.urls import path
from . import views

app_name = "departments"

urlpatterns = [
    path('tekhnicheskiy-otdel/', views.department_orders, {'department_slug': 'tekhnicheskiy-otdel'}, name='tekhnicheskiy-otdel'),
    path('bortogib/', views.department_orders, {'department_slug': 'bortogib'}, name='bortogib'),
    path('obuchenie/', views.department_orders, {'department_slug': 'obuchenie'}, name='obuchenie'),
    path('dostavka/', views.department_orders, {'department_slug': 'dostavka'}, name='dostavka'),
    path('montazh/', views.department_orders, {'department_slug': 'montazh'}, name='montazh'),
    path('pokraska/', views.department_orders, {'department_slug': 'pokraska'}, name='pokraska'),
    path('sborka/', views.department_orders, {'department_slug': 'sborka'}, name='sborka'),
    path('svarka/', views.department_orders, {'department_slug': 'svarka'}, name='svarka'),
    path('raskroy/', views.department_orders, {'department_slug': 'raskroy'}, name='raskroy'),
    path('nakatka/', views.department_orders, {'department_slug': 'nakatka'}, name='nakatka'),
    path('plotter/', views.department_orders, {'department_slug': 'plotter'}, name='plotter'),
    path('tsifrovaya-poligrafiya/', views.department_orders, {'department_slug': 'tsifrovaya-poligrafiya'}, name='tsifrovaya-poligrafiya'),
    path('pechat/', views.department_orders, {'department_slug': 'pechat'}, name='pechat'),
    path('otdel-snabzheniya/', views.department_orders, {'department_slug': 'otdel-snabzheniya'}, name='otdel-snabzheniya'),
    path('nachalnik-proizvodstva/', views.department_orders, {'department_slug': 'nachalnik-proizvodstva'}, name='nachalnik-proizvodstva'),
    path('ofis-menedzher/', views.department_orders, {'department_slug': 'ofis-menedzher'}, name='ofis-menedzher'),
    path('dizayn/', views.department_orders, {'department_slug': 'dizayn'}, name='dizayn'),
    path('otdel-prodazh/', views.department_orders, {'department_slug': 'otdel-prodazh'}, name='otdel-prodazh'),
    path('buhgalteriya/', views.department_orders, {'department_slug': 'buhgalteriya'}, name='buhgalteriya'),
    path('kommercheskiy-direktor/', views.department_orders, {'department_slug': 'kommercheskiy-direktor'}, name='kommercheskiy-direktor'),
    path('generalny-direktor/', views.department_orders, {'department_slug': 'generalny-direktor'}, name='generalny-direktor'),


    
    path('users/<slug:department_slug>/', views.department_users, name='department_users'),
    path('statuses/<slug:department_slug>/', views.department_statuses, name='department_statuses'),
    path('statuses/by-id/<int:department_id>/', views.department_statuses_by_id, name='department_statuses_by_id'),
	path('list/', views.departments_list, name='departments_list'),
    path('<slug:department_slug>/orders/assign-executor/<int:order_id>/', 
         views.department_work_assign_executor, 
         name='department_work_assign_executor'),
    path('<slug:department_slug>/orders/update-status/<int:order_id>/', 
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
    path('work/set-active/<int:work_id>/', views.department_work_set_active, name='department_work_set_active'),
    path('work/delete/<int:work_id>/', views.department_work_delete, name='department_work_delete'),
    path('work/<int:work_id>/', views.department_work_detail_by_id, name='department_work_detail_by_id'),

    path('orders/<int:order_id>/departments/', views.order_departments_list, name='order_departments_list'),

    path('work-status/create/', views.order_work_status_create, name='order_work_status_create'),
    path('work-status/update/<int:pk>/', views.order_work_status_update, name='order_work_status_update'),
    path('work-status/delete/<int:pk>/', views.order_work_status_delete, name='order_work_status_delete'),
    path('work-status/<int:pk>/', views.order_work_status_detail, name='order_work_status_detail'),
]