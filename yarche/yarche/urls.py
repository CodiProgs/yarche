from django.contrib import admin
from django.urls import path, re_path, include
from . import views
from django.contrib.auth.views import LogoutView
from django.http import HttpResponseForbidden, Http404
from django.core.exceptions import PermissionDenied


def dynamic_view(request, category, url_name):
    user = request.user
    user_type = user.user_type

    menu_item = user_type.menu_items.filter(url_name=url_name).first()
    if not menu_item:
        raise PermissionDenied

    access_codename = f"access_{url_name}"
    menu_item_permission = menu_item.permissions.filter(
        codename=access_codename
    ).first()

    if menu_item_permission:
        if not user_type.permissions.filter(codename=access_codename).exists():
            raise PermissionDenied

    view_function = views.get_view_function(url_name)
    if view_function:
        return view_function(request, **request.GET.dict())
    else:
        raise Http404("Страница не найдена")


handler404 = "yarche.views.error_404_view"
handler403 = "yarche.views.error_403_view"

urlpatterns = [
    path("admin/", admin.site.urls),
    path("", views.index, name="index"),
    path("ledger/", include("ledger.urls")),
    path("commerce/", include("commerce.urls")),
    path("users/", include("users.urls")),
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
    path(
        "components/<str:app_name>/<str:template_name>/",
        views.ComponentView.as_view(),
        name="app_component_view",
    ),
    re_path(
        r"^(?P<category>[\w-]+)/(?P<url_name>[\w-]+)/$",
        dynamic_view,
        name="dynamic_view",
    ),
]
