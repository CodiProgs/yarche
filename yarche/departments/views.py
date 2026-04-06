import json
from django.db import transaction
from django.contrib.auth.decorators import login_required
from commerce.models import Department, OrderDepartmentWork, OrderWorkStatus, Order, OrderDepartmentWorkMessage
from users.models import User
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods, require_POST
from django.template.loader import render_to_string
from django.db import models
from django.db.models import Q
from types import SimpleNamespace
from users.models import Notification
from django.forms.models import model_to_dict


@login_required
def department_orders(request, department_slug):
    department = get_object_or_404(Department, slug=department_slug)
    
    department_works = OrderDepartmentWork.objects.filter(
        department=department,
        completed_at__isnull=True 
    ).select_related(
        'order',
        'order__client',
        'order__product',
        'order__status',
        'order__manager',
        'status',
        'executor'
    ).order_by('-order__created')
    
    data = []

    for work in department_works:
        order = work.order
        
        order.department_status = work.get_current_status()
        order.department_executor = work.executor
        order.department_started = work.get_formatted_started_at()
        order.department_completed = work.get_formatted_completed_at()
        order.legal_name = order.client.legal_name if order.client else None

        data.append(order)
    
    fields = [
        {"name": "id", "verbose_name": "№ Заказа"},
        {"name": "department_executor", "verbose_name": "Исполнитель", "is_relation": True},
        {"name": "client", "verbose_name": "Клиент", "is_relation": True},
        {"name": "legal_name", "verbose_name": "Юрлицо"},
        {"name": "product", "verbose_name": "Продукт", "is_relation": True},
        {"name": "department_status", "verbose_name": f"Состояние заказа", "is_relation": True},
        {"name": "created", "verbose_name": "Создан", "is_date": True},
        {"name": "department_started", "verbose_name": "Начало работы"},
        {"name": "department_completed", "verbose_name": "Завершен"},
    ]

    is_chief = False
    user_type = getattr(request.user, "user_type", None)
    if user_type:
        if department.chief_user_type and user_type.id == department.chief_user_type.id:
            is_chief = True
        if user_type.name.lower() == "администратор":
            is_chief = True

    ids = [work.id for work in department_works]

    context = {
        "fields": fields,
        "data": data,
        "is_chief": is_chief,
        "ids": ids, 
    }
    
    return render(request, "departments/department_orders.html", context)

@login_required
def department_users(request, department_slug):
    """
    Возвращает пользователей отдела, связанных с определённым заказом или работой отдела.
    Если не передан order_id и order_work_id, возвращает всех пользователей отдела.
    """
    from commerce.models import Department, Order, OrderDepartmentWork
    from users.models import User

    department = get_object_or_404(Department, slug=department_slug)
    order_id = request.GET.get("order_id")
    order_work_id = request.GET.get("order_work_id")

    if not order_id and not order_work_id:
        users = User.objects.filter(user_type=department.worker_user_type) if department.worker_user_type else User.objects.none()
    else:
        if order_work_id:
            order_work = get_object_or_404(OrderDepartmentWork, id=order_work_id)
            order = order_work.order
        else:
            order = get_object_or_404(Order, id=order_id)
        users = User.objects.none()
        if order.manager and department.worker_user_type and order.manager.user_type_id == department.worker_user_type.id:
            users = users | User.objects.filter(id=order.manager.id)
        if department.worker_user_type:
            viewers = order.viewers.filter(user_type=department.worker_user_type)
            users = users | viewers
        executors = OrderDepartmentWork.objects.filter(
            order=order,
            department=department,
            executor__isnull=False
        ).values_list('executor_id', flat=True)
        users = users | User.objects.filter(id__in=executors)
        users = users.distinct()

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
def department_statuses(request, department_slug):
    department = get_object_or_404(Department, slug=department_slug)
    statuses = OrderWorkStatus.objects.filter(department=department).values("id", "name")
    return JsonResponse(list(statuses), safe=False)

