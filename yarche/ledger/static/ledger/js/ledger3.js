import { DynamicFormHandler } from '/static/js/dynamicFormHandler.js'
import SelectHandler from '/static/js/selectHandler.js'
import { TableManager } from '/static/js/table.js'
import {
	collapseContainer,
	createLoader,
	enableResize,
	showError,
	showQuestion,
	showSuccess,
} from '/static/js/ui-utils.js'

/**
 * @file ledger.js
 * @description Основной модуль управления финансами (Ledger).
 * Путь: /static/ledger/js/ledger.js
 */

/* ==========================================
   1. КОНСТАНТЫ И КОНФИГУРАЦИЯ
   ========================================== */

const LedgerConfig = {
	BASE_URL: '/ledger/',
	ENTITIES: {
		BANK_ACCOUNTS: 'bank-accounts',
		TRANSACTION_CATEGORIES: 'transaction-categories',
	},
	CURRENCY: {
		SUFFIX: ' р.',
		DEFAULT: `0,00 р.`,
	},

	/** Генерирует стандартный конфиг для сущности */
	getBase(entity) {
		return {
			containerId: `${entity}-container`,
			tableId: `${entity}-table`,
			formId: `${entity}-form`,
			getUrl: `${this.BASE_URL}${entity}/`,
			addUrl: `${this.BASE_URL}${entity}/add/`,
			editUrl: `${this.BASE_URL}${entity}/edit/`,
			deleteUrl: `${this.BASE_URL}${entity}/delete/`,
			refreshUrl: `${this.BASE_URL}${entity}/refresh/`,
		}
	},
}

const configs = {
	bank_accounts: {
		...LedgerConfig.getBase(LedgerConfig.ENTITIES.BANK_ACCOUNTS),
		dataUrls: [
			{
				id: 'id_type',
				url: `${LedgerConfig.BASE_URL}${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/types/`,
			},
		],
	},
	transaction_categories: {
		...LedgerConfig.getBase(LedgerConfig.ENTITIES.TRANSACTION_CATEGORIES),
		dataUrls: [
			{
				id: 'id_type',
				url: [
					{ id: 'income', name: '+' },
					{ id: 'expense', name: '-' },
				],
			},
		],
	},
}

/* ==========================================
   2. УТИЛИТАРНЫЙ МОДУЛЬ (LedgerUtils)
   ========================================== */

const LedgerUtils = {
	/** Преобразует строку/число в целое число (копейки/единицы) */
	parseNumeric(text) {
		if (text == null) return 0
		const cleaned = String(text)
			.replace(LedgerConfig.CURRENCY.SUFFIX, '')
			.replace(/\s/g, '')
			.replace(',', '.')
		return Math.round(parseFloat(cleaned) || 0)
	},

	/** Форматирует число в валюту */
	formatCurrency(value, withSuffix = true) {
		const numericValue =
			typeof value === 'number' ? Math.round(value) : this.parseNumeric(value)
		const formatted = numericValue
			.toString()
			.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
		return withSuffix
			? `${formatted}${LedgerConfig.CURRENCY.SUFFIX}`
			: formatted
	},

	/** Форматирование даты */
	formatDate: date => date.toLocaleDateString('ru-RU'),

	formatDateForServer: date => {
		const d = val => String(val).padStart(2, '0')
		return `${date.getFullYear()}-${d(date.getMonth() + 1)}-${d(date.getDate())}`
	},
}

/* ==========================================
   3. УПРАВЛЕНИЕ КОНТЕНТНЫМ МЕНЮ (ContextMenuManager)
   ========================================== */

