from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from users.models import UserTypeMenuItem
from .models import MenuCategory

@login_required
def category_menu(request, category_name):
    category = get_object_or_404(MenuCategory, name=category_name)

    user_menu_items = UserTypeMenuItem.objects.filter(
        user_type=request.user.user_type,
        category=category
    ).order_by('order')

    menu_items = [item.menu_item for item in user_menu_items]

    context = {
        'category': category,
        'menu_items': menu_items,
        'user_menu_items': user_menu_items,
    }

    return render(request, 'menu/category_menu.html', context)