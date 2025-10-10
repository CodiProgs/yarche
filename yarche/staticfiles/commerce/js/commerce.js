import { Modal } from '/static/js/modal.js'
import SelectHandler from '/static/js/selectHandler.js'
import { TableManager } from '/static/js/table.js'
import { initTableHandlers } from '/static/js/tableHandlers.js'
import {
	createLoader,
	getCSRFToken,
	showError,
	showSuccess,
} from '/static/js/ui-utils.js'

const CLIENTS = 'clients'
const CONTACTS = 'contacts'
const PRODUCTS = 'products'

const BASE_URL = '/commerce/'

const configs = {
	clients: {
		containerId: `${CLIENTS}-container`,
		tableId: `${CLIENTS}-table`,
		formId: `${CLIENTS}-form`,
		getUrl: `${BASE_URL}${CLIENTS}/`,
		addUrl: `${BASE_URL}${CLIENTS}/add/`,
		deleteUrl: `${BASE_URL}${CLIENTS}/delete/`,
		afterAddFunc: newItem => {
			let id = null
			if (typeof newItem === 'number') id = newItem
			else if (newItem && typeof newItem === 'object')
				id = newItem.id || newItem.pk || null

			if (id) {
				setTimeout(() => loadClientToForm(Number(id)), 50)
			} else {
				setTimeout(loadFirstClientFromTable, 50)
			}
		},
		afterDeleteFunc: deletedArg => {
			let deletedId = null
			if (typeof deletedArg === 'number') deletedId = deletedArg
			else if (deletedArg && typeof deletedArg === 'object')
				deletedId = deletedArg.id || deletedArg.pk || null

			if (deletedId && lastLoadedClientId === Number(deletedId)) {
				lastLoadedClientId = null
			}

			setTimeout(() => {
				const table = document.getElementById('clients-table')
				if (!table) {
					clearClientForm()
					return
				}
				const anyRow = table.querySelector(
					'tbody tr:not(.table__row--empty):not(.table__row--summary)'
				)
				if (anyRow) loadFirstClientFromTable()
				else clearClientForm()
			}, 50)
		},
	},
	clients_contacts: {
		containerId: `${CONTACTS}-container`,
		tableId: `${CONTACTS}-table`,
		formId: `${CONTACTS}-form`,
		getUrl: `${BASE_URL}${CLIENTS}/${CONTACTS}/`,
		addUrl: `${BASE_URL}${CLIENTS}/${CONTACTS}/add/`,
		editUrl: `${BASE_URL}${CLIENTS}/${CONTACTS}/edit/`,
		deleteUrl: `${BASE_URL}${CLIENTS}/${CONTACTS}/delete/`,
		addButtonId: 'add-contact-button',
		editButtonId: 'edit-contact-button',
		deleteButtonId: 'delete-contact-button',
		addFunc: () => {
			const contactsForm = document.getElementById('contacts-form')
			if (!contactsForm) return

			const clientIdField =
				document.querySelector('#client-form #client_id') ||
				document.getElementById('client_id')
			const clientVal = clientIdField
				? clientIdField.value
				: lastLoadedClientId || ''

			let hidden = contactsForm.querySelector('#client_form_id')
			if (hidden) {
				hidden.value = clientVal
			} else {
				hidden = document.createElement('input')
				hidden.type = 'hidden'
				hidden.name = 'client_form_id'
				hidden.id = 'client_form_id'
				hidden.value = clientVal
				contactsForm.appendChild(hidden)
			}
		},
	},
	products: {
		containerId: `${PRODUCTS}-container`,
		tableId: `${PRODUCTS}-table`,
		formId: `${PRODUCTS}-form`,
		getUrl: `${BASE_URL}${PRODUCTS}/`,
		addUrl: `${BASE_URL}${PRODUCTS}/add/`,
		editUrl: `${BASE_URL}${PRODUCTS}/edit/`,
		deleteUrl: `${BASE_URL}${PRODUCTS}/delete/`,
	},
}

let lastLoadedClientId = null
let originalClientData = null

const initGenericPage = pageConfig => {
	if (!pageConfig) {
		console.error('Generic page initialized without config.')
		return
	}

	initTableHandlers(pageConfig)
}

const setIds = (ids, tableId) => {
	const tableRows = document.querySelectorAll(
		`#${tableId} tbody tr:not(.table__row--summary)`
	)
	if (!tableRows || tableRows.length === 0 || !ids || ids.length === 0) {
		return
	}
	if (tableRows.length !== ids.length) {
		console.error('Количество строк не совпадает с количеством ID')
	} else {
		tableRows.forEach((row, index) => {
			row.setAttribute('data-id', ids[index])
		})
	}
}