@login_required
@require_http_methods(["POST", "PUT", "PATCH"])
def department_work_assign_executor(request, order_id: int, department_slug: str):
    """Назначает или меняет исполнителя для работы отдела по заказу"""
    try:
        with transaction.atomic():
            
            if request.method in ["PUT", "PATCH"]:
                data = json.loads(request.body)
            else:
                data = request.POST.dict()
            
            executor_id = data.get("executor") or data.get("executor_id")
            
            if not executor_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указан исполнитель"},
                    status=400,
                )
            
            order = get_object_or_404(Order, id=order_id)
            department = get_object_or_404(Department, slug=department_slug)
            
            try:
                executor = get_object_or_404(User, id=int(executor_id))
            except (ValueError, TypeError):
                return JsonResponse(
                    {"status": "error", "message": "Неверный ID исполнителя"},
                    status=400,
                )
            
            if not executor.user_type or executor.user_type.name != department.name:
                return JsonResponse(
                    {"status": "error", "message": f"Пользователь не принадлежит отделу {department.name}"},
                    status=400,
                )
            
            department_work, created = OrderDepartmentWork.objects.get_or_create(
                order=order,
                department=department,
                defaults={"executor": executor}
            )

            url = f"/departments/{department_slug}/?order_id={order.id}"
            
            if not created:
                old_executor = department_work.executor
                department_work.executor = executor
                department_work.save(update_fields=["executor"])

                Notification.objects.create(
                    user=executor,
                    message=f"Вы назначены исполнителем по заказу №{order.id} ({department.name})",
                    url=url,
                    type="Назначение",
                    order=order,
                )
                
                message = f"Исполнитель изменен с {old_executor} на {executor}" if old_executor else f"Назначен исполнитель {executor}"
            else:
                Notification.objects.create(
                    user=executor,
                    message=f"Вы назначены исполнителем по заказу №{order.id} ({department.name})",
                    url=url,
                    type="Назначение",
                    order=order,
                )
                message = f"Назначен исполнитель {executor}"
            
            order.department_status = department_work.get_current_status()
            order.department_executor = department_work.executor
            order.department_started = department_work.get_formatted_started_at()
            order.department_completed = department_work.get_formatted_completed_at()
            order.legal_name = order.client.legal_name if order.client else None
            
            fields = [
                {"name": "id", "verbose_name": "№ Заказа"},
                {"name": "department_executor", "verbose_name": "Исполнитель", "is_relation": True},
                {"name": "client", "verbose_name": "Клиент", "is_relation": True},
                {"name": "legal_name", "verbose_name": "Юрлицо"},
                {"name": "product", "verbose_name": "Продукт", "is_relation": True},
                {"name": "department_status", "verbose_name": "Состояние заказа", "is_relation": True},
                {"name": "created", "verbose_name": "Создан", "is_date": True},
                {"name": "department_started", "verbose_name": "Начало работы"},
                {"name": "department_completed", "verbose_name": "Завершен"},
            ]
            
            html = render_to_string("components/table_row.html", {"item": order, "fields": fields})
            
            return JsonResponse(
                {
                    "status": "success",
                    "message": message,
                    "html": html,
                    "order_id": order.id,
                    "executor": {
                        "id": executor.id,
                        "name": f"{executor.last_name} {executor.first_name}" if executor.last_name else executor.username,
                    }
                }
            )
            
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST", "PUT", "PATCH"])
def department_work_update_status(request, order_id: int, department_slug: str):
    """Обновляет статус работы отдела по заказу"""
    try:
        with transaction.atomic():
            from django.utils import timezone

            if request.method in ["PUT", "PATCH"]:
                data = json.loads(request.body)
            else:
                data = request.POST.dict()

            status_id = data.get("status") or data.get("status_id")

            if not status_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указан статус"},
                    status=400,
                )

            order = get_object_or_404(Order, id=order_id)
            department = get_object_or_404(Department, slug=department_slug)

            try:
                new_status = get_object_or_404(OrderWorkStatus, id=int(status_id))
            except (ValueError, TypeError):
                return JsonResponse(
                    {"status": "error", "message": "Неверный ID статуса"},
                    status=400,
                )

            department_work, created = OrderDepartmentWork.objects.get_or_create(
                order=order,
                department=department,
                defaults={"status": new_status, "started_at": timezone.now()}
            )

            if not department_work.started_at:
                department_work.started_at = timezone.now()

            old_status = department_work.status
            department_work.status = new_status

            if new_status.is_final:
                if not department_work.completed_at:
                    department_work.completed_at = timezone.now()
                    department_work.save(update_fields=["status", "started_at", "completed_at"])
                    message = f"Статус изменен на '{new_status}'. Работа завершена."
                else:
                    department_work.save(update_fields=["status", "started_at"])
                    message = f"Статус изменен на '{new_status}'"
            else:
                if department_work.completed_at:
                    department_work.completed_at = None
                    department_work.save(update_fields=["status", "started_at", "completed_at"])
                    message = f"Статус изменен с '{old_status}' на '{new_status}'. Дата завершения сброшена."
                else:
                    department_work.save(update_fields=["status", "started_at"])
                    message = f"Статус изменен с '{old_status}' на '{new_status}'" if old_status else f"Установлен статус '{new_status}'"

            department_work.refresh_from_db()

            from types import SimpleNamespace

            order_data = SimpleNamespace(
                id=order.id,
                client=order.client,
                product=order.product,
                created=order.created,
                status=order.status,
                manager=order.manager,
                department_status=department_work.get_current_status(),
                department_executor=department_work.executor,
                department_started=department_work.get_formatted_started_at(),
                department_completed=department_work.get_formatted_completed_at(),
                legal_name=order.client.legal_name if order.client else None
            )

            fields = [
                {"name": "id", "verbose_name": "№ Заказа"},
                {"name": "department_executor", "verbose_name": "Исполнитель", "is_relation": True},
                {"name": "client", "verbose_name": "Клиент", "is_relation": True},
                {"name": "legal_name", "verbose_name": "Юрлицо"},
                {"name": "product", "verbose_name": "Продукт", "is_relation": True},
                {"name": "department_status", "verbose_name": "Состояние заказа"},
                {"name": "created", "verbose_name": "Создан", "is_date": True},
                {"name": "department_started", "verbose_name": "Начало работы"},
                {"name": "department_completed", "verbose_name": "Завершен"},
            ]

            html = render_to_string("components/table_row.html", {"item": order_data, "fields": fields})

            return JsonResponse(
                {
                    "status": "success",
                    "message": message,
                    "html": html,
                    "id": order.id,
                    "started_at": department_work.get_formatted_started_at(),
                    "completed_at": department_work.get_formatted_completed_at(),
                }
            )

    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
