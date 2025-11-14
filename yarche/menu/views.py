from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required
from .models import MenuCategory, MenuItem

@login_required
def category_menu(request, category_name):
    category = get_object_or_404(MenuCategory, name=category_name)
    
    user_menu_items = request.user.user_type.type_menu_items.all()
    available_menu_item_ids = [item.menu_item.id for item in user_menu_items]
    
    menu_items = MenuItem.objects.filter(
        category=category,
        id__in=available_menu_item_ids
    )
    
    context = {
        'category': category,
        'menu_items': menu_items,
    }
    
    return render(request, 'menu/category_menu.html', context)