const addMenuHandler = () => {
	const menu = document.getElementById('context-menu')
	const addButton = document.getElementById('add-button')
	const editButton = document.getElementById('edit-button')
	const deleteButton = document.getElementById('delete-button')
	const paymentButton = document.getElementById('payment-button')
	const hideButton = document.getElementById('hide-button')
	const settleDebtButton = document.getElementById('settle-debt-button')
	const settleDebtAllButton = document.getElementById('settle-debt-all-button')
	const repaymentsEditButton = document.getElementById('repayment-edit-button')

	const editContactButton = document.getElementById('edit-contact-button')
	const deleteContactButton = document.getElementById('delete-contact-button')

	const viewButton = document.getElementById('view-button')

	const refreshButton = document.getElementById('refresh-button')

	if (menu) {
		if (menu.parentNode !== document.body) {
			document.body.appendChild(menu)
		}
		menu.style.position = 'fixed'
		menu.style.zIndex = 10000
	}

	function showMenu(pageX, pageY) {
		menu.style.display = 'block'

		const clientX = pageX - window.scrollX
		const clientY = pageY - window.scrollY

		const viewportWidth =
			window.innerWidth || document.documentElement.clientWidth
		const viewportHeight =
			window.innerHeight || document.documentElement.clientHeight

		const rect = menu.getBoundingClientRect()
		const menuWidth = rect.width || 200
		const menuHeight = rect.height || 200

		const margin = 8
		const offset = 10

		let left = clientX + offset
		if (left + menuWidth > viewportWidth - margin) {
			left = Math.max(margin, viewportWidth - menuWidth - margin)
		}
		if (left < margin) left = margin

		const bottomThreshold = viewportHeight * 0.75
		let top
		if (clientY > bottomThreshold) {
			top = clientY - menuHeight - offset
			if (top < margin) top = margin
		} else {
			top = clientY + offset
			if (top + menuHeight > viewportHeight - margin) {
				top = Math.max(margin, viewportHeight - menuHeight - margin)
			}
		}

		menu.style.left = `${left}px`
		menu.style.top = `${top}px`
	}

	if (menu) {
		document.addEventListener('contextmenu', function (e) {
			const row = e.target.closest(
				'tbody tr:not(.table__row--summary):not(.table__row--empty)'
			)

			const table = e.target.closest('table')
			if (row && table) {
				e.preventDefault()

				if (addButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						addButton.style.display = 'none'
					} else {
						addButton.style.display = 'block'
					}
				}
				if (editButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						editButton.style.display = 'none'
					} else {
						editButton.style.display = 'block'
					}
				}
				if (deleteButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						deleteButton.style.display = 'none'
					} else {
						deleteButton.style.display = 'block'
					}
				}
				if (paymentButton) paymentButton.style.display = 'block'
				if (hideButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						hideButton.style.display = 'none'
					} else {
						hideButton.style.display = 'block'
					}
				}
				if (settleDebtButton) {
					if (
						(table.id && table.id.startsWith('branch-repayments-')) ||
						table.id === 'investor-operations-table'
					) {
						settleDebtButton.style.display = 'none'
					} else if (table.id === 'investors-table') {
						const selectedCell = document.querySelector(
							'td.table__cell--selected'
						)
						if (selectedCell) {
							const cellIndex = Array.from(
								selectedCell.parentNode.children
							).indexOf(selectedCell)
							const th = table.querySelectorAll('thead th')[cellIndex]
							const colName = th ? th.dataset.name : null

							if (colName === 'initial_balance') {
								settleDebtButton.style.display = 'block'
								settleDebtButton.textContent = 'Изменить сумму'
								settleDebtButton.dataset.type = 'initial'
							} else if (colName === 'balance') {
								settleDebtButton.style.display = 'block'
								settleDebtButton.textContent = 'Изменить сумму'
								settleDebtButton.dataset.type = 'balance'
							} else {
								settleDebtButton.style.display = 'none'
								settleDebtButton.dataset.type = ''
							}
						} else {
							settleDebtButton.style.display = 'none'
							settleDebtButton.dataset.type = ''
						}
					} else {
						settleDebtButton.style.display = 'block'
						settleDebtButton.textContent = 'Погасить долг'
						settleDebtButton.dataset.type = ''
					}
				}
				if (settleDebtAllButton) {
					if (table.id === 'summary-profit') {
						settleDebtAllButton.style.display = 'block'
					} else {
						settleDebtAllButton.style.display = 'none'
					}
				}
				if (repaymentsEditButton) {
					if (table.id && table.id.startsWith('branch-repayments-')) {
						repaymentsEditButton.style.display = 'block'
					} else {
						repaymentsEditButton.style.display = 'none'
					}
				}

				if (editContactButton) {
					if (table.id && table.id === 'contacts-table') {
						editContactButton.style.display = 'block'
					} else {
						editContactButton.style.display = 'none'
					}
				}
				if (deleteContactButton) {
					if (table.id && table.id === 'contacts-table') {
						deleteContactButton.style.display = 'block'
					} else {
						deleteContactButton.style.display = 'none'
					}
				}

				if (table.id === 'cash_flow-table') {
					const headers = table.querySelectorAll('thead th')
					let purposeIndex = -1
					headers.forEach((th, idx) => {
						if (th.dataset.name === 'purpose') purposeIndex = idx
					})
					if (purposeIndex !== -1) {
						const cells = row.querySelectorAll('td')
						const purposeCell = cells[purposeIndex]
						if (
							purposeCell &&
							(purposeCell.textContent.trim() === 'Перевод' ||
								purposeCell.textContent.trim() === 'Инкассация' ||
								purposeCell.textContent.trim() === 'Погашение долга поставщика')
						) {
							e.preventDefault()

							if (editButton) editButton.style.display = 'none'
							if (deleteButton) deleteButton.style.display = 'none'
						}
					}
				}

				if (viewButton) {
					if (table.id.startsWith('order-documents-')) {
						viewButton.style.display = 'none'
					} else {
						viewButton.style.display = 'block'
					}
				}

				if (refreshButton) {
					if (table.id.startsWith('order-documents-')) {
						refreshButton.style.display = 'block'
					} else {
						refreshButton.style.display = 'none'
					}
				}

				const pathname = window.location.pathname

				const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
				const match = pathname.match(regex)

				const urlName = match ? match[1].replace(/-/g, '_') : null

				if (urlName === 'clients' && table.id === 'contacts-table') {
					if (addButton) addButton.style.display = 'none'
					if (deleteButton) deleteButton.style.display = 'none'
				} else {
					if (addButton) addButton.style.display = 'block'
					if (deleteButton) deleteButton.style.display = 'block'
				}

				showMenu(e.pageX, e.pageY)
				return
			}

			if (e.target.closest('.content')) {
				e.preventDefault()

				if (addButton) addButton.style.display = 'block'
				if (editButton) editButton.style.display = 'none'
				if (deleteButton) deleteButton.style.display = 'none'
				if (paymentButton) paymentButton.style.display = 'none'
				if (hideButton) hideButton.style.display = 'none'
				if (settleDebtButton) settleDebtButton.style.display = 'none'
				if (settleDebtAllButton) settleDebtAllButton.style.display = 'none'
				if (repaymentsEditButton) repaymentsEditButton.style.display = 'none'
				if (viewButton) viewButton.style.display = 'none'

				if (editContactButton) editContactButton.style.display = 'none'
				if (deleteContactButton) deleteContactButton.style.display = 'none'

				if (refreshButton) refreshButton.style.display = 'none'

				const pathname = window.location.pathname

				const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
				const match = pathname.match(regex)

				const urlName = match ? match[1].replace(/-/g, '_') : null

				if (urlName === 'works') {
					const row = e.target.closest('.debtors-office-list__row')

					if (row) {
						if (
							row.dataset.target &&
							row.dataset.target.startsWith('branch-')
						) {
							addButton.textContent = 'Добавить объект'
							addButton.style.display = 'block'
						} else {
							addButton.style.display = 'none'
						}
					} else {
						addButton.style.display = 'none'
					}
				}

				showMenu(e.pageX, e.pageY)
			}

			const item = e.target.closest('.debtors-office-list__row-item')
			if (item) {
				const h4 = item.querySelector('h4')
				const settleDebtButton = document.getElementById('settle-debt-button')
				if (
					h4 &&
					['Оборудование', 'Кредит', 'Краткосрочные обязательства'].includes(
						h4.textContent.trim()
					)
				) {
					if (settleDebtButton) {
						settleDebtButton.style.display = 'block'
						settleDebtButton.textContent = 'Изменить сумму'
						settleDebtButton.dataset.type = h4.textContent.trim()
					}
				}
			}
		})

		let touchTimer = null
		let touchStartTarget = null
		let touchStartX = 0
		let touchStartY = 0
		const LONG_PRESS_DELAY = 600

		document.addEventListener(
			'touchstart',
			function (ev) {
				if (ev.touches && ev.touches.length > 1) return
				const t = ev.touches ? ev.touches[0] : null
				if (!t) return
				touchStartX = t.pageX
				touchStartY = t.pageY
				touchStartTarget = ev.target

				touchTimer = setTimeout(() => {
					const evt = new MouseEvent('contextmenu', {
						bubbles: true,
						cancelable: true,
						view: window,
						clientX: touchStartX,
						clientY: touchStartY,
						pageX: touchStartX,
						pageY: touchStartY,
					})
					try {
						touchStartTarget.dispatchEvent(evt)
					} catch (e) {
						document.dispatchEvent(evt)
					}
					touchTimer = null
				}, LONG_PRESS_DELAY)
			},
			{ passive: true }
		)

		document.addEventListener(
			'touchmove',
			function () {
				if (touchTimer) {
					clearTimeout(touchTimer)
					touchTimer = null
				}
			},
			{ passive: true }
		)

		document.addEventListener(
			'touchend',
			function () {
				if (touchTimer) {
					clearTimeout(touchTimer)
					touchTimer = null
				}
			},
			{ passive: true }
		)

		document.addEventListener('click', () => {
			menu.style.display = 'none'
		})
	}
}

