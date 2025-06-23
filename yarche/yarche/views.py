from django.shortcuts import render
from django.contrib.auth.views import LoginView
from django.urls import reverse_lazy
from users.forms import CustomAuthForm
from django.conf import settings
import importlib
from django.views.generic import TemplateView
from django.http import HttpResponseForbidden


class CustomLoginView(LoginView):
    template_name = "login.html"
    authentication_form = CustomAuthForm

    def get_success_url(self):
        return reverse_lazy("index")


def index(request):
    return render(request, "index.html")


def error_404_view(request, exception):
    return render(request, "errors/404.html", status=404)


def error_403_view(request, exception=None):
    return render(request, "errors/403.html", status=403)


def get_view_function(url_name):
    normalized_url_name = url_name.replace("-", "_")

    for app in settings.INSTALLED_APPS:
        views_module_name = f"{app}.views"
        try:
            views_module = importlib.import_module(views_module_name)
            if hasattr(views_module, normalized_url_name):
                return getattr(views_module, normalized_url_name)
        except ImportError:
            continue

    project_name = settings.ROOT_URLCONF.rsplit(".", 1)[0]
    if project_name not in settings.INSTALLED_APPS:
        project_views_module_name = f"{project_name}.views"
        try:
            project_views_module = importlib.import_module(project_views_module_name)
            if hasattr(project_views_module, normalized_url_name):
                return getattr(project_views_module, normalized_url_name)
        except ImportError:
            pass

    return None


class ComponentView(TemplateView):
    def dispatch(self, request, *args, **kwargs):
        if not request.headers.get("X-Requested-With") == "XMLHttpRequest":
            return HttpResponseForbidden()
        return super().dispatch(request, *args, **kwargs)

    def get(self, request, *args, **kwargs):
        app_name = kwargs.get("app_name")
        template_name = kwargs.get("template_name")

        if app_name:
            self.template_name = f"{app_name}/components/{template_name}.html"
        else:
            self.template_name = f"components/{template_name}.html"

        context = request.GET.dict()
        return super().render_to_response(context=context)
