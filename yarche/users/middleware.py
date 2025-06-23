from django.http import HttpResponseRedirect
from django.urls import reverse
from django.utils.deprecation import MiddlewareMixin


class AuthMiddleware(MiddlewareMixin):
    EXEMPT_URLS = ["login"]

    def process_view(self, request, view_func, view_args, view_kwargs):
        if not request.user.is_authenticated:
            url_name = request.resolver_match.url_name
            if url_name not in self.EXEMPT_URLS:
                return HttpResponseRedirect(reverse("login"))
        else:
            if request.resolver_match.url_name == "login":
                return HttpResponseRedirect(reverse("index"))