const initWorksPage = () => {
	document.querySelectorAll('.debtors-office-list__row').forEach(row => {
		row.addEventListener('click', async function (e) {
			const targetId = row.getAttribute('data-target')
			if (!targetId) return
			const details = document.getElementById(targetId)
			if (!details) return

			const btn = row.querySelector('.debtors-office-list__toggle')
			if (btn) btn.classList.toggle('open')
			details.classList.toggle('open')

			if (
				row.dataset.target.startsWith('product-') &&
				!details.dataset.loaded
			) {
				const loader = createLoader()
				document.body.appendChild(loader)

				const productId = row.dataset.productId
				const clientId = row.dataset.clientId
				const objectId = row.dataset.objectId
				if (!productId || !clientId || !objectId) return

				const resp = await fetch(
					`/commerce/product_orders/?product_id=${productId}&client_id=${clientId}&object_id=${objectId}`
				)
				const data = await resp.json()
				loader.remove()

				if (!resp.ok) {
					showError(data.error || 'Ошибка загрузки данных')
					return
				}

				details.innerHTML = `<ul>${data.html}</ul>`
				details.dataset.loaded = '1'
			}
		})
	})
}

async function loadClientToForm(clientId) {
	if (!clientId) return
	if (lastLoadedClientId === clientId) return

	const form = document.getElementById('client-form')
	if (!form) return

	const loader = createLoader()
	document.body.appendChild(loader)

	try {
		const resp = await fetch(`${BASE_URL}clients/${clientId}/`)
		const payload = await resp.json()
		loader.remove()

		if (!resp.ok) {
			showError(payload.error || payload.message || 'Ошибка загрузки клиента')
			return
		}

		const client = payload.data || {}

		const idField = form.querySelector('#client_id')
		if (idField) idField.value = client.id || clientId

		const fields = [
			'name',
			'comment',
			'inn',
			'legal_name',
			'director',
			'ogrn',
			'basis',
			'legal_address',
			'actual_address',
		]

		fields.forEach(name => {
			const el = form.querySelector(`#${name}`)
			if (el) el.value = client[name] != null ? client[name] : ''
		})

		const contactsContainer = document.getElementById('contacts-container')
		if (contactsContainer) {
			contactsContainer.innerHTML = payload.contacts_html || ''

			try {
				const table = contactsContainer.querySelector('table')
				if (table) {
					table.querySelectorAll('tbody tr').forEach(row => {
						TableManager.attachRowCellHandlers(row)
						TableManager.formatCurrencyValuesForRow(table.id, row)
						TableManager.applyColumnWidthsForRow(table.id, row)
					})
				} else {
					contactsContainer.querySelectorAll('tr').forEach(row => {
						TableManager.attachRowCellHandlers(row)
					})
				}
			} catch (e) {
				console.warn('Не удалось применить TableManager к контактам:', e)
			}
			TableManager.initTable('contacts-table')
		}

		setIds(payload.contacts_ids, 'contacts-table')

		originalClientData = getClientFormValues()
		updateSaveCancelButtonsState()

		lastLoadedClientId = clientId
	} catch (err) {
		loader.remove()
		showError(err.message || 'Ошибка загрузки клиента')
	}
}

