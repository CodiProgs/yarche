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
const BASE_URL = '/ledger/'
const BANK_ACCOUNTS = 'bank-accounts'
const TRANSACTION_CATEGORIES = 'transaction-categories'
const CURRENCY_SUFFIX = ' р.'
const DEFAULT_CURRENCY_VALUE = `0,00${CURRENCY_SUFFIX}`

const configs = {
	bank_accounts: {
		containerId: `${BANK_ACCOUNTS}-container`,
		tableId: `${BANK_ACCOUNTS}-table`,
		formId: `${BANK_ACCOUNTS}-form`,
		getUrl: `${BASE_URL}${BANK_ACCOUNTS}/`,
		addUrl: `${BASE_URL}${BANK_ACCOUNTS}/add/`,
		editUrl: `${BASE_URL}${BANK_ACCOUNTS}/edit/`,
		deleteUrl: `${BASE_URL}${BANK_ACCOUNTS}/delete/`,
		refreshUrl: `${BASE_URL}${BANK_ACCOUNTS}/refresh/`,
		dataUrls: [{ id: 'id_type', url: `${BASE_URL}${BANK_ACCOUNTS}/types/` }],
	},
	transaction_categories: {
		containerId: `${TRANSACTION_CATEGORIES}-container`,
		tableId: `${TRANSACTION_CATEGORIES}-table`,
		formId: `${TRANSACTION_CATEGORIES}-form`,
		getUrl: `${BASE_URL}${TRANSACTION_CATEGORIES}/`,
		addUrl: `${BASE_URL}${TRANSACTION_CATEGORIES}/add/`,
		editUrl: `${BASE_URL}${TRANSACTION_CATEGORIES}/edit/`,
		deleteUrl: `${BASE_URL}${TRANSACTION_CATEGORIES}/delete/`,
		refreshUrl: `${BASE_URL}${TRANSACTION_CATEGORIES}/refresh/`,
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

const parseNumeric = text => {
	if (text === null || typeof text === 'undefined') return 0
	const cleaned = String(text)
		.replace(/[^\d,-]/g, '')
		.replace(',', '.')
	return parseFloat(cleaned) || 0
}

const formatCurrency = value => {
	const numericValue =
		typeof value === 'string' ? parseNumeric(value) : Number(value)
	return (
		(numericValue || 0)
			.toFixed(2)
			.replace('.', ',')
			.replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + CURRENCY_SUFFIX
	)
}

const formatDate = date => {
	const day = String(date.getDate()).padStart(2, '0')
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const year = date.getFullYear()
	return `${day}.${month}.${year}`
}

const formatDateForServer = date => {
	const year = date.getFullYear()
	const month = String(date.getMonth() + 1).padStart(2, '0')
	const day = String(date.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
}

const initDatePicker = (inputSelector, iconSelector, defaultDateStr) => {
	const inputElement = document.querySelector(inputSelector)
	const iconElement = document.querySelector(iconSelector)

	if (!inputElement || !iconElement) {
		console.warn(
			`Date picker elements not found for: ${inputSelector} / ${iconSelector}`
		)
		return null
	}

	let isIconClicked = false

	iconElement.addEventListener('mousedown', () => {
		isIconClicked = true
	})

	const datePickerInstance = flatpickr(inputElement, {
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
		if (isIconClicked) {
			datePickerInstance.toggle()
		}
		isIconClicked = false
	})

	return datePickerInstance
}

function setupCurrencyInput(inputId) {
	const input = document.getElementById(inputId)
	if (!input) {
		console.error(`Input with id "${inputId}" not found`)
		return
	}
	new AutoNumeric(input, {
		allowDecimalPadding: true,
		alwaysAllowDecimalCharacter: true,
		currencySymbol: CURRENCY_SUFFIX,
		currencySymbolPlacement: 's',
		decimalCharacter: ',',
		decimalCharacterAlternative: '.',
		decimalPlacesRawValue: 2,
		digitGroupSeparator: ' ',
		emptyInputBehavior: 'zero',
		minimumValue: '0',
	})
}

const findAndUpdateBankAccountRow = (accountName, amountChange) => {
	const bankAccountsTable = document.getElementById('bank-accounts-table')
	if (!bankAccountsTable) return

	const accountRow = Array.from(
		bankAccountsTable.querySelectorAll('tbody tr:not(.table__row--summary)')
	).find(row => {
		const accountCell = row.querySelector('td:first-child')
		return accountCell?.textContent?.trim() === accountName
	})

	if (!accountRow) return

	const accountCells = accountRow.querySelectorAll('td')

	if (accountCells.length < 4) return

	const currentBalance = parseNumeric(accountCells[1]?.textContent)
	const currentShift = parseNumeric(accountCells[2]?.textContent)

	const newShift = currentShift + amountChange
	accountCells[2].textContent = formatCurrency(newShift)
	accountCells[3].textContent = formatCurrency(currentBalance + newShift)
}

const updateBankAccountSummaryAfterAdd = (isTransfer = false) => {
	const transactionsTable = document.getElementById('transactions-table')
	if (!transactionsTable) return

	const transactionRows = Array.from(
		transactionsTable.querySelectorAll('tbody tr:not(.table__row--summary)')
	)
	if (transactionRows.length === 0) return

	const targetRows = isTransfer
		? transactionRows.slice(-2)
		: transactionRows.length > 0
		? [transactionRows[transactionRows.length - 1]]
		: []

	targetRows.forEach(transactionRow => {
		const cells = transactionRow.querySelectorAll('td')

		if (cells.length < 3) return

		const accountName = cells[1]?.textContent?.trim()
		const transactionAmount = parseNumeric(cells[2]?.textContent)

		if (accountName && !isNaN(transactionAmount)) {
			findAndUpdateBankAccountRow(accountName, transactionAmount)
		}
	})

	TableManager.calculateTableSummary(
		'bank-accounts-table',
		['balance', 'shift_amount', 'total_amount'],
		{ grouped: true, total: true }
	)
}

const updateBankAccountSummaryAfterEdit = (
	outgoingTransactionId,
	incomingTransactionId,
	outgoingPreviousAccountName,
	outgoingPreviousAmount,
	incomingPreviousAccountName = null,
	incomingPreviousAmount = null
) => {
	const transactionsTable = document.getElementById('transactions-table')
	if (!transactionsTable) return

	if (outgoingPreviousAccountName && outgoingPreviousAmount !== null) {
		findAndUpdateBankAccountRow(
			outgoingPreviousAccountName,
			-outgoingPreviousAmount
		)
	}

	if (
		incomingTransactionId &&
		incomingPreviousAccountName &&
		incomingPreviousAmount !== null
	) {
		findAndUpdateBankAccountRow(
			incomingPreviousAccountName,
			-incomingPreviousAmount
		)
	}

	const outgoingRow = transactionsTable.querySelector(
		`tr[data-id="${outgoingTransactionId}"]`
	)
	if (outgoingRow) {
		const outgoingCells = outgoingRow.querySelectorAll('td')
		if (outgoingCells.length >= 3) {
			const newAccountName = outgoingCells[1]?.textContent?.trim()
			const newAmount = parseNumeric(outgoingCells[2]?.textContent)
			if (newAccountName && !isNaN(newAmount)) {
				findAndUpdateBankAccountRow(newAccountName, newAmount)
			}
		}
	}

	if (incomingTransactionId) {
		const incomingRow = transactionsTable.querySelector(
			`tr[data-id="${incomingTransactionId}"]`
		)
		if (incomingRow) {
			const incomingCells = incomingRow.querySelectorAll('td')
			if (incomingCells.length >= 3) {
				const newAccountName = incomingCells[1]?.textContent?.trim()
				const newAmount = parseNumeric(incomingCells[2]?.textContent)
				if (newAccountName && !isNaN(newAmount)) {
					findAndUpdateBankAccountRow(newAccountName, newAmount)
				}
			}
		}
	}

	TableManager.calculateTableSummary(
		'bank-accounts-table',
		['balance', 'shift_amount', 'total_amount'],
		{ grouped: true, total: true }
	)
}

const updateBankAccountSummaryAfterDelete = (
	transactionRow,
	relatedTransactionRow = null
) => {
	const updateForRowDeletion = row => {
		if (!row) return
		const cells = row.querySelectorAll('td')

		if (cells.length >= 3) {
			const accountName = cells[1]?.textContent?.trim()
			const transactionAmount = parseNumeric(cells[2]?.textContent)
			if (accountName && !isNaN(transactionAmount)) {
				findAndUpdateBankAccountRow(accountName, -transactionAmount)
			}
		}

		row.remove()
	}

	updateForRowDeletion(transactionRow)

	updateForRowDeletion(relatedTransactionRow)

	TableManager.calculateTableSummary(
		'bank-accounts-table',
		['balance', 'shift_amount', 'total_amount'],
		{ grouped: true, total: true }
	)
	TableManager.calculateTableSummary('transactions-table', ['amount'])
}

const initTransactionForm = async (config, editId = null) => {
	const formHandler = new DynamicFormHandler(config)

	await formHandler.init(editId)

	const formElement = document.getElementById(
		config.formId || 'transactions-form'
	)
	if (formElement) {
		const amountInput = formElement.querySelector('#amount')
		if (amountInput) {
			setupCurrencyInput('amount', editId !== null)
		}
	} else {
		console.warn(
			`Form with id "${
				config.formId || 'transactions-form'
			}" not found during initTransactionForm.`
		)
	}

	return formHandler
}

const handleTransactionSuccess = async (result, tableId, isEdit = false) => {
	const processTableRow = async (transactionData, targetTableId, wasEdit) => {
		const method = wasEdit ? 'updateTableRow' : 'addTableRow'

		const processedRow = await TableManager[method](
			transactionData,
			targetTableId
		)
		if (processedRow) {
			processedRow.setAttribute('data-id', transactionData.id)
			TableManager.addActionsToRow(
				processedRow,
				transactionData.id,
				editTransaction,
				deleteTransaction
			)
		} else {
			console.warn(
				`TableManager.${method} did not return a row for data:`,
				transactionData
			)
		}
		return processedRow
	}

	try {
		if (result.html && result.id) {
			await processTableRow(result, tableId, isEdit)
			if (isEdit) {
				updateBankAccountSummaryAfterEdit(
					result.id,
					null,
					result.outgoingPreviousAccountName,
					result.outgoingPreviousAmount
				)
			} else {
				updateBankAccountSummaryAfterAdd(false)
			}
		} else if (result.outgoing_transaction && result.incoming_transaction) {
			await processTableRow(result.outgoing_transaction, tableId, isEdit)
			await processTableRow(result.incoming_transaction, tableId, isEdit)
			if (isEdit) {
				updateBankAccountSummaryAfterEdit(
					result.outgoing_transaction.id,
					result.incoming_transaction.id,
					result.outgoingPreviousAccountName,
					result.outgoingPreviousAmount,
					result.incomingPreviousAccountName,
					result.incomingPreviousAmount
				)
			} else {
				updateBankAccountSummaryAfterAdd(true)
			}
		} else if (
			result.id &&
			result.type &&
			!result.html &&
			!result.outgoing_transaction
		) {
			await processTableRow(result, tableId, isEdit)
			if (isEdit) {
				updateBankAccountSummaryAfterEdit(
					result.id,
					null,
					result.outgoingPreviousAccountName,
					result.outgoingPreviousAmount
				)
			} else {
				updateBankAccountSummaryAfterAdd(false)
			}
		} else {
			console.error('Unknown transaction success result structure:', result)
			showError(
				'Не удалось обработать ответ сервера после сохранения транзакции.'
			)
			return
		}

		TableManager.calculateTableSummary(tableId, ['amount'])
	} catch (error) {
		console.error('Error handling transaction success:', error)
		showError('Произошла ошибка при обновлении таблицы после сохранения.')
	}
}

const fetchOrderDebt = async (orderId, currentPaymentAmount = 0) => {
	if (!orderId) return null

	const loader = createLoader()
	document.body.appendChild(loader)
	let debtValue = null
	try {
		const response = await fetch(`/commerce/orders/${orderId}/debt/`)
		if (!response.ok) {
			throw new Error(`Server responded with status: ${response.status}`)
		}
		const data = await response.json()

		debtValue = parseFloat(data.debt) + Number(currentPaymentAmount)
	} catch (error) {
		console.error('Error fetching order debt:', error)
		showError('Не удалось загрузить долг по заказу.')
	} finally {
		loader.remove()
	}
	return debtValue
}

const displayOrderDebt = (inputId, debtValue) => {
	const debtAmountInput = document.getElementById(inputId)
	if (debtAmountInput) {
		debtAmountInput.value =
			debtValue !== null && !isNaN(debtValue)
				? formatCurrency(debtValue)
				: DEFAULT_CURRENCY_VALUE
	}
}

const updateClientOrdersList = async (
	clientId,
	selectElement,
	isFirstLoad = false,
	targetOrderId = null
) => {
	if (!selectElement) {
		console.error('updateClientOrdersList: selectElement not provided.')
		return
	}
	const selectParent = selectElement.closest('.select')
	if (!selectParent) {
		console.error(
			'updateClientOrdersList: Could not find .select parent for',
			selectElement
		)
		return
	}

	const selectInput = selectParent.querySelector('.select__input')
	const selectText = selectParent.querySelector('.select__text')

	if (selectInput) selectInput.value = ''
	if (selectText) selectText.textContent = 'Загрузка заказов...'

	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		const url = `/commerce/orders/ids/?client=${clientId}${
			targetOrderId ? `&order=${targetOrderId}` : ''
		}`
		const response = await fetch(url, {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		if (!response.ok) {
			throw new Error(`Ошибка загрузки заказов: ${response.status}`)
		}
		const data = await response.json()

		if (isFirstLoad) {
			await SelectHandler.setupSelects({ data: data, select: selectParent })
		} else {
			SelectHandler.updateSelectOptions(selectParent, data)
		}

		if (targetOrderId) {
			await new Promise(resolve => setTimeout(resolve, 50))

			let foundAndSelected = false

			const options = selectParent.querySelectorAll('.select__option')
			for (const option of options) {
				if (option.dataset.value === String(targetOrderId)) {
					option.click()
					foundAndSelected = true
					break
				}
			}

			if (
				!foundAndSelected &&
				selectInput &&
				selectInput.value !== String(targetOrderId)
			) {
				const targetOrderItem = data.find(
					item => String(item.id) === String(targetOrderId)
				)
				if (targetOrderItem) {
					selectInput.value = targetOrderItem.id
					if (selectText)
						selectText.textContent =
							targetOrderItem.name || `Заказ #${targetOrderItem.id}`
					foundAndSelected = true
				}
			}

			if (!foundAndSelected) {
				console.warn(
					`Target order ID ${targetOrderId} not found in fetched list for client ${clientId}.`
				)
				if (selectText)
					selectText.textContent =
						data.length > 0 ? 'Выберите заказ' : 'Нет заказов'
			}
		} else {
			if (selectText)
				selectText.textContent =
					data.length > 0 ? 'Выберите заказ' : 'Нет заказов'
		}
	} catch (error) {
		console.error('Ошибка получения данных для select (заказы):', error)
		showError('Не удалось загрузить список заказов.')
		if (selectText) selectText.textContent = 'Ошибка загрузки'
	} finally {
		loader.remove()

		displayOrderDebt('debt_amount', null)
	}
}

const deleteTransaction = (transactionId, row) => {
	showQuestion(
		'Вы действительно хотите удалить запись?',
		'Удаление',
		async () => {
			const loader = createLoader()
			document.body.appendChild(loader)
			let relatedRow = null
			try {
				const data = await TableManager.sendDeleteRequest(
					transactionId,
					'/ledger/transactions/delete/',
					'transactions-table'
				)

				if (data?.success) {
					const relatedTransactionId = data.related_transaction_id
					if (relatedTransactionId) {
						relatedRow = TableManager.getRowById(
							relatedTransactionId,
							'transactions-table'
						)
					}

					updateBankAccountSummaryAfterDelete(row, relatedRow)

					showSuccess('Запись успешно удалена')
				} else {
					console.error(
						'Deletion failed or did not return success:',
						data?.message
					)
				}
			} catch (error) {
				console.error('Error during deleteTransaction process:', error)
				showError('Произошла ошибка при удалении.')
			} finally {
				loader.remove()
			}
		}
	)
}

const editTransaction = async (transactionId, row, tableId) => {
	const table = document.getElementById(tableId)
	if (!table) {
		console.error(`Таблица с id "${tableId}" не найдена`)
		showError(`Ошибка: Таблица "${tableId}" не найдена.`)
		return
	}

	const headers = Array.from(table.querySelectorAll('thead th'))
	const typeHeaderIndex = headers.findIndex(th => th.dataset.name === 'type')

	if (typeHeaderIndex === -1) {
		console.error('Не найден столбец с типом транзакции (data-name="type")')
		showError(
			'Ошибка: Не удалось определить тип транзакции для редактирования.'
		)
		return
	}

	const cells = row.querySelectorAll('td')
	const typeCell = cells[typeHeaderIndex]
	if (!typeCell) {
		console.error('Не найдена ячейка с типом транзакции в строке.')
		showError(
			'Ошибка: Не удалось определить тип транзакции для редактирования.'
		)
		return
	}

	const typeValue = typeCell.dataset.value || typeCell.textContent.trim()

	let config = {
		submitUrl: `/ledger/transactions/edit/`,
		getUrl: `${BASE_URL}transactions/`,
		tableId: 'transactions-table',
		formId: 'transactions-form',
		modalConfig: {
			url: '',
			title: '',
			context: {},
		},

		onSuccess: async result =>
			handleTransactionSuccess(result, 'transactions-table', true),
		dataUrls: [],
	}

	switch (typeValue) {
		case 'Приход':
			config.dataUrls = [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/?type=income`,
				},
			]
			config.modalConfig.url = '/components/ledger/add_transaction/'
			config.modalConfig.title = 'Редактирование прихода'
			config.modalConfig.context = { type: 'income' }

			break
		case 'Расход':
			config.dataUrls = [
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
				{
					id: 'category',
					url: `/ledger/${TRANSACTION_CATEGORIES}/?type=expense`,
				},
			]
			config.modalConfig.url = '/components/ledger/add_transaction/'
			config.modalConfig.title = 'Редактирование расхода'
			config.modalConfig.context = { type: 'expense' }

			break
		case 'Оплата заказа':
			config.dataUrls = [
				{
					id: 'order',
					url: `/commerce/orders/ids/?transaction=${transactionId}`,
				},
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			]
			config.modalConfig.url = '/components/ledger/add_order_payment/'
			config.modalConfig.title = 'Редактирование оплаты заказа'

			break
		case 'Перевод между счетами':
			config.dataUrls = [
				{ id: 'source_bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
				{ id: 'destination_bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			]
			config.modalConfig.url = '/components/ledger/add_transfer/'
			config.modalConfig.title = 'Редактирование перевода'

			break
		case 'Внос на ЛС клиента':
			config.dataUrls = [
				{ id: 'client', url: '/commerce/clients/list/' },
				{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			]
			config.modalConfig.url = '/components/ledger/deposit_client_balance/'
			config.modalConfig.title = 'Редактирование зачисления на ЛС клиента'

			break
		case 'Оплата с ЛС клиента':
			config.modalConfig.url = '/components/ledger/ls_payment/'
			config.modalConfig.title = 'Редактирование оплаты заказа с ЛС клиента'

			break
		default:
			console.error('Неизвестный тип транзакции для редактирования:', typeValue)
			showError(`Невозможно редактировать транзакцию типа "${typeValue}"`)
			return
	}

	try {
		await initTransactionForm(config, transactionId)

		const formElement = document.getElementById(
			config.formId || 'transactions-form'
		)
		if (!formElement) {
			console.error(
				`Form element "${
					config.formId || 'transactions-form'
				}" not found after init.`
			)
			return
		}

		if (typeValue === 'Оплата заказа') {
			const orderInput = formElement.querySelector('#order')
			const amountInput = formElement.querySelector('#amount')
			const debtAmountInput = formElement.querySelector('#debt_amount')

			if (orderInput?.value && amountInput && debtAmountInput) {
				const currentPayment = parseNumeric(amountInput.value)
				const debt = await fetchOrderDebt(orderInput.value, currentPayment)
				displayOrderDebt('debt_amount', debt)
			}
		} else if (typeValue === 'Оплата с ЛС клиента') {
			const debtAmountInput = formElement.querySelector('#debt_amount')
			if (debtAmountInput) debtAmountInput.value = DEFAULT_CURRENCY_VALUE

			const initialClientIdInput = formElement.querySelector('#client')
			const initialOrderIdInput = formElement.querySelector('#order')
			const amountInput = formElement.querySelector('#amount')

			if (!initialClientIdInput?.value || !initialOrderIdInput?.value) {
				console.error(
					'LS Payment Edit: Missing initial client or order ID in the form.'
				)
				showError(
					'Ошибка: Не удалось получить исходные данные клиента или заказа для редактирования.'
				)
				return
			}
			const initialClientId = initialClientIdInput.value
			const initialOrderId = initialOrderIdInput.value
			const currentPayment = amountInput ? parseNumeric(amountInput.value) : 0

			const tableContainer = formElement.querySelector(
				'#clients-table--container'
			)
			if (!tableContainer) {
				console.error(
					"LS Payment Edit: Container '#clients-table--container' not found in the modal."
				)
				return
			}

			const loader = createLoader()
			tableContainer.appendChild(loader)

			try {
				const response = await fetch(
					`/commerce/clients/balances/?client=${initialClientId}`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					}
				)
				const data = await response.json()

				if (data.html && data.ids) {
					const clientIds = data.ids

					const newTableElement = TableManager.replaceEntireTable(
						data.html,
						'clients-table--container',
						'clients-table'
					)

					if (newTableElement) {
						const inputClient = formElement.querySelector('input[id="client"]')

						if (inputClient) {
							const selectRow = rowElement => {
								newTableElement
									.querySelectorAll('tbody tr.table__row--selected')
									.forEach(r => r.classList.remove('table__row--selected'))
								rowElement?.classList.add('table__row--selected')
							}

							const rows = Array.from(
								newTableElement.querySelectorAll(
									'tbody tr:not(.table__row--summary)'
								)
							)

							let initialRowFound = false
							for (let i = 0; i < rows.length; i++) {
								const clientIdForRow = clientIds[i]?.id
								if (
									clientIdForRow &&
									String(clientIdForRow) === String(initialClientId)
								) {
									selectRow(rows[i])
									inputClient.value = initialClientId
									initialRowFound = true
									break
								}
							}

							if (!initialRowFound && rows.length > 0 && clientIds.length > 0) {
								console.warn(
									`Initial client ${initialClientId} not found in balances table, selecting first.`
								)
							}

							newTableElement.addEventListener('click', event => {
								const row = event.target.closest(
									'tbody tr:not(.table__row--summary)'
								)
								if (!row) return

								const index = rows.indexOf(row)
								if (index !== -1 && index < clientIds.length) {
									const selectedClientId = clientIds[index].id
									inputClient.value = selectedClientId
									selectRow(row)

									const orderSelectElement = formElement.querySelector('#order')
									if (orderSelectElement) {
										updateClientOrdersList(
											selectedClientId,
											orderSelectElement,
											false,
											null
										)
									}
								}
							})

							const orderSelectElement = formElement.querySelector('#order')
							if (orderSelectElement) {
								await updateClientOrdersList(
									initialClientId,
									orderSelectElement,
									true,
									initialOrderId
								)

								await new Promise(resolve => setTimeout(resolve, 150))
								const finalOrderId =
									formElement.querySelector('#order')?.value || initialOrderId
								const debt = await fetchOrderDebt(finalOrderId, currentPayment)
								displayOrderDebt('debt_amount', debt)

								const orderSelectParent = orderSelectElement.closest('.select')
								const dropdownElement =
									orderSelectParent?.querySelector('.select__dropdown')
								dropdownElement?.addEventListener('click', async event => {
									if (event.target.classList.contains('select__option')) {
										const selectedOrderId = event.target.dataset.value
										if (selectedOrderId) {
											const debt = await fetchOrderDebt(selectedOrderId, 0)
											displayOrderDebt('debt_amount', debt)
										} else {
											displayOrderDebt('debt_amount', null)
										}
									}
								})
							} else {
								console.error(
									"LS Payment Edit: Order select element '#order' not found."
								)
							}
						} else {
							console.error(
								"LS Payment Edit: Client hidden input '#client' not found."
							)
						}
					} else {
						console.error(
							'LS Payment Edit: Failed to replace client balances table.'
						)
					}
				} else {
					console.error(
						'LS Payment Edit: Invalid data received for client balances.',
						data
					)
					showError('Не удалось загрузить балансы клиентов.')
				}
			} catch (error) {
				console.error('Ошибка при настройке формы Оплаты с ЛС (edit):', error)
				showError('Произошла ошибка при настройке формы редактирования.')
			} finally {
				loader.remove()
			}
		}
	} catch (error) {
		console.error('Ошибка при инициализации формы редактирования:', error)

		showError('Не удалось загрузить форму редактирования.')
	}
}

const initGenericLedgerPage = pageConfig => {
	if (!pageConfig) {
		console.error('Generic ledger page initialized without config.')
		return
	}

	initTableHandlers(pageConfig)
}

const initPaymentsPage = async () => {
	await TableManager.init()

	await TableManager.createColumnsForTable('payments-table', [
		{ name: 'manager', url: '/users/managers/' },
		{ name: 'product', url: '/commerce/products/' },
		{ name: 'client', url: '/commerce/clients/list/' },
		{ name: 'legal_name' },
		{ name: 'comment' },
	])

	try {
		const restrictedUserData =
			document.getElementById('restricted-user')?.textContent
		if (restrictedUserData) {
			const restrictedUser = JSON.parse(restrictedUserData)
			if (restrictedUser) {
				const managerInput = document.getElementById('id_manager')
				const selectContainer = managerInput?.closest('.select')
				if (selectContainer) {
					selectContainer.classList.add('disabled')
					const textDisplay = selectContainer.querySelector('.select__text')
					if (textDisplay) {
						textDisplay.textContent = restrictedUser
					}
				}
			}
		}
	} catch (e) {
		console.error('Error processing restricted user data:', e)
	}
}

const initTransactionsPage = () => {
	TableManager.init()

	TableManager.createColumnsForTable(
		'transactions-table',
		[
			{ name: 'id' },
			{ name: 'category', url: `/ledger/${TRANSACTION_CATEGORIES}/` },
			{ name: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			{ name: 'amount' },
			{ name: 'client', url: '/commerce/clients/list/' },
			{ name: 'orderId' },
			{ name: 'type', url: '/ledger/transaction-types/' },
			{ name: 'comment' },
			{ name: 'created' },
			{ name: 'report_date' },
		],
		['amount']
	)

	const today = new Date()
	const sevenDaysAgo = new Date()
	sevenDaysAgo.setDate(today.getDate() - 7)

	const startDatePicker = initDatePicker(
		'#start-date',
		'.date-filter__icon[data-target="start-date"]',
		formatDate(sevenDaysAgo)
	)
	const endDatePicker = initDatePicker(
		'#end-date',
		'.date-filter__icon[data-target="end-date"]',
		formatDate(today)
	)

	const loadButton = document.getElementById('load-data')
	const nextPageButton = document.getElementById('next-page')
	const lastPageButton = document.getElementById('last-page')
	const prevPageButton = document.getElementById('prev-page')
	const firstPageButton = document.getElementById('first-page')
	const currentPageInput = document.getElementById('current-page')
	const totalPagesSpan = document.getElementById('total-pages')
	const refreshButton = document.getElementById('refresh')
	const editTransactionButton = document.getElementById('edit-transaction')

	const fetchAndUpdateTable = async page => {
		if (!startDatePicker || !endDatePicker) {
			showError('Ошибка: Компоненты выбора даты не найдены.')
			return
		}
		const startDate = startDatePicker.selectedDates[0]
		const endDate = endDatePicker.selectedDates[0]

		if (!startDate || !endDate) {
			showError('Не выбраны Начальная или Конечная дата')
			return
		}

		const formattedStartDate = formatDateForServer(startDate)
		const formattedEndDate = formatDateForServer(endDate)

		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const response = await fetch(
				`${BASE_URL}transactions/?start_date=${formattedStartDate}&end_date=${formattedEndDate}&page=${page}`,
				{ headers: { 'X-Requested-With': 'XMLHttpRequest' } }
			)
			const data = await response.json()

			if (response.ok && data.html && data.context) {
				TableManager.updateTable(data.html, 'transactions-table')

				TableManager.calculateTableSummary('transactions-table', ['amount'])

				const { current_page, total_pages, transaction_ids = [] } = data.context

				if (currentPageInput) {
					currentPageInput.value = current_page
					currentPageInput.max = total_pages
					currentPageInput.disabled = total_pages <= 0
				}
				if (totalPagesSpan) {
					totalPagesSpan.textContent = total_pages
				}

				const isFirstPage = current_page <= 1
				const isLastPage = current_page >= total_pages

				if (nextPageButton) nextPageButton.disabled = isLastPage
				if (lastPageButton) lastPageButton.disabled = isLastPage
				if (prevPageButton) prevPageButton.disabled = isFirstPage
				if (firstPageButton) firstPageButton.disabled = isFirstPage

				const transactionsTable = document.getElementById('transactions-table')
				const rows = transactionsTable?.querySelectorAll(
					'tbody tr:not(.table__row--summary)'
				)

				if (rows && transaction_ids.length === rows.length) {
					rows.forEach((row, index) => {
						row.setAttribute('data-id', transaction_ids[index])
					})
				} else if (rows && transaction_ids.length > 0) {
					console.warn(
						'Mismatch between number of rows and transaction IDs received.'
					)
				}
			} else {
				TableManager.updateTable('', 'transactions-table')
				TableManager.calculateTableSummary('transactions-table', ['amount'])
				if (currentPageInput) {
					currentPageInput.value = 1
					currentPageInput.max = 1
					currentPageInput.disabled = true
				}
				if (totalPagesSpan) totalPagesSpan.textContent = '1'
				;[
					nextPageButton,
					lastPageButton,
					prevPageButton,
					firstPageButton,
				].forEach(btn => {
					if (btn) btn.disabled = true
				})

				if (data.message) {
					console.log('Server message:', data.message)
				} else if (!response.ok) {
					showError('Ошибка загрузки данных транзакций.')
				}
			}
		} catch (error) {
			console.error('Ошибка при загрузке данных транзакций:', error)
			showError('Произошла ошибка при загрузке данных')

			TableManager.updateTable('', 'transactions-table')
			TableManager.calculateTableSummary('transactions-table', ['amount'])
		} finally {
			loader.remove()
		}
	}

	loadButton?.addEventListener('click', () => fetchAndUpdateTable(1))

	refreshButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput?.value, 10) || 1
		fetchAndUpdateTable(currentPage)
	})

	nextPageButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput?.value, 10) || 1
		fetchAndUpdateTable(currentPage + 1)
	})

	lastPageButton?.addEventListener('click', () => {
		const totalPages =
			parseInt(totalPagesSpan?.textContent || currentPageInput?.max, 10) || 1
		fetchAndUpdateTable(totalPages)
	})

	prevPageButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput?.value, 10) || 1
		fetchAndUpdateTable(currentPage - 1)
	})

	firstPageButton?.addEventListener('click', () => fetchAndUpdateTable(1))

	currentPageInput?.addEventListener('input', () => {
		const totalPages =
			parseInt(totalPagesSpan?.textContent || currentPageInput?.max, 10) || 1
		let currentPage = parseInt(currentPageInput.value, 10)

		if (isNaN(currentPage) || currentPage < 1) {
			currentPageInput.value = 1
		} else if (currentPage > totalPages) {
			currentPageInput.value = totalPages
		}
	})

	currentPageInput?.addEventListener('change', () => {
		const totalPages =
			parseInt(totalPagesSpan?.textContent || currentPageInput?.max, 10) || 1
		let targetPage = parseInt(currentPageInput.value, 10)

		if (isNaN(targetPage) || targetPage < 1) {
			targetPage = 1
		} else if (targetPage > totalPages) {
			targetPage = totalPages
		}
		currentPageInput.value = targetPage
		fetchAndUpdateTable(targetPage)
	})

	editTransactionButton?.addEventListener('click', async () => {
		const selectedRow = TableManager.getSelectedRow('transactions-table')

		if (selectedRow) {
			const selectedRowId = selectedRow.getAttribute('data-id')
			if (selectedRowId) {
				let hasPermission = false
				const loader = createLoader()
				document.body.appendChild(loader)
				try {
					const response = await fetch(
						'/users/check-permission/?permission=edit_closed_transactions',
						{ headers: { 'X-Requested-With': 'XMLHttpRequest' } }
					)
					if (response.ok) {
						hasPermission = true
					} else {
						const data = await response.json()
						showError(
							data?.message || 'У вас нет прав на редактирование транзакций'
						)
					}
				} catch (error) {
					console.error('Permission check failed:', error)
					showError('Ошибка проверки прав доступа.')
				} finally {
					loader.remove()
				}

				if (hasPermission) {
					editTransaction(selectedRowId, selectedRow, 'transactions-table')
				}
			} else {
				showError('Не удалось получить ID выбранной строки.')
			}
		} else {
			showError('Выберите строку для редактирования')
		}
	})
}

