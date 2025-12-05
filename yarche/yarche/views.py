from django.shortcuts import render, redirect
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
    user = request.user
    if user.is_authenticated and user.user_type:
        first_link = user.user_type.type_menu_items.order_by("order").select_related("menu_item").first()
        if first_link and first_link.menu_item:
            return redirect(first_link.menu_item.full_url)
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

from django.shortcuts import get_object_or_404, redirect
from django.utils import timezone
from commerce.models import Document
from django.http import HttpResponse, Http404
import mimetypes
from users.models import FileAccessToken
from django.contrib.auth.decorators import login_required

def generate_file_token(request, file_id):
    doc = get_object_or_404(Document, id=file_id)
    user = request.user if request.user.is_authenticated else None
    token = FileAccessToken.objects.create(
        file=doc,
        expires_at=timezone.now() + timezone.timedelta(minutes=5),
        created_by=user
    )
    file_url = request.build_absolute_uri(f"/file-access/{token.token}/")
    ext = doc.file.name.split('.')[-1].lower()
    if ext in ['doc', 'docx', 'xls', 'xlsx']:
        viewer_url = f"https://view.officeapps.live.com/op/view.aspx?src={file_url}"
        return redirect(viewer_url)
    return redirect(file_url)

def file_access(request, token):
    try:
        access = FileAccessToken.objects.select_related('file').get(token=token)
    except FileAccessToken.DoesNotExist:
        raise Http404()
    if not access.is_valid():
        raise Http404()
    file_field = access.file.file
    mime, _ = mimetypes.guess_type(file_field.name)
    response = HttpResponse(file_field, content_type=mime or 'application/octet-stream')
    response['Content-Disposition'] = f'inline; filename="{file_field.name}"'
    return response

def file_online_view(request, file_id):
    doc = get_object_or_404(Document, id=file_id)
    ext = doc.file.name.split('.')[-1].lower()
    office_exts = ['doc', 'docx', 'xls', 'xlsx']
    if ext not in office_exts:
        return redirect(doc.file.url)
    token = FileAccessToken.objects.create(
        file=doc,
        expires_at=timezone.now() + timezone.timedelta(minutes=5),
        created_by=request.user if request.user.is_authenticated else None
    )
    file_url = request.build_absolute_uri(f"/file-access/{token.token}/")
    viewer_url = f"https://view.officeapps.live.com/op/view.aspx?src={file_url}"
    return redirect(viewer_url)