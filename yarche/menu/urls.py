from django.urls import path
from . import views

app_name = "menu"

urlpatterns = [
    path('category/<str:category_name>/', views.category_menu, name='category'),
]