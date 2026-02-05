import { DynamicFormHandler } from '/static/js/dynamicFormHandler.js'
import SelectHandler from '/static/js/selectHandler.js'
import { TableManager } from '/static/js/table.js'
import { initTableHandlers } from '/static/js/tableHandlers.js'
import {
	collapseContainer,
	createLoader,
	enableResize,
	getCSRFToken,
	showError,
	showQuestion,
	showSuccess,
} from '/static/js/ui-utils.js'

/**
 * @file .
 * @description Модуль конфигураций и импортов для управления банковскими счетами и категориями транзакций.
 */

/** @constant {string} */
const BASE_URL = '/ledger/'
/** @constant {string} */
const BANK_ACCOUNTS = 'bank-accounts'
/** @constant {string} */
const TRANSACTION_CATEGORIES = 'transaction-categories'
/** @constant {string} */
const CURRENCY_SUFFIX = ' р.'
/** @constant {string} */
const DEFAULT_CURRENCY_VALUE = `0,00${CURRENCY_SUFFIX}`

/**
 * Генерирует стандартный набор URL и ID для сущности.
 * @param {string} entity - Название сущности.
 * @returns {Object} Объект с путями и идентификаторами.
 */
const getBaseConfig = entity => ({
	containerId: `${entity}-container`,
	tableId: `${entity}-table`,
	formId: `${entity}-form`,
	getUrl: `${BASE_URL}${entity}/`,
	addUrl: `${BASE_URL}${entity}/add/`,
	editUrl: `${BASE_URL}${entity}/edit/`,
	deleteUrl: `${BASE_URL}${entity}/delete/`,
	refreshUrl: `${BASE_URL}${entity}/refresh/`,
})

/**
 * Общий объект конфигураций для модулей.
 * @type {Object.<string, Object>}
 */