function attachClientsTableClickHandler() {
	const clientsTable = document.getElementById('clients-table')
	if (!clientsTable) return

	clientsTable.addEventListener('click', e => {
		const cell = e.target.closest('td')
		if (!cell) return

		const row = cell.closest('tr')
		if (!row) return

		const firstCell = row.querySelector('td')
		if (!firstCell) return
		const idText = firstCell.textContent.trim()
		const clientId = parseInt(idText, 10)
		if (Number.isNaN(clientId)) return

		const prev = clientsTable.querySelector('.table__row--selected')
		if (prev && prev !== row) prev.classList.remove('table__row--selected')
		row.classList.add('table__row--selected')

		if (lastLoadedClientId !== clientId) {
			loadClientToForm(clientId)
		}
	})
}

function attachFormCancelHandler() {
	const form = document.getElementById('client-form')
	if (!form) return
	const cancelBtn = form.querySelector('.button--cancel')
	if (!cancelBtn) return
	cancelBtn.addEventListener('click', () => {
		if (originalClientData) {
			const fields = [
				'name',
				'comment',
				'inn',
				'legal_name',
				'director',
				'ogrn',
				'basis',
				'legal_address',
				'actual_address',
			]
			fields.forEach(name => {
				const el = form.querySelector(`#${name}`)
				if (el)
					el.value =
						originalClientData[name] != null ? originalClientData[name] : ''
			})
		} else {
			form.reset()
		}
		const idField = form.querySelector('#client_id')
		if (idField && originalClientData && originalClientData.id)
			idField.value = originalClientData.id
		if (idField && !originalClientData) idField.value = ''
		updateSaveCancelButtonsState()
	})
}

async function loadFirstClientFromTable() {
	const table = document.getElementById('clients-table')
	if (!table) return

	const firstRow = table.querySelector(
		'tbody tr:not(.table__row--empty):not(.table__row--summary)'
	)
	if (!firstRow) return

	const firstCell = firstRow.querySelector('td')
	if (!firstCell) return
	const id = parseInt(firstCell.textContent.trim(), 10)
	if (Number.isNaN(id)) return

	const prev = table.querySelector('.table__row--selected')
	if (prev && prev !== firstRow) prev.classList.remove('table__row--selected')
	firstRow.classList.add('table__row--selected')

	if (lastLoadedClientId !== id) {
		await loadClientToForm(id)

		initGenericPage(configs['clients_contacts'])
	}
}

function clearClientForm() {
	const form = document.getElementById('client-form')
	if (!form) return
	form.reset()
	const idField = form.querySelector('#client_id')
	if (idField) idField.value = ''
	lastLoadedClientId = null
}

function getClientFormValues() {
	const form = document.getElementById('client-form')
	if (!form) return null
	const fields = [
		'id',
		'name',
		'comment',
		'inn',
		'legal_name',
		'director',
		'ogrn',
		'basis',
		'legal_address',
		'actual_address',
	]
	const data = {}
	fields.forEach(name => {
		const el = form.querySelector(`#${name}`)
		data[name] = el ? (el.value != null ? el.value : '') : ''
	})
	return data
}

function isClientDataEqual(a, b) {
	if (!a || !b) return false
	const keys = [
		'name',
		'comment',
		'inn',
		'legal_name',
		'director',
		'ogrn',
		'basis',
		'legal_address',
		'actual_address',
	]
	return keys.every(k => (a[k] || '') === (b[k] || ''))
}

function updateSaveCancelButtonsState() {
	const saveBtn = document.getElementById('save-button')
	const cancelBtn = document.getElementById('cancel-button')
	if (!saveBtn || !cancelBtn) return
	const current = getClientFormValues()
	const changed = originalClientData
		? !isClientDataEqual(current, originalClientData)
		: false
	saveBtn.disabled = !changed
	cancelBtn.disabled = !changed
}

function replaceClientTableRow(id, rowHtml) {
	const table = document.getElementById('clients-table')
	if (!table) return
	const tbody = table.querySelector('tbody') || table
	const rows = Array.from(tbody.querySelectorAll('tr'))
	for (const row of rows) {
		const firstCell = row.querySelector('td')
		if (!firstCell) continue
		if (String(firstCell.textContent).trim() === String(id)) {
			row.outerHTML = rowHtml

			const newRow = Array.from(tbody.querySelectorAll('tr')).find(r => {
				const fc = r.querySelector('td')
				return fc && String(fc.textContent).trim() === String(id)
			})

			if (newRow) {
				const prev = table.querySelector('.table__row--selected')
				if (prev) prev.classList.remove('table__row--selected')
				newRow.classList.add('table__row--selected')
				newRow
					.querySelector('.table__cell')
					?.classList.add('table__cell--selected')

				TableManager.formatCurrencyValuesForRow(table.id, newRow)
				TableManager.applyColumnWidthsForRow(table.id, newRow)
				TableManager.attachRowCellHandlers(newRow)
			}
			return
		}
	}

	tbody.insertAdjacentHTML('afterbegin', rowHtml)
	const insertedRow = Array.from(tbody.querySelectorAll('tr')).find(r => {
		const fc = r.querySelector('td')
		return fc && String(fc.textContent).trim() === String(id)
	})
	if (insertedRow) {
		const prev = table.querySelector('.table__row--selected')
		if (prev) prev.classList.remove('table__row--selected')
		insertedRow.classList.add('table__row--selected')
		insertedRow
			.querySelector('.table__cell')
			?.classList.add('table__cell--selected')

		TableManager.formatCurrencyValuesForRow(table.id, insertedRow)
		TableManager.applyColumnWidthsForRow(table.id, insertedRow)
		TableManager.attachRowCellHandlers(insertedRow)
	}
}

function debounce(fn, wait) {
	let t = null
	return function (...args) {
		clearTimeout(t)
		t = setTimeout(() => fn.apply(this, args), wait)
	}
}

async function fetchDadataSuggestions(query, dadataKey = null) {
	const url =
		'https://suggestions.dadata.ru/suggestions/api/4_1/rs/suggest/party'
	const body = JSON.stringify({ query, count: 7 })
	if (dadataKey) {
		const resp = await fetch(url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
				Authorization: `Token ${dadataKey}`,
			},
			body,
		})
		return resp.ok ? resp.json() : null
	} else {
		const resp = await fetch('/commerce/dadata_suggest/', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-CSRFToken': getCSRFToken(),
			},
			credentials: 'same-origin',
			body,
		})
		return resp.ok ? resp.json() : null
	}
}

