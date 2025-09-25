import { TableManager } from '/static/js/table.js'
import { createLoader, showError } from '/static/js/ui-utils.js'

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

	function showMenu(x, y) {
		menu.style.display = 'block'
		menu.style.left = `${x + 10}px`
		menu.style.top = `${y}px`
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

document.addEventListener('DOMContentLoaded', () => {
	const pathname = window.location.pathname

	const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
	const match = pathname.match(regex)

	const urlName = match ? match[1].replace(/-/g, '_') : null

	TableManager.init()
	addMenuHandler()

	if (urlName) {
		if (urlName === 'works') {
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
			console.log(
				`No specific initialization logic defined for URL segment: ${urlName}`
			)
		}
	} else {
		console.log('Could not determine page context from URL pathname:', pathname)
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
