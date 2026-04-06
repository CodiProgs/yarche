from users.models import Permission, UserType
from django.contrib.auth.decorators import login_required
from .models import User, Notification
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from commerce.models import Order, OrderDepartmentWork
from django.views.decorators.http import require_http_methods
from django.db import transaction
import json
from django.forms.models import model_to_dict
from django.template.loader import render_to_string


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


@login_required
def users_list(request):
    """
    View для отображения списка пользователей.
    """
    users = User.objects.select_related("user_type").order_by("id")
    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "username", "verbose_name": "Логин"},
        {"name": "password", "verbose_name": "Пароль"},
        {"name": "last_name", "verbose_name": "Фамилия"},
        {"name": "first_name", "verbose_name": "Имя"},
        {"name": "patronymic", "verbose_name": "Отчество"},
        {"name": "date_joined", "verbose_name": "Создан"},
        {"name": "is_active", "verbose_name": "Активен", "is_boolean": True},
        {"name": "user_type", "verbose_name": "Тип пользователя", "is_relation": True, },
    ]
    context = {
        "fields": fields,
        "data": users,
    }
    return render(request, "users/list.html", context)

@login_required
@require_http_methods(["POST"])
def create_user(request):
    """
    Создает нового пользователя. Пароль сохраняется в открытом виде для тестовой системы.
    """
    try:
        with transaction.atomic():
            username = request.POST.get("username", "").strip()
            password = request.POST.get("password", "").strip()
            email = request.POST.get("email", "").strip()
            first_name = request.POST.get("first_name", "").strip()
            last_name = request.POST.get("last_name", "").strip()
            patronymic = request.POST.get("patronymic", "").strip()
            user_type_id = request.POST.get("user_type")

            if not username or not password:
                return JsonResponse(
                    {"status": "error", "message": "Логин и пароль обязательны"},
                    status=400,
                )

            if not user_type_id:
                return JsonResponse(
                    {"status": "error", "message": "Тип пользователя обязателен"},
                    status=400,
                )

            user_type = get_object_or_404(UserType, id=user_type_id)

            user = User.objects.create_user(
                username=username,
                password=password,
                email=email,
                first_name=first_name,
                last_name=last_name,
                patronymic=patronymic,
                user_type=user_type,
            )

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "username", "verbose_name": "Логин"},
                {"name": "password", "verbose_name": "Пароль"},
                {"name": "last_name", "verbose_name": "Фамилия"},
                {"name": "first_name", "verbose_name": "Имя"},
                {"name": "patronymic", "verbose_name": "Отчество"},
                {"name": "date_joined", "verbose_name": "Создан"},
                {"name": "is_active", "verbose_name": "Активен", "is_boolean": True},
                {"name": "user_type", "verbose_name": "Тип пользователя", "is_relation": True, },
            ]

            context = {"item": user, "fields": fields}

            return JsonResponse(
                {
                    "status": "success",
                    "id": user.id,
                    "html": render_to_string("components/table_row.html", context),
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def update_user(request, user_id: int):
    """
    Редактирует данные существующего пользователя.
    """
    try:
        with transaction.atomic():
            user = get_object_or_404(User, id=user_id)
            data = (
                json.loads(request.body) if request.method in ["PUT", "PATCH"] else request.POST.dict()
            )

            username = data.get("username", "").strip()
            password = data.get("password", "").strip()
            user_type_id = data.get("user_type")

            if not username:
                return JsonResponse(
                    {"status": "error", "message": "Имя пользователя обязательно"},
                    status=400,
                )

            if not password:
                return JsonResponse(
                    {"status": "error", "message": "Пароль обязателен"},
                    status=400,
                )

            if not user_type_id:
                return JsonResponse(
                    {"status": "error", "message": "Тип пользователя обязателен"},
                    status=400,
                )

            user.username = username
            user.password = password  
            user.user_type = get_object_or_404(UserType, id=int(user_type_id))

            updatable_fields = [
                "email",
                "first_name",
                "last_name",
                "patronymic",
            ]

            for field in updatable_fields:
                if field in data:
                    value = data[field]
                    if isinstance(value, str):
                        value = value.strip()
                        if value == "":
                            value = None
                    setattr(user, field, value)

            if "is_active" in data:
                is_active_value = data["is_active"].strip().lower()
                user.is_active = is_active_value == "on"

            user.save()

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "username", "verbose_name": "Логин"},
                {"name": "password", "verbose_name": "Пароль"},
                {"name": "last_name", "verbose_name": "Фамилия"},
                {"name": "first_name", "verbose_name": "Имя"},
                {"name": "patronymic", "verbose_name": "Отчество"},
                {"name": "date_joined", "verbose_name": "Создан"},
                {"name": "is_active", "verbose_name": "Активен", "is_boolean": True},
                {"name": "user_type", "verbose_name": "Тип пользователя", "is_relation": True, },
            ]

            context = {"item": user, "fields": fields}

            return JsonResponse(
                {
                    "status": "success",
                    "id": user.id,
                    "html": render_to_string("components/table_row.html", context),
                }
            )
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["POST"])
def delete_user(request, user_id: int):
    """
    Удаляет пользователя по его ID.
    """
    try:
        with transaction.atomic():
            user = get_object_or_404(User, id=user_id)

            if user == request.user:
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить самого себя"},
                    status=400,
                )

            user.delete()
            return JsonResponse(
                {"status": "success", "message": f"Пользователь {user.username} удален"}
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["GET"])
def user_detail(request, user_id: int):
    """
    Возвращает данные о пользователе по его ID.
    """
    try:
        user = get_object_or_404(User, id=user_id)
        data = model_to_dict(user, fields=[
            "id", "username", "email", "first_name", "last_name", "is_active", "date_joined", "patronymic", "password"
        ])
        data["user_type"] = user.user_type.id if user.user_type else None
        return JsonResponse({"status": "success", "data": data})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["GET"])