def department_work_detail(request, order_id: int, department_slug: str):
    """Получает информацию о работе отдела по заказу"""
    order = get_object_or_404(Order, id=order_id)
    department = get_object_or_404(Department, slug=department_slug)
    
    try:
        department_work = OrderDepartmentWork.objects.select_related(
            'status', 
            'executor',
            'order',
            'department'
        ).get(order=order, department=department)
        
        data = {
            "order": department_work.order_id,
            "department": department_work.department_id,
            "status": department_work.status_id,
            "executor": department_work.executor_id,
            "started_at": department_work.started_at.isoformat() if department_work.started_at else None,
            "completed_at": department_work.completed_at.isoformat() if department_work.completed_at else None,
        }
        
        return JsonResponse({
            "status": "success",
            "data": data
        })
        
    except OrderDepartmentWork.DoesNotExist:
        data = {
            "order": order.id,
            "department": department.id,
            "status": None,
            "executor": None,
            "started_at": None,
            "completed_at": None,
        }
        
        return JsonResponse({
            "status": "success",
            "data": data
        })

@login_required
@require_http_methods(["GET"])
def department_work_messages_list(request, order_work_id=None):
    try:
        from types import SimpleNamespace

        messages_qs = None
        order_id = request.GET.get("order_id")
        if order_work_id is not None and str(order_work_id) != "0":
            order_work = get_object_or_404(OrderDepartmentWork, id=order_work_id)
            messages_qs = OrderDepartmentWorkMessage.objects.filter(
                order_work=order_work
            ).select_related("author", "recipient").order_by("-created")
        elif order_id:
            messages_qs = OrderDepartmentWorkMessage.objects.filter(
                order_work__isnull=True,
                order_id=order_id
            ).select_related("author", "recipient").order_by("-created")
        else:
            return JsonResponse({"status": "error", "message": "Не передан order_work_id или order_id"}, status=400)

        messages_qs = messages_qs.filter(
            models.Q(author=request.user, recipient__isnull=False) |  
            models.Q(recipient=request.user) |                        
            models.Q(recipient__isnull=True)                          
        )

        messages_data = []
        messages_meta = []

        for msg in messages_qs:
            msg_obj = SimpleNamespace(
                id=msg.id,
                author=str(msg.author),
                author_id=msg.author.id,
                recipient=str(msg.recipient) if msg.recipient else "Всем",
                recipient_id=msg.recipient.id if msg.recipient else None,
                created=msg.get_formatted_created(),
                message=msg.message,
                is_read=msg.is_read,
            )
            messages_data.append(msg_obj)

            unread_type = None
            if msg.recipient and msg.author.id == request.user.id:
                if msg.is_read:
                    unread_type = "sent_read" 
                else:
                    unread_type = "sent"      
            elif not msg.is_read and msg.recipient and msg.recipient.id == request.user.id:
                unread_type = "received"

            messages_meta.append({
                "id": msg.id,
                "is_read": msg.is_read,
                "unread_type": unread_type,
            })

        if order_work_id is not None and str(order_work_id) != "0":
            OrderDepartmentWorkMessage.objects.filter(
                order_work=order_work,
                recipient=request.user,
                is_read=False
            ).update(is_read=True)
        elif order_id:
            OrderDepartmentWorkMessage.objects.filter(
                order_work__isnull=True,
                order_id=order_id,
                recipient=request.user,
                is_read=False
            ).update(is_read=True)

        fields = [
            {"name": "author", "verbose_name": "Автор"},
            {"name": "recipient", "verbose_name": "Получатель"},
            {"name": "created", "verbose_name": "Дата"},
            {"name": "message", "verbose_name": "Сообщение"},
        ]

        html = render_to_string(
            "components/table.html",
            {
                "fields": fields,
                "data": messages_data,
                "id": f"order-work-messages-{order_work_id or order_id}",
            },
        )

        return JsonResponse(
            {
                "html": html,
                "messages_meta": messages_meta,
                "order_work_id": order_work_id,
                "order_id": order_work.order.id if order_work_id is not None and str(order_work_id) != "0" else order_id,
                "messages_id_list": [msg.id for msg in messages_qs],
            }
        )

    except Exception as e:
        return JsonResponse(
            {"status": "error", "message": str(e)},
            status=400
        )

