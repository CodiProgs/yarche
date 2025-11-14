import { DynamicFormHandler } from '/static/js/dynamicFormHandler.js'
import { Modal } from '/static/js/modal.js'
import SelectHandler from '/static/js/selectHandler.js'
import { TableManager } from '/static/js/table.js'
import { initTableHandlers } from '/static/js/tableHandlers.js'
import {
	createLoader,
	getCSRFToken,
	showError,
	showQuestion,
	showSuccess,
} from '/static/js/ui-utils.js'

const CLIENTS = 'clients'
const CONTACTS = 'contacts'
const PRODUCTS = 'products'
const CLIENTS_OBJECTS = 'client-objects'
const CURRENCY_SUFFIX = ' р.'

const BASE_URL = '/commerce/'
const DEPARTMENTS_BASE_URL = '/departments/'

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

const setupCurrencyInput = (inputId, decimalPlaces = 2) => {
	const input = document.getElementById(inputId)
	if (!input) {
		console.error(`Input with id "${inputId}" not found`)
		return null
	}

	if (input.autoNumeric) {
		input.autoNumeric.remove()
	}

	const anElement = new AutoNumeric(input, {
		allowDecimalPadding: decimalPlaces === 0 ? false : true,
		alwaysAllowDecimalCharacter: decimalPlaces > 0,
		currencySymbol: CURRENCY_SUFFIX,
		currencySymbolPlacement: 's',
		decimalCharacter: ',',
		decimalCharacterAlternative: '.',
		decimalPlacesRawValue: decimalPlaces,
		decimalPlaces: decimalPlaces,
		digitGroupSeparator: ' ',
		emptyInputBehavior: 'null',
		minimumValue: '0',
		allowEmpty: true,
	})

	input.autoNumeric = anElement

	return anElement
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

			const pathname = window.location.pathname

			const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
			const match = pathname.match(regex)

			const urlName = match ? match[1].replace(/-/g, '_') : null

			const table = e.target.closest('table')
			if (row && table) {
				e.preventDefault()

				if (addButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						addButton.style.display = 'none'
					} else {
						addButton.style.display = 'block'
					}

					if (urlName === 'works') {
						addButton.textContent = 'Новый расчет'
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

				if (urlName === 'clients' && table.id === 'contacts-table') {
					if (addButton) addButton.style.display = 'none'
					if (deleteButton) deleteButton.style.display = 'none'
				} else {
					if (addButton) addButton.style.display = 'block'
					if (deleteButton) deleteButton.style.display = 'block'
				}

				const viewOrderFilesBtn = document.getElementById(
					'view_order_files-button'
				)
				const updateStatusBtn = document.getElementById('update_status-button')
				const assignExecutorBtn = document.getElementById(
					'assign_executor-button'
				)
				const viewCorrespondenceBtn = document.getElementById(
					'view_correspondence-button'
				)
				const newMessageBtn = document.getElementById('new_message-button')
				const editMessageBtn = document.getElementById('edit_message-button')
				const deleteMessageBtn = document.getElementById(
					'delete_message-button'
				)
				const refreshMessagesBtn = document.getElementById(
					'refresh_messages-button'
				)

				if (
					table.id.startsWith('order-documents-') ||
					table.id.startsWith('order-work-messages-')
				) {
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
					if (updateStatusBtn) updateStatusBtn.style.display = 'none'
					if (assignExecutorBtn) assignExecutorBtn.style.display = 'none'
					if (viewCorrespondenceBtn)
						viewCorrespondenceBtn.style.display = 'none'
				} else {
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'block'
					if (updateStatusBtn) updateStatusBtn.style.display = 'block'
					if (assignExecutorBtn) assignExecutorBtn.style.display = 'block'
					if (viewCorrespondenceBtn)
						viewCorrespondenceBtn.style.display = 'block'
				}

				if (table.id.startsWith('order-work-messages-')) {
					newMessageBtn.style.display = 'block'
					editMessageBtn.style.display = 'block'
					deleteMessageBtn.style.display = 'block'
					refreshMessagesBtn.style.display = 'block'
				} else {
					newMessageBtn.style.display = 'none'
					editMessageBtn.style.display = 'none'
					deleteMessageBtn.style.display = 'none'
					refreshMessagesBtn.style.display = 'none'
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
						if (row.dataset.target) {
							if (row.dataset.target.startsWith('branch-')) {
								addButton.style.display = 'block'
								addButton.textContent = 'Добавить объект'
							} else if (row.dataset.target.startsWith('object-')) {
								addButton.style.display = 'none'

								editButton.style.display = 'block'
								editButton.textContent = 'Редактировать объект'

								deleteButton.style.display = 'block'
								deleteButton.textContent = 'Удалить объект'
							} else if (row.dataset.target.startsWith('product-')) {
								addButton.style.display = 'block'
								addButton.textContent = 'Новый расчет'
							}
						} else {
							addButton.style.display = 'none'
							editButton.style.display = 'none'
							deleteButton.style.display = 'none'
						}
					} else {
						addButton.style.display = 'none'
						editButton.style.display = 'none'
						deleteButton.style.display = 'none'
					}
				}

				const viewOrderFilesBtn = document.getElementById(
					'view_order_files-button'
				)
				const updateStatusBtn = document.getElementById('update_status-button')
				const assignExecutorBtn = document.getElementById(
					'assign_executor-button'
				)
				const viewCorrespondenceBtn = document.getElementById(
					'view_correspondence-button'
				)

				if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'block'
				if (updateStatusBtn) updateStatusBtn.style.display = 'block'
				if (assignExecutorBtn) assignExecutorBtn.style.display = 'block'
				if (viewCorrespondenceBtn) viewCorrespondenceBtn.style.display = 'block'

				const newMessageBtn = document.getElementById('new_message-button')
				const editMessageBtn = document.getElementById('edit_message-button')
				const deleteMessageBtn = document.getElementById(
					'delete_message-button'
				)
				const refreshMessagesBtn = document.getElementById(
					'refresh_messages-button'
				)
				if (newMessageBtn) newMessageBtn.style.display = 'none'
				if (editMessageBtn) editMessageBtn.style.display = 'none'
				if (deleteMessageBtn) deleteMessageBtn.style.display = 'none'
				if (refreshMessagesBtn) refreshMessagesBtn.style.display = 'none'

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

				details.innerHTML = `<div>${data.html}</div>`
				details.dataset.loaded = '1'

				TableManager.initTable(data.table_id)
				TableManager.createColumnsForTable(data.table_id, [
					{ name: 'id' },
					{ name: 'status', url: '/commerce/orders/statuses/' },
					{ name: 'client', url: '/commerce/clients/list/' },
					{ name: 'legal_name' },
					{ name: 'product', url: '/commerce/products/list/' },
					{ name: 'created' },
					{ name: 'deadline' },
					{ name: 'unit_price' },
					{ name: 'amount' },
					{ name: 'paid_amount' },
					{ name: 'comment' },
					{ name: 'additional_info' },
				])
			}
		})
	})

	let clientId = null
	let objectId = null

	document.addEventListener('contextmenu', e => {
		const row = e.target.closest('.debtors-office-list__row')
		if (row) {
			const dataTarget = row.getAttribute('data-target')

			if (dataTarget && dataTarget.startsWith('branch-')) {
				const id = dataTarget.replace('branch-', '')
				clientId = id
				objectId = null
			} else if (dataTarget && dataTarget.startsWith('object-')) {
				const parts = dataTarget.replace('object-', '').split('-')
				if (parts.length >= 2) {
					clientId = parts[0]
					objectId = parts[1]
				}
			} else {
				clientId = null
				objectId = null
			}
		}
	})

	const addButton = document.getElementById('add-button')
	const editButton = document.getElementById('edit-button')
	const deleteButton = document.getElementById('delete-button')

	if (addButton) {
		addButton.addEventListener('click', async () => {
			const buttonText = addButton.textContent.trim()

			if (buttonText === 'Добавить объект') {
				let config = {
					submitUrl: `/commerce/clients/objects/add/`,
					getUrl: `/commerce/clients/objects/`,
					tableId: `${CLIENTS_OBJECTS}-table`,
					formId: `${CLIENTS_OBJECTS}-form`,
					modalConfig: {
						url: `/components/commerce/add_client-object`,
						title: 'Добавить объект',
						context: {},
					},
					onSuccess: async result => {
						if (
							result.status === 'success' &&
							result.html &&
							result.client_id
						) {
							const branchDetails = document.getElementById(
								`branch-${result.client_id}`
							)
							if (branchDetails) {
								let ul = branchDetails.querySelector('ul')

								const noObjectsLi = ul?.querySelector('li:only-child')
								if (
									noObjectsLi &&
									noObjectsLi.textContent.trim() === 'Нет объектов'
								) {
									noObjectsLi.remove()
								}

								if (!ul) {
									ul = document.createElement('ul')
									branchDetails.appendChild(ul)
								}

								ul.insertAdjacentHTML('beforeend', result.html)

								const newItem = ul.lastElementChild
								if (newItem) {
									const newRow = newItem.querySelector(
										'.debtors-office-list__row'
									)
									if (newRow) {
										newRow.addEventListener('click', async function (e) {
											const targetId = newRow.getAttribute('data-target')
											if (!targetId) return
											const details = document.getElementById(targetId)
											if (!details) return

											const btn = newRow.querySelector(
												'.debtors-office-list__toggle'
											)
											if (btn) btn.classList.toggle('open')
											details.classList.toggle('open')

											if (
												newRow.dataset.target.startsWith('product-') &&
												!details.dataset.loaded
											) {
												const loader = createLoader()
												document.body.appendChild(loader)

												const productId = newRow.dataset.productId
												const clientId = newRow.dataset.clientId
												const objectId = newRow.dataset.objectId

												if (productId && clientId && objectId) {
													try {
														const resp = await fetch(
															`/commerce/product_orders/?product_id=${productId}&client_id=${clientId}&object_id=${objectId}`
														)
														const data = await resp.json()
														loader.remove()

														if (resp.ok) {
															details.innerHTML = `<ul>${data.html}</ul>`
															details.dataset.loaded = '1'
														} else {
															showError(data.error || 'Ошибка загрузки данных')
														}
													} catch (err) {
														loader.remove()
														showError(err.message || 'Ошибка загрузки данных')
													}
												}
											}
										})
									}

									const productRows = newItem.querySelectorAll(
										'.debtors-office-list__row[data-target^="product-"]'
									)
									productRows.forEach(row => {
										row.addEventListener('click', async function (e) {
											const targetId = row.getAttribute('data-target')
											if (!targetId) return
											const details = document.getElementById(targetId)
											if (!details) return

											const btn = row.querySelector(
												'.debtors-office-list__toggle'
											)
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

												if (productId && clientId && objectId) {
													try {
														const resp = await fetch(
															`/commerce/product_orders/?product_id=${productId}&client_id=${clientId}&object_id=${objectId}`
														)
														const data = await resp.json()
														loader.remove()

														if (resp.ok) {
															details.innerHTML = `<ul>${data.html}</ul>`
															details.dataset.loaded = '1'
														} else {
															showError(data.error || 'Ошибка загрузки данных')
														}
													} catch (err) {
														loader.remove()
														showError(err.message || 'Ошибка загрузки данных')
													}
												}
											}
										})
									})
								}

								showSuccess('Объект успешно добавлен')
							}
						}
					},
				}

				if (!clientId) {
					showError('Не выбран клиент для добавления объекта.')
					return
				}

				const formHandler = new DynamicFormHandler(config)
				await formHandler.init()

				const clientIdInput = document.getElementById('client_id')
				if (clientIdInput) {
					clientIdInput.value = clientId
				}
			} else if (buttonText === 'Новый расчет') {
				const row = document.querySelector(
					'.debtors-office-list__row[data-target^="product-"]'
				)
				if (!row) {
					showError('Не выбран продукт для создания расчета.')
					return
				}

				const productId = row.dataset.productId
				const currentClientId = row.dataset.clientId
				const currentObjectId = row.dataset.objectId

				if (!productId || !currentClientId || !currentObjectId) {
					showError('Не удалось определить параметры для создания расчета.')
					return
				}

				let config = {
					submitUrl: `/commerce/orders/add/`,
					getUrl: `/commerce/orders/`,
					tableId: `orders-table`,
					formId: `orders-form`,
					modalConfig: {
						url: `/components/commerce/add_order`,
						title: 'Новый расчет',
						context: {},
					},
					dataUrls: [
						{ id: 'client', url: `/commerce/clients/list/` },
						{
							id: 'product',
							url: `/commerce/products/list/`,
						},
					],
					onSuccess: async result => {
						if (result.status === 'success' && result.id) {
							const tableId = result.table_id

							let table = document.getElementById(tableId)

							if (!table) {
								const productId = row.dataset.productId
								const currentClientId = row.dataset.clientId
								const currentObjectId = row.dataset.objectId

								const productDetails = document.getElementById(
									`product-${currentClientId}-${currentObjectId}-${productId}`
								)

								if (productDetails) {
									const fields = [
										{ name: 'id', verbose_name: 'Заказ' },
										{ name: 'status', verbose_name: 'Статус' },
										{ name: 'client', verbose_name: 'Клиент' },
										{ name: 'legal_name', verbose_name: 'Полное юринфо' },
										{ name: 'product', verbose_name: 'Продукт' },
										{ name: 'created', verbose_name: 'Создан' },
										{ name: 'deadline', verbose_name: 'Срок сдачи' },
										{ name: 'required_documents', verbose_name: 'Док-ты' },
										{ name: 'unit_price', verbose_name: 'Стоимость' },
										{ name: 'amount', verbose_name: 'Сумма' },
										{ name: 'paid_amount', verbose_name: 'Погашено' },
										{ name: 'comment', verbose_name: 'Комментарий' },
										{ name: 'additional_info', verbose_name: 'Доп. инф-я' },
									]

									const tableHTML = `
											<div>
												<table id="${tableId}" class="table">
													<thead>
														<tr>
															${fields.map(f => `<th data-name="${f.name}">${f.verbose_name}</th>`).join('')}
														</tr>
													</thead>
													<tbody>
													</tbody>
												</table>
											</div>
										`

									productDetails.innerHTML = tableHTML
									productDetails.dataset.loaded = '1'

									table = document.getElementById(tableId)

									TableManager.initTable(tableId)
								}
							}

							if (table) {
								const newRow = await TableManager.addTableRow(result, tableId)

								if (newRow) {
									TableManager.attachRowCellHandlers(newRow)
									TableManager.formatCurrencyValuesForRow(tableId, newRow)
									TableManager.applyColumnWidthsForRow(tableId, newRow)

									showSuccess('Расчет успешно создан')
								}
							} else {
								showError('Не удалось добавить заказ в таблицу')
							}
						}
					},
				}

				const formHandler = new DynamicFormHandler(config)
				await formHandler.init()

				const clientInput = document.getElementById('client')
				if (clientInput) {
					clientInput.value = currentClientId
					const selectWrapper = clientInput.closest('.select')
					if (selectWrapper) {
						const displaySpan = selectWrapper.querySelector(
							'.select__display span'
						)
						if (displaySpan) {
							const clientRow = document.querySelector(
								`[data-target="branch-${currentClientId}"]`
							)
							if (clientRow) {
								displaySpan.textContent =
									clientRow.querySelector('h3')?.textContent || currentClientId
							}
						}
					}
				}

				const productInput = document.getElementById('product')
				if (productInput) {
					productInput.value = productId
					const selectWrapper = productInput.closest('.select')
					if (selectWrapper) {
						const displaySpan = selectWrapper.querySelector(
							'.select__display span'
						)
						if (displaySpan) {
							displaySpan.textContent =
								row.querySelector('.debtors-office-list__title')?.textContent ||
								productId
						}
					}
				}

				const clientObjectInput = document.getElementById('client_object')
				if (clientObjectInput) {
					clientObjectInput.value = currentObjectId
					const selectWrapper = clientObjectInput.closest('.select')
					if (selectWrapper) {
						const displaySpan = selectWrapper.querySelector(
							'.select__display span'
						)
						if (displaySpan) {
							const objectRow = document.querySelector(
								`[data-target="object-${currentClientId}-${currentObjectId}"]`
							)
							if (objectRow) {
								displaySpan.textContent =
									objectRow.querySelector('h4')?.textContent || currentObjectId
							}
						}
					}
				}

				const unit_priceInput = document.getElementById('unit_price')
				const quantityInput = document.getElementById('quantity')
				const amountInput = document.getElementById('amount')

				if (unit_priceInput && quantityInput && amountInput) {
					const unitPriceAN = setupCurrencyInput('unit_price', 0)
					const amountAN = setupCurrencyInput('amount', 0)

					const calculateAmount = () => {
						const unitPrice = unitPriceAN
							? unitPriceAN.getNumber()
							: parseFloat(
									unit_priceInput.value.replace(/\s/g, '').replace(',', '.')
							  ) || 0
						const quantity =
							parseFloat(
								quantityInput.value.replace(/\s/g, '').replace(',', '.')
							) || 0

						if (unitPrice > 0 && quantity > 0) {
							const amount = Math.round(unitPrice * quantity)
							if (amountAN) {
								amountAN.set(amount)
							} else {
								amountInput.value = amount
							}
						} else if (unitPrice === 0 || quantity === 0) {
							if (amountAN) {
								amountAN.set(0)
							} else {
								amountInput.value = ''
							}
						}
					}

					unit_priceInput.addEventListener('input', calculateAmount)
					quantityInput.addEventListener('input', calculateAmount)

					unit_priceInput.addEventListener('change', calculateAmount)
					quantityInput.addEventListener('change', calculateAmount)
				}
			}
		})
	}

	if (editButton) {
		editButton.addEventListener('click', async () => {
			if (!clientId || !objectId) {
				showError('Не выбран объект для редактирования.') // TODO:
				return
			}

			const editConfig = {
				submitUrl: `/commerce/clients/objects/edit/${objectId}/`,
				getUrl: `/commerce/clients/objects/${objectId}/`,
				tableId: `${CLIENTS_OBJECTS}-table`,
				formId: `${CLIENTS_OBJECTS}-form`,
				modalConfig: {
					url: `/components/commerce/add_client-object`,
					title: 'Редактировать объект',
				},

				onSuccess: async result => {
					if (
						result.status === 'success' &&
						result.html &&
						result.client_id &&
						result.id
					) {
						const existingObjectItem = document
							.querySelector(
								`[data-target="object-${result.client_id}-${result.id}"]`
							)
							?.closest('li')

						if (existingObjectItem) {
							existingObjectItem.outerHTML = result.html

							const newItem = document
								.querySelector(
									`[data-target="object-${result.client_id}-${result.id}"]`
								)
								?.closest('li')

							if (newItem) {
								const newRow = newItem.querySelector(
									'.debtors-office-list__row'
								)
								if (newRow) {
									newRow.addEventListener('click', async function (e) {
										const targetId = newRow.getAttribute('data-target')
										if (!targetId) return
										const details = document.getElementById(targetId)
										if (!details) return

										const btn = newRow.querySelector(
											'.debtors-office-list__toggle'
										)
										if (btn) btn.classList.toggle('open')
										details.classList.toggle('open')
									})
								}

								const productRows = newItem.querySelectorAll(
									'.debtors-office-list__row[data-target^="product-"]'
								)
								productRows.forEach(row => {
									row.addEventListener('click', async function (e) {
										const targetId = row.getAttribute('data-target')
										if (!targetId) return
										const details = document.getElementById(targetId)
										if (!details) return

										const btn = row.querySelector(
											'.debtors-office-list__toggle'
										)
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

											if (productId && clientId && objectId) {
												try {
													const resp = await fetch(
														`/commerce/product_orders/?product_id=${productId}&client_id=${clientId}&object_id=${objectId}`
													)
													const data = await resp.json()
													loader.remove()

													if (resp.ok) {
														details.innerHTML = `<ul>${data.html}</ul>`
														details.dataset.loaded = '1'
													} else {
														showError(data.error || 'Ошибка загрузки данных')
													}
												} catch (err) {
													loader.remove()
													showError(err.message || 'Ошибка загрузки данных')
												}
											}
										}
									})
								})
							}

							showSuccess('Объект успешно обновлен')
						}
					}
				},
			}

			const formHandler = new DynamicFormHandler(editConfig)
			await formHandler.init()

			try {
				const resp = await fetch(`/commerce/clients/objects/${objectId}/`)
				const data = await resp.json()

				if (resp.ok && data.data) {
					const nameInput = document.getElementById('name')
					if (nameInput && data.data.name) {
						nameInput.value = data.data.name
					}

					const clientIdInput = document.getElementById('client_id')
					if (clientIdInput) {
						clientIdInput.value = clientId
					}
				}
			} catch (err) {
				showError(err.message || 'Ошибка загрузки данных объекта')
			}
		})
	}

	if (deleteButton) {
		deleteButton.addEventListener('click', async () => {
			if (!clientId || !objectId) {
				showError('Не выбран объект для удаления.')
				return
			}

			showQuestion(
				'Вы действительно хотите удалить запись?',
				'Удаление',
				async () => {
					const loader = createLoader()
					document.body.appendChild(loader)

					try {
						const resp = await fetch(
							`/commerce/clients/objects/delete/${objectId}/`,
							{
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'X-CSRFToken': getCSRFToken(),
								},
								credentials: 'same-origin',
							}
						)

						const data = await resp.json()
						loader.remove()

						if (!resp.ok || data.status !== 'success') {
							showError(
								data.message || data.error || 'Ошибка при удалении объекта'
							)
							return
						}

						const objectItem = document
							.querySelector(`[data-target="object-${clientId}-${objectId}"]`)
							?.closest('li')

						if (objectItem) {
							objectItem.remove()

							const branchDetails = document.getElementById(
								`branch-${clientId}`
							)
							if (branchDetails) {
								const ul = branchDetails.querySelector('ul')
								const remainingObjects = ul?.querySelectorAll(
									'li.debtors-office-list__item'
								)

								if (!remainingObjects || remainingObjects.length === 0) {
									if (!ul) {
										const newUl = document.createElement('ul')
										branchDetails.appendChild(newUl)
										newUl.innerHTML = '<li>Нет объектов</li>'
									} else {
										ul.innerHTML = '<li>Нет объектов</li>'
									}
								}
							}

							showSuccess('Объект успешно удален')

							objectId = null
						}
					} catch (err) {
						loader.remove()
						showError(err.message || 'Ошибка при удалении объекта')
					}
				}
			)
		})
	}
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