def user_types_list(request):
    """
    Возвращает список типов пользователей.
    """
    user_types = UserType.objects.all().values("id", "name")
    return JsonResponse(list(user_types), safe=False)


@login_required
def user_types(request):
    """
    View для отображения списка типов пользователей.
    """
    user_types = UserType.objects.prefetch_related('permissions').order_by('id')
    
    fields = [
        {"name": "id", "verbose_name": "ID"},
        {"name": "name", "verbose_name": "Название"},
        {"name": "permissions_list", "verbose_name": "Права"},
    ]
    
    for user_type in user_types:
        perms = user_type.permissions.all()
        if perms:
            user_type.permissions_list = ', '.join([perm.description for perm in perms])
        else:
            user_type.permissions_list = ""
    
    context = {
        "fields": fields,
        "data": user_types,
    }
    return render(request, "users/user_types.html", context)


@login_required
def permissions_list(request):
    """
    Get list of all permissions.
    """
    permissions_data = [
        {"id": perm.id, "name": perm.description, "codename": perm.codename}
        for perm in Permission.objects.all().order_by("description")
    ]
    return JsonResponse(permissions_data, safe=False)


@login_required
@require_http_methods(["POST"])
def create_user_type(request):
    """
    Create a new user type with name and permissions.
    """
    try:
        with transaction.atomic():
            name = request.POST.get("name", "").strip()
            if not name:
                return JsonResponse(
                    {"status": "error", "message": "Название типа пользователя не может быть пустым"},
                    status=400,
                )

            if UserType.objects.filter(name=name).exists():
                return JsonResponse(
                    {"status": "error", "message": "Тип пользователя с таким названием уже существует"},
                    status=400,
                )

            permissions_str = request.POST.get("permissions", "").strip()
            permissions_ids = [int(pid) for pid in permissions_str.split(",") if pid.strip()] if permissions_str else []

            permissions = Permission.objects.filter(id__in=permissions_ids)
            if len(permissions) != len(permissions_ids):
                return JsonResponse(
                    {"status": "error", "message": "Некоторые права не найдены"},
                    status=400,
                )

            user_type = UserType.objects.create(name=name)
            user_type.permissions.set(permissions)

            user_type.permissions_list = ', '.join([perm.description for perm in permissions]) if permissions else ""
            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "name", "verbose_name": "Название"},
                {"name": "permissions_list", "verbose_name": "Права"},
            ]
            context = {"item": user_type, "fields": fields}

            return JsonResponse(
                {
                    "html": render_to_string("components/table_row.html", context),
                    "id": user_type.id,
                }
            )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)


