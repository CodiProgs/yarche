import { TableManager } from '/static/js/table.js'
import { initTableHandlers } from '/static/js/tableHandlers.js'
import { createLoader, showError } from '/static/js/ui-utils.js'

const BASE_URL = '/commerce/'
const CLIENTS = 'clients'

const initOrdersPage = () => {
	TableManager.init()

	TableManager.createColumnsForTable(
		'orders-table',
		[
			{ name: 'status', url: `${BASE_URL}orders/statuses` },
			{ name: 'manager', url: `/users/managers` },
			{ name: 'client', url: `${BASE_URL}clients` },
			{ name: 'client_legal_name' },
			{ name: 'product', url: `${BASE_URL}products` },
			{ name: 'amount' },
			{ name: 'created' },
			{ name: 'deadline' },
			{ name: 'paid_percent' },
			{ name: 'paid_amount' },
			{ name: 'additional_info' },
		],
		['amount']
	)
}

const initClientsPage = () => {
	TableManager.init()

	TableManager.createColumnsForTable(
		'clients-table',
		[{ name: 'name' }, { name: 'legal_name' }],
		['amount']
	)

	let page = 1

	const nextPageButton = document.getElementById('next-page')
	const lastPageButton = document.getElementById('last-page')
	const prevPageButton = document.getElementById('prev-page')
	const firstPageButton = document.getElementById('first-page')
	const currentPageInput = document.getElementById('current-page')
	const totalPagesSpan = document.getElementById('total-pages')
	const refreshButton = document.getElementById('refresh')

	const fetchAndUpdateTable = async page => {
		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const response = await fetch(`${BASE_URL}clients/table/?page=${page}`, {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const data = await response.json()

			if (response.ok && data.html && data.context) {
				TableManager.updateTable(data.html, 'clients-table')

				const { current_page, total_pages = [] } = data.context

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
			} else {
				TableManager.updateTable('', 'clients-table')

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
			console.error('Ошибка при загрузке данных клиентов:', error)
			showError('Произошла ошибка при загрузке данных')

			TableManager.updateTable('', 'clients-table')
		} finally {
			loader.remove()
		}
	}

	try {
		const paginationData =
			document.getElementById('pagination-data')?.textContent
		if (paginationData) {
			const { current_page, total_pages = [] } = JSON.parse(paginationData)
			page = current_page || 1

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
		} else {
			console.warn('Pagination data not found in the document.')
		}
	} catch (e) {
		console.error('Error parsing pagination data:', e)
	}

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

	initTableHandlers({
		containerId: `${CLIENTS}-container`,
		tableId: `${CLIENTS}-table`,
		formId: `${CLIENTS}-form`,
		getUrl: `${BASE_URL}${CLIENTS}/`,
		addUrl: `${BASE_URL}${CLIENTS}/add/`,
		editUrl: `${BASE_URL}${CLIENTS}/edit/`,
		deleteUrl: `${BASE_URL}${CLIENTS}/delete/`,
		refreshUrl: `${BASE_URL}${CLIENTS}/table/?page=${page}`,
	})
}

document.addEventListener('DOMContentLoaded', () => {
	const pathname = window.location.pathname

	const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
	const match = pathname.match(regex)

	const urlName = match ? match[1].replace(/-/g, '_') : null

	if (urlName) {
		if (urlName === 'orders') {
			initOrdersPage()
		} else if (urlName === 'clients') {
			initClientsPage()
		} else {
			console.log(
				`No specific initialization logic defined for URL segment: ${urlName}`
			)
		}
	} else {
		console.log('Could not determine page context from URL pathname:', pathname)
	}
})