function createSuggestionsContainer(input) {
	let container = input.parentNode.querySelector('.dadata-suggestions')
	if (!container) {
		container = document.createElement('div')
		container.className = 'dadata-suggestions'
		container.style.position = 'absolute'
		container.style.zIndex = 9999
		container.style.background = '#fff'
		container.style.border = '1px solid #ccc'
		container.style.maxHeight = '250px'
		container.style.overflow = 'auto'
		container.style.width = `${input.offsetWidth}px`
		container.style.display = 'none'
		input.parentNode.style.position = 'relative'
		input.parentNode.appendChild(container)
	}
	return container
}

function renderSuggestions(container, suggestions, onSelect) {
	container.innerHTML = ''
	if (!suggestions || !suggestions.length) {
		container.innerHTML =
			'<div class="dadata-empty" style="padding:6px;color:#666">Ничего не найдено</div>'
		container.style.display = 'block'
		return
	}
	container.style.display = 'block'
	suggestions.forEach(s => {
		const el = document.createElement('div')
		el.className = 'dadata-item'
		el.style.padding = '6px'
		el.style.cursor = 'pointer'
		const d = s.data || {}
		const title = d.name
			? d.name.full_with_opf || d.name.short_with_opf || s.value
			: s.value
		el.innerHTML = `<strong>${title}</strong><div style="font-size:12px;color:#666">${
			d.inn || ''
		}${d.ogrn ? ' • ОГРН ' + d.ogrn : ''}${
			d.address && d.address.value ? ' • ' + d.address.value : ''
		}</div>`
		el.addEventListener('click', () => onSelect(s))
		container.appendChild(el)
	})
}

function fillClientFormFromSuggestion(form, suggestion) {
	if (!form || !suggestion) return
	const data = suggestion.data || {}
	const map = {
		legal_name: data.name
			? data.name.full_with_opf || data.name.short_with_opf
			: suggestion.value,
		inn: data.inn || '',
		ogrn: data.ogrn || '',
		director: data.management ? data.management.name || '' : '',
		legal_address: data.address ? data.address.value || '' : '',
		actual_address: data.address ? data.address.value || '' : '',
	}
	Object.keys(map).forEach(k => {
		const el = form.querySelector(`#${k}`)
		if (el) el.value = map[k]
	})
	updateSaveCancelButtonsState()
}

function attachClientFormHandlers() {
	const form = document.getElementById('client-form')
	if (!form) return

	const fields = [
		'name',
		'comment',
		'inn',
		'legal_name',
		'director',
		'ogrn',
		'basis',
		'legal_address',
		'actual_address',
	]

	form.addEventListener('input', updateSaveCancelButtonsState)
	form.addEventListener('change', updateSaveCancelButtonsState)

	const dadataKey = `caf408d00eea05c3f0af6d1750e3bb9634ee5f69`
	const innInput = form.querySelector('#inn')
	if (innInput) {
		const container = createSuggestionsContainer(innInput)
		let currentSuggestions = []
		let active = -1

		const doSuggest = debounce(async () => {
			const q = innInput.value && innInput.value.trim()
			if (!q || q.length < 3) {
				container.innerHTML = ''
				container.style.display = 'none'
				return
			}

			container.innerHTML =
				'<div class="dadata-loading" style="padding:6px;color:#666">Загрузка...</div>'
			container.style.display = 'block'

			try {
				const resp = await fetchDadataSuggestions(q, dadataKey)
				const suggestions = resp && resp.suggestions ? resp.suggestions : []
				currentSuggestions = suggestions

				renderSuggestions(container, suggestions, s => {
					fillClientFormFromSuggestion(form, s)
					container.innerHTML = ''
					container.style.display = 'none'
				})
			} catch (err) {
				container.innerHTML = `<div class="dadata-error" style="padding:6px;color:#c00">Ошибка загрузки</div>`
				setTimeout(() => {
					if (container) {
						container.innerHTML = ''
						container.style.display = 'none'
					}
				}, 1500)
			}
		}, 300)

		innInput.addEventListener('input', () => {
			doSuggest()
		})

		innInput.addEventListener('keydown', e => {
			const items = container.querySelectorAll('.dadata-item')
			if (!items.length) return
			if (e.key === 'ArrowDown') {
				e.preventDefault()
				active = Math.min(active + 1, items.length - 1)
				items.forEach(
					(it, i) => (it.style.background = i === active ? '#eef' : '')
				)
				items[active].scrollIntoView({ block: 'nearest' })
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				active = Math.max(active - 1, 0)
				items.forEach(
					(it, i) => (it.style.background = i === active ? '#eef' : '')
				)
				items[active].scrollIntoView({ block: 'nearest' })
			} else if (e.key === 'Enter') {
				if (active >= 0 && items[active]) {
					e.preventDefault()
					items[active].click()
					active = -1
				}
			}
		})

		document.addEventListener('click', ev => {
			if (innInput) {
				const container = innInput.parentNode.querySelector(
					'.dadata-suggestions'
				)
				if (
					container &&
					!innInput.contains(ev.target) &&
					!container.contains(ev.target)
				) {
					container.innerHTML = ''
					container.style.display = 'none'
				}
			}
		})
	}

	form.addEventListener('submit', async e => {
		e.preventDefault()
		const idField = form.querySelector('#client_id')
		if (!idField) return
		const clientId = idField.value
		if (!clientId) return

		const payload = {}
		fields.forEach(name => {
			const el = form.querySelector(`#${name}`)
			payload[name] = el ? el.value : ''
		})

		const loader = createLoader()
		document.body.appendChild(loader)
		try {
			const resp = await fetch(`${BASE_URL}clients/edit/${clientId}/`, {
				method: 'PUT',
				headers: {
					'Content-Type': 'application/json',
					'X-CSRFToken': getCSRFToken(),
				},
				credentials: 'same-origin',
				body: JSON.stringify(payload),
			})
			const data = await resp.json()
			loader.remove()

			if (!resp.ok) {
				showError(data.error || data.message || 'Ошибка при сохранении клиента')
				return
			}

			replaceClientTableRow(data.id, data.html)

			originalClientData = getClientFormValues()
			lastLoadedClientId = Number(data.id)
			updateSaveCancelButtonsState()
		} catch (err) {
			loader.remove()
			showError(err.message || 'Ошибка при сохранении клиента')
		}
	})
}

