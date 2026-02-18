from users.models import Permission
from django.contrib.auth.decorators import login_required
from .models import User, Notification
from django.shortcuts import render
from django.http import JsonResponse
from commerce.models import Order, OrderDepartmentWork
from django.views.decorators.http import require_http_methods

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

    role = request.GET.get("role")
    if role == "viewer":
        managers = list(managers_qs.exclude(id=current_user.id))
    elif has_view_all_payments_perm:
        managers = list(managers_qs)
    else:
        managers = list(managers_qs.filter(id=current_user.id))

    if role != "viewer" and not any(u.id == current_user.id for u in managers):
        managers.append(current_user)
    # -------------------------------------

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

@login_required
def notifications_list(request):
    notifications = Notification.objects.filter(user=request.user).order_by('-created')
    return render(request, "users/notifications.html", {"notifications": notifications})

@login_required
def order_related_users(request, order_id):
    from django.shortcuts import get_object_or_404
    order = get_object_or_404(Order.objects.select_related('manager', 'client').prefetch_related('viewers'), id=order_id)
    users = set()

    if order.manager and order.manager != request.user:
        users.add(order.manager)

    if hasattr(order.client, 'user') and order.client.user and order.client.user != request.user:
        users.add(order.client.user)

    works = OrderDepartmentWork.objects.filter(order=order).select_related('executor')
    for work in works:
        if work.executor and work.executor != request.user:
            users.add(work.executor)

    for viewer in order.viewers.all():
        if viewer != request.user:
            users.add(viewer)

    users_data = [
        {
            "id": user.id,
            "name": f"{user.last_name} {user.first_name}" if user.last_name else user.username,
            "username": user.username,
            "email": user.email,
        }
        for user in users
    ]

    return JsonResponse(users_data, safe=False)

@login_required
@require_http_methods(["POST"])
def notifications_mark_all_read(request):
    Notification.objects.filter(user=request.user, is_read=False).update(is_read=True)
    return JsonResponse({"status": "success"})


@login_required
def department_workers(request, department_id):
    from django.shortcuts import get_object_or_404
    from commerce.models import Department
    department = get_object_or_404(Department, id=department_id)
    
    users = set()
    if department.worker_user_type:
        for user in User.objects.filter(user_type=department.worker_user_type):
            if user != request.user:
                users.add(user)
    
    users_data = [
        {
            "id": user.id,
            "name": f"{user.last_name} {user.first_name}" if user.last_name else user.username,
            "username": user.username,
            "email": user.email,
        }
        for user in users
    ]
    
    return JsonResponse(users_data, safe=False)