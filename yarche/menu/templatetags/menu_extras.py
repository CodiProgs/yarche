from django import template

register = template.Library()


@register.filter
def unique_categories(type_menu_items):
    categories = []
    seen_ids = set()
    for item in type_menu_items:
        if item.category_id and item.category_id not in seen_ids:
            categories.append(item.category)
            seen_ids.add(item.category_id)
    return categories