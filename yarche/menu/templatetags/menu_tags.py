from django import template

register = template.Library()


@register.inclusion_tag("components/menu.html", takes_context=True)
def render_menu(context):
    request = context["request"]

    menu_structure = get_menu_structure(request)

    return {"menu": menu_structure, "request": request}


def get_menu_structure(request):
    if not request.user.is_authenticated:
        return {}

    user_type = request.user.user_type
    if not user_type:
        return {}

    menu_links = (
        user_type.type_menu_items.all().select_related("menu_item").order_by("order")
    )

    current_path = request.path
    active_category = None

    menu = {}
    for link in menu_links:
        menu_item = link.menu_item

        category = link.category or "Без категории"

        if category not in menu:
            menu[category] = {"items": [], "is_active": False}

        item_data = {
            "title": link.name or menu_item.title,
            "url_name": menu_item.url_name,
            "icon_class": menu_item.icon_class,
        }

        if link.category and link.category_slug:
            item_data["full_url"] = f"/{link.category_slug}/{menu_item.url_name}/"
        else:
            item_data["full_url"] = f"/{menu_item.url_name}/"

        if current_path == item_data["full_url"]:
            menu[category]["is_active"] = True
            active_category = category

        menu[category]["items"].append(item_data)

    if active_category:
        menu[active_category]["is_active"] = True

    return menu
