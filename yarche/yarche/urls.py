from django.contrib import admin
from django.urls import path, re_path, include
from . import views
from django.contrib.auth.views import LogoutView
from django.conf import settings
from django.conf.urls.static import static


handler404 = "yarche.views.error_404_view"
handler403 = "yarche.views.error_403_view"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.index, name="index"),
    path("ledger/", include("ledger.urls")),
    path("commerce/", include("commerce.urls")),
    path("users/", include("users.urls")),
    path("departments/", include("departments.urls")),
    path("menu/", include("menu.urls")),
    path(
        "login/",
        views.CustomLoginView.as_view(),
        name="login",
    ),
    path("logout/", LogoutView.as_view(next_page="login"), name="logout"),
    path(
        "components/<str:template_name>/",
        views.ComponentView.as_view(),
        name="global_component_view",
    ),
    path('file-view/<int:file_id>/', views.generate_file_token, name='file_view'),
    path('file-access/<uuid:token>/', views.file_access, name='file_access'),
    path('file-online-view/<int:file_id>/', views.file_online_view, name='file_online_view'),
    path(
        "components/<str:app_name>/<str:template_name>/",
        views.ComponentView.as_view(),
        name="app_component_view",
    ),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)