@login_required
@require_http_methods(["POST"])
def department_work_message_mark_read(request, pk: int):
    try:
        with transaction.atomic():
            message = get_object_or_404(OrderDepartmentWorkMessage, id=pk)
            
            if message.recipient and message.recipient != request.user:
                return JsonResponse(
                    {"status": "error", "message": "Вы не можете отметить это сообщение"},
                    status=403,
                )
            
            message.mark_as_read()
            
            return JsonResponse(
                {
                    "status": "success",
                    "id": message.id,
                    "is_read": message.is_read,
                }
            )

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["GET"])
def get_order_work(request, department_slug: str, order_id: int):
    """Получить order_work_id для заказа и отдела"""
    try:
        from commerce.models import Department, OrderDepartmentWork
        
        department = get_object_or_404(Department, slug=department_slug)
        order_work = get_object_or_404(
            OrderDepartmentWork, 
            order_id=order_id, 
            department=department
        )
        
        return JsonResponse({
            "order_work_id": order_work.id,
            "department_id": department.id,
            "order_id": order_id,
        })
        
    except Exception as e:
        return JsonResponse(
            {"status": "error", "message": str(e)}, 
            status=400
        )

@login_required
@require_http_methods(["POST"])
def department_work_messages_mark_all_read(request, order_work_id: int):
    """Отметить все сообщения как прочитанные"""
    try:
        order_work = get_object_or_404(OrderDepartmentWork, id=order_work_id)
        
        updated_count = OrderDepartmentWorkMessage.objects.filter(
            order_work=order_work,
            recipient=request.user,
            is_read=False
        ).update(is_read=True)
        
        return JsonResponse({
            "status": "success",
            "message": f"Отмечено сообщений: {updated_count}",
            "count": updated_count
        })
        
    except Exception as e:
        return JsonResponse(
            {"status": "error", "message": str(e)}, 
            status=400
        )