function initClientsPagination() {
	const clientsTableId = 'clients-table'

	const nextPageButton = document.getElementById('next-page')
	const lastPageButton = document.getElementById('last-page')
	const prevPageButton = document.getElementById('prev-page')
	const firstPageButton = document.getElementById('first-page')
	const currentPageInput = document.getElementById('current-page')
	const totalPagesSpan = document.getElementById('total-pages')
	const refreshButton = document.getElementById('refresh')

	const fetchAndUpdateClients = async page => {
		const pageNum = Math.max(1, Number(page) || 1)
		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const response = await fetch(
				`${BASE_URL}clients/list/paginate/?page=${pageNum}`,
				{
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				}
			)
			const data = await response.json()

			if (response.ok && data.html && data.context) {
				TableManager.updateTable(data.html, clientsTableId)

				const { current_page, total_pages, client_ids = [] } = data.context

				if (currentPageInput) {
					currentPageInput.value = current_page
					currentPageInput.max = total_pages
					currentPageInput.disabled = total_pages <= 0
				}
				if (totalPagesSpan) totalPagesSpan.textContent = total_pages

				const isFirstPage = current_page <= 1
				const isLastPage = current_page >= total_pages

				if (nextPageButton) nextPageButton.disabled = isLastPage
				if (lastPageButton) lastPageButton.disabled = isLastPage
				if (prevPageButton) prevPageButton.disabled = isFirstPage
				if (firstPageButton) firstPageButton.disabled = isFirstPage

				let hasRows = false
				const tableElem = document.getElementById(clientsTableId)
				if (tableElem) {
					const rows = tableElem.querySelectorAll(
						'tbody tr:not(.table__row--summary):not(.table__row--empty)'
					)
					hasRows = rows && rows.length > 0
					if (rows && client_ids && client_ids.length === rows.length) {
						rows.forEach((row, idx) => {
							row.setAttribute('data-id', client_ids[idx])
						})
					}
				}

				if (hasRows) {
					const prev = document.querySelector(
						'#clients-table tbody tr.table__row--selected'
					)
					if (prev) prev.classList.remove('table__row--selected')
					setTimeout(loadFirstClientFromTable, 50)
				} else {
					clearClientForm()
				}
			} else {
				TableManager.updateTable('', clientsTableId)
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
				if (!response.ok) {
					showError(
						data?.error || data?.message || 'Ошибка загрузки списка клиентов.'
					)
				}
			}
		} catch (err) {
			console.error('Ошибка при загрузке клиентов:', err)
			showError('Произошла ошибка при загрузке списка клиентов.')
			TableManager.updateTable('', clientsTableId)
		} finally {
			loader.remove()
		}
	}

	refreshButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput?.value, 10) || 1
		fetchAndUpdateClients(currentPage)
	})
	nextPageButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput?.value, 10) || 1
		fetchAndUpdateClients(currentPage + 1)
	})
	lastPageButton?.addEventListener('click', () => {
		const totalPages =
			parseInt(totalPagesSpan?.textContent || currentPageInput?.max, 10) || 1
		fetchAndUpdateClients(totalPages)
	})
	prevPageButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput?.value, 10) || 1
		fetchAndUpdateClients(Math.max(1, currentPage - 1))
	})
	firstPageButton?.addEventListener('click', () => fetchAndUpdateClients(1))

	currentPageInput?.addEventListener('input', () => {
		const totalPages =
			parseInt(totalPagesSpan?.textContent || currentPageInput?.max, 10) || 1
		let currentPage = parseInt(currentPageInput.value, 10)
		if (isNaN(currentPage) || currentPage < 1) currentPageInput.value = 1
		else if (currentPage > totalPages) currentPageInput.value = totalPages
	})

	currentPageInput?.addEventListener('change', () => {
		const totalPages =
			parseInt(totalPagesSpan?.textContent || currentPageInput?.max, 10) || 1
		let targetPage = parseInt(currentPageInput.value, 10)
		if (isNaN(targetPage) || targetPage < 1) targetPage = 1
		else if (targetPage > total_pages) targetPage = total_pages
		currentPageInput.value = targetPage
		fetchAndUpdateClients(targetPage)
	})

	const initialPage = parseInt(currentPageInput?.value, 10) || 1
	fetchAndUpdateClients(initialPage)
}

function initArchivePage() {
	TableManager.createColumnsForTable('orders_archive-table', [
		{ name: 'id' },
		{ name: 'archived_at' },
		{ name: 'manager', url: '/users/managers/' },
		{ name: 'client', url: '/commerce/clients/list/' },
		{ name: 'legal_name' },
		{ name: 'product', url: '/commerce/products/list/' },
		{ name: 'amount' },
		{ name: 'created' },
		{ name: 'additional_info' },
	])

	const viewButton = document.getElementById('view-button')

	if (viewButton) {
		viewButton.addEventListener('click', async () => {
			const modal = new Modal()
			const resp = await fetch('/components/commerce/order_documents', {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const html = await resp.text()
			await modal.open(html, 'Файлы заказа')

			const fileTypeSelectInput = document.getElementById('file_type')
			const fileTypeSelect =
				fileTypeSelectInput && fileTypeSelectInput.closest('.select')
			if (fileTypeSelect) {
				SelectHandler.setupSelects({
					select: fileTypeSelect,
					url: `${BASE_URL}documents/types/`,
				})
			}

			let orderId = null
			const selectedCell = document.querySelector('td.table__cell--selected')
			if (selectedCell) {
				const v = selectedCell.textContent.trim()
				orderId = Number.isNaN(Number(v)) ? null : parseInt(v, 10)
			}
			if (!orderId) {
				const selectedRow = document.querySelector('tr.table__row--selected')
				if (selectedRow) {
					const firstCell = selectedRow.querySelector('td')
					if (firstCell) {
						const v = firstCell.textContent.trim()
						orderId = Number.isNaN(Number(v)) ? null : parseInt(v, 10)
					}
				}
			}

			const documentsContainer = document.getElementById('documents-container')
			if (!documentsContainer) return

			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				if (orderId) {
					const docsResp = await fetch(
						`${BASE_URL}documents/table/${orderId}/`,
						{
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						}
					)
					const data = await docsResp.json()
					if (docsResp.ok) {
						documentsContainer.innerHTML = data.html || ''

						try {
							const urls = Array.isArray(data.urls) ? data.urls : []
							if (urls.length) {
								const table =
									documentsContainer.querySelector(
										`table#order-documents-${orderId}`
									) || documentsContainer.querySelector('table')
								if (table) {
									const ths = Array.from(table.querySelectorAll('thead th'))
									const fileColIndex = ths.findIndex(
										th => th && th.dataset && th.dataset.name === 'file_display'
									)
									if (fileColIndex !== -1) {
										const rows = table.querySelectorAll(
											'tbody tr:not(.table__row--summary):not(.table__row--empty)'
										)
										rows.forEach((row, idx) => {
											const cell = row.children[fileColIndex]
											if (!cell) return
											const text = cell.textContent.trim()
											const fileUrl = urls[idx] || ''
											if (fileUrl && text) {
												cell.innerHTML = `<a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`
											}
										})
									}
								}
							}
						} catch (err) {
							console.warn(
								'Не удалось применить ссылки к колонке file_display:',
								err
							)
						}
					} else {
						documentsContainer.innerHTML = data.html || ''
						showError(
							data.error || data.message || 'Ошибка загрузки документов заказа'
						)
					}
				} else {
					documentsContainer.innerHTML =
						'<div class="info">Не выбран заказ</div>'
				}
			} catch (err) {
				showError(err.message || 'Ошибка загрузки документов заказа')
			} finally {
				loader.remove()
			}

			try {
				const uploadForm = document.getElementById('upload-form')
				const uploadBtn = document.getElementById('upload-btn')
				const fileInput = document.getElementById('upload-file-input')
				const fileTypeInput = document.getElementById('file_type')

				if (uploadBtn && fileInput) {
					uploadBtn.addEventListener('click', () => {
						fileInput.click()
					})
				}

				if (fileInput) {
					fileInput.addEventListener('change', async () => {
						const f = fileInput.files && fileInput.files[0]
						if (!f) return

						if (!orderId) {
							showError('Не выбран заказ')
							fileInput.value = ''
							return
						}
						const fileTypeVal = fileTypeInput ? fileTypeInput.value : ''
						if (!fileTypeVal) {
							showError('Выберите тип файла')
							fileInput.value = ''
							return
						}

						const l = createLoader()
						document.body.appendChild(l)
						uploadBtn.disabled = true

						try {
							const fd = new FormData()
							fd.append('file', f)
							fd.append('order', orderId)
							fd.append('file_type', fileTypeVal)

							const uploadResp = await fetch(`${BASE_URL}documents/upload/`, {
								method: 'POST',
								headers: {
									'X-CSRFToken': getCSRFToken(),
									'X-Requested-With': 'XMLHttpRequest',
								},
								credentials: 'same-origin',
								body: fd,
							})

							const payload = await uploadResp.json()

							if (!uploadResp.ok || payload.status !== 'success') {
								showError(
									payload.message || payload.error || 'Ошибка загрузки файла'
								)
							} else {
								const tableId = `order-documents-${orderId}`
								const newRow = await TableManager.addTableRow(payload, tableId)

								try {
									if (payload.url) {
										const table = document.getElementById(tableId)
										if (table) {
											const ths = Array.from(table.querySelectorAll('thead th'))
											const fileColIndex = ths.findIndex(
												th =>
													th && th.dataset && th.dataset.name === 'file_display'
											)
											if (fileColIndex !== -1) {
												let row = null
												if (newRow instanceof HTMLElement) {
													row = newRow
												} else {
													const nameToMatch = (payload.name || '').trim()
													const rows = Array.from(
														table.querySelectorAll(
															'tbody tr:not(.table__row--summary):not(.table__row--empty)'
														)
													)
													row =
														rows.find(r => {
															const c = r.children[fileColIndex]
															return c && c.textContent.trim() === nameToMatch
														}) || null
												}

												if (row) {
													const cell = row.children[fileColIndex]
													if (cell) {
														const text =
															cell.textContent.trim() || payload.name || ''
														cell.innerHTML = ''
														const a = document.createElement('a')
														a.href = payload.url
														a.target = '_blank'
														a.rel = 'noopener noreferrer'
														a.textContent = text
														cell.appendChild(a)
													}
												}
											}
										}
									}
								} catch (e) {
									console.warn(
										'Не удалось сделать ссылку из названия файла:',
										e
									)
								}

								TableManager.initTable(tableId)

								showSuccess('Файл успешно загружен')
							}
						} catch (err) {
							showError(err.message || 'Ошибка загрузки файла')
						} finally {
							l.remove()
							uploadBtn.disabled = false
							try {
								fileInput.value = ''
							} catch (e) {}
						}
					})
				}
			} catch (e) {
				console.warn(
					'Ошибка инициализации загрузчика документов в модальном окне:',
					e
				)
			}

			try {
				const table = documentsContainer.querySelector('table')
				if (table) {
					if (!table.id) table.id = `order-documents-${orderId || 'tmp'}`
					TableManager.initTable(table.id)
					table.querySelectorAll('tbody tr').forEach(row => {
						TableManager.attachRowCellHandlers(row)
						TableManager.formatCurrencyValuesForRow(table.id, row)
						TableManager.applyColumnWidthsForRow(table.id, row)
					})
				}
			} catch (e) {
				console.warn('Не удалось инициализировать таблицу документов:', e)
			}

			const refreshButton = document.getElementById('refresh-button')
			if (refreshButton) {
				refreshButton.addEventListener('click', async () => {
					if (!orderId) return
					const loader2 = createLoader()
					document.body.appendChild(loader2)
					try {
						const docsResp2 = await fetch(
							`${BASE_URL}documents/table/${orderId}/`,
							{ headers: { 'X-Requested-With': 'XMLHttpRequest' } }
						)
						const data = await docsResp2.json()
						if (docsResp2.ok) {
							documentsContainer.innerHTML = data.html || ''

							try {
								const urls = Array.isArray(data.urls) ? data.urls : []
								if (urls.length) {
									const table =
										documentsContainer.querySelector(
											`table#order-documents-${orderId}`
										) || documentsContainer.querySelector('table')
									if (table) {
										const ths = Array.from(table.querySelectorAll('thead th'))
										const fileColIndex = ths.findIndex(
											th =>
												th && th.dataset && th.dataset.name === 'file_display'
										)
										if (fileColIndex !== -1) {
											const rows = table.querySelectorAll(
												'tbody tr:not(.table__row--summary):not(.table__row--empty)'
											)
											rows.forEach((row, idx) => {
												const cell = row.children[fileColIndex]
												if (!cell) return
												const text = cell.textContent.trim()
												const fileUrl = urls[idx] || ''
												if (fileUrl && text) {
													cell.innerHTML = `<a href="${fileUrl}" target="_blank" rel="noopener noreferrer">${text}</a>`
												}
											})
										}
									}
								}
							} catch (err) {
								console.warn(
									'Не удалось применить ссылки к колонке file_display:',
									err
								)
							}

							try {
								const table = documentsContainer.querySelector('table')
								if (table) {
									if (!table.id)
										table.id = `order-documents-${orderId || 'tmp'}`
									TableManager.initTable(table.id)
									table.querySelectorAll('tbody tr').forEach(row => {
										TableManager.attachRowCellHandlers(row)
										TableManager.formatCurrencyValuesForRow(table.id, row)
										TableManager.applyColumnWidthsForRow(table.id, row)
									})
								}
							} catch (e) {
								console.warn(
									'Не удалось инициализировать таблицу документов после обновления:',
									e
								)
							}
						} else {
							documentsContainer.innerHTML = data.html || ''
							showError(
								data.error ||
									data.message ||
									'Ошибка загрузки документов заказа'
							)
						}
					} catch (err) {
						showError(err.message || 'Ошибка загрузки документов заказа')
					} finally {
						loader2.remove()
					}
				})
			}
		})
	}

	document.addEventListener('dblclick', function (e) {
		const row = e.target.closest(
			'tbody tr:not(.table__row--summary):not(.table__row--empty)'
		)
		const table = e.target.closest('table')
		if (!row || !table) return

		let viewBtn = document.getElementById('view-button')
		if (viewBtn && viewBtn.style.display === 'none') viewBtn = null

		if (!viewBtn) {
			viewBtn =
				row.querySelector('.view-button') ||
				e.target.closest('.table__cell')?.querySelector('.view-button')
		}

		if (!viewBtn) {
			const rowId = row.getAttribute('data-id')
			if (rowId) {
				viewBtn =
					document.querySelector(`.view-button[data-row-id="${rowId}"]`) || null
			}
		}

		if (viewBtn) {
			try {
				viewBtn.click()
			} catch (err) {
				viewBtn.dispatchEvent(
					new MouseEvent('click', { bubbles: true, cancelable: true })
				)
			}
		}
	})
}

document.addEventListener('DOMContentLoaded', () => {
	const pathname = window.location.pathname

	const segments = pathname.split('/').filter(Boolean)
	const urlName = segments.length
		? segments[segments.length - 1].replace(/-/g, '_')
		: null

	TableManager.init()
	addMenuHandler()

	if (urlName) {
		if (urlName === 'clients') {
			if (configs[urlName]) {
				initGenericPage(configs[urlName])
			} else {
				console.error(`Config not found for generic page: ${urlName}`)
			}

			attachClientsTableClickHandler()
			attachFormCancelHandler()
			attachClientFormHandlers()

			loadFirstClientFromTable()

			initClientsPagination()
		} else if (urlName === 'products') {
			if (configs[urlName]) {
				initGenericPage(configs[urlName])
			} else {
				console.error(`Config not found for generic page: ${urlName}`)
			}
		} else if (urlName === 'archive') {
			initArchivePage()
		} else if (urlName === 'works') {
			initWorksPage()
		} else if (urlName === 'orders') {
			TableManager.createColumnsForTable('orders-table', [
				{ name: 'id' },
				{ name: 'status', url: '/commerce/orders/statuses/' },
				{ name: 'manager', url: '/users/managers/' },
				{ name: 'client', url: '/commerce/clients/list/' },
				{ name: 'legal_name' },
				{ name: 'product', url: '/commerce/products/list/' },
				{ name: 'amount' },
				{ name: 'created' },
				{ name: 'deadline' },
				{ name: 'paid_amount' },
				{ name: 'paid_percent' },
				{ name: 'additional_info' },
			])
		} else {
			console.error(
				`No specific initialization logic defined for URL segment: ${urlName}`
			)
		}
	} else {
		console.error(
			'Could not determine page context from URL pathname:',
			pathname
		)
	}

	const hideButton = document.getElementById('hide-button')
	const showAllButton = document.getElementById('show-all-button')

	if (hideButton) {
		hideButton.addEventListener('click', () => {
			const selectedRow = document.querySelector('.table__row--selected')
			if (selectedRow) {
				selectedRow.classList.add('hidden-row')
				selectedRow.style.display = 'none'
			}
		})
	}

	if (showAllButton) {
		showAllButton.addEventListener('click', () => {
			document.querySelectorAll('tr.hidden-row').forEach(row => {
				row.classList.remove('hidden-row')
				row.style.display = ''
			})
		})
	}
})