const ContextMenuManager = {
	elements: {},

	init() {
		this.elements = {
			menu: document.getElementById('context-menu'),
			buttons: {
				add: document.getElementById('add-button'),
				edit: document.getElementById('edit-button'),
				del: document.getElementById('delete-button'),
				payment: document.getElementById('payment-button'),
				hide: document.getElementById('hide-button'),
				settle: document.getElementById('settle-debt-button'),
				settleAll: document.getElementById('settle-debt-all-button'),
				repayEdit: document.getElementById('repayment-edit-button'),
			},
		}

		if (!this.elements.menu) return

		this.bindEvents()
	},

	bindEvents() {
		document.addEventListener('contextmenu', e => this.handleContextMenu(e))
		document.addEventListener('click', () => this.hide())
		this.initTouchSupport()
	},

	hide() {
		if (this.elements.menu) this.elements.menu.style.display = 'none'
	},

	/** Настройка видимости кнопок через Map */
	updateVisibility(visibilityMap) {
		Object.entries(this.elements.buttons).forEach(([key, btn]) => {
			if (btn) btn.style.display = visibilityMap[key] ? 'block' : 'none'
		})
	},

	/** Позиционирование меню с учетом вьюпорта */
	show(pageX, pageY) {
		const { menu } = this.elements
		menu.style.display = 'block'

		const size = { w: menu.offsetWidth || 200, h: menu.offsetHeight || 200 }
		const viewport = { w: window.innerWidth, h: window.innerHeight }
		const offset = 10

		let left = pageX + offset
		if (left + size.w > viewport.w + window.scrollX) {
			left = pageX - size.w - offset
		}

		let top = pageY + offset
		if (top + size.h > viewport.h + window.scrollY) {
			top = pageY - size.h - offset
		}

		menu.style.left = `${Math.max(0, left)}px`
		menu.style.top = `${Math.max(0, top)}px`
	},

	handleContextMenu(e) {
		const row = e.target.closest(
			'tbody tr:not(.table__row--summary):not(.table__row--empty)',
		)
		const table = e.target.closest('table')
		const content = e.target.closest('.content')
		const debtorItem = e.target.closest('.debtors-office-list__row-item')

		if (row && table) {
			e.preventDefault()
			this.handleTableSpecifics(table, row)
			this.show(e.pageX, e.pageY)
			return
		}

		if (content) {
			e.preventDefault()
			this.updateVisibility({ add: true })
			this.show(e.pageX, e.pageY)
		}

		// Логика для debtorItem (должники)
		if (debtorItem && this.elements.buttons.settle) {
			this.handleDebtorSpecifics(debtorItem)
		}
	},

	handleTableSpecifics(table, row) {
		const id = table.id
		const isBank = id === 'transactions-bank-accounts-table'

		const config = {
			add: !isBank,
			edit: !isBank,
			del: !isBank,
			hide: !isBank,
			payment: true,
			settleAll: id === 'summary-profit',
			repayEdit: id?.startsWith('branch-repayments-'),
		}

		// Логика инвесторов
		if (id === 'investors-table') {
			const cell = document.querySelector('td.table__cell--selected')
			const colName = cell
				? table.querySelectorAll('thead th')[cell.cellIndex]?.dataset.name
				: null
			if (['initial_balance', 'balance'].includes(colName)) {
				config.settle = true
				this.elements.buttons.settle.textContent = 'Изменить сумму'
				this.elements.buttons.settle.dataset.type =
					colName === 'initial_balance' ? 'initial' : 'balance'
			}
		} else if (
			!isBank &&
			!id?.startsWith('branch-repayments-') &&
			id !== 'investor-operations-table'
		) {
			config.settle = true
			this.elements.buttons.settle.textContent = 'Погасить долг'
		}

		// Cash Flow Logic
		if (id === 'cash_flow-table') {
			const purpose =
				row.querySelector('[data-name="purpose"]')?.textContent.trim() ||
				row.cells[2]?.textContent.trim()
			if (
				['Перевод', 'Инкассация', 'Погашение долга поставщика'].includes(
					purpose,
				)
			) {
				config.edit = false
				config.del = false
			}
		}

		this.updateVisibility(config)
	},

	initTouchSupport() {
		let touchTimer
		document.addEventListener(
			'touchstart',
			e => {
				if (e.touches.length > 1) return
				const touch = e.touches[0]
				touchTimer = setTimeout(() => {
					const event = new MouseEvent('contextmenu', {
						bubbles: true,
						clientX: touch.clientX,
						clientY: touch.clientY,
						pageX: touch.pageX,
						pageY: touch.pageY,
					})
					e.target.dispatchEvent(event)
				}, 600)
			},
			{ passive: true },
		)

		document.addEventListener('touchmove', () => clearTimeout(touchTimer), {
			passive: true,
		})
		document.addEventListener('touchend', () => clearTimeout(touchTimer), {
			passive: true,
		})
	},
}

/* ==========================================
   4. СЕРВИС ОБНОВЛЕНИЯ UI (LedgerDOMService)
   ========================================== */

const LedgerDOMService = {
	/** Обновляет строку счета в таблице транзакций */
	updateBankAccountRow(accountName, amountChange) {
		const table = document.getElementById('transactions-bank-accounts-table')
		if (!table) return

		const row = Array.from(table.querySelectorAll('tbody tr')).find(
			r => r.cells[0]?.textContent?.trim() === accountName,
		)

		if (!row || row.cells.length < 4) return

		let baseBalance = parseInt(row.dataset.baseBalance, 10)
		if (isNaN(baseBalance)) {
			const currentShift = LedgerUtils.parseNumeric(row.cells[2].textContent)
			const total = LedgerUtils.parseNumeric(row.cells[3].textContent)
			baseBalance = total - currentShift
			row.dataset.baseBalance = baseBalance
		}

		const newShift =
			(LedgerUtils.parseNumeric(row.cells[2].textContent) || 0) +
			(Number(amountChange) || 0)
		row.cells[2].textContent = LedgerUtils.formatCurrency(newShift)
		row.cells[3].textContent = LedgerUtils.formatCurrency(
			baseBalance + newShift,
		)
	},
}

// Запуск модуля меню
const addMenuHandler = () => ContextMenuManager.init()

/* ==========================================
   5. СЕРВИС УПРАВЛЕНИЯ БАЛАНСАМИ (LedgerBalanceService)
   ========================================== */