@login_required
@require_http_methods(["POST"])
def department_work_message_create(request):
    try:
        with transaction.atomic():
            order_work_id = request.POST.get("order_work") or request.POST.get("order_work_id")
            order_id = request.POST.get("order") or request.POST.get("order_id")
            message_text = (request.POST.get("message") or "").strip()
            recipient_id = request.POST.get("recipient") or request.POST.get("recipient_id")

            if not order_work_id and not order_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указана работа отдела или заказ"},
                    status=400,
                )

            if not message_text:
                return JsonResponse(
                    {"status": "error", "message": "Сообщение не может быть пустым"},
                    status=400,
                )

            order_work = None
            order = None

            if order_work_id:
                try:
                    order_work = get_object_or_404(OrderDepartmentWork, id=int(order_work_id))
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный ID работы отдела"},
                        status=400,
                    )
            elif order_id:
                try:
                    from commerce.models import Order
                    order = get_object_or_404(Order, id=int(order_id))
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный ID заказа"},
                        status=400,
                    )

            recipient = None
            if recipient_id:
                try:
                    from users.models import User
                    recipient = get_object_or_404(User, id=int(recipient_id))
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный ID получателя"},
                        status=400,
                    )

            from commerce.models import OrderDepartmentWorkMessage
            message = OrderDepartmentWorkMessage.objects.create(
                order_work=order_work,
                order=order if order_work is None else None,
                author=request.user,
                recipient=recipient,
                message=message_text,
            )

            from types import SimpleNamespace
            message_obj = SimpleNamespace(
                id=message.id,
                author=str(message.author),
                author_id=message.author.id,
                recipient=str(message.recipient) if message.recipient else "Всем",
                recipient_id=message.recipient.id if message.recipient else None,
                created=message.get_formatted_created(),
                message=message.message,
                is_read=message.is_read,
                order_work_id=message.order_work.id if message.order_work else None,
                order_id=message.order.id if message.order else (message.order_work.order.id if message.order_work else None),
            )

            fields = [
                {"name": "author", "verbose_name": "Автор"},
                {"name": "recipient", "verbose_name": "Получатель"},
                {"name": "created", "verbose_name": "Дата", "is_date": True},
                {"name": "message", "verbose_name": "Сообщение"},
            ]

            from django.template.loader import render_to_string
            html = render_to_string(
                "components/table_row.html",
                {
                    "item": message_obj,
                    "fields": fields,
                },
            )

            unread_type = None
            if message.recipient and message.author.id == request.user.id:
                if message.is_read:
                    unread_type = "sent_read"
                else:
                    unread_type = "sent"
            elif not message.is_read and message.recipient and message.recipient.id == request.user.id:
                unread_type = "received"

            message_meta = {
                "id": message.id,
                "is_read": message.is_read,
                "unread_type": unread_type,
            }

            return JsonResponse(
                {
                    "status": "success",
                    "id": message.id,
                    "html": html,
                    "message": vars(message_obj),
                    "message_meta": message_meta,
                }
            )

    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST", "PUT", "PATCH"])
