from django.shortcuts import render, get_object_or_404, redirect
from django.http import JsonResponse
from django.views.decorators.http import require_POST
from django.contrib.auth.decorators import login_required
from .models import ChatMessage
from .services import get_ai_response
import json
from .models import ChatActionLog
from .services import restore_from_log
from django.core.cache import cache

@login_required
def chat_interface(request):
    messages = ChatMessage.objects.filter(user=request.user).order_by('-created_at')[:50]
    messages = reversed(messages)
    return render(request, 'chat/chat_interface.html', {'chat_history': messages})


@require_POST
@login_required
def send_chat_message(request):
    user_id = request.user.id
    cache_key = f"chat_debounce_{user_id}"

    if cache.get(cache_key):
        return JsonResponse({'error': 'Подождите немного...'}, status=429)
    
    cache.set(cache_key, True, 2)

    data = json.loads(request.body)
    user_message = data.get('message', '')

    if not user_message.strip():
        return JsonResponse({'error': 'Пустое сообщение'}, status=400)

    chat_msg = ChatMessage.objects.create(
        user=request.user,
        message=user_message
    )

    response_text, response_html = get_ai_response(user_message, request.user, user_message)

    chat_msg.response = response_text
    chat_msg.response_html = response_html
    chat_msg.is_processed = True
    chat_msg.save()

    return JsonResponse({
        'status': 'ok',
        'response_text': response_text,
        'response_html': response_html,
        'message_id': chat_msg.id
    })

@login_required
def chat_logs(request):
    """Страница просмотра всех логов действий чата"""
    if not hasattr(request.user, 'user_type') or request.user.user_type.name != "Администратор":
        return redirect('/smart-chat/')
    logs = ChatActionLog.objects.filter(user=request.user).order_by('-created_at')[:100]
    return render(request, 'chat/chat_logs.html', {'logs': logs})

@login_required
@require_POST
def restore_log(request, log_id):
    """Восстановление объекта из лога"""
    if not hasattr(request.user, 'user_type') or request.user.user_type.name != "Администратор":
        return JsonResponse({'status': 'error', 'message': 'Нет доступа'})
    success, message = restore_from_log(log_id, request.user)
    return JsonResponse({'status': 'success' if success else 'error', 'message': message})

@login_required
def log_detail(request, log_id):
    """Детали конкретного лога"""
    if not hasattr(request.user, 'user_type') or request.user.user_type.name != "Администратор":
        return redirect('/smart-chat/')
    log = get_object_or_404(ChatActionLog, id=log_id, user=request.user)
    return render(request, 'chat/log_detail.html', {'log': log})