const LedgerBalanceService = {
	/** * Полный пересчет состояния счетов на основе видимых транзакций
	 */
	recompute() {
		const bankTable = document.getElementById(
			'transactions-bank-accounts-table',
		)
		const transTable = document.getElementById('transactions-table')
		if (!bankTable) return

		const accountRows = bankTable.querySelectorAll(
			'tbody tr:not(.table__row--summary)',
		)
		const shiftMap = {}
		const baseMap = {}

		// 1. Собираем базу
		accountRows.forEach(row => {
			const name = row.cells[0]?.textContent?.trim()
			if (!name || row.classList.contains('table__row--empty')) return // Пропускаем пустые строки

			let base = parseInt(row.dataset.baseBalance, 10)

			if (isNaN(base)) {
				// Проверяем, существуют ли ячейки [2] и [3] прежде чем читать их текст
				const shiftCell = row.cells[2]
				const totalCell = row.cells[3]

				if (shiftCell && totalCell) {
					base =
						LedgerUtils.parseNumeric(totalCell.textContent) -
						LedgerUtils.parseNumeric(shiftCell.textContent)
					row.dataset.baseBalance = base
				} else {
					console.warn(
						`Строка счета "${name}" не имеет нужных колонок (нужны 2 и 3).`,
					)
					base = 0 // Значение по умолчанию, чтобы не упал весь скрипт
				}
			}

			baseMap[name] = base
			shiftMap[name] = 0
		})

		if (transTable) {
			transTable
				.querySelectorAll(
					'tbody tr:not(.table__row--summary):not(.table__row--empty)',
				)
				.forEach(tr => {
					const accCell = tr.cells[1]
					const amtCell = tr.cells[2]

					if (accCell && amtCell) {
						const acc = accCell.textContent?.trim()
						const amt = LedgerUtils.parseNumeric(amtCell.textContent)
						if (acc && acc in shiftMap) {
							shiftMap[acc] += amt
						}
					}
				})
		}

		accountRows.forEach(row => {
			const name = row.cells[0]?.textContent?.trim()
			if (!name) return

			const base = baseMap[name] || 0
			const shift = shiftMap[name] || 0

			if (row.cells[1] && row.cells[2] && row.cells[3]) {
				row.cells[2].textContent = LedgerUtils.formatCurrency(shift)

				const initialVal = LedgerUtils.parseNumeric(row.cells[1].textContent)
				row.cells[3].textContent = LedgerUtils.formatCurrency(
					shift + initialVal,
				)
			}
		})

		this.updateSummaries()
	},

	updateSummaries(options = {}) {
		if (options.rowToRemove) options.rowToRemove.remove()
		if (options.relatedRowToRemove) options.relatedRowToRemove.remove()

		this.recompute()

		if (document.getElementById('transactions-table')) {
			TableManager.calculateTableSummary('transactions-table', ['amount'])
		}

		TableManager.calculateTableSummary(
			'transactions-bank-accounts-table',
			['balance', 'shift_amount', 'total_amount'],
			{ grouped: true, total: true },
		)
	},
}

/* ==========================================
   6. МЕНЕДЖЕР ТРАНЗАКЦИЙ (TransactionManager)
   ========================================== */

const TransactionManager = {
	/** Инициализация формы (Приход/Расход/Перевод) */
	async initForm(config, editId = null) {
		const formHandler = new DynamicFormHandler(config)
		await formHandler.init(editId)

		if (document.getElementById('amount')) {
			setupCurrencyInput('amount', editId !== null)
		}
		return formHandler
	},

	/** Обработка успешного сохранения */
	async handleSuccess(result, tableId, isEdit = false, prevData = {}) {
		const processRow = async data => {
			const method = isEdit ? 'updateTableRow' : 'addTableRow'
			const row = await TableManager[method](data, tableId)
			if (row) row.setAttribute('data-id', data.id)
			return row
		}

		try {
			const { outgoing_transaction: out, incoming_transaction: inc } = result

			if (out && inc) {
				await processRow(out)
				await processRow(inc)
			} else if (result.id) {
				await processRow(result)
			}

			LedgerBalanceService.updateSummaries()
			if (typeof colorizeTableAmounts === 'function')
				colorizeTableAmounts(tableId)

			showSuccess(isEdit ? 'Изменения сохранены' : 'Транзакция добавлена')
		} catch (error) {
			console.error('Success handling error:', error)
			showError('Ошибка при обновлении интерфейса')
		}
	},

	/** Логика редактирования (выбор типа и загрузка формы) */
	async edit(transactionId, row, tableId, isClosed = false, isAllMode = false) {
		const table = document.getElementById(tableId)
		const headers = Array.from(table.querySelectorAll('thead th'))
		const getColIdx = name => headers.findIndex(th => th.dataset.name === name)

		const typeIdx = getColIdx('type')
		const accIdx = getColIdx('bank_account')
		const amtIdx = getColIdx('amount')

		const cells = row.querySelectorAll('td')
		const typeValue =
			cells[typeIdx]?.dataset.value || cells[typeIdx]?.textContent.trim()

		// Конфигурация по типам (упрощенный маппинг)
		const typeMap = {
			Приход: {
				url: 'add_transaction',
				ctx: { type: 'income' },
				data: 'categories_income',
			},
			Расход: {
				url: 'add_transaction',
				ctx: { type: 'expense' },
				data: 'categories_expense',
			},
			'Оплата заказа': { url: 'add_order_payment', data: 'order_and_banks' },
			'Перевод между счетами': { url: 'add_transfer', data: 'double_banks' },
			'Внос на ЛС клиента': {
				url: 'deposit_client_balance',
				data: 'clients_and_banks',
			},
			'Оплата с ЛС клиента': { url: 'ls_payment' },
		}

		const tCfg = typeMap[typeValue]
		if (!tCfg)
			return showError(
				`Тип "${typeValue}" не поддерживается для редактирования`,
			)

		const config = {
			submitUrl: `/ledger/transactions/${isClosed ? 'closed/' : ''}edit/`,
			queryParams: isAllMode ? { table: 'all' } : {},
			tableId,
			formId: 'transactions-form',
			modalConfig: {
				url: `/components/ledger/${tCfg.url}/`,
				title: `Редактирование: ${typeValue}`,
				context: tCfg.ctx || {},
			},
			onSuccess: res => this.handleSuccess(res, tableId, true),
		}

		// TODO: Добавить динамическую подгрузку dataUrls на основе tCfg.data

		await this.initForm(config, transactionId)
		this._postInitFormLogic(typeValue, transactionId, isAllMode)
	},

	/** Специфичные действия после отрисовки формы */
	async _postInitFormLogic(typeValue, transactionId, isAllMode) {
		const form = document.getElementById('transactions-form')
		if (!form) return

		if (isAllMode) {
			form
				.querySelector('#report_date')
				?.closest('.modal-form__group')
				?.style.setProperty('display', 'block')
		}

		if (typeValue === 'Оплата заказа') {
			const orderId = form.querySelector('#order')?.value
			if (orderId) {
				const debt = await fetchOrderDebt(
					orderId,
					LedgerUtils.parseNumeric(form.querySelector('#amount')?.value),
				)
				displayOrderDebt('debt_amount', debt)
			}
		} else if (typeValue === 'Оплата с ЛС клиента') {
			const clientId = form.querySelector('#client')?.value
			const orderId = form.querySelector('#order')?.value
			if (clientId && orderId) {
				await _setupLSPaymentLogic(
					form,
					clientId,
					orderId,
					LedgerUtils.parseNumeric(form.querySelector('#amount')?.value),
				)
			}
		}
	},
}

/* ==========================================
   7. ОБЕРТКИ И ХЕЛПЕРЫ
   ========================================== */

const withLoader = async asyncFn => {
	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		return await asyncFn()
	} finally {
		loader.remove()
	}
}

// Совместимость со старым кодом
const recomputeBankAccountsFromTransactions = () =>
	LedgerBalanceService.recompute()
const updateBankAccountSummary = opt =>
	LedgerBalanceService.updateSummaries(opt)
const updateBankAccountSummaryAfterAdd = () =>
	LedgerBalanceService.updateSummaries()
const editTransaction = (...args) => TransactionManager.edit(...args)
/* ==========================================
   8. СЕРВИС ЗАКАЗОВ И КЛИЕНТОВ (OrderService)
   ========================================== */

const OrderService = {
	/** Получает сумму долга по заказу */
	async fetchDebt(orderId, currentPaymentAmount = 0) {
		if (!orderId) return null

		return await withLoader(async () => {
			try {
				const response = await fetch(`/commerce/orders/${orderId}/debt/`)
				if (!response.ok)
					throw new Error(`HTTP error! status: ${response.status}`)

				const data = await response.json()
				return parseFloat(data.debt) + Number(currentPaymentAmount)
			} catch (error) {
				console.error('Error fetching order debt:', error)
				showError('Не удалось загрузить долг по заказу.')
				return null
			}
		})
	},

	/** Отображает долг в UI */
	displayDebt(inputId, debtValue) {
		const input = document.getElementById(inputId)
		if (!input) return

		const isValid = debtValue !== null && !isNaN(debtValue)
		input.value = isValid
			? LedgerUtils.formatCurrency(debtValue)
			: LedgerConfig.CURRENCY.DEFAULT
	},

	/** Обновляет список заказов клиента в выпадающем списке */
	async updateOrdersList(
		clientId,
		selectElement,
		isFirstLoad = false,
		targetOrderId = null,
	) {
		const selectParent = selectElement?.closest('.select')
		if (!selectParent)
			return console.error('Required select elements not found.')

		const input = selectParent.querySelector('.select__input')
		const text = selectParent.querySelector('.select__text')

		if (input) input.value = ''
		if (text) text.textContent = 'Загрузка заказов...'

		await withLoader(async () => {
			try {
				const url = `/commerce/orders/ids/?client=${clientId}${targetOrderId ? `&order=${targetOrderId}` : ''}`
				const response = await fetch(url, {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				if (!response.ok) throw new Error(`Status: ${response.status}`)

				const data = await response.json()
				const setupMethod = isFirstLoad ? 'setupSelects' : 'updateSelectOptions'

				await SelectHandler[setupMethod](
					isFirstLoad ? { data, select: selectParent } : selectParent,
					data,
				)

				if (targetOrderId) {
					await new Promise(resolve => setTimeout(resolve, 50))
					this._handleSelection(selectParent, data, targetOrderId, input, text)
				} else if (text) {
					text.textContent = data.length > 0 ? 'Выберите заказ' : 'Нет заказов'
				}
			} catch (error) {
				console.error('Error updating orders list:', error)
				showError('Не удалось загрузить список заказов.')
				if (text) text.textContent = 'Ошибка загрузки'
			} finally {
				this.displayDebt('debt_amount', null)
			}
		})
	},

	/** Внутренний помощник для клика по опции в кастомном селекте */
	_handleSelection(parent, data, targetId, input, text) {
		const options = parent.querySelectorAll('.select__option')
		const targetStr = String(targetId)

		for (const option of options) {
			if (option.dataset.value === targetStr) {
				option.click()
				return
			}
		}

		const item = data.find(i => String(i.id) === targetStr)
		if (item && input) {
			input.value = item.id
			if (text) text.textContent = item.name || `Заказ #${item.id}`
		}
	},
}

/* ==========================================
   9. ИНИЦИАЛИЗАТОР СТРАНИЦ (PageInitializer)
   ========================================== */

const PageInitializer = {
	/** Страница платежей */
	async initPayments() {
		await TableManager.init()
		await TableManager.createColumnsForTable('payments-table', [
			{ name: 'id' },
			{ name: 'manager', url: '/users/managers/' },
			{ name: 'completed_date' },
			{ name: 'product', url: '/commerce/products/list/' },
			{ name: 'amount' },
			{ name: 'remaining_debt' },
			{ name: 'order' },
			{ name: 'client', url: '/commerce/clients/list/' },
			{ name: 'legal_name' },
			{ name: 'comment' },
		])

		// Автозаполнение заказа из URL
		const orderId = new URL(window.location.href).searchParams.get('order_id')
		const orderInput = document.querySelector(
			'input[name="order"].create-form__input',
		)
		if (orderId && orderInput) {
			orderInput.value = orderId
			orderInput.dispatchEvent(new Event('input', { bubbles: true }))
		}

		this._handleRestrictedUser('id_manager')
		colorizeTableAmounts('payments-table')
	},

	/** Страница реестра транзакций (Архив) */
	async initTransactions() {
		await TableManager.init()
		TableManager.createColumnsForTable(
			'transactions-table',
			[
				{ name: 'id' },
				{
					name: 'category',
					url: `/ledger/${LedgerConfig.ENTITIES.TRANSACTION_CATEGORIES}/list/`,
				},
				{
					name: 'bank_account',
					url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
				},
				{ name: 'amount' },
				{ name: 'client', url: '/commerce/clients/list/' },
				{ name: 'order' },
				{ name: 'type', url: '/ledger/transaction-types/' },
				{ name: 'comment' },
				{ name: 'created' },
				{ name: 'report_date' },
			],
			['amount'],
		)

		// Инициализация фильтров дат (предустановка -7 дней)
		const today = new Date()
		const start = new Date()
		start.setDate(today.getDate() - 7)

		// Внешние функции initDatePicker должны быть доступны глобально
		this.pickers = {
			start:
				typeof initDatePicker === 'function'
					? initDatePicker(
							'#start-date',
							'.date-filter__icon[data-target="start-date"]',
							LedgerUtils.formatDate(start),
						)
					: null,
			end:
				typeof initDatePicker === 'function'
					? initDatePicker(
							'#end-date',
							'.date-filter__icon[data-target="end-date"]',
							LedgerUtils.formatDate(today),
						)
					: null,
		}

		this._setupPagination()
	},

	/** Страница текущей смены */
	initCurrentShift() {
		collapseContainer('current-shift-left', 'Баланс')
		enableResize('current-shift-left')
		colorizeTableAmounts('transactions-table')
		TableManager.init()

		// Расчет итогов
		LedgerBalanceService.updateSummaries()

		// Простановка ID строкам (из JSON в шаблоне)
		const dataElem = document.getElementById('transaction-ids-data')
		if (dataElem?.textContent) {
			try {
				const ids = JSON.parse(dataElem.textContent)
				this._setRowIds(ids, 'transactions-table')
			} catch (e) {
				console.error('ID parse error', e)
			}
		}

		this._setupActionButtons()
	},

	/** Вспомогательные методы инициализации */
	_handleRestrictedUser(managerInputId) {
		const restrictedData =
			document.getElementById('restricted-user')?.textContent
		if (!restrictedData) return
		try {
			const userName = JSON.parse(restrictedData)
			const container = document
				.getElementById(managerInputId)
				?.closest('.select')
			if (container) {
				container.classList.add('disabled')
				const txt = container.querySelector('.select__text')
				if (txt) txt.textContent = userName
			}
		} catch (e) {}
	},

	_setRowIds(ids, tableId) {
		const rows = document.querySelectorAll(
			`#${tableId} tbody tr:not(.table__row--summary)`,
		)
		rows.forEach((row, i) => {
			if (ids[i]) row.setAttribute('data-id', ids[i])
		})
	},

	_setupActionButtons() {
		;['edit-button', 'delete-button'].forEach(id => {
			document.getElementById(id)?.addEventListener('click', () => {
				const rowId = TableManager.getSelectedRowId('transactions-table')
				const row = rowId
					? TableManager.getRowById(rowId, 'transactions-table')
					: null
				if (!row) return showError('Выберите строку')

				if (id === 'edit-button')
					TransactionManager.edit(rowId, row, 'transactions-table')
				else deleteTransaction(rowId, row)
			})
		})
	},
}

/* ==========================================
   10. ГЛОБАЛЬНЫЕ ФУНКЦИИ (Совместимость)
   ========================================== */

const fetchOrderDebt = (id, amt) => OrderService.fetchDebt(id, amt)
const displayOrderDebt = (id, val) => OrderService.displayDebt(id, val)
const updateClientOrdersList = (...args) =>
	OrderService.updateOrdersList(...args)

function colorizeTableAmounts(tableId) {
	const table = document.getElementById(tableId)
	if (!table) return

	const amountIdx = Array.from(table.querySelectorAll('thead th')).findIndex(
		th => th.dataset.name === 'amount',
	)
	if (amountIdx === -1) return

	table.querySelectorAll('tbody tr:not(.table__row--summary)').forEach(row => {
		const cell = row.cells[amountIdx]
		if (!cell) return
		const val = LedgerUtils.parseNumeric(cell.textContent)
		cell.classList.remove('text-red', 'text-green')
		if (val < 0) cell.classList.add('text-red')
		else if (val > 0) cell.classList.add('text-green')
		cell.textContent = LedgerUtils.formatCurrency(val)
	})
}

const deleteTransaction = (id, row) => {
	showQuestion('Удалить запись?', 'Удаление', async () => {
		await withLoader(async () => {
			const data = await TableManager.sendDeleteRequest(
				id,
				'/ledger/transactions/delete/',
				'transactions-table',
			)
			if (data?.status === 'success') {
				const related = data.related_transaction_id
					? TableManager.getRowById(
							data.related_transaction_id,
							'transactions-table',
						)
					: null
				LedgerBalanceService.updateSummaries({
					rowToRemove: row,
					relatedRowToRemove: related,
				})
				showSuccess('Удалено')
			}
		})
	})
}

/* ==========================================
   11. РАСШИРЕННОЕ УПРАВЛЕНИЕ ТРАНЗАКЦИЯМИ
   ========================================== */

/** Конфигурация типов транзакций для модальных окон */
TransactionManager.types = {
	'income-button': {
		submitUrl: '/ledger/transactions/add/',
		modalConfig: {
			title: 'Приход',
			context: { type: 'income' },
			url: '/components/ledger/add_transaction/',
		},
		dataUrls: [
			{
				id: 'bank_account',
				url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
			},
			{
				id: 'category',
				url: `/ledger/${LedgerConfig.ENTITIES.TRANSACTION_CATEGORIES}/list/?type=income`,
			},
		],
	},
	'expense-button': {
		submitUrl: '/ledger/transactions/add/',
		modalConfig: {
			title: 'Расход',
			context: { type: 'expense' },
			url: '/components/ledger/add_transaction/',
		},
		dataUrls: [
			{
				id: 'bank_account',
				url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
			},
			{
				id: 'category',
				url: `/ledger/${LedgerConfig.ENTITIES.TRANSACTION_CATEGORIES}/list/?type=expense`,
			},
		],
	},
	'transfer-button': {
		submitUrl: '/ledger/transfers/add/',
		modalConfig: { title: 'Перевод', url: '/components/ledger/add_transfer/' },
		dataUrls: [
			{
				id: 'source_bank_account',
				url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
			},
			{
				id: 'destination_bank_account',
				url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
			},
		],
	},
	'order-payment-button': {
		submitUrl: '/ledger/order-payments/add/',
		modalConfig: {
			title: 'Оплата заказа',
			url: '/components/ledger/add_order_payment/',
		},
		dataUrls: [
			{
				id: 'order',
				url: '/commerce/orders/ids/',
				includeValuesInSearch: true,
			},
			{
				id: 'bank_account',
				url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
			},
		],
	},
	'deposit-button': {
		submitUrl: '/ledger/client-balance/deposit/',
		modalConfig: {
			title: 'Зачисление на ЛС',
			url: '/components/ledger/deposit_client_balance/',
		},
		dataUrls: [
			{ id: 'client', url: '/commerce/clients/list/' },
			{
				id: 'bank_account',
				url: `/ledger/${LedgerConfig.ENTITIES.BANK_ACCOUNTS}/list/`,
			},
		],
	},
	'ls-payment-button': {
		submitUrl: '/ledger/client-balance/payment/',
		modalConfig: {
			title: 'Оплата с ЛС',
			url: '/components/ledger/ls_payment/',
		},
	},
}

/** Инициализация кнопок создания в интерфейсе */
TransactionManager.initActionButtons = function () {
	const baseConfig = {
		tableId: 'transactions-table',
		formId: 'transactions-form',
		onSuccess: res =>
			handleTransactionSuccess(res, 'transactions-table', false),
	}

	Object.entries(this.types).forEach(([id, cfg]) => {
		const btn = document.getElementById(id)
		if (!btn) return

		btn.addEventListener('click', async () => {
			const finalConfig = { ...baseConfig, ...cfg }
			await initTransactionForm(finalConfig, null)

			if (id === 'order-payment-button')
				this._bindOrderDebtLogic(finalConfig.formId)
			if (id === 'ls-payment-button')
				this._initLSPaymentModal(finalConfig.formId)
		})
	})
}

/** Логика авто-подгрузки долга при выборе заказа в форме */
TransactionManager._bindOrderDebtLogic = function (formId) {
	const dropdown = document
		.getElementById(formId)
		?.querySelector('#order')
		?.closest('.select')
		?.querySelector('.select__dropdown')
	if (!dropdown) return

	dropdown.addEventListener('click', async e => {
		const option = e.target.closest('.select__option')
		if (option) {
			const debt = await OrderService.fetchDebt(option.dataset.value, 0)
			OrderService.displayDebt('debt_amount', debt)
		}
	})
}

/** Сложная логика модального окна оплаты с ЛС (таблица клиентов внутри формы) */
TransactionManager._initLSPaymentModal = async function (formId) {
	const container = document.getElementById('clients-table--container')
	if (!container) return

	const loader = createLoader()
	container.appendChild(loader)

	try {
		const res = await fetch('/commerce/clients/balances/', {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		const data = await res.json()
		loader.remove()

		if (!data.html || !data.ids?.length) {
			container.innerHTML = '<p>Нет клиентов с балансом.</p>'
			return
		}

		const table = TableManager.replaceEntireTable(
			data.html,
			'clients-table--container',
			'clients-table',
		)
		const inputClient = document.getElementById('client')
		const orderSelect = document.getElementById('order')
		const rows = Array.from(
			table.querySelectorAll('tbody tr:not(.table__row--summary)'),
		)

		const selectClient = async (idx, row) => {
			rows.forEach(r => r.classList.remove('table__row--selected'))
			row.classList.add('table__row--selected')
			inputClient.value = data.ids[idx].id
			await OrderService.updateOrdersList(data.ids[idx].id, orderSelect, true)
			OrderService.displayDebt('debt_amount', null)
		}

		if (rows[0]) await selectClient(0, rows[0])

		table.addEventListener('click', e => {
			const row = e.target.closest('tbody tr:not(.table__row--summary)')
			const idx = rows.indexOf(row)
			if (idx !== -1) selectClient(idx, row)
		})

		this._bindOrderDebtLogic(formId)
	} catch (error) {
		loader.remove()
		showError('Ошибка загрузки клиентов')
	}
}

/* ==========================================
   12. ОБНОВЛЕННЫЙ PAGE INITIALIZER
   ========================================== */

/** Страница "Все транзакции" (Архив с пагинацией) */
PageInitializer.initAllTransactions = async function () {
	const tableId = 'all_transaction-table'
	const container = document.getElementById('all_transaction-container')
	if (!container) return

	const nav = {
		pageInput: document.getElementById('current-page'),
		totalSpan: document.getElementById('total-pages'),
		btns: {
			refresh: document.getElementById('refresh'),
			next: document.getElementById('next-page'),
			prev: document.getElementById('prev-page'),
			first: document.getElementById('first-page'),
			last: document.getElementById('last-page'),
			edit: document.getElementById('edit-button'),
			delete: document.getElementById('delete-button'),
		},
	}

	const updateTable = async page => {
		return await withLoader(async () => {
			try {
				const res = await fetch(`/ledger/transactions/table/?page=${page}`, {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				const data = await res.json()
				if (res.ok && data.html) {
					const tbody = document.getElementById(tableId)?.querySelector('tbody')
					if (tbody) tbody.innerHTML = data.html
					colorizeTableAmounts(tableId)
					TableManager.calculateTableSummary(tableId, ['amount'])
					this._updatePaginationUI(nav, data.context, tableId)
				}
			} catch (e) {
				console.error('Archive update error', e)
			}
		})
	}

	// Привязка событий пагинации
	nav.btns.refresh?.addEventListener('click', () =>
		updateTable(parseInt(nav.pageInput?.value) || 1),
	)
	nav.btns.next?.addEventListener('click', () =>
		updateTable((parseInt(nav.pageInput?.value) || 1) + 1),
	)
	nav.btns.prev?.addEventListener('click', () =>
		updateTable((parseInt(nav.pageInput?.value) || 1) - 1),
	)
	nav.btns.first?.addEventListener('click', () => updateTable(1))
	nav.btns.last?.addEventListener('click', () =>
		updateTable(parseInt(nav.totalSpan?.textContent) || 1),
	)

	nav.btns.edit?.addEventListener('click', () =>
		this._handleArchiveRowAction('edit', tableId),
	)
	nav.btns.delete?.addEventListener('click', () =>
		this._handleArchiveRowAction('delete', tableId),
	)

	updateTable(1)
}

/** Страница балансов */
PageInitializer.initBalances = function () {
	TableManager.calculateTableSummary(
		'bank_accounts_balances-table',
		['balance'],
		{ grouped: true, total: true },
	)
}

/** Вспомогательный UI пагинации */
PageInitializer._updatePaginationUI = function (nav, ctx, tableId) {
	const { current_page, total_pages, transaction_ids = [] } = ctx || {}
	if (nav.pageInput) {
		nav.pageInput.value = current_page || 1
		nav.pageInput.disabled = !total_pages
	}
	if (nav.totalSpan) nav.totalSpan.textContent = total_pages || 1

	nav.btns.next.disabled = current_page >= total_pages
	nav.btns.prev.disabled = current_page <= 1

	// Маппинг ID к строкам
	const rows = document.querySelectorAll(
		`#${tableId} tbody tr:not(.table__row--summary)`,
	)
	rows.forEach((row, i) => {
		if (transaction_ids[i]) row.setAttribute('data-id', transaction_ids[i])
	})
}

/** Обработка действий в архиве (с проверкой прав) */
PageInitializer._handleArchiveRowAction = async function (action, tableId) {
	const row = TableManager.getSelectedRow(tableId)
	const id = row?.getAttribute('data-id')
	if (!id) return showError('Выберите строку')

	if (action === 'edit') {
		const hasPerm = await this._checkPermission('edit_closed_transactions')
		if (hasPerm) TransactionManager.edit(id, row, tableId, true)
	} else {
		deleteClosedTransaction(id, row, tableId)
	}
}

PageInitializer._checkPermission = async function (perm) {
	try {
		const res = await fetch(`/users/check-permission/?permission=${perm}`, {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		if (!res.ok) showError('Нет прав на это действие')
		return res.ok
	} catch (e) {
		return false
	}
}

/* ==========================================
   13. ГЛОБАЛЬНЫЕ ФУНКЦИИ (Закрытие смены)
   ========================================== */

const deleteClosedTransaction = (id, row, tableId) => {
	showQuestion('Удалить запись?', 'Удаление', async () => {
		await withLoader(async () => {
			const data = await TableManager.sendDeleteRequest(
				id,
				'/ledger/transactions/closed/delete/',
				tableId,
			)
			if (data?.status === 'success') {
				row?.remove()
				if (data.related_transaction_id)
					TableManager.getRowById(
						data.related_transaction_id,
						tableId,
					)?.remove()
				TableManager.calculateTableSummary(tableId, ['amount'])
				showSuccess('Удалено')
			}
		})
	})
}

/* ==========================================
   14. ГЛОБАЛЬНЫЕ UI-ЭЛЕМЕНТЫ (UIHandler)
   ========================================== */

const UIHandler = {
	/** Инициализирует функционал скрытия строк и счетчик */
	initGlobalFeatures() {
		const content = document.querySelector('.content')
		if (!content) return

		// Создаем плавающий счетчик скрытых строк
		const counter = document.createElement('div')
		counter.id = 'hidden-rows-counter'
		Object.assign(counter.style, {
			position: 'absolute',
			bottom: '1px',
			right: '10px',
			background: 'rgba(255, 255, 255, 0.8)',
			padding: '5px 10px',
			borderRadius: '3px',
			fontSize: '12px',
			zIndex: '1000',
			border: '1px solid #ccc',
			display: 'none',
		})
		content.appendChild(counter)

		const updateCounter = () => {
			const hidden = document.querySelectorAll('.hidden-row').length
			counter.style.display = hidden > 0 ? 'block' : 'none'
			counter.textContent = `Скрыто: ${hidden}`
		}

		// Обработчик кнопки "Скрыть"
		document.getElementById('hide-button')?.addEventListener('click', () => {
			const selected = document.querySelector('.table__row--selected')
			if (selected) {
				selected.classList.add('hidden-row')
				selected.style.display = 'none'
				updateCounter()
			}
		})

		// Обработчик кнопки "Показать все"
		document
			.getElementById('show-all-button')
			?.addEventListener('click', () => {
				document.querySelectorAll('tr.hidden-row').forEach(row => {
					row.classList.remove('hidden-row')
					row.style.display = ''
				})
				updateCounter()
			})
	},

	/** Модальное окно выбора типа транзакции (для страницы "Все") */
	showAddTransactionModal() {
		const modal = document.createElement('div')
		modal.className = 'modal'
		modal.innerHTML = `
            <div class="modal__overlay"></div>
            <div class="modal__content">
                <div class="modal__header">
                    <h3>Добавить транзакцию</h3>
                    <button class="modal__close">&times;</button>
                </div>
                <div class="modal__body">
                    <div id="transaction-type-buttons" class="button-grid">
                        <button class="button" id="income-modal">Приход</button>
                        <button class="button" id="expense-modal">Расход</button>
                        <button class="button" id="transfer-modal">Перевод</button>
                        <button class="button" id="order-pay-modal">Оплата заказа</button>
                        <button class="button" id="deposit-modal">Внос на ЛС</button>
                        <button class="button" id="ls-pay-modal">Оплата с ЛС</button>
                    </div>
                </div>
            </div>`
		document.body.appendChild(modal)

		const close = () => modal.remove()
		modal.querySelector('.modal__close').onclick = close
		modal.querySelector('.modal__overlay').onclick = close

		// Привязываем действия к кнопкам внутри модалки
		Object.entries(TransactionManager.types).forEach(([id, cfg]) => {
			// Маппим ID кнопок в модалке (income-modal вместо income-button)
			const modalBtnId = id.replace('-button', '-modal')
			modal.querySelector(`#${modalBtnId}`)?.addEventListener('click', () => {
				modal.remove()
				this.setupTransactionAction(cfg)
			})
		})
	},

	/** Инициализация формы из конфига для страницы "Все" */
	async setupTransactionAction(cfg) {
		const finalConfig = {
			tableId: 'all_transaction-table',
			formId: 'transactions-form',
			onSuccess: res =>
				handleTransactionSuccess(res, 'all_transaction-table', false),
			...cfg,
		}

		await initTransactionForm(finalConfig, null)
		const form = document.getElementById(finalConfig.formId)
		if (!form) return

		if (cfg.modalConfig.title.includes('заказа'))
			TransactionManager._bindOrderDebtLogic(finalConfig.formId)
		if (cfg.modalConfig.title.includes(' ЛС'))
			TransactionManager._initLSPaymentModal(finalConfig.formId)
	},
}

/* ==========================================
   15. ТОЧКА ВХОДА (App Initialization)
   ========================================== */

document.addEventListener('DOMContentLoaded', () => {
	// 1. Общая инициализация для всех страниц Ledger
	TableManager.init()
	if (typeof addMenuHandler === 'function') addMenuHandler()
	UIHandler.initGlobalFeatures()

	// 2. Определение текущей страницы по URL
	const pathname = window.location.pathname
	const parts = pathname.split('/').filter(Boolean)
	const urlName =
		parts.length > 0 ? parts[parts.length - 1].replace(/-/g, '_') : null

	if (!urlName) return

	// 3. Карта инициализаторов
	const pageInitializers = {
		bank_accounts: () =>
			configs?.bank_accounts && initGenericLedgerPage(configs.bank_accounts),
		transaction_categories: () =>
			configs?.transaction_categories &&
			initGenericLedgerPage(configs.transaction_categories),
		payments: () => PageInitializer.initPayments(),
		transactions: () => PageInitializer.initTransactions(),
		current_shift: () => PageInitializer.initCurrentShift(),
		balances: () => PageInitializer.initBalances(),
		all: () => PageInitializer.initAllTransactions(),
	}

	// 4. Запуск
	if (pageInitializers[urlName]) {
		console.log(`[Ledger] Initializing page: ${urlName}`)
		pageInitializers[urlName]()
	} else {
		console.warn(`[Ledger] No initializer found for: ${urlName}`)
	}
})

/** Глобальные алиасы для вызова из HTML */
const showAddTransactionModal = () => UIHandler.showAddTransactionModal()
const initAllTransactionsPage = () => PageInitializer.initAllTransactions()
const initBalancesPage = () => PageInitializer.initBalances()