const initCurrentShiftPage = () => {
	collapseContainer('current-shift-left', 'Баланс')
	enableResize('current-shift-left')
	TableManager.init()

	TableManager.calculateTableSummary(
		'bank-accounts-table',
		['balance', 'shift_amount', 'total_amount'],
		{ grouped: true, total: true }
	)

	try {
		const transactionIdsData = document.getElementById(
			'transaction-ids-data'
		)?.textContent
		if (transactionIdsData) {
			const transactionIds = JSON.parse(transactionIdsData)
			TableManager.addActionsColumn(
				'transactions-table',
				transactionIds,
				editTransaction,
				deleteTransaction
			)
		} else {
			console.warn("Element with ID 'transaction-ids-data' not found or empty.")
		}
	} catch (e) {
		console.error('Error parsing transaction IDs data for actions column:', e)
	}

	TableManager.createColumnsForTable(
		'transactions-table',
		[
			{ name: 'category', url: `/ledger/${TRANSACTION_CATEGORIES}/` },
			{ name: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			{ name: 'amount' },
			{ name: 'client', url: '/commerce/clients/list/' },
			{ name: 'orderId' },
			{ name: 'type', url: '/ledger/transaction-types/' },
			{ name: 'comment' },
		],
		['amount']
	)
	TableManager.calculateTableSummary('transactions-table', ['amount'])

	const setupTransactionButton = (buttonId, typeConfig) => {
		const button = document.getElementById(buttonId)
		if (!button) {
			console.warn(`Button with ID "${buttonId}" not found.`)
			return
		}

		button.addEventListener('click', async () => {
			const defaultConfig = {
				tableId: 'transactions-table',
				formId: 'transactions-form',

				onSuccess: result =>
					handleTransactionSuccess(result, 'transactions-table', false),
			}

			const finalConfig = { ...defaultConfig, ...typeConfig }

			try {
				await initTransactionForm(finalConfig, null)

				const formElement = document.getElementById(finalConfig.formId)
				if (!formElement) return

				if (buttonId === 'order-payment-button') {
					const orderInput = formElement.querySelector('#order')
					const debtAmountInput = formElement.querySelector('#debt_amount')

					if (debtAmountInput) debtAmountInput.value = DEFAULT_CURRENCY_VALUE

					const orderSelectParent = orderInput?.closest('.select')
					const dropdownElement =
						orderSelectParent?.querySelector('.select__dropdown')

					dropdownElement?.addEventListener('click', async event => {
						if (event.target.classList.contains('select__option')) {
							const selectedOrderId = event.target.dataset.value

							const debt = await fetchOrderDebt(selectedOrderId, 0)
							displayOrderDebt('debt_amount', debt)
						}
					})
				} else if (buttonId === 'ls-payment-button') {
					const debtAmountInput = formElement.querySelector('#debt_amount')
					if (debtAmountInput) debtAmountInput.value = DEFAULT_CURRENCY_VALUE

					const tableContainer = formElement.querySelector(
						'#clients-table--container'
					)
					if (!tableContainer) {
						console.error(
							"LS Payment Add: Container '#clients-table--container' not found in modal."
						)
						return
					}

					const loader = createLoader()
					tableContainer.appendChild(loader)

					try {
						const response = await fetch('/commerce/clients/balances/', {
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						})
						const data = await response.json()

						if (data.html && data.ids) {
							const clientIds = data.ids

							const clientsTable = TableManager.replaceEntireTable(
								data.html,
								'clients-table--container',
								'clients-table'
							)

							if (clientsTable && clientIds.length > 0) {
								const inputClient =
									formElement.querySelector('input[id="client"]')
								const orderSelectElement = formElement.querySelector('#order')

								if (inputClient && orderSelectElement) {
									const selectRow = rowElement => {
										clientsTable
											.querySelectorAll('tbody tr.table__row--selected')
											.forEach(r => r.classList.remove('table__row--selected'))
										rowElement?.classList.add('table__row--selected')
									}

									const rows = Array.from(
										clientsTable.querySelectorAll(
											'tbody tr:not(.table__row--summary)'
										)
									)

									inputClient.value = clientIds[0].id
									const firstRow = rows[0]
									selectRow(firstRow)

									await updateClientOrdersList(
										clientIds[0].id,
										orderSelectElement,
										true,
										null
									)

									displayOrderDebt('debt_amount', null)

									clientsTable.addEventListener('click', event => {
										const row = event.target.closest(
											'tbody tr:not(.table__row--summary)'
										)
										if (!row) return

										const index = rows.indexOf(row)
										if (index !== -1 && index < clientIds.length) {
											const selectedClientId = clientIds[index].id
											inputClient.value = selectedClientId
											selectRow(row)

											updateClientOrdersList(
												selectedClientId,
												orderSelectElement,
												false,
												null
											)
										}
									})

									const orderSelectParent =
										orderSelectElement.closest('.select')
									const dropdownElement =
										orderSelectParent?.querySelector('.select__dropdown')
									dropdownElement?.addEventListener('click', async event => {
										if (event.target.classList.contains('select__option')) {
											const selectedOrderId = event.target.dataset.value

											const debt = await fetchOrderDebt(selectedOrderId, 0)
											displayOrderDebt('debt_amount', debt)
										}
									})
								} else {
									console.error(
										'LS Payment Add: Client input or Order select not found in form.'
									)
								}
							} else if (!clientsTable) {
								console.error(
									'LS Payment Add: Failed to replace clients table.'
								)
							} else {
								tableContainer.innerHTML = '<p>Нет клиентов с балансом.</p>'
							}
						} else {
							console.error(
								'LS Payment Add: Invalid data received for client balances.',
								data
							)
							showError('Не удалось загрузить балансы клиентов.')
						}
					} catch (error) {
						console.error(
							'Ошибка при загрузке балансов клиентов (LS Payment Add):',
							error
						)
						showError('Произошла ошибка при загрузке данных клиентов.')
						tableContainer.innerHTML = '<p>Ошибка загрузки данных.</p>'
					} finally {
						loader.remove()
					}
				}
			} catch (error) {
				console.error(
					`Failed to initialize transaction form for ${buttonId}:`,
					error
				)
			}
		})
	}

	setupTransactionButton('income-button', {
		dataUrls: [
			{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			{ id: 'category', url: `/ledger/${TRANSACTION_CATEGORIES}/?type=income` },
		],
		submitUrl: '/ledger/transactions/add/',
		modalConfig: {
			url: '/components/ledger/add_transaction/',
			title: 'Приход',
			context: { type: 'income' },
		},
	})

	setupTransactionButton('expense-button', {
		dataUrls: [
			{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			{
				id: 'category',
				url: `/ledger/${TRANSACTION_CATEGORIES}/?type=expense`,
			},
		],
		submitUrl: '/ledger/transactions/add/',
		modalConfig: {
			url: '/components/ledger/add_transaction/',
			title: 'Расход',
			context: { type: 'expense' },
		},
	})

	setupTransactionButton('transfer-button', {
		dataUrls: [
			{ id: 'source_bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
			{ id: 'destination_bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
		],
		submitUrl: '/ledger/transfers/add/',
		modalConfig: {
			url: '/components/ledger/add_transfer/',
			title: 'Перевод',
		},
	})

	setupTransactionButton('order-payment-button', {
		dataUrls: [
			{ id: 'order', url: '/commerce/orders/ids/' },
			{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
		],
		submitUrl: '/ledger/order-payments/add/',
		modalConfig: {
			url: '/components/ledger/add_order_payment/',
			title: 'Оплата заказа',
		},
	})

	setupTransactionButton('deposit-button', {
		dataUrls: [
			{ id: 'client', url: '/commerce/clients/list/' },
			{ id: 'bank_account', url: `/ledger/${BANK_ACCOUNTS}/` },
		],
		submitUrl: '/ledger/client-balance/deposit/',
		modalConfig: {
			url: '/components/ledger/deposit_client_balance/',
			title: 'Зачисление на ЛС клиента',
		},
	})

	setupTransactionButton('ls-payment-button', {
		submitUrl: '/ledger/client-balance/payment/',
		modalConfig: {
			url: '/components/ledger/ls_payment/',
			title: 'Оплата заказа с ЛС клиента',
		},
	})

	const closeShiftButton = document.getElementById('close-shift-button')
	closeShiftButton?.addEventListener('click', async () => {
		let hasPermission = false
		const checkLoader = createLoader()
		document.body.appendChild(checkLoader)
		try {
			const permResponse = await fetch(
				'/users/check-permission/?permission=close_current_shift',
				{ headers: { 'X-Requested-With': 'XMLHttpRequest' } }
			)
			if (permResponse.ok) {
				hasPermission = true
			} else {
				const data = await permResponse.json()
				showError(data?.message || 'У вас нет прав на закрытие смены')
			}
		} catch (error) {
			console.error('Permission check failed:', error)
			showError('Ошибка проверки прав доступа.')
		} finally {
			checkLoader.remove()
		}

		if (!hasPermission) return

		showQuestion(
			'Вы уверены, что хотите закрыть смену?',
			'Закрытие смены',
			async () => {
				const closeLoader = createLoader()
				document.body.appendChild(closeLoader)
				const csrfToken = getCSRFToken()

				try {
					const response = await fetch('/ledger/close-shift/', {
						method: 'POST',
						headers: {
							'X-Requested-With': 'XMLHttpRequest',
							'X-CSRFToken': csrfToken,
						},
					})

					const data = await response.json()

					if (!response.ok) {
						showError(data?.message || 'Ошибка при закрытии смены.')
						return
					}

					if (data.html) {
						TableManager.replaceEntireTable(
							data.html,
							'bank-accounts-container',
							'bank-accounts-table'
						)

						TableManager.calculateTableSummary(
							'bank-accounts-table',
							['balance', 'shift_amount', 'total_amount'],
							{ grouped: true, total: true }
						)

						const transactionsTable =
							document.getElementById('transactions-table')
						const tbody = transactionsTable?.querySelector('tbody')
						if (tbody) {
							tbody.innerHTML = ''
							TableManager.calculateTableSummary('transactions-table', [
								'amount',
							])
						}

						showSuccess('Смена успешно закрыта.')
					} else {
						showError(
							'Не удалось обновить данные после закрытия смены. Ответ сервера не содержит ожидаемых данных.'
						)
					}
				} catch (error) {
					console.error(
						'Ошибка при выполнении запроса на закрытие смены:',
						error
					)
					showError(`Произошла сетевая или другая ошибка: ${error.message}`)
				} finally {
					closeLoader.remove()
				}
			}
		)
	})
}

document.addEventListener('DOMContentLoaded', () => {
	const pathname = window.location.pathname

	const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
	const match = pathname.match(regex)

	const urlName = match ? match[1].replace(/-/g, '_') : null

	if (urlName) {
		if (urlName === 'bank_accounts' || urlName === 'transaction_categories') {
			if (configs[urlName]) {
				initGenericLedgerPage(configs[urlName])
			} else {
				console.error(`Config not found for generic page: ${urlName}`)
			}
		} else if (urlName === 'payments') {
			initPaymentsPage()
		} else if (urlName === 'transactions') {
			initTransactionsPage()
		} else if (urlName === 'current_shift') {
			initCurrentShiftPage()
		} else {
			console.log(
				`No specific initialization logic defined for URL segment: ${urlName}`
			)
		}
	} else {
		console.log('Could not determine page context from URL pathname:', pathname)
	}
})
