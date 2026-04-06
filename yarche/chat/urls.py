from django.urls import path
from . import views

urlpatterns = [
    path('smart-chat/', views.chat_interface, name='smart_chat'),
    path('api/chat/send/', views.send_chat_message, name='api_chat_send'),
	path('logs/', views.chat_logs, name='chat_logs'),
    path('logs/<int:log_id>/', views.log_detail, name='log_detail'),
    path('logs/<int:log_id>/restore/', views.restore_log, name='restore_log'),
]