@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def update_user_type(request, type_id: int):
    """
    Update a user type with name and permissions.
    """
    try:
        user_type = UserType.objects.get(id=type_id)
        data = (
            json.loads(request.body)
            if request.method in ["PUT", "PATCH"]
            else request.POST.dict()
        )

        if "name" in data:
            name = data["name"].strip()
            if not name:
                return JsonResponse(
                    {"status": "error", "message": "Название типа пользователя не может быть пустым"},
                    status=400,
                )
            if UserType.objects.filter(name=name).exclude(id=type_id).exists():
                return JsonResponse(
                    {"status": "error", "message": "Тип пользователя с таким названием уже существует"},
                    status=400,
                )
            user_type.name = name

        if "permissions" in data:
            permissions_ids = data["permissions"]
            if isinstance(permissions_ids, str):
                permissions_ids = permissions_ids.split(",") if permissions_ids else []
            permissions = Permission.objects.filter(id__in=permissions_ids)
            if len(permissions) != len(permissions_ids):
                return JsonResponse(
                    {"status": "error", "message": "Некоторые права не найдены"},
                    status=400,
                )
            user_type.permissions.set(permissions)

        user_type.save()

        user_type.permissions_list = ', '.join([perm.description for perm in user_type.permissions.all()]) if user_type.permissions.exists() else ""
        fields = [
            {"name": "id", "verbose_name": "ID"},
            {"name": "name", "verbose_name": "Название"},
            {"name": "permissions_list", "verbose_name": "Права"},
        ]
        context = {"item": user_type, "fields": fields}

        return JsonResponse(
            {
                "id": user_type.id,
                "html": render_to_string("components/table_row.html", context),
            }
        )
    except UserType.DoesNotExist:
        return JsonResponse(
            {"status": "error", "message": "Тип пользователя не найден"}, status=404
        )
    except json.JSONDecodeError:
        return JsonResponse(
            {"status": "error", "message": "Неверный формат JSON"}, status=400
        )
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
def user_type_detail(request, type_id: int):
    """
    Get user type details: name and list of permission IDs.
    """
    user_type = get_object_or_404(UserType, id=type_id)
    data = {
        "name": user_type.name,
        "permissions": list(user_type.permissions.values_list("id", flat=True)),
    }
    return JsonResponse({"data": data})


@login_required
@require_http_methods(["POST"])
def delete_user_type(request, type_id: int):
    """
    Delete a user type if not in use.
    """
    try:
        with transaction.atomic():
            user_type = get_object_or_404(UserType, id=type_id)
            if User.objects.filter(user_type=user_type).exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить тип пользователя, который используется"},
                    status=400,
                )
            user_type.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

# настройка пунктов меню

@login_required
def menu_items_list(request):
    """
    Получить все категории и пункты меню.
    """
    from menu.models import MenuCategory, MenuItem
    categories = MenuCategory.objects.order_by('order').all()
    result = []
    for cat in categories:
        items = MenuItem.objects.filter(category=cat).order_by('title').values('id', 'title', 'url_name')
        result.append({
            "category_id": cat.id,
            "category_name": cat.display_name,
            "items": list(items)
        })
    return JsonResponse(result, safe=False)

@login_required
def user_type_menu_items(request, type_id):
    """
    Получить пункты меню для типа пользователя.
    """
    from users.models import UserType, UserTypeMenuItem
    from menu.models import MenuCategory
    user_type = get_object_or_404(UserType, id=type_id)
    categories = MenuCategory.objects.order_by('order').all()
    result = []
    for cat in categories:
        items = UserTypeMenuItem.objects.filter(user_type=user_type, category=cat).order_by('order')
        result.append({
            "category_id": cat.id,
            "category_name": cat.display_name,
            "items": [
                {
                    "id": utmi.menu_item.id,
                    "title": utmi.menu_item.title,
                    "name": utmi.name or utmi.menu_item.title,
                    "order": utmi.order
                }
                for utmi in items
            ]
        })
    return JsonResponse(result, safe=False)

@login_required
@require_http_methods(["POST"])
def update_user_type_menu_items(request, type_id):
    """
    Обновить пункты меню для типа пользователя.
    """
    from users.models import UserType, UserTypeMenuItem
    from menu.models import MenuCategory, MenuItem
    import json
    user_type = get_object_or_404(UserType, id=type_id)
    try:
        data = json.loads(request.body)
        UserTypeMenuItem.objects.filter(user_type=user_type).delete()
        order_counter = 1
        for cat in data:
            category_id = cat.get("category_id")
            category = MenuCategory.objects.get(id=category_id)
            for item in cat.get("items", []):
                menu_item = get_object_or_404(MenuItem, id=item["id"])
                UserTypeMenuItem.objects.create(
                    user_type=user_type,
                    menu_item=menu_item,
                    category=category,
                    name=item.get("name") or menu_item.title,
                    order=order_counter
                )
                order_counter += 1
        return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)
    
@login_required
def available_menu_items(request, type_id):
    from users.models import UserType, UserTypeMenuItem
    from menu.models import MenuItem
    user_type = get_object_or_404(UserType, id=type_id)
    used_ids = UserTypeMenuItem.objects.filter(user_type=user_type).values_list('menu_item_id', flat=True)
    available = MenuItem.objects.exclude(id__in=used_ids).values('id', 'title', 'url_name')
    return JsonResponse(list(available), safe=False)