const configs = {
	bank_accounts: {
		...getBaseConfig(BANK_ACCOUNTS),
		dataUrls: [{ id: 'id_type', url: `${BASE_URL}${BANK_ACCOUNTS}/types/` }],
	},
	transaction_categories: {
		...getBaseConfig(TRANSACTION_CATEGORIES),
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
/**
 * @file .
 * @description Модуль инициализации и управления контекстным меню для таблиц и списков.
 */

const addMenuHandler = () => {
	const elements = {
		menu: document.getElementById('context-menu'),
		add: document.getElementById('add-button'),
		edit: document.getElementById('edit-button'),
		del: document.getElementById('delete-button'),
		payment: document.getElementById('payment-button'),
		hide: document.getElementById('hide-button'),
		settle: document.getElementById('settle-debt-button'),
		settleAll: document.getElementById('settle-debt-all-button'),
		repayEdit: document.getElementById('repayment-edit-button'),
	}

	if (!elements.menu) return

	/**
	 * Управляет видимостью элементов меню.
	 * @param {Object} visibilityMap - Карта соответствия ключа элемента и флага видимости.
	 */
	const toggleButtons = visibilityMap => {
		Object.entries(visibilityMap).forEach(([key, isVisible]) => {
			if (elements[key]) {
				elements[key].style.display = isVisible ? 'block' : 'none'
			}
		})
	}

	/**
	 * Вычисляет позицию и отображает меню.
	 * @param {number} pageX
	 * @param {number} pageY
	 */
	const showMenu = (pageX, pageY) => {
		try {
			const { menu } = elements
			menu.style.display = 'block'

			const clientX = pageX - window.scrollX
			const clientY = pageY - window.scrollY
			const viewport = {
				w: window.innerWidth || document.documentElement.clientWidth,
				h: window.innerHeight || document.documentElement.clientHeight,
			}

			const rect = menu.getBoundingClientRect()
			const size = { w: rect.width || 200, h: rect.height || 200 }
			const margin = 8
			const offset = 10

			let left = clientX + offset
			if (left + size.w > viewport.w - margin) {
				left = Math.max(margin, viewport.w - size.w - margin)
			}

			let top
			if (clientY > viewport.h * 0.75) {
				top = Math.max(margin, clientY - size.h - offset)
			} else {
				top = clientY + offset
				if (top + size.h > viewport.h - margin) {
					top = Math.max(margin, viewport.h - size.h - margin)
				}
			}

			menu.style.left = `${left + window.scrollX}px`
			menu.style.top = `${top + window.scrollY}px`
		} catch (err) {
			console.error('Menu positioning error:', err)
		}
	}

	/**
	 * Обработка логики для специальных таблиц (investors, cash_flow и др.)
	 */
	const handleTableSpecifics = (table, row, e) => {
		const isBankTable = table.id === 'transactions-bank-accounts-table'

		// Базовая видимость для обычных строк
		toggleButtons({
			add: !isBankTable,
			edit: !isBankTable,
			del: !isBankTable,
			hide: !isBankTable,
			payment: true,
			settle: false,
			settleAll: table.id === 'summary-profit',
			repayEdit: table.id?.startsWith('branch-repayments-'),
		})

		// Investor Table Logic
		if (table.id === 'investors-table' && elements.settle) {
			const selectedCell = document.querySelector('td.table__cell--selected')
			const cellIndex = selectedCell
				? Array.from(selectedCell.parentNode.children).indexOf(selectedCell)
				: -1
			const colName =
				cellIndex !== -1
					? table.querySelectorAll('thead th')[cellIndex]?.dataset.name
					: null

			if (['initial_balance', 'balance'].includes(colName)) {
				elements.settle.style.display = 'block'
				elements.settle.textContent = 'Изменить сумму'
				elements.settle.dataset.type =
					colName === 'initial_balance' ? 'initial' : 'balance'
			}
		} else if (
			!isBankTable &&
			!table.id?.startsWith('branch-repayments-') &&
			table.id !== 'investor-operations-table'
		) {
			if (elements.settle) {
				elements.settle.style.display = 'block'
				elements.settle.textContent = 'Погасить долг'
				elements.settle.dataset.type = ''
			}
		}

		// Cash Flow Logic
		if (table.id === 'cash_flow-table') {
			const headers = Array.from(table.querySelectorAll('thead th'))
			const pIdx = headers.findIndex(th => th.dataset.name === 'purpose')
			if (pIdx !== -1) {
				const purposeText = row.querySelectorAll('td')[pIdx]?.textContent.trim()
				if (
					['Перевод', 'Инкассация', 'Погашение долга поставщика'].includes(
						purposeText,
					)
				) {
					toggleButtons({ edit: false, del: false })
				}
			}
		}
	}

	// --- Event Listeners ---

	document.addEventListener('contextmenu', e => {
		const row = e.target.closest(
			'tbody tr:not(.table__row--summary):not(.table__row--empty)',
		)
		const table = e.target.closest('table')
		const content = e.target.closest('.content')
		const debtorItem = e.target.closest('.debtors-office-list__row-item')

		if (row && table) {
			e.preventDefault()
			handleTableSpecifics(table, row, e)
			showMenu(e.pageX, e.pageY)
			return
		}

		if (content) {
			e.preventDefault()
			toggleButtons({
				add: true,
				edit: false,
				del: false,
				payment: false,
				hide: false,
				settle: false,
				settleAll: false,
				repayEdit: false,
			})
			showMenu(e.pageX, e.pageY)
		}

		if (debtorItem && elements.settle) {
			const type = debtorItem.querySelector('h4')?.textContent.trim()
			if (
				['Оборудование', 'Кредит', 'Краткосрочные обязательства'].includes(type)
			) {
				elements.settle.style.display = 'block'
				elements.settle.textContent = 'Изменить сумму'
				elements.settle.dataset.type = type
			}
		}
	})

	// --- Touch Support ---
	let touchData = { timer: null, target: null, x: 0, y: 0 }
	const LONG_PRESS_DELAY = 600

	const clearTouch = () => {
		if (touchData.timer) clearTimeout(touchData.timer)
		touchData.timer = null
	}

	document.addEventListener(
		'touchstart',
		ev => {
			if (ev.touches?.length > 1) return
			const t = ev.touches[0]
			touchData.x = t.pageX
			touchData.y = t.pageY
			touchData.target = ev.target

			touchData.timer = setTimeout(() => {
				const evt = new MouseEvent('contextmenu', {
					bubbles: true,
					cancelable: true,
					view: window,
					clientX: touchData.x,
					clientY: touchData.y,
					pageX: touchData.x,
					pageY: touchData.y,
				})
				try {
					touchData.target.dispatchEvent(evt)
				} catch {
					document.dispatchEvent(evt)
				}
				touchData.timer = null
			}, LONG_PRESS_DELAY)
		},
		{ passive: true },
	)

	document.addEventListener('touchmove', clearTouch, { passive: true })
	document.addEventListener('touchend', clearTouch, { passive: true })

	document.addEventListener('click', () => {
		elements.menu.style.display = 'none'
	})
}

/**
 * @file .
 * @description Утилитарные функции для обработки данных, форматирования дат/валют и управления DOM-элементами таблиц.
 */

/**
 * Преобразует строку с валютой в целое число.
 * @param {string|number} text - Входное значение.
 * @returns {number} Округленное числовое значение.
 */
const parseNumeric = text => {
	if (text == null) return 0
	const cleaned = String(text)
		.replace(' р.', '')
		.replace(/\s/g, '')
		.replace(',', '.')
	return Math.round(parseFloat(cleaned) || 0)
}

/**
 * Форматирует число в строку валюты.
 * @param {number|string} value - Число для форматирования.
 * @param {boolean} [withSuffix=true] - Добавлять ли суффикс валюты.
 * @returns {string} Отформатированная строка.
 */
const formatCurrency = (value, withSuffix = true) => {
	const numericValue =
		typeof value === 'number' ? Math.round(value) : parseNumeric(value)
	const formatted = numericValue
		.toString()
		.replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
	return withSuffix ? `${formatted}${CURRENCY_SUFFIX}` : formatted
}

/**
 * Форматирует объект Date в строку DD.MM.YYYY.
 * @param {Date} date
 * @returns {string}
 */
const formatDate = date => {
	const d = val => String(val).padStart(2, '0')
	return `${d(date.getDate())}.${d(date.getMonth() + 1)}.${date.getFullYear()}`
}

/**
 * Форматирует объект Date в ISO формат для сервера (YYYY-MM-DD).
 * @param {Date} date
 * @returns {string}
 */
const formatDateForServer = date => {
	const d = val => String(val).padStart(2, '0')
	return `${date.getFullYear()}-${d(date.getMonth() + 1)}-${d(date.getDate())}`
}

/**
 * Инициализирует виджет выбора даты Flatpickr.
 * @param {string} inputSelector
 * @param {string} iconSelector
 * @param {string} defaultDateStr
 * @returns {Object|null} Экземпляр flatpickr.
 */
const initDatePicker = (inputSelector, iconSelector, defaultDateStr) => {
	const inputElement = document.querySelector(inputSelector)
	const iconElement = document.querySelector(iconSelector)

	if (!inputElement || !iconElement) {
		console.warn(
			`Date picker elements not found: ${inputSelector}, ${iconSelector}`,
		)
		return null
	}

	let isIconClicked = false
	iconElement.addEventListener('mousedown', () => {
		isIconClicked = true
	})

	const instance = flatpickr(inputElement, {
		dateFormat: 'd.m.Y',
		clickOpens: false,
		defaultDate: defaultDateStr,
		allowInput: true,
		locale: 'ru',
		onClose: () => {
			setTimeout(() => {
				isIconClicked = false
			}, 100)
		},
	})

	iconElement.addEventListener('click', () => {
		if (isIconClicked) instance.toggle()
		isIconClicked = false
	})

	return instance
}

/**
 * Настраивает поле ввода для работы с валютой через AutoNumeric.
 * @param {string} inputId
 * @returns {Object|null} Экземпляр AutoNumeric.
 */
const setupCurrencyInput = inputId => {
	const input = document.getElementById(inputId)
	if (!input) return null

	if (input.autoNumeric) input.autoNumeric.remove()

	const instance = new AutoNumeric(input, {
		allowDecimalPadding: false,
		alwaysAllowDecimalCharacter: false,
		currencySymbol: CURRENCY_SUFFIX,
		currencySymbolPlacement: 's',
		decimalCharacter: ',',
		decimalCharacterAlternative: '.',
		decimalPlaces: 0,
		digitGroupSeparator: ' ',
		emptyInputBehavior: 'null',
		minimumValue: '0',
		allowEmpty: true,
	})

	input.autoNumeric = instance
	return instance
}

/**
 * Ищет строку банковского счета и обновляет её значения.
 * @param {string} accountName
 * @param {number} amountChange
 */
const findAndUpdateBankAccountRow = (accountName, amountChange) => {
	const table = document.getElementById('transactions-bank-accounts-table')
	if (!table) return

	const rows = table.querySelectorAll('tbody tr:not(.table__row--summary)')
	const row = Array.from(rows).find(
		r => r.cells[0]?.textContent?.trim() === accountName,
	)

	if (!row || row.cells.length < 4) return

	let baseBalance = parseInt(row.dataset.baseBalance, 10)
	if (isNaN(baseBalance)) {
		const shift = parseNumeric(row.cells[2].textContent)
		const total = parseNumeric(row.cells[3].textContent)
		baseBalance = total - shift
		row.dataset.baseBalance = baseBalance
	}

	const newShift =
		(parseNumeric(row.cells[2].textContent) || 0) + (Number(amountChange) || 0)
	row.cells[2].textContent = formatCurrency(newShift)
	row.cells[3].textContent = formatCurrency(baseBalance + newShift)
}

/**
 * Пересчитывает состояние банковских счетов на основе таблицы транзакций.
 */
const recomputeBankAccountsFromTransactions = () => {
	const bankTable = document.getElementById('transactions-bank-accounts-table')
	const transTable = document.getElementById('transactions-table')
	if (!bankTable) return

	const accountRows = bankTable.querySelectorAll(
		'tbody tr:not(.table__row--summary)',
	)
	const baseMap = {}
	const shiftMap = {}

	// Инициализация данных из строк счетов
	accountRows.forEach(row => {
		const name = row.cells[0]?.textContent?.trim()
		if (!name) return

		let base = parseInt(row.dataset.baseBalance, 10)
		if (isNaN(base)) {
			base =
				parseNumeric(row.cells[3].textContent) -
				parseNumeric(row.cells[2].textContent)
			row.dataset.baseBalance = base
		}
		baseMap[name] = base
		shiftMap[name] = 0
	})

	// Агрегация транзакций
	if (transTable) {
		const transRows = transTable.querySelectorAll(
			'tbody tr:not(.table__row--summary)',
		)
		transRows.forEach(tr => {
			const acc = tr.cells[1]?.textContent?.trim()
			const amt = parseNumeric(tr.cells[2]?.textContent)
			if (acc && acc in shiftMap) shiftMap[acc] += amt
		})
	}

	// Обновление DOM
	accountRows.forEach(row => {
		const name = row.cells[0]?.textContent?.trim()
		const base = baseMap[name] || 0
		const shift = shiftMap[name] || 0

		if (row.cells[2] && row.cells[3]) {
			row.cells[2].textContent = formatCurrency(shift)
			row.cells[3].textContent = formatCurrency(
				shift + parseNumeric(row.cells[1].textContent),
			)
		}
	})

	TableManager.calculateTableSummary(
		'transactions-bank-accounts-table',
		['balance', 'shift_amount', 'total_amount'],
		{ grouped: true, total: true },
	)
}

/**
 * Универсальный обработчик обновления сводки банковских счетов.
 * @param {Object} [options] - Параметры обновления.
 * @param {HTMLElement} [options.rowToRemove] - Строка для удаления.
 * @param {HTMLElement} [options.relatedRowToRemove] - Связанная строка для удаления.
 */
const updateBankAccountSummary = (options = {}) => {
	try {
		if (options.rowToRemove) options.rowToRemove.remove()
		if (options.relatedRowToRemove) options.relatedRowToRemove.remove()

		recomputeBankAccountsFromTransactions()

		if (document.getElementById('transactions-table')) {
			TableManager.calculateTableSummary('transactions-table', ['amount'])
		}
	} catch (error) {
		console.error('Failed to update bank account summary:', error)
	}
}

// Алиасы для сохранения совместимости
const updateBankAccountSummaryAfterAdd = () => updateBankAccountSummary()
const updateBankAccountSummaryAfterEdit = () => updateBankAccountSummary()
const updateBankAccountSummaryAfterDelete = (row, related) =>
	updateBankAccountSummary({ rowToRemove: row, relatedRowToRemove: related })

/**
 * @file .
 * @description Оптимизированный модуль управления транзакциями: инициализация форм, обработка успешных операций и редактирование.
 */

/**
 * Инициализирует динамическую форму транзакции.
 * @param {Object} config - Конфигурация формы.
 * @param {string|number|null} [editId=null] - ID редактируемой транзакции.
 * @returns {Promise<DynamicFormHandler>}
 */
const initTransactionForm = async (config, editId = null) => {
	const formHandler = new DynamicFormHandler(config)
	await formHandler.init(editId)

	const formId = config.formId || 'transactions-form'
	const formElement = document.getElementById(formId)

	if (!formElement) {
		console.warn(`Form with id "${formId}" not found during init.`)
		return formHandler
	}

	if (formElement.querySelector('#amount')) {
		setupCurrencyInput('amount', editId !== null)
	}

	return formHandler
}

/**
 * Обрабатывает успешный ответ сервера после сохранения транзакции.
 * @param {Object} result - Данные ответа.
 * @param {string} tableId - ID целевой таблицы.
 * @param {boolean} [isEdit=false] - Флаг редактирования.
 * @param {Object} [prev] - Предыдущие данные для обновления баланса.
 */
const handleTransactionSuccess = async (
	result,
	tableId,
	isEdit = false,
	prev = {},
) => {
	const processRow = async data => {
		const method = isEdit ? 'updateTableRow' : 'addTableRow'
		const row = await TableManager[method](data, tableId)
		if (row) row.setAttribute('data-id', data.id)
		return row
	}

	try {
		const { outgoing_transaction: outTrans, incoming_transaction: inTrans } =
			result

		if (outTrans && inTrans) {
			// Случай перевода между счетами
			await processRow(outTrans)
			await processRow(inTrans)
			isEdit
				? updateBankAccountSummaryAfterEdit(
						outTrans.id,
						inTrans.id,
						prev.outAcc,
						prev.outAmt,
						prev.inAcc,
						prev.inAmt,
					)
				: updateBankAccountSummaryAfterAdd(true)
		} else if (result.id) {
			// Обычная транзакция
			await processRow(result)
			isEdit
				? updateBankAccountSummaryAfterEdit(
						result.id,
						null,
						prev.outAcc,
						prev.outAmt,
					)
				: updateBankAccountSummaryAfterAdd(false)
		} else {
			throw new Error('Unknown structure')
		}

		TableManager.calculateTableSummary(tableId, ['amount'])
		colorizeTableAmounts(tableId)
	} catch (error) {
		console.error('Error handling success:', error)
		showError('Ошибка при обновлении таблицы после сохранения.')
	}
}

/**
 * Вспомогательная функция для настройки логики оплаты с ЛС клиента.
 * @private
 */
const _setupLSPaymentLogic = async (
	formElement,
	initialClientId,
	initialOrderId,
	currentPayment,
) => {
	const tableContainer = formElement.querySelector('#clients-table--container')
	const orderSelect = formElement.querySelector('#order')
	const clientInput = formElement.querySelector('input[id="client"]')

	if (!tableContainer || !orderSelect || !clientInput) return

	const loader = createLoader()
	tableContainer.appendChild(loader)

	try {
		const response = await fetch(
			`/commerce/clients/balances/?client=${initialClientId}`,
			{
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			},
		)
		const data = await response.json()

		if (!data.html || !data.ids) throw new Error('Invalid balances data')

		const newTable = TableManager.replaceEntireTable(
			data.html,
			'clients-table--container',
			'clients-table',
		)
		if (!newTable) return

		const rows = Array.from(
			newTable.querySelectorAll('tbody tr:not(.table__row--summary)'),
		)
		const targetIdx = data.ids.findIndex(
			c => String(c.id) === String(initialClientId),
		)

		if (targetIdx !== -1) {
			rows[targetIdx].classList.add('table__row--selected')
			clientInput.value = initialClientId
		}

		newTable.addEventListener('click', async e => {
			const row = e.target.closest('tbody tr:not(.table__row--summary)')
			if (!row) return

			const idx = rows.indexOf(row)
			if (idx !== -1 && data.ids[idx]) {
				rows.forEach(r => r.classList.remove('table__row--selected'))
				row.classList.add('table__row--selected')
				clientInput.value = data.ids[idx].id
				await updateClientOrdersList(data.ids[idx].id, orderSelect, false, null)
			}
		})

		await updateClientOrdersList(
			initialClientId,
			orderSelect,
			true,
			initialOrderId,
		)
		await new Promise(r => setTimeout(r, 150))

		const debt = await fetchOrderDebt(
			orderSelect.value || initialOrderId,
			currentPayment,
		)
		displayOrderDebt('debt_amount', debt)
	} catch (error) {
		console.error('LS Payment Setup Error:', error)
		showError('Ошибка загрузки балансов клиентов.')
	} finally {
		loader.remove()
	}
}

/**
 * Универсальная функция редактирования транзакции.
 * @param {string|number} transactionId
 * @param {HTMLElement} row
 * @param {string} tableId
 * @param {boolean} [closed=false]
 * @param {boolean} [isAll=false] - Флаг режима "Все транзакции"
 */
const editTransaction = async (
	transactionId,
	row,
	tableId,
	closed = false,
	isAll = false,
) => {
	const table = document.getElementById(tableId)
	if (!table) return showError(`Таблица "${tableId}" не найдена.`)

	const headers = Array.from(table.querySelectorAll('thead th'))
	const getIdx = name => headers.findIndex(th => th.dataset.name === name)

	const typeIdx = getIdx('type')
	const accIdx = getIdx('bank_account')
	const amtIdx = getIdx('amount')

	if (typeIdx === -1) return showError('Не удалось определить тип транзакции.')

	const cells = row.querySelectorAll('td')
	const typeValue =
		cells[typeIdx].dataset.value || cells[typeIdx].textContent.trim()

	const prev = {
		outAcc: cells[accIdx]?.textContent?.trim(),
		outAmt: parseNumeric(cells[amtIdx]?.textContent),
		inAcc: null,
		inAmt: null,
	}

	if (typeValue === 'Перевод между счетами') {
		const relatedRow = Array.from(table.querySelectorAll('tbody tr')).find(
			r =>
				r !== row &&
				r.querySelector(`td:nth-child(${typeIdx + 1})`)?.textContent?.trim() ===
					typeValue,
		)

		if (relatedRow) {
			const rCells = relatedRow.querySelectorAll('td')
			prev.inAcc = rCells[accIdx]?.textContent?.trim()
			prev.inAmt = parseNumeric(rCells[amtIdx]?.textContent)
		}
	}

	const config = {
		submitUrl: `/ledger/transactions/${closed ? 'closed/' : ''}edit/`,
		queryParams: isAll ? { table: 'all' } : {},
		getUrl: `${BASE_URL}transactions/`,
		tableId,
		formId: 'transactions-form',
		modalConfig: { url: '', title: '', context: {} },
		onSuccess: result => handleTransactionSuccess(result, tableId, true, prev),
		dataUrls: [],
	}

	// Маппинг типов транзакций к конфигурации
	const typeConfigs = {
		Приход: {
			url: '/components/ledger/add_transaction/',
			title: 'Редактирование прихода',
			ctx: { type: 'income' },
			data: [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/list/?type=income`,
				},
			],
		},
		Расход: {
			url: '/components/ledger/add_transaction/',
			title: 'Редактирование расхода',
			ctx: { type: 'expense' },
			data: [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/list/?type=expense`,
				},
			],
		},
		'Оплата заказа': {
			url: '/components/ledger/add_order_payment/',
			title: 'Редактирование оплаты заказа',
			data: [
				{
					id: 'order',
					url: `/commerce/orders/ids/?transaction=${transactionId}`,
				},
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
			],
		},
		'Перевод между счетами': {
			url: '/components/ledger/add_transfer/',
			title: 'Редактирование перевода',
			data: [
				{ id: 'source_bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'destination_bank_account',
					url: `/ledger/${BANK_ACCOUNTS}/list/`,
				},
			],
		},
		'Внос на ЛС клиента': {
			url: '/components/ledger/deposit_client_balance/',
			title: 'Редактирование зачисления на ЛС клиента',
			data: [
				{ id: 'client', url: '/commerce/clients/list/' },
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
			],
		},
		'Оплата с ЛС клиента': {
			url: '/components/ledger/ls_payment/',
			title: 'Редактирование оплаты заказа с ЛС клиента',
		},
	}

	const tCfg = typeConfigs[typeValue]
	if (!tCfg) return showError(`Неизвестный тип: "${typeValue}"`)

	config.modalConfig = {
		url: tCfg.url,
		title: tCfg.title,
		context: tCfg.ctx || {},
	}
	config.dataUrls = tCfg.data || []

	try {
		await initTransactionForm(config, transactionId)
		const form = document.getElementById(config.formId)
		if (!form) return

		// Специфичная логика для типов
		const reportDateInput = form.querySelector('#report_date')
		if (isAll && reportDateInput) {
			reportDateInput
				.closest('.modal-form__group')
				?.style.setProperty('display', 'block')
		}

		if (typeValue === 'Оплата заказа') {
			const orderId = form.querySelector('#order')?.value
			const amt = parseNumeric(form.querySelector('#amount')?.value)
			if (orderId)
				displayOrderDebt('debt_amount', await fetchOrderDebt(orderId, amt))
		} else if (typeValue === 'Оплата с ЛС клиента') {
			const cId = form.querySelector('#client')?.value
			const oId = form.querySelector('#order')?.value
			const amt = parseNumeric(form.querySelector('#amount')?.value)

			if (!cId || !oId) return showError('Ошибка данных клиента/заказа.')
			await _setupLSPaymentLogic(form, cId, oId, amt)
		}
	} catch (err) {
		console.error('Init Edit Form Error:', err)
		showError('Не удалось загрузить форму редактирования.')
	}
}

/** Алиас для совместимости */
const editTransactionForAll = (id, row, tid, closed) =>
	editTransaction(id, row, tid, closed, true)

/**
 * @file .
 * @description Оптимизированные утилитарные функции для обработки транзакций, заказов и таблиц.
 */

/**
 * Обертка для выполнения асинхронных операций с индикатором загрузки.
 * @param {Function} asyncFn - Асинхронная функция.
 * @returns {Promise<any>}
 */
const withLoader = async asyncFn => {
	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		return await asyncFn()
	} finally {
		loader.remove()
	}
}

/**
 * Получает сумму долга по заказу с сервера.
 * @param {string|number} orderId - ID заказа.
 * @param {number} [currentPaymentAmount=0] - Текущая сумма платежа.
 * @returns {Promise<number|null>} Сумма долга или null.
 */
const fetchOrderDebt = async (orderId, currentPaymentAmount = 0) => {
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
}

/**
 * Отображает сумму долга в указанном поле ввода.
 * @param {string} inputId - ID элемента ввода.
 * @param {number|null} debtValue - Значение долга.
 */
const displayOrderDebt = (inputId, debtValue) => {
	const input = document.getElementById(inputId)
	if (!input) return

	const isValid = debtValue !== null && !isNaN(debtValue)
	input.value = isValid ? formatCurrency(debtValue) : DEFAULT_CURRENCY_VALUE
}

/**
 * Обновляет выпадающий список заказов клиента.
 * @param {string|number} clientId - ID клиента.
 * @param {HTMLElement} selectElement - Элемент select.
 * @param {boolean} [isFirstLoad=false] - Флаг первой загрузки.
 * @param {string|number|null} [targetOrderId=null] - ID целевого заказа для выбора.
 */
const updateClientOrdersList = async (
	clientId,
	selectElement,
	isFirstLoad = false,
	targetOrderId = null,
) => {
	const selectParent = selectElement?.closest('.select')
	if (!selectParent) return console.error('Required select elements not found.')

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
				_handleOrderSelection(selectParent, data, targetOrderId, input, text)
			} else if (text) {
				text.textContent = data.length > 0 ? 'Выберите заказ' : 'Нет заказов'
			}
		} catch (error) {
			console.error('Error updating orders list:', error)
			showError('Не удалось загрузить список заказов.')
			if (text) text.textContent = 'Ошибка загрузки'
		} finally {
			displayOrderDebt('debt_amount', null)
		}
	})
}

/**
 * Внутренний помощник для выбора заказа в кастомном селекте.
 * @private
 */
const _handleOrderSelection = (parent, data, targetId, input, text) => {
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
	} else if (text) {
		text.textContent = data.length > 0 ? 'Выберите заказ' : 'Нет заказов'
	}
}

/**
 * Присваивает data-id строкам таблицы из массива.
 * @param {Array} ids - Массив идентификаторов.
 * @param {string} tableId - ID таблицы.
 */
const setIds = (ids, tableId) => {
	if (!ids?.length) return

	const rows = document.querySelectorAll(
		`#${tableId} tbody tr:not(.table__row--summary)`,
	)
	if (!rows.length) return

	if (rows.length !== ids.length) {
		console.warn('Rows count mismatch with IDs count')
	}

	rows.forEach((row, i) => {
		if (ids[i]) row.setAttribute('data-id', ids[i])
	})
}

/**
 * Инициирует удаление транзакции с подтверждением.
 * @param {string|number} transactionId - ID транзакции.
 * @param {HTMLElement} row - Строка таблицы.
 */
const deleteTransaction = (transactionId, row) => {
	showQuestion(
		'Вы действительно хотите удалить запись?',
		'Удаление',
		async () => {
			await withLoader(async () => {
				try {
					const data = await TableManager.sendDeleteRequest(
						transactionId,
						'/ledger/transactions/delete/',
						'transactions-table',
					)

					if (data?.status === 'success') {
						const relatedRow = data.related_transaction_id
							? TableManager.getRowById(
									data.related_transaction_id,
									'transactions-table',
								)
							: null

						updateBankAccountSummaryAfterDelete(row, relatedRow)
						showSuccess('Запись успешно удалена')
					}
				} catch (error) {
					console.error('Delete transaction error:', error)
					showError('Произошла ошибка при удалении.')
				}
			})
		},
	)
}

