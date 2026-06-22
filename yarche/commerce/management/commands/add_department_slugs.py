from django.core.management.base import BaseCommand
from django.utils.text import slugify
from commerce.models import Department


class Command(BaseCommand):
    help = 'Заполняет поле slug у Department по предопределённой карте имен или автогенерирует slug'

    NAME_TO_SLUG = {
        'Технический отдел': 'tekhnicheskiy-otdel',
        'Бортогиб': 'bortogib',
        'Обучение': 'obuchenie',
        'Доставка': 'dostavka',
        'Монтаж': 'montazh',
        'Покраска': 'pokraska',
        'Сборка': 'sborka',
        'Сварка': 'svarka',
        'Раскрой': 'raskroy',
        'Накатка': 'nakatka',
        'Плоттер': 'plotter',
        'Цифровая полиграфия': 'tsifrovaya-poligrafiya',
        'ИФП': 'ifp',
        'Отдел снабжения': 'otdel-snabzheniya',
        'Начальник производства': 'nachalnik-proizvodstva',
        'Офис-менеджер': 'ofis-menedzher',
        'Отдел дизайна': 'dizayn',
        'Отдел продаж': 'otdel-prodazh',
        'Бухгалтерия': 'buhgalteriya',
        'Коммерческий директор': 'kommercheskiy-direktor',
        'Генеральный директор': 'generalny-direktor',
    }

    def handle(self, *args, **options):
        updated = []
        skipped = []
        for dept in Department.objects.all():
            name = (dept.name or '').strip()
            if not name:
                skipped.append((dept.id, 'empty name'))
                continue

            desired = None
            # Exact match mapping
            if name in self.NAME_TO_SLUG:
                desired = self.NAME_TO_SLUG[name]
            else:
                # Try case-insensitive match
                for k, v in self.NAME_TO_SLUG.items():
                    if k.lower() == name.lower():
                        desired = v
                        break

            if not desired:
                # Fallback: latinize by simple slugify; allow_unicode=False to get ascii where possible
                desired = slugify(name, allow_unicode=False)
                if not desired:
                    # If produced empty (e.g. only non-latin), allow unicode
                    desired = slugify(name, allow_unicode=True)

            # Ensure uniqueness: append id if collision
            qs = Department.objects.filter(slug=desired).exclude(id=dept.id)
            if qs.exists():
                desired = f"{desired}-{dept.id}"

            if dept.slug != desired:
                dept.slug = desired
                dept.save(update_fields=['slug'])
                updated.append((dept.id, name, desired))
            else:
                skipped.append((dept.id, name))

        self.stdout.write(self.style.SUCCESS(f'Updated {len(updated)} departments'))
        for u in updated:
            self.stdout.write(f'  id={u[0]} name="{u[1]}" slug="{u[2]}"')
        if skipped:
            self.stdout.write(self.style.WARNING(f'Skipped {len(skipped)} departments (already had slug or empty):'))
            for s in skipped[:50]:
                self.stdout.write(f'  id={s[0]} name="{s[1]}"')