def department_work_message_edit(request, message_id: int):
    """Редактирование сообщения работы отдела"""
    try:
        with transaction.atomic():
            message = get_object_or_404(OrderDepartmentWorkMessage, id=message_id)
            
            if message.author != request.user:
                return JsonResponse(
                    {"status": "error", "message": "Вы можете редактировать только свои сообщения"},
                    status=403,
                )
            
            if request.method in ["PUT", "PATCH"]:
                data = json.loads(request.body)
            else:
                data = request.POST.dict()
            
            message_text = (data.get("message") or "").strip()
            recipient_id = data.get("recipient") or data.get("recipient_id")
            
            if not message_text:
                return JsonResponse(
                    {"status": "error", "message": "Сообщение не может быть пустым"},
                    status=400,
                )
            
            message.message = message_text
            
            if recipient_id:
                try:
                    from users.models import User
                    recipient = get_object_or_404(User, id=int(recipient_id))
                    message.recipient = recipient
                except (ValueError, TypeError):
                    return JsonResponse(
                        {"status": "error", "message": "Неверный ID получателя"},
                        status=400,
                    )
            else:
                message.recipient = None
            
            message.is_read = False
            
            message.save(update_fields=["message", "recipient", "is_read"])
                        
            message_obj = SimpleNamespace(
                id=message.id,
                author=str(message.author),
                author_id=message.author.id,
                recipient=str(message.recipient) if message.recipient else "Всем",
                recipient_id=message.recipient.id if message.recipient else None,
                created=message.get_formatted_created(),
                message=message.message,
                is_read=message.is_read,
            )
            
            fields = [
                {"name": "author", "verbose_name": "Автор"},
                {"name": "recipient", "verbose_name": "Получатель"},
                {"name": "created", "verbose_name": "Дата"},
                {"name": "message", "verbose_name": "Сообщение"},
            ]
            
            html = render_to_string(
                "components/table_row.html",
                {
                    "item": message_obj,
                    "fields": fields,
                },
            )
            
            unread_type = None
            if not message.is_read:
                if message.recipient and message.recipient.id == request.user.id:
                    unread_type = "received"
                elif message.author.id == request.user.id and message.recipient:
                    unread_type = "sent"
            
            return JsonResponse(
                {
                    "status": "success",
                    "message": "Сообщение успешно обновлено",
                    "id": message.id,
                    "html": html,
                    "message_meta": {
                        "id": message.id,
                        "is_read": message.is_read,
                        "unread_type": unread_type,
                    },
                }
            )
            
    except json.JSONDecodeError:
        return JsonResponse(
            {"status": "error", "message": "Неверный формат JSON"}, 
            status=400
        )
    except Exception as e:
        return JsonResponse(
            {"status": "error", "message": str(e)}, 
            status=400
        )

@login_required
@require_http_methods(["POST", "DELETE"])
def department_work_message_delete(request, message_id: int):
    """Удаление сообщения работы отдела"""
    try:
        with transaction.atomic():
            message = get_object_or_404(OrderDepartmentWorkMessage, id=message_id)
            
            if message.author != request.user:
                return JsonResponse(
                    {"status": "error", "message": "Вы можете удалять только свои сообщения"},
                    status=403,
                )
            
            message_id = message.id
            message.delete()
            
            return JsonResponse(
                {
                    "status": "success",
                    "message": "Сообщение успешно удалено",
                    "id": message_id,
                }
            )
            
    except Exception as e:
        return JsonResponse(
            {"status": "error", "message": str(e)}, 
            status=400
        )

@login_required
@require_http_methods(["GET"])
def department_work_message_detail(request, message_id: int):
    """Получение информации о конкретном сообщении работы отдела"""
    message = get_object_or_404(
        OrderDepartmentWorkMessage.objects.select_related(
            'author',
            'recipient',
            'order_work',
            'order_work__order',
            'order_work__department'
        ),
        id=message_id
    )
    
    if message.recipient:
        if request.user not in [message.author, message.recipient]:
            return JsonResponse(
                {"status": "error", "message": "У вас нет доступа к этому сообщению"},
                status=403,
            )
    else:
        department = message.order_work.department
        department_users = department.get_department_users()
        if request.user not in department_users and message.author != request.user:
            return JsonResponse(
                {"status": "error", "message": "У вас нет доступа к этому сообщению"},
                status=403,
            )
    
    data = {
        "order_work": message.order_work_id,
        "author": message.author_id,
        "recipient": message.recipient_id,
        "created": message.created.isoformat(),
        "message": message.message,
        "is_read": message.is_read,
    }
    
    return JsonResponse({"data": data})

