import json
from django.db import transaction
from django.contrib.auth.decorators import login_required
from commerce.models import Department, OrderDepartmentWork, DepartmentStatus, Order, OrderDepartmentWorkMessage
from users.models import User
from django.shortcuts import render, get_object_or_404
from django.http import JsonResponse
from django.views.decorators.http import require_http_methods
from django.template.loader import render_to_string
from django.utils.timezone import localtime

@login_required
def department_orders(request, department_slug):
    department = get_object_or_404(Department, slug=department_slug)
    
    department_works = OrderDepartmentWork.objects.filter(
        department=department
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
        {"name": "product", "verbose_name": "Продукт", "is_relation": True},
        {"name": "department_status", "verbose_name": f"Состояние заказа", "is_relation": True},
        {"name": "created", "verbose_name": "Создан", "is_date": True},
        {"name": "department_started", "verbose_name": "Начало работы"},
        {"name": "department_completed", "verbose_name": "Завершен"},
        {"name": "legal_name", "verbose_name": "Юрлицо"},
    ]
    
    context = {
        "fields": fields,
        "data": data,
    }
    
    return render(request, "departments/department_orders.html", context)

@login_required
def department_users(request, department_slug):
    from commerce.models import Department
    
    department = get_object_or_404(Department, slug=department_slug)
    users = department.get_department_users()
    
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
    statuses = DepartmentStatus.objects.filter(department=department).values("id", "name")
    
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
            
            if not created:
                old_executor = department_work.executor
                department_work.executor = executor
                department_work.save(update_fields=["executor"])
                
                message = f"Исполнитель изменен с {old_executor} на {executor}" if old_executor else f"Назначен исполнитель {executor}"
            else:
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
                {"name": "product", "verbose_name": "Продукт", "is_relation": True},
                {"name": "department_status", "verbose_name": "Состояние заказа", "is_relation": True},
                {"name": "created", "verbose_name": "Создан", "is_date": True},
                {"name": "department_started", "verbose_name": "Начало работы"},
                {"name": "department_completed", "verbose_name": "Завершен"},
                {"name": "legal_name", "verbose_name": "Юрлицо"},
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
                new_status = get_object_or_404(DepartmentStatus, id=int(status_id), department=department)
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
            
            if not created:
                old_status = department_work.status
                department_work.status = new_status
                
                if new_status.name.lower() in ["готово", "завершено", "выполнено", "готов"]:
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
            else:
                if new_status.name.lower() in ["готово", "завершено", "выполнено", "готов"]:
                    department_work.completed_at = timezone.now()
                    department_work.save(update_fields=["status", "started_at", "completed_at"])
                    message = f"Установлен статус '{new_status}'. Работа завершена."
                else:
                    department_work.save(update_fields=["status", "started_at"])
                    message = f"Установлен статус '{new_status}'"
            
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
                {"name": "product", "verbose_name": "Продукт", "is_relation": True},
                {"name": "department_status", "verbose_name": "Состояние заказа"},
                {"name": "created", "verbose_name": "Создан", "is_date": True},
                {"name": "department_started", "verbose_name": "Начало работы"},
                {"name": "department_completed", "verbose_name": "Завершен"},
                {"name": "legal_name", "verbose_name": "Юрлицо"},
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
def department_work_messages_list(request, order_work_id: int):
    """Список сообщений по работе отдела"""
    try:
        from types import SimpleNamespace
        
        order_work = get_object_or_404(OrderDepartmentWork, id=order_work_id)
        
        messages_qs = OrderDepartmentWorkMessage.objects.filter(
            order_work=order_work
        ).select_related("author", "recipient").order_by("-created")

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
            if not msg.is_read:
                if msg.recipient and msg.recipient.id == request.user.id:
                    unread_type = "received"
                elif msg.author.id == request.user.id and msg.recipient:
                    unread_type = "sent"
            
            messages_meta.append({
                "id": msg.id,
                "is_read": msg.is_read,
                "unread_type": unread_type,
            })

        OrderDepartmentWorkMessage.objects.filter(
            order_work=order_work,
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
                "id": f"order-work-messages-{order_work_id}",
            },
        )

        return JsonResponse(
            {
                "html": html,
                "messages_meta": messages_meta,
                "order_work_id": order_work_id,
                "order_id": order_work.order.id,
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
            message_text = (request.POST.get("message") or "").strip()
            recipient_id = request.POST.get("recipient") or request.POST.get("recipient_id")

            if not order_work_id:
                return JsonResponse(
                    {"status": "error", "message": "Не указана работа отдела"},
                    status=400,
                )

            if not message_text:
                return JsonResponse(
                    {"status": "error", "message": "Сообщение не может быть пустым"},
                    status=400,
                )

            try:
                order_work = get_object_or_404(OrderDepartmentWork, id=int(order_work_id))
            except (ValueError, TypeError):
                return JsonResponse(
                    {"status": "error", "message": "Неверный ID работы отдела"},
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

            message = OrderDepartmentWorkMessage.objects.create(
                order_work=order_work,
                author=request.user,
                recipient=recipient,
                message=message_text,
            )

            message_data = {
                "id": message.id,
                "author": str(message.author),
                "author_id": message.author.id,
                "recipient": str(message.recipient) if message.recipient else None,
                "recipient_id": message.recipient.id if message.recipient else None,
                "created": message.get_formatted_created(),
                "message": message.message,
                "is_read": message.is_read,
                "order_work_id": message.order_work.id,
                "order_id": message.order_work.order.id,
            }

            fields = [
                {"name": "author", "verbose_name": "Автор"},
                {"name": "recipient", "verbose_name": "Получатель"},
                {"name": "created", "verbose_name": "Дата", "is_date": True},
                {"name": "message", "verbose_name": "Сообщение"},
            ]

            html = render_to_string(
                "components/table_row.html",
                {
                    "item": message_data,
                    "fields": fields,
                },
            )

            return JsonResponse(
                {
                    "status": "success",
                    "id": message.id,
                    "html": html,
                    "message": message_data,
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
