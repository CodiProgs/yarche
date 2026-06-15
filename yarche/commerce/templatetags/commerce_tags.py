from django import template

register = template.Library()

@register.filter
def get_item(dictionary, key):
    """Get item from dictionary by key"""
    if not dictionary or not isinstance(dictionary, dict):
        return []
    # Преобразуем ключ в нужный тип
    if isinstance(key, str) and key.isdigit():
        key = int(key)
    result = dictionary.get(key)
    return result if result is not None else []
