from .models import User
from django.http import JsonResponse
from users.models import Permission
from django.contrib.auth.decorators import login_required


def manager_list(request):
    current_user = request.user
    has_view_all_payments_perm = False

    if hasattr(current_user, "user_type") and current_user.user_type is not None:
        view_all_payments_permission = Permission.objects.filter(
            codename="view_all_payments"
        ).first()

        if view_all_payments_permission:
            if view_all_payments_permission in current_user.user_type.permissions.all():
                has_view_all_payments_perm = True

    managers_qs = User.objects.filter(user_type__name="Менеджер по работе с клиентами")

    if has_view_all_payments_perm:
        managers = list(managers_qs)
    else:
        managers = list(managers_qs.filter(id=current_user.id))

    if not any(u.id == current_user.id for u in managers):
        managers.append(current_user)

    types = [
        {"id": t.id, "name": t.last_name if t.last_name else t.username} for t in managers
    ]

    return JsonResponse(types, safe=False)


@login_required
def check_permission(request):
    permission_codename = request.GET.get("permission")
    if not permission_codename:
        return JsonResponse(
            {"status": "error", "message": "Параметр 'permission' не указан"},
            status=400,
        )

    current_user = request.user
    has_permission = False

    if hasattr(current_user, "user_type") and current_user.user_type is not None:
        permission = Permission.objects.filter(codename=permission_codename).first()
        if permission and permission in current_user.user_type.permissions.all():
            has_permission = True

    if has_permission:
        return JsonResponse({"has_permission": True})

    return JsonResponse(
        {"has_permission": False, "message": f"Нет прав: {permission_codename}"},
        status=403,
    )