/**
 * @file .
 * @description Модуль инициализации страниц Ledger: платежи, транзакции и управление состоянием таблиц.
 */

/**
 * Инициализация базовой страницы реестра.
 * @param {Object} pageConfig
 */
const initGenericLedgerPage = pageConfig => {
	if (!pageConfig)
		return console.error('Generic ledger page initialized without config.')
	initTableHandlers(pageConfig)
}

/**
 * Получает значение параметра из URL.
 * @param {string} name
 * @returns {string|null}
 */
const getQueryParam = name =>
	new URL(window.location.href).searchParams.get(name)

/**
 * Инициализация страницы платежей.
 */
const initPaymentsPage = async () => {
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

	// Обработка order_id из URL
	const orderId = getQueryParam('order_id')
	const orderInput = document.querySelector(
		'input[name="order"].create-form__input',
	)
	if (orderId && orderInput) {
		orderInput.value = orderId
		orderInput.dispatchEvent(new Event('input', { bubbles: true }))
	}

	// Ограничение прав менеджера
	_handleRestrictedUser('id_manager')
	colorizeTableAmounts('payments-table')
}

/**
 * Вспомогательная функция для обработки данных ограниченного пользователя.
 * @private
 */
const _handleRestrictedUser = managerInputId => {
	const restrictedData = document.getElementById('restricted-user')?.textContent
	if (!restrictedData) return

	try {
		const userName = JSON.parse(restrictedData)
		const managerInput = document.getElementById(managerInputId)
		const container = managerInput?.closest('.select')
		if (!container) return

		container.classList.add('disabled')
		const textDisplay = container.querySelector('.select__text')
		if (textDisplay) textDisplay.textContent = userName
	} catch (e) {
		console.error('Error parsing restricted user:', e)
	}
}

/**
 * Инициализация страницы транзакций.
 */
