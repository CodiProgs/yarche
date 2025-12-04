from django import template

register = template.Library()

@register.filter
def unique_categories(menu_items):
    seen = set()
    unique = []
    for item in menu_items:
        cat = getattr(item.menu_item, 'category', None)
        if cat and cat not in seen:
            unique.append(cat)
            seen.add(cat)
    return unique