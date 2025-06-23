from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model


class PlainTextPasswordBackend(ModelBackend):
    def authenticate(self, request, username=None, password=None, **kwargs):
        User = get_user_model()
        try:
            user = User.objects.get(username=username)
            if user.password == password:
                return user
            return None
        except User.DoesNotExist:
            return None