const initTransactionsPage = async () => {
	await TableManager.init()
	TableManager.createColumnsForTable(
		'transactions-table',
		[
			{ name: 'id' },
			{ name: 'category', url: `/ledger/${TRANSACTION_CATEGORIES}/list/` },
			{ name: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
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

	// Настройка дат (последние 7 дней)
	const today = new Date()
	const sevenDaysAgo = new Date(new Date().setDate(today.getDate() - 7))

	const pickers = {
		start: initDatePicker(
			'#start-date',
			'.date-filter__icon[data-target="start-date"]',
			formatDate(sevenDaysAgo),
		),
		end: initDatePicker(
			'#end-date',
			'.date-filter__icon[data-target="end-date"]',
			formatDate(today),
		),
	}

	// Кэширование элементов пагинации
	const pagination = {
		input: document.getElementById('current-page'),
		total: document.getElementById('total-pages'),
		btns: {
			load: document.getElementById('load-data'),
			refresh: document.getElementById('refresh'),
			next: document.getElementById('next-page'),
			last: document.getElementById('last-page'),
			prev: document.getElementById('prev-page'),
			first: document.getElementById('first-page'),
			edit: document.getElementById('edit-button'),
		},
	}

	/**
	 * Загрузка и обновление данных таблицы.
	 */
	const fetchAndUpdateTable = async page => {
		const start = pickers.start?.selectedDates[0]
		const end = pickers.end?.selectedDates[0]
		if (!start || !end) return showError('Не выбраны даты периода')

		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const url = `${BASE_URL}transactions/list/?start_date=${formatDateForServer(start)}&end_date=${formatDateForServer(end)}&page=${page}`
			const response = await fetch(url, {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const data = await response.json()

			if (response.ok && data.html && data.context) {
				TableManager.updateTable(data.html, 'transactions-table')
				TableManager.calculateTableSummary('transactions-table', ['amount'])
				colorizeTableAmounts('transactions-table')
				_updatePaginationUI(pagination, data.context)
				_setTransactionRowIds(data.context.transaction_ids)
			} else {
				_resetTableState(pagination)
				if (data.message) console.warn(data.message)
			}
		} catch (error) {
			console.error('Fetch error:', error)
			showError('Ошибка загрузки данных')
			_resetTableState(pagination)
		} finally {
			loader.remove()
		}
	}

	// Привязка событий
	const getPage = () => parseInt(pagination.input?.value, 10) || 1

	pagination.btns.load?.addEventListener('click', () => fetchAndUpdateTable(1))
	pagination.btns.refresh?.addEventListener('click', () =>
		fetchAndUpdateTable(getPage()),
	)
	pagination.btns.next?.addEventListener('click', () =>
		fetchAndUpdateTable(getPage() + 1),
	)
	pagination.btns.prev?.addEventListener('click', () =>
		fetchAndUpdateTable(getPage() - 1),
	)
	pagination.btns.first?.addEventListener('click', () => fetchAndUpdateTable(1))
	pagination.btns.last?.addEventListener('click', () =>
		fetchAndUpdateTable(parseInt(pagination.total?.textContent, 10) || 1),
	)

	pagination.input?.addEventListener('change', e => {
		const max = parseInt(pagination.total?.textContent, 10) || 1
		let val = Math.min(Math.max(parseInt(e.target.value, 10) || 1, 1), max)
		e.target.value = val
		fetchAndUpdateTable(val)
	})

	pagination.btns.edit?.addEventListener('click', async () => {
		const row = TableManager.getSelectedRow('transactions-table')
		const id = row?.getAttribute('data-id')
		if (!id) return showError('Выберите строку для редактирования')

		const loader = createLoader()
		document.body.appendChild(loader)
		try {
			const res = await fetch(
				'/users/check-permission/?permission=edit_closed_transactions',
				{ headers: { 'X-Requested-With': 'XMLHttpRequest' } },
			)
			if (res.ok) {
				editTransaction(id, row, 'transactions-table', true)
			} else {
				showError('Недостаточно прав для редактирования')
			}
		} catch (e) {
			showError('Ошибка проверки прав')
		} finally {
			loader.remove()
		}
	})
}

/**
 * Обновление интерфейса пагинации.
 * @private
 */
const _updatePaginationUI = (nav, ctx) => {
	const { current_page, total_pages } = ctx
	if (nav.input) {
		nav.input.value = current_page
		nav.input.max = total_pages
		nav.input.disabled = total_pages <= 0
	}
	if (nav.total) nav.total.textContent = total_pages

	const isFirst = current_page <= 1
	const isLast = current_page >= total_pages

	nav.btns.next.disabled = isLast
	nav.btns.last.disabled = isLast
	nav.btns.prev.disabled = isFirst
	nav.btns.first.disabled = isFirst
}

/**
 * Сброс состояния таблицы при ошибке или пустых данных.
 * @private
 */
const _resetTableState = nav => {
	TableManager.updateTable('', 'transactions-table')
	TableManager.calculateTableSummary('transactions-table', ['amount'])
	if (nav.input) {
		nav.input.value = 1
		nav.input.disabled = true
	}
	if (nav.total) nav.total.textContent = '1'
	Object.values(nav.btns).forEach(btn => {
		if (btn && btn.id !== 'load-data') btn.disabled = true
	})
}

/**
 * Присваивает ID строкам транзакций.
 * @private
 */
const _setTransactionRowIds = (ids = []) => {
	const rows = document
		.getElementById('transactions-table')
		?.querySelectorAll('tbody tr:not(.table__row--summary)')
	if (!rows || rows.length !== ids.length) return
	rows.forEach((row, i) => row.setAttribute('data-id', ids[i]))
}

/**
 * Подсветка сумм в таблице (красный/зеленый).
 * @param {string} tableId
 */
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

		const val = parseNumeric(cell.textContent)
		cell.classList.remove('text-red', 'text-green')
		if (val < 0) cell.classList.add('text-red')
		else if (val > 0) cell.classList.add('text-green')

		cell.textContent = formatCurrency(val)
	})
}
/**
 * @file .
 * @description Инициализация страницы текущей смены, настройка транзакций и управления таблицами.
 */

/**
 * Инициализирует страницу текущей смены.
 */
const initCurrentShiftPage = () => {
	collapseContainer('current-shift-left', 'Баланс')
	enableResize('current-shift-left')
	colorizeTableAmounts('transactions-table')
	TableManager.init()

	_initShiftSummaries()
	_initTransactionIds()
	_setupRowActionButtons()
	_initTransactionButtons()
	_setupCloseShiftButton()
}

/**
 * Инициализирует итоговые значения таблиц баланса.
 * @private
 */
const _initShiftSummaries = () => {
	TableManager.calculateTableSummary(
		'transactions-bank-accounts-table',
		['balance', 'shift_amount', 'total_amount'],
		{ grouped: true, total: true },
	)

	TableManager.createColumnsForTable(
		'transactions-table',
		[
			{ name: 'category', url: `/ledger/${TRANSACTION_CATEGORIES}/list/` },
			{ name: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
			{ name: 'amount' },
			{ name: 'client', url: '/commerce/clients/list/' },
			{ name: 'order' },
			{ name: 'type', url: '/ledger/transaction-types/' },
			{ name: 'comment' },
		],
		['amount'],
	)
	TableManager.calculateTableSummary('transactions-table', ['amount'])
}

/**
 * Парсит и устанавливает ID для строк транзакций из скрытого элемента данных.
 * @private
 */
const _initTransactionIds = () => {
	const dataElem = document.getElementById('transaction-ids-data')
	if (!dataElem?.textContent) return

	try {
		const ids = JSON.parse(dataElem.textContent)
		setIds(ids, 'transactions-table')
	} catch (e) {
		console.error('Failed to parse transaction IDs:', e)
	}
}

/**
 * Универсальный обработчик действий над выбранной строкой (редактирование/удаление).
 * @param {string} btnId - ID кнопки.
 * @param {string} actionType - 'edit' или 'delete'.
 * @private
 */
const _setupRowActionButtons = () => {
	const actions = [
		{
			id: 'edit-button',
			type: 'edit',
			msg: 'Выберите строку для редактирования',
		},
		{
			id: 'delete-button',
			type: 'delete',
			msg: 'Выберите строку для удаления',
		},
	]

	actions.forEach(({ id, type, msg }) => {
		document.getElementById(id)?.addEventListener('click', () => {
			const rowId = TableManager.getSelectedRowId('transactions-table')
			const row = rowId
				? TableManager.getRowById(rowId, 'transactions-table')
				: null

			if (!row) return showError(msg)

			if (type === 'edit') editTransaction(rowId, row, 'transactions-table')
			else deleteTransaction(rowId, row)
		})
	})
}

/**
 * Настраивает кнопки создания различных типов транзакций.
 * @private
 */
const _initTransactionButtons = () => {
	const baseConfig = {
		tableId: 'transactions-table',
		formId: 'transactions-form',
		onSuccess: res =>
			handleTransactionSuccess(res, 'transactions-table', false),
	}

	const types = {
		'income-button': {
			submitUrl: '/ledger/transactions/add/',
			modalConfig: {
				title: 'Приход',
				context: { type: 'income' },
				url: '/components/ledger/add_transaction/',
			},
			dataUrls: [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/list/?type=income`,
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
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/list/?type=expense`,
				},
			],
		},
		'transfer-button': {
			submitUrl: '/ledger/transfers/add/',
			modalConfig: {
				title: 'Перевод',
				url: '/components/ledger/add_transfer/',
			},
			dataUrls: [
				{ id: 'source_bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'destination_bank_account',
					url: `/ledger/${BANK_ACCOUNTS}/list/`,
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
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
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
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
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

	Object.entries(types).forEach(([id, cfg]) => {
		const btn = document.getElementById(id)
		if (!btn) return

		btn.addEventListener('click', async () => {
			const finalConfig = { ...baseConfig, ...cfg }
			await initTransactionForm(finalConfig, null)

			if (id === 'order-payment-button') _bindOrderDebtLogic(finalConfig.formId)
			if (id === 'ls-payment-button') _initLSPaymentModal(finalConfig.formId)
		})
	})
}

/**
 * Логика обновления долга при выборе заказа в форме.
 * @private
 */
const _bindOrderDebtLogic = formId => {
	const form = document.getElementById(formId)
	const dropdown = form
		?.querySelector('#order')
		?.closest('.select')
		?.querySelector('.select__dropdown')
	if (!dropdown) return

	dropdown.addEventListener('click', async e => {
		const option = e.target.closest('.select__option')
		if (option) {
			const debt = await fetchOrderDebt(option.dataset.value, 0)
			displayOrderDebt('debt_amount', debt)
		}
	})
}

/**
 * Инициализация сложной логики выбора клиента и заказа для оплаты с ЛС.
 * @private
 */
const _initLSPaymentModal = async formId => {
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
			await updateClientOrdersList(data.ids[idx].id, orderSelect, true)
			displayOrderDebt('debt_amount', null)
		}

		// Начальное состояние
		if (rows[0]) await selectClient(0, rows[0])

		table.addEventListener('click', e => {
			const row = e.target.closest('tbody tr:not(.table__row--summary)')
			const idx = rows.indexOf(row)
			if (idx !== -1) selectClient(idx, row)
		})

		_bindOrderDebtLogic(formId)
	} catch (error) {
		loader.remove()
		showError('Ошибка загрузки клиентов')
	}
}

/**
 * Настройка кнопки закрытия смены.
 * @private
 */
const _setupCloseShiftButton = () => {
	document
		.getElementById('close-shift-button')
		?.addEventListener('click', async () => {
			const hasPerm = await _checkPermission('close_current_shift')
			if (!hasPerm) return showError('Нет прав на закрытие смены')

			showQuestion(
				'Вы уверены, что хотите закрыть смену?',
				'Закрытие',
				async () => {
					const loader = createLoader()
					document.body.appendChild(loader)

					try {
						const res = await fetch('/ledger/close-shift/', {
							method: 'POST',
							headers: {
								'X-Requested-With': 'XMLHttpRequest',
								'X-CSRFToken': getCSRFToken(),
							},
						})
						const data = await res.json()

						if (res.ok && data.html) {
							TableManager.replaceEntireTable(
								data.html,
								'transactions-bank-accounts-container',
								'transactions-bank-accounts-table',
							)
							_initShiftSummaries()

							const tbody = document.querySelector('#transactions-table tbody')
							if (tbody) tbody.innerHTML = ''

							TableManager.calculateTableSummary('transactions-table', [
								'amount',
							])
							showSuccess('Смена успешно закрыта.')
						} else {
							showError(data.message || 'Ошибка обновления данных.')
						}
					} catch (e) {
						showError('Сетевая ошибка при закрытии смены.')
					} finally {
						loader.remove()
					}
				},
			)
		})
}

/**
 * Удаляет транзакцию из закрытой смены.
 * @param {string} transactionId
 * @param {HTMLElement} row
 * @param {string} tableId
 */
const deleteClosedTransaction = (transactionId, row, tableId) => {
	showQuestion(
		'Вы действительно хотите удалить запись?',
		'Удаление',
		async () => {
			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				const data = await TableManager.sendDeleteRequest(
					transactionId,
					'/ledger/transactions/closed/delete/',
					tableId,
				)
				if (data?.status === 'success') {
					row?.remove()
					if (data.related_transaction_id) {
						TableManager.getRowById(
							data.related_transaction_id,
							tableId,
						)?.remove()
					}
					TableManager.calculateTableSummary(tableId, ['amount'])
					showSuccess('Запись успешно удалена')
				}
			} catch (error) {
				showError('Ошибка при удалении.')
			} finally {
				loader.remove()
			}
		},
	)
}

/**
 * Проверка прав пользователя.
 * @private
 */
const _checkPermission = async perm => {
	try {
		const res = await fetch(`/users/check-permission/?permission=${perm}`, {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		return res.ok
	} catch {
		return false
	}
}

/**
 * Подсветка сумм для таблицы всех транзакций.
 */
function colorizeAllTransactionTableAmounts() {
	colorizeTableAmounts('all_transaction-table')
}

/**
 * Инициализирует страницу "Все транзакции".
 */
async function initAllTransactionsPage() {
	const tableContainer = document.getElementById('all_transaction-container')
	if (!tableContainer) return

	const elements = {
		table: document.getElementById('all_transaction-table'),
		nextBtn: document.getElementById('next-page'),
		prevBtn: document.getElementById('prev-page'),
		lastBtn: document.getElementById('last-page'),
		firstBtn: document.getElementById('first-page'),
		pageInput: document.getElementById('current-page'),
		totalSpan: document.getElementById('total-pages'),
		refreshBtn: document.getElementById('refresh'),
		editBtn: document.getElementById('edit-button'),
		deleteBtn: document.getElementById('delete-button'),
		addBtn: document.getElementById('add-button'),
	}

	colorizeAllTransactionTableAmounts()

	/**
	 * Загружает данные страницы и обновляет таблицу.
	 * @param {number} page
	 */
	const updateTable = async page => {
		const loader = createLoader()
		document.body.appendChild(loader)
		try {
			const response = await fetch(`/ledger/transactions/table/?page=${page}`, {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const data = await response.json()

			if (response.ok && data.html) {
				const tbody = elements.table?.querySelector('tbody')
				if (tbody) tbody.innerHTML = data.html

				colorizeAllTransactionTableAmounts()
				TableManager.calculateTableSummary('all_transaction-table', ['amount'])
				updatePaginationUI(data.context, elements)
			}
		} catch (error) {
			console.error('Failed to update transactions table:', error)
		} finally {
			loader.remove()
		}
	}

	// Слушатели навигации
	elements.refreshBtn?.addEventListener('click', () =>
		updateTable(parseInt(elements.pageInput?.value) || 1),
	)
	elements.nextBtn?.addEventListener('click', () =>
		updateTable((parseInt(elements.pageInput?.value) || 1) + 1),
	)
	elements.prevBtn?.addEventListener('click', () =>
		updateTable((parseInt(elements.pageInput?.value) || 1) - 1),
	)
	elements.firstBtn?.addEventListener('click', () => updateTable(1))
	elements.lastBtn?.addEventListener('click', () =>
		updateTable(parseInt(elements.totalSpan?.textContent) || 1),
	)

	elements.pageInput?.addEventListener('change', e => {
		const page = Math.min(
			Math.max(parseInt(e.target.value) || 1, 1),
			parseInt(elements.totalSpan?.textContent) || 1,
		)
		e.target.value = page
		updateTable(page)
	})

	// Действия со строками
	elements.editBtn?.addEventListener('click', () => handleRowAction('edit'))
	elements.deleteBtn?.addEventListener('click', () => handleRowAction('delete'))
	elements.addBtn?.addEventListener('click', () => showAddTransactionModal())

	/**
	 * Обрабатывает выбор строки для редактирования или удаления.
	 */
	async function handleRowAction(action) {
		const selectedRow = TableManager.getSelectedRow('all_transaction-table')
		const rowId = selectedRow?.getAttribute('data-id')

		if (!selectedRow || !rowId)
			return showError(
				selectedRow ? 'Не удалось получить ID строки' : 'Выберите строку',
			)

		if (action === 'edit') {
			const hasPermission = await checkUserPermission(
				'edit_closed_transactions',
			)
			if (hasPermission)
				editTransactionForAll(rowId, selectedRow, 'all_transaction-table', true)
		} else {
			deleteClosedTransaction(rowId, selectedRow, 'all_transaction-table')
		}
	}

	updateTable(1)
}

/**
 * Инициализирует страницу балансов.
 */
function initBalancesPage() {
	TableManager.calculateTableSummary(
		'bank_accounts_balances-table',
		['balance'],
		{ grouped: true, total: true },
	)
}

/**
 * Проверяет права пользователя через API.
 * @param {string} permission
 * @returns {Promise<boolean>}
 */
async function checkUserPermission(permission) {
	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		const response = await fetch(
			`/users/check-permission/?permission=${permission}`,
			{
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			},
		)
		if (response.ok) return true
		showError('У вас нет прав на это действие')
		return false
	} catch (e) {
		showError('Ошибка проверки прав')
		return false
	} finally {
		loader.remove()
	}
}

/**
 * Обновляет состояние элементов пагинации.
 */
function updatePaginationUI(context, el) {
	const { current_page, total_pages, transaction_ids = [] } = context || {}
	if (el.pageInput) {
		el.pageInput.value = current_page || 1
		el.pageInput.max = total_pages || 1
		el.pageInput.disabled = !total_pages
	}
	if (el.totalSpan) el.totalSpan.textContent = total_pages || 1

	const isFirst = current_page <= 1
	const isLast = current_page >= total_pages

	if (el.nextBtn) el.nextBtn.disabled = isLast
	if (el.lastBtn) el.lastBtn.disabled = isLast
	if (el.prevBtn) el.prevBtn.disabled = isFirst
	if (el.firstBtn) el.firstBtn.disabled = isFirst

	// Привязка ID к строкам
	const rows = document.querySelectorAll(
		'#all_transaction-table tbody tr:not(.table__row--summary)',
	)
	rows.forEach(
		(row, i) =>
			transaction_ids[i] && row.setAttribute('data-id', transaction_ids[i]),
	)
}

/**
 * Глобальные элементы интерфейса (скрытие строк, счетчики).
 */
function initGlobalUI() {
	const content = document.querySelector('.content')
	if (!content) return

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

	document.getElementById('hide-button')?.addEventListener('click', () => {
		const selected = document.querySelector('.table__row--selected')
		if (selected) {
			selected.classList.add('hidden-row')
			selected.style.display = 'none'
			updateCounter()
		}
	})

	document.getElementById('show-all-button')?.addEventListener('click', () => {
		document.querySelectorAll('tr.hidden-row').forEach(row => {
			row.classList.remove('hidden-row')
			row.style.display = ''
		})
		updateCounter()
	})
}

/**
 * Отображает модальное окно выбора типа транзакции.
 */
function showAddTransactionModal() {
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
                <div id="transaction-type-buttons">
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

	const configsMap = {
		'income-modal': {
			submitUrl: '/ledger/transactions/add/',
			modalConfig: {
				url: '/components/ledger/add_transaction/',
				title: 'Приход',
				context: { type: 'income' },
			},
			dataUrls: [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/list/?type=income`,
				},
			],
		},
		'expense-modal': {
			submitUrl: '/ledger/transactions/add/',
			modalConfig: {
				url: '/components/ledger/add_transaction/',
				title: 'Расход',
				context: { type: 'expense' },
			},
			dataUrls: [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/list/?type=expense`,
				},
			],
		},
		'transfer-modal': {
			submitUrl: '/ledger/transfers/add/',
			modalConfig: {
				url: '/components/ledger/add_transfer/',
				title: 'Перевод',
			},
			dataUrls: [
				{ id: 'source_bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
				{
					id: 'destination_bank_account',
					url: `/ledger/${BANK_ACCOUNTS}/list/`,
				},
			],
		},
		'order-pay-modal': {
			isOrderPayment: true,
			submitUrl: '/ledger/order-payments/add/',
			modalConfig: {
				url: '/components/ledger/add_order_payment/',
				title: 'Оплата заказа',
			},
			dataUrls: [
				{
					id: 'order',
					url: '/commerce/orders/ids/',
					includeValuesInSearch: true,
				},
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
			],
		},
		'deposit-modal': {
			submitUrl: '/ledger/client-balance/deposit/',
			modalConfig: {
				url: '/components/ledger/deposit_client_balance/',
				title: 'Зачисление на ЛС',
			},
			dataUrls: [
				{ id: 'client', url: '/commerce/clients/list/' },
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/list/` },
			],
		},
		'ls-pay-modal': {
			isLSPayment: true,
			submitUrl: '/ledger/client-balance/payment/',
			modalConfig: {
				url: '/components/ledger/ls_payment/',
				title: 'Оплата заказа с ЛС',
			},
		},
	}

	Object.entries(configsMap).forEach(([id, cfg]) => {
		document
			.getElementById(id)
			?.addEventListener('click', () => setupTransactionAction(cfg))
	})
}

/**
 * Инициализирует форму транзакции на основе переданного конфига.
 */
async function setupTransactionAction(cfg) {
	const finalConfig = {
		tableId: 'all_transaction-table',
		formId: 'transactions-form',
		onSuccess: res =>
			handleTransactionSuccess(res, 'all_transaction-table', false),
		...cfg,
	}

	try {
		await initTransactionForm(finalConfig, null)
		const form = document.getElementById(finalConfig.formId)
		if (!form) return

		if (cfg.isOrderPayment) bindOrderDebtLogic(form)
		if (cfg.isLSPayment) initLSPaymentLogic(form)
	} catch (e) {
		console.error('Form init error:', e)
	}
}

/**
 * Привязывает логику отображения долга к выпадающему списку заказов.
 */
function bindOrderDebtLogic(form) {
	const debtInput = form.querySelector('#debt_amount')
	if (debtInput) debtInput.value = DEFAULT_CURRENCY_VALUE

	form
		.querySelector('#order')
		?.closest('.select')
		?.querySelector('.select__dropdown')
		?.addEventListener('click', async e => {
			const option = e.target.closest('.select__option')
			if (option) {
				const debt = await fetchOrderDebt(option.dataset.value, 0)
				displayOrderDebt('debt_amount', debt)
			}
		})
}

/**
 * Инициализирует таблицу клиентов и выбор заказа для оплаты с ЛС.
 */
async function initLSPaymentLogic(form) {
	const container = form.querySelector('#clients-table--container')
	if (!container) return

	const loader = createLoader()
	container.appendChild(loader)

	try {
		const response = await fetch('/commerce/clients/balances/', {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		const data = await response.json()

		if (data.html && data.ids?.length) {
			const table = TableManager.replaceEntireTable(
				data.html,
				'clients-table--container',
				'clients-table',
			)
			const clientInput = form.querySelector('#client')
			const orderSelect = form.querySelector('#order')
			const rows = Array.from(
				table.querySelectorAll('tbody tr:not(.table__row--summary)'),
			)

			const selectClient = async (idx, row) => {
				table
					.querySelectorAll('.table__row--selected')
					.forEach(r => r.classList.remove('table__row--selected'))
				row.classList.add('table__row--selected')
				clientInput.value = data.ids[idx].id
				await updateClientOrdersList(data.ids[idx].id, orderSelect, true, null)
				displayOrderDebt('debt_amount', null)
			}

			if (rows[0]) await selectClient(0, rows[0])

			table.addEventListener('click', e => {
				const row = e.target.closest('tbody tr:not(.table__row--summary)')
				const idx = rows.indexOf(row)
				if (idx !== -1) selectClient(idx, row)
			})

			bindOrderDebtLogic(form)
		} else {
			container.innerHTML = '<p>Нет клиентов с балансом.</p>'
		}
	} catch (e) {
		showError('Ошибка загрузки данных клиентов')
	} finally {
		loader.remove()
	}
}

/**
 * @file .
 * @description Основной инициализатор приложения. Управляет маршрутизацией страниц и общим поведением таблиц.
 */

document.addEventListener('DOMContentLoaded', () => {
	const pathname = window.location.pathname
	const parts = pathname.split('/').filter(Boolean)
	const urlName =
		parts.length > 0 ? parts[parts.length - 1].replace(/-/g, '_') : null

	TableManager.init()
	addMenuHandler()
	initGlobalUI()

	if (!urlName) return

	// Маршрутизация инициализации страниц
	const pageInitializers = {
		bank_accounts: () =>
			configs.bank_accounts && initGenericLedgerPage(configs.bank_accounts),
		transaction_categories: () =>
			configs.transaction_categories &&
			initGenericLedgerPage(configs.transaction_categories),
		payments: initPaymentsPage,
		transactions: initTransactionsPage,
		current_shift: initCurrentShiftPage,
		balances: initBalancesPage,
		all: initAllTransactionsPage,
	}

	if (pageInitializers[urlName]) {
		pageInitializers[urlName]()
	} else {
		console.warn(`No specific initialization logic for: ${urlName}`)
	}
})