@login_required
@require_http_methods(["POST"])
def department_work_create(request):
    try:
        with transaction.atomic():
            order_id = request.POST.get("order")
            departments_raw = request.POST.get("department")

            errors = []

            if not order_id or not departments_raw:
                errors.append({"message": "Не передан order или department"})
                return JsonResponse({
                    "status": "error",
                    "errors": errors,
                    "message": errors[0]["message"]
                }, status=400)

            department_ids = [d.strip() for d in departments_raw.split(",") if d.strip()]

            order = get_object_or_404(Order, id=order_id)
            created_works = []

            for department_id in department_ids:
                department = get_object_or_404(Department, id=department_id)
                status = OrderWorkStatus.objects.filter(
                    department=department,
                    is_initial=True
                ).first()

                if not status:
                    errors.append({
                        "department": department_id,
                        "message": f"Для отдела '{department.name}' не настроен стартовый статус работы. Обратитесь к администратору."
                    })
                    continue

                if OrderDepartmentWork.objects.filter(order=order, department=department).exists():
                    existing_work = OrderDepartmentWork.objects.get(order=order, department=department)
                    errors.append({
                        "department": department_id,
                        "message": (
                            f"Работа для отдела '{department.name}' уже существует "
                            f"статус: '{existing_work.status.name}')"
                        )
                    })
                    continue

                work = OrderDepartmentWork.objects.create(
                    order=order,
                    department=department,
                    status=status
                )
                created_works.append({
                    "id": work.id,
                    "order": work.order.id,
                    "department": work.department.id,
                    "status_name": work.status.name,
                    "department_name": work.department.name,
                })

            if created_works:
                return JsonResponse({
                    "status": "success",
                    "created": created_works,
                    "errors": errors,
                }, status=200)
            else:
                message = errors[0]["message"] if errors else "Ошибка создания работы отдела"
                return JsonResponse({
                    "status": "error",
                    "created": [],
                    "errors": errors,
                    "message": message
                }, status=400)
    except Exception as e:
        return JsonResponse({
            "status": "error",
            "errors": [{"message": str(e)}],
            "message": str(e)
        }, status=400)


def entity_list(request, model_class):
    entities = model_class.objects.all().values("id", "name")
    return JsonResponse(list(entities), safe=False)


def departments_list(request):
    return entity_list(request, Department)

@login_required
@require_POST
def department_work_delete(request, work_id: int):
    try:
        with transaction.atomic():
            work = get_object_or_404(OrderDepartmentWork, id=work_id)
            work.delete()
            return JsonResponse({
                "status": "success",
                "message": "Работа отдела успешно удалена",
                "id": work_id,
            })
    except Exception as e:
        return JsonResponse({
            "status": "error",
            "message": str(e),
        }, status=400)

@login_required
@require_http_methods(["GET"])
def order_departments_list(request, order_id: int):
    """
    Возвращает список отделов, участвующих в работах по заказу.
    """
    try:
        order = get_object_or_404(Order, id=order_id)
        works = OrderDepartmentWork.objects.filter(order=order).select_related('department')
        departments = [
            {
                "id": work.department.id,
                "name": work.department.name,
                "slug": work.department.slug,
            }
            for work in works
        ]
        return JsonResponse({"departments": departments, "order_id": order.id})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
def department_work_detail_by_id(request, work_id):
    work = get_object_or_404(OrderDepartmentWork, id=work_id)
    return JsonResponse({
        'order_id': work.order.id,
        'department_id': work.department.id,
    })