const initDepartmentPage = departmentSlug => {
	const tableId = 'department_orders-table'

	TableManager.createColumnsForTable(tableId, [
		{ name: 'id' },
		{
			name: 'department_executor',
			url: `/departments/users/${departmentSlug}/`,
		},
		{ name: 'client', url: '/commerce/clients/list/' },
		{ name: 'product', url: '/commerce/products/list/' },
		{
			name: 'department_status',
			url: `/departments/statuses/${departmentSlug}/`,
		},
		{ name: 'created' },
		{ name: 'department_started' },
		{ name: 'department_completed' },
		{ name: 'legal_name' },
	])

	const assignExecutorBtn = document.getElementById('assign_executor-button')
	if (assignExecutorBtn) {
		assignExecutorBtn.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			if (!selectedRow) {
				showError('Выберите заказ для назначения исполнителя')
				return
			}

			const orderIdCell = selectedRow.querySelector('td:first-child')
			const orderId = orderIdCell?.textContent.trim()

			if (!orderId) {
				showError('Не удалось определить ID заказа')
				return
			}

			const config = {
				submitUrl: `/departments/${departmentSlug}/orders/${orderId}/assign-executor/`,
				tableId: tableId,
				formId: 'assign-executor-form',
				modalConfig: {
					url: '/components/departments/assign_executor',
					title: `Назначить исполнителя для заказа №${orderId}`,
				},
				getUrl: `/departments/${departmentSlug}/orders/`,
				dataUrls: [
					{
						id: 'executor',
						url: `/departments/users/${departmentSlug}/`,
					},
				],
				onSuccess: async result => {
					if (result.status === 'success' && result.html) {
						selectedRow.outerHTML = result.html

						const table = document.getElementById(tableId)
						if (table) {
							const rows = table.querySelectorAll('tbody tr')
							rows.forEach(row => {
								const firstCell = row.querySelector('td:first-child')
								if (firstCell && firstCell.textContent.trim() === orderId) {
									row.classList.add('table__row--selected')
									TableManager.attachRowCellHandlers(row)
									TableManager.formatCurrencyValuesForRow(tableId, row)
									TableManager.applyColumnWidthsForRow(tableId, row)
								}
							})
						}

						showSuccess(result.message || 'Исполнитель успешно назначен')
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(orderId)
		})
	}

	const updateStatusBtn = document.getElementById('update_status-button')
	if (updateStatusBtn) {
		updateStatusBtn.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			if (!selectedRow) {
				showError('Выберите заказ для изменения статуса')
				return
			}

			const orderIdCell = selectedRow.querySelector('td:first-child')
			const orderId = orderIdCell?.textContent.trim()

			if (!orderId) {
				showError('Не удалось определить ID заказа')
				return
			}

			const config = {
				submitUrl: `/departments/${departmentSlug}/orders/${orderId}/update-status/`,
				tableId: tableId,
				formId: 'update-status-form',
				modalConfig: {
					url: '/components/departments/update_status',
					title: `Изменить статус заказа №${orderId}`,
				},
				getUrl: `/departments/${departmentSlug}/orders/`,
				dataUrls: [
					{
						id: 'status',
						url: `/departments/statuses/${departmentSlug}/`,
					},
				],
				onSuccess: async result => {
					if (result.status === 'success' && result.html) {
						const table = document.getElementById(tableId)

						if (table) {
							const rows = table.querySelectorAll('tbody tr')
							rows.forEach(row => {
								const firstCell = row.querySelector('td:first-child')
								if (firstCell && firstCell.textContent.trim() === orderId) {
									TableManager.updateTableRow(result, tableId)

									row.classList.add('table__row--selected')
									TableManager.attachRowCellHandlers(row)
									TableManager.formatCurrencyValuesForRow(tableId, row)
									TableManager.applyColumnWidthsForRow(tableId, row)
								}
							})
						}

						showSuccess(result.message || 'Статус успешно изменен')
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(orderId)
		})
	}

	const viewOrderFilesBtn = document.getElementById('view_order_files-button')
	if (viewOrderFilesBtn) {
		viewOrderFilesBtn.addEventListener('click', async () => {
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

		if (!row || !table || table.id !== tableId) return

		let viewBtn = document.getElementById('view_order_files-button')
		if (viewBtn && viewBtn.style.display === 'none') viewBtn = null

		if (!viewBtn) {
			viewBtn =
				row.querySelector('.view_order_files-button') ||
				e.target
					.closest('.table__cell')
					?.querySelector('.view_order_files-button')
		}

		if (!viewBtn) {
			const rowId = row.getAttribute('data-id')
			if (rowId) {
				viewBtn =
					document.querySelector(
						`.view_order_files-button[data-row-id="${rowId}"]`
					) || null
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

	const viewCorrespondenceBtn = document.getElementById(
		'view_correspondence-button'
	)

	if (viewCorrespondenceBtn) {
		viewCorrespondenceBtn.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			if (!selectedRow) {
				showError('Выберите заказ для просмотра переписки')
				return
			}

			const orderIdCell = selectedRow.querySelector('td:first-child')
			const orderId = orderIdCell?.textContent.trim()

			if (!orderId) {
				showError('Не удалось определить ID заказа')
				return
			}

			const loader = createLoader()
			document.body.appendChild(loader)

			try {
				const orderWorkResp = await fetch(
					`/departments/${departmentSlug}/orders/${orderId}/work/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					}
				)

				if (!orderWorkResp.ok) {
					loader.remove()
					showError('Не удалось получить данные о работе отдела')
					return
				}

				const orderWorkData = await orderWorkResp.json()
				const orderWorkId = orderWorkData.order_work_id

				if (!orderWorkId) {
					loader.remove()
					showError('Работа отдела не найдена для этого заказа')
					return
				}

				const messagesResp = await fetch(
					`/departments/work-messages/${orderWorkId}/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					}
				)

				const messagesData = await messagesResp.json()

				loader.remove()

				if (!messagesResp.ok) {
					showError(
						messagesData.error ||
							messagesData.message ||
							'Ошибка загрузки сообщений'
					)
					return
				}

				const modal = new Modal()

				const modalContent = `
                <div class="correspondence-container" id="messages-container">
                    ${
											messagesData.html ||
											'<div class="info">Нет сообщений</div>'
										}
                </div>
            `

				await modal.open(modalContent, `Переписка по заказу №${orderId}`)

				try {
					const table = document.querySelector('#messages-container table')
					if (table && messagesData.messages_meta) {
						const ths = Array.from(table.querySelectorAll('thead th'))
						const authorColIndex = ths.findIndex(
							th => th && th.dataset && th.dataset.name === 'author'
						)

						if (authorColIndex !== -1) {
							const rows = table.querySelectorAll(
								'tbody tr:not(.table__row--summary):not(.table__row--empty)'
							)

							messagesData.messages_meta.forEach((meta, idx) => {
								if (meta.unread_type && rows[idx]) {
									const authorCell = rows[idx].children[authorColIndex]
									if (authorCell) {
										const unreadDot = document.createElement('span')
										unreadDot.className = 'unread-indicator'

										const bgColor =
											meta.unread_type === 'received' ? '#10b981' : '#f59e0b'

										unreadDot.style.cssText = `
                                        display: inline-block;
                                        width: 8px;
                                        height: 8px;
                                        background-color: ${bgColor};
                                        border-radius: 50%;
                                        margin-right: 6px;
                                        vertical-align: middle;
                                        margin-bottom: 2px;
                                    `

										unreadDot.title =
											meta.unread_type === 'received'
												? 'Непрочитанное сообщение для вас'
												: 'Ваше сообщение не прочитано'

										authorCell.insertBefore(unreadDot, authorCell.firstChild)
									}
								}
							})
						}
					}
				} catch (e) {
					console.warn(
						'Не удалось добавить индикаторы непрочитанных сообщений:',
						e
					)
				}

				try {
					const table = document.querySelector('#messages-container table')
					if (table) {
						if (!table.id) table.id = `order-work-messages-${orderWorkId}`
						TableManager.initTable(table.id)
						table.querySelectorAll('tbody tr').forEach(row => {
							TableManager.attachRowCellHandlers(row)
							TableManager.formatCurrencyValuesForRow(table.id, row)
							TableManager.applyColumnWidthsForRow(table.id, row)
						})
					}
				} catch (e) {
					console.warn('Не удалось инициализировать таблицу сообщений:', e)
				}

				setIds(
					messagesData.messages_id_list,
					`order-work-messages-${orderWorkId}`
				)
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка загрузки переписки')
			}
		})
	}

	const newMessageBtn = document.getElementById('new_message-button')
	const editMessageBtn = document.getElementById('edit_message-button')
	const deleteMessageBtn = document.getElementById('delete_message-button')
	const refreshMessagesBtn = document.getElementById('refresh_messages-button')

	if (newMessageBtn) {
		newMessageBtn.addEventListener('click', async () => {
			const messagesContainer = document.getElementById('messages-container')
			if (!messagesContainer) {
				showError('Сначала откройте переписку по заказу')
				return
			}

			const messagesTable = messagesContainer.querySelector('table')
			if (!messagesTable || !messagesTable.id) {
				showError('Не удалось определить таблицу сообщений')
				return
			}

			const tableIdMatch = messagesTable.id.match(/order-work-messages-(\d+)/)
			if (!tableIdMatch || !tableIdMatch[1]) {
				showError('Не удалось определить ID работы отдела')
				return
			}
			const orderWorkId = tableIdMatch[1]

			const config = {
				getUrl: `${DEPARTMENTS_BASE_URL}work-messages/detail/`,
				submitUrl: `/departments/work-messages/create/`,
				tableId: messagesTable.id,
				formId: 'message-form',
				modalConfig: {
					url: '/components/departments/message',
					title: 'Новое сообщение',
				},
				dataUrls: [
					{
						id: 'recipient',
						url: `/departments/users/${departmentSlug}/`,
					},
				],
				beforeSubmit: formData => {
					formData.append('order_work', orderWorkId)
					return formData
				},
				onSuccess: async result => {
					if (result.status === 'success' && result.html && result.message) {
						const tbody = messagesTable.querySelector('tbody')
						if (tbody) {
							tbody.insertAdjacentHTML('afterbegin', result.html)
							const newRow = tbody.firstElementChild

							if (newRow && newRow.tagName === 'TR') {
								if (result.id && !newRow.hasAttribute('data-id')) {
									newRow.setAttribute('data-id', String(result.id))
								}

								try {
									const ths = Array.from(
										messagesTable.querySelectorAll('thead th')
									)
									const authorColIndex = ths.findIndex(
										th => th && th.dataset && th.dataset.name === 'author'
									)

									if (authorColIndex !== -1) {
										const authorCell = newRow.children[authorColIndex]
										if (authorCell) {
											const unreadDot = document.createElement('span')
											unreadDot.className = 'unread-indicator'
											unreadDot.style.cssText = `
                                        display: inline-block;
                                        width: 8px;
                                        height: 8px;
                                        background-color: #f59e0b;
                                        border-radius: 50%;
                                        margin-right: 6px;
                                        vertical-align: middle;
                                        margin-bottom: 2px;
                                    `
											unreadDot.title = 'Ваше сообщение не прочитано'
											authorCell.insertBefore(unreadDot, authorCell.firstChild)
										}
									}
								} catch (e) {
									console.warn(
										'Не удалось добавить индикатор к новому сообщению:',
										e
									)
								}

								TableManager.attachRowCellHandlers(newRow)
								TableManager.formatCurrencyValuesForRow(
									messagesTable.id,
									newRow
								)
								TableManager.applyColumnWidthsForRow(messagesTable.id, newRow)

								showSuccess('Сообщение успешно отправлено')
							}
						}
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init()

			const messageForm = document.getElementById('message-form')
			if (messageForm) {
				let hiddenInput = messageForm.querySelector('#order_work')
				if (!hiddenInput) {
					hiddenInput = document.createElement('input')
					hiddenInput.type = 'hidden'
					hiddenInput.id = 'order_work'
					hiddenInput.name = 'order_work'
					messageForm.appendChild(hiddenInput)
				}
				hiddenInput.value = orderWorkId
			}
		})
	}

	if (editMessageBtn) {
		editMessageBtn.addEventListener('click', async () => {
			const messagesContainer = document.getElementById('messages-container')
			if (!messagesContainer) {
				showError('Сначала откройте переписку по заказу')
				return
			}

			const messagesTable = messagesContainer.querySelector('table')
			if (!messagesTable || !messagesTable.id) {
				showError('Не удалось определить таблицу сообщений')
				return
			}

			let selectedRow =
				messagesTable.querySelector('tbody tr.table__row--selected') ||
				messagesTable
					.querySelector('tbody tr td.table__cell--selected')
					?.closest('tr')

			if (!selectedRow) {
				showError('Выберите сообщение для редактирования')
				return
			}

			const messageId =
				selectedRow.dataset.id ||
				selectedRow.querySelector('td')?.textContent.trim()

			if (!messageId) {
				showError('Не удалось определить ID сообщения')
				return
			}

			const config = {
				getUrl: `${DEPARTMENTS_BASE_URL}work-messages/detail/`,
				submitUrl: `/departments/work-messages/edit/`,
				tableId: messagesTable.id,
				formId: 'message-form',
				modalConfig: {
					url: '/components/departments/message',
					title: 'Редактировать сообщение',
				},
				dataUrls: [
					{
						id: 'recipient',
						url: `/departments/users/${departmentSlug}/`,
					},
				],
				onSuccess: async result => {
					if (result.status === 'success' && result.html) {
						const existingRow =
							messagesTable.querySelector(`tbody tr[data-id="${messageId}"]`) ||
							selectedRow

						const rowId =
							result.id ||
							(result.message_meta &&
								(result.message_meta.id || result.message_meta.message_id)) ||
							result.message_id ||
							result.pk ||
							null

						const tbody = existingRow.parentNode
						const existingRowIndex = Array.from(tbody.children).indexOf(
							existingRow
						)

						existingRow.outerHTML = result.html

						const newRow = tbody.children[existingRowIndex]

						if (newRow && newRow.tagName === 'TR') {
							if (rowId && !newRow.hasAttribute('data-id')) {
								newRow.setAttribute('data-id', String(rowId))
							}

							try {
								const ths = Array.from(
									messagesTable.querySelectorAll('thead th')
								)
								const authorColIndex = ths.findIndex(
									th => th && th.dataset && th.dataset.name === 'author'
								)

								if (
									authorColIndex !== -1 &&
									result.message_meta &&
									result.message_meta.unread_type
								) {
									const authorCell = newRow.children[authorColIndex]
									if (authorCell) {
										const unreadDot = document.createElement('span')
										unreadDot.className = 'unread-indicator'

										const bgColor =
											result.message_meta.unread_type === 'received'
												? '#10b981'
												: '#f59e0b'

										unreadDot.style.cssText = `
                                            display: inline-block;
                                            width: 8px;
                                            height: 8px;
                                            background-color: ${bgColor};
                                            border-radius: 50%;
                                            margin-right: 6px;
                                            vertical-align: middle;
                                            margin-bottom: 2px;
                                        `
										unreadDot.title =
											result.message_meta.unread_type === 'received'
												? 'Непрочитанное сообщение для вас'
												: 'Ваше сообщение не прочитано'

										const existingDot =
											authorCell.querySelector('.unread-indicator')
										if (existingDot) existingDot.remove()

										authorCell.insertBefore(unreadDot, authorCell.firstChild)
									}
								}
							} catch (e) {
								console.warn(
									'Не удалось обновить индикатор непрочитанности:',
									e
								)
							}

							TableManager.attachRowCellHandlers(newRow)
							TableManager.formatCurrencyValuesForRow(messagesTable.id, newRow)
							TableManager.applyColumnWidthsForRow(messagesTable.id, newRow)

							showSuccess('Сообщение успешно обновлено')
						} else {
							console.warn(
								'Не удалось найти или заменить строку после обновления'
							)
						}
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(messageId)
		})
	}

	if (deleteMessageBtn) {
		deleteMessageBtn.addEventListener('click', async () => {
			const messagesContainer = document.getElementById('messages-container')
			if (!messagesContainer) {
				showError('Сначала откройте переписку по заказу')
				return
			}

			const messagesTable = messagesContainer.querySelector('table')
			if (!messagesTable || !messagesTable.id) {
				showError('Не удалось определить таблицу сообщений')
				return
			}

			let selectedRow =
				messagesTable.querySelector('tbody tr.table__row--selected') ||
				messagesTable
					.querySelector('tbody tr td.table__cell--selected')
					?.closest('tr')

			if (!selectedRow) {
				showError('Выберите сообщение для удаления')
				return
			}

			const messageId =
				selectedRow.dataset.id ||
				selectedRow.querySelector('td')?.textContent.trim()

			if (!messageId) {
				showError('Не удалось определить ID сообщения')
				return
			}

			showQuestion(
				'Вы действительно хотите удалить это сообщение?',
				'Удаление сообщения',
				async () => {
					const loader = createLoader()
					document.body.appendChild(loader)

					try {
						const resp = await fetch(
							`${DEPARTMENTS_BASE_URL}work-messages/delete/${messageId}/`,
							{
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'X-CSRFToken': getCSRFToken(),
								},
								credentials: 'same-origin',
							}
						)

						const data = await resp.json()
						loader.remove()

						if (!resp.ok || data.status !== 'success') {
							showError(
								data.message || data.error || 'Ошибка при удалении сообщения'
							)
							return
						}

						selectedRow.remove()

						const remainingRows = messagesTable.querySelectorAll(
							'tbody tr:not(.table__row--summary):not(.table__row--empty)'
						)

						if (remainingRows.length === 0) {
							const tbody = messagesTable.querySelector('tbody')
							if (tbody) {
								tbody.innerHTML = `
                                    <tr class="table__row--empty">
                                        <td colspan="100%" style="text-align: center; padding: 20px;">
                                            Нет сообщений
                                        </td>
                                    </tr>
                                `
							}
						}

						showSuccess('Сообщение успешно удалено')
					} catch (err) {
						loader.remove()
						showError(err.message || 'Ошибка при удалении сообщения')
					}
				}
			)
		})
	}

	if (refreshMessagesBtn) {
		refreshMessagesBtn.addEventListener('click', async () => {
			const messagesContainer = document.getElementById('messages-container')
			if (!messagesContainer) {
				showError('Сначала откройте переписку по заказу')
				return
			}

			const messagesTable = messagesContainer.querySelector('table')
			if (!messagesTable || !messagesTable.id) {
				showError('Не удалось определить таблицу сообщений')
				return
			}

			const tableIdMatch = messagesTable.id.match(/order-work-messages-(\d+)/)
			if (!tableIdMatch || !tableIdMatch[1]) {
				showError('Не удалось определить ID работы отдела')
				return
			}
			const orderWorkId = tableIdMatch[1]

			const loader = createLoader()
			document.body.appendChild(loader)

			try {
				const messagesResp = await fetch(
					`${DEPARTMENTS_BASE_URL}work-messages/${orderWorkId}/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					}
				)

				const messagesData = await messagesResp.json()
				loader.remove()

				if (!messagesResp.ok) {
					showError(
						messagesData.error ||
							messagesData.message ||
							'Ошибка загрузки сообщений'
					)
					return
				}

				messagesContainer.innerHTML =
					messagesData.html || '<div class="info">Нет сообщений</div>'

				try {
					const table = messagesContainer.querySelector('table')
					if (table && messagesData.messages_meta) {
						const ths = Array.from(table.querySelectorAll('thead th'))
						const authorColIndex = ths.findIndex(
							th => th && th.dataset && th.dataset.name === 'author'
						)

						if (authorColIndex !== -1) {
							const rows = table.querySelectorAll(
								'tbody tr:not(.table__row--summary):not(.table__row--empty)'
							)

							messagesData.messages_meta.forEach((meta, idx) => {
								if (meta.unread_type && rows[idx]) {
									const authorCell = rows[idx].children[authorColIndex]
									if (authorCell) {
										const unreadDot = document.createElement('span')
										unreadDot.className = 'unread-indicator'

										const bgColor =
											meta.unread_type === 'received' ? '#10b981' : '#f59e0b'

										unreadDot.style.cssText = `
                                            display: inline-block;
                                            width: 8px;
                                            height: 8px;
                                            background-color: ${bgColor};
                                            border-radius: 50%;
                                            margin-right: 6px;
                                            vertical-align: middle;
                                            margin-bottom: 2px;
                                        `

										unreadDot.title =
											meta.unread_type === 'received'
												? 'Непрочитанное сообщение для вас'
												: 'Ваше сообщение не прочитано'

										authorCell.insertBefore(unreadDot, authorCell.firstChild)
									}
								}
							})
						}
					}
				} catch (e) {
					console.warn(
						'Не удалось добавить индикаторы непрочитанных сообщений:',
						e
					)
				}

				try {
					const table = messagesContainer.querySelector('table')
					if (table) {
						if (!table.id) table.id = `order-work-messages-${orderWorkId}`
						TableManager.initTable(table.id)
						table.querySelectorAll('tbody tr').forEach(row => {
							TableManager.attachRowCellHandlers(row)
							TableManager.formatCurrencyValuesForRow(table.id, row)
							TableManager.applyColumnWidthsForRow(table.id, row)
						})
					}
				} catch (e) {
					console.warn('Не удалось инициализировать таблицу сообщений:', e)
				}

				if (messagesData.messages_id_list) {
					setIds(
						messagesData.messages_id_list,
						`order-work-messages-${orderWorkId}`
					)
				}

				showSuccess('Сообщения обновлены')
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка при обновлении сообщений')
			}
		})
	}
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
		} else if (segments[0] === 'departments' && segments[1]) {
			const departmentSlug = segments[1]
			initDepartmentPage(departmentSlug)
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
