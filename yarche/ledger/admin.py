from django.contrib import admin
from .models import (
    BankAccountType,
    BankAccount,
    TransactionCategory,
    Transaction,
)


admin.site.register(BankAccountType)
admin.site.register(BankAccount)
admin.site.register(TransactionCategory)
admin.site.register(Transaction)