@login_required
@require_http_methods(["POST"])
def order_work_status_create(request):
    try:
        with transaction.atomic():
            department_id = request.POST.get("department")
            name = (request.POST.get("name") or "").strip()
            is_initial = request.POST.get("is_initial") in ["true", "on", "1"]
            is_final = request.POST.get("is_final") in ["true", "on", "1"]

            if not department_id:
                return JsonResponse({"status": "error", "message": "Не указан отдел"}, status=400)
            if not name:
                return JsonResponse({"status": "error", "message": "Не указано название статуса"}, status=400)

            department = get_object_or_404(Department, id=int(department_id))

            if is_initial and OrderWorkStatus.objects.filter(department=department, is_initial=True).exists():
                return JsonResponse({"status": "error", "message": "В отделе уже есть статус, назначаемый при создании работы"}, status=400)
            if is_final and OrderWorkStatus.objects.filter(department=department, is_final=True).exists():
                return JsonResponse({"status": "error", "message": "В отделе уже есть статус, назначаемый при закрытии работы"}, status=400)

            status = OrderWorkStatus.objects.create(
                name=name,
                department=department,
                is_initial=is_initial,
                is_final=is_final,
            )

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "department", "verbose_name": "Отдел"},
                {"name": "name", "verbose_name": "Состояние"},
                {"name": "is_initial", "verbose_name": "Новый заказ", "is_boolean": True},
                {"name": "is_final", "verbose_name": "Закрыть", "is_boolean": True},
            ]
            context = {"item": status, "fields": fields}
            html = render_to_string("components/table_row.html", context)

            return JsonResponse({
                "html": html,
                "id": status.id,
            })
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["PUT", "PATCH", "POST"])
def order_work_status_update(request, pk: int):
    try:
        with transaction.atomic():
            status = get_object_or_404(OrderWorkStatus, id=pk)
            data = (
                json.loads(request.body) if request.method in ["PUT", "PATCH"] else request.POST.dict()
            )

            updatable = ["name", "department", "is_initial", "is_final"]

            for field in updatable:
                if field in data:
                    val = data[field]
                    if field == "department" and val:
                        try:
                            val = get_object_or_404(Department, id=int(val))
                        except Exception:
                            return JsonResponse({"status": "error", "message": "Неверный ID отдела"}, status=400)
                    elif field in ["is_initial", "is_final"]:
                        val = str(val).lower() in ["true", "on", "1"]
                    elif isinstance(val, str):
                        val = val.strip()
                        if val == "":
                            val = None
                    setattr(status, field, val)

            department = status.department
            if status.is_initial:
                qs = OrderWorkStatus.objects.filter(department=department, is_initial=True).exclude(id=status.id)
                if qs.exists():
                    return JsonResponse({"status": "error", "message": "В отделе уже есть статус, назначаемый при создании работы"}, status=400)
            if status.is_final:
                qs = OrderWorkStatus.objects.filter(department=department, is_final=True).exclude(id=status.id)
                if qs.exists():
                    return JsonResponse({"status": "error", "message": "В отделе уже есть статус, назначаемый при закрытии работы"}, status=400)

            if not status.name:
                return JsonResponse({"status": "error", "message": "Требуется указать название статуса"}, status=400)

            status.save()

            fields = [
                {"name": "id", "verbose_name": "ID"},
                {"name": "department", "verbose_name": "Отдел"},
                {"name": "name", "verbose_name": "Состояние"},
                {"name": "is_initial", "verbose_name": "Новый заказ", "is_boolean": True},
                {"name": "is_final", "verbose_name": "Закрыть", "is_boolean": True},
            ]
            context = {"item": status, "fields": fields}
            html = render_to_string("components/table_row.html", context)

            return JsonResponse({
                "id": status.id,
                "html": html,
            })
    except json.JSONDecodeError:
        return JsonResponse({"status": "error", "message": "Неверный формат JSON"}, status=400)
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["POST"])
def order_work_status_delete(request, pk: int):
    try:
        with transaction.atomic():
            status = get_object_or_404(OrderWorkStatus, id=pk)
            if OrderDepartmentWork.objects.filter(status=status).exists():
                return JsonResponse(
                    {"status": "error", "message": "Нельзя удалить статус, так как есть работы с этим статусом"},
                    status=400,
                )
            status.delete()
            return JsonResponse({"status": "success"})
    except Exception as e:
        return JsonResponse({"status": "error", "message": str(e)}, status=400)

@login_required
@require_http_methods(["GET"])
def order_work_status_detail(request, pk: int):
    status = get_object_or_404(OrderWorkStatus, id=pk)
    data = model_to_dict(status)
    if "department" in data and status.department:
        data["department"] = status.department.id
        data["department_name"] = status.department.name
    return JsonResponse({"data": data})
