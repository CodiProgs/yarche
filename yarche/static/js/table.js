import SelectHandler from './selectHandler.js'
import { FormBuilder } from '/static/js/form-builder.js'
import {
	createLoader,
	getCSRFToken,
	showError,
	showSuccess,
} from '/static/js/ui-utils.js'

const DOM_HELPER = {
	createElement: (tag, className = '') => {
		const element = document.createElement(tag)
		if (className) element.className = className
		return element
	},
	removeElement: element => element?.remove(),
	toggleElementClass: (element, className, shouldAdd) =>
		element.classList.toggle(className, shouldAdd),
	applyStyles: (element, styles) => Object.assign(element.style, styles),
}

class ColumnSizeCalculator {
	static CONFIG = {
		select: { min: 150, max: 200 },
		number: { min: 60, max: 90 },
		default: { min: 50, max: 200 },
		sign: { min: 50, max: 80 },
	}

	constructor(tableElement, headerCells, initialWidths) {
		this.tableElement = tableElement
		this.headerCells = headerCells
		this.initialWidths = initialWidths
	}

	calculateInitialWidths() {
		if (this.initialWidths && this.initialWidths.length > 0) {
			this.applyColumnWidths(this.initialWidths)
			this.tableElement.style.visibility = 'visible'
			return this.initialWidths
		}

		const visibleHeaders = this.headerCells.filter(
			header => !header.classList.contains('hidden')
		)

		let computedWidths = Array.from(
			this.tableElement.querySelector('colgroup').children
		).map((col, index) => this.calculateColumnWidth(col, index, visibleHeaders))

		const container = this.tableElement.parentElement
		const tableWidth = container.clientWidth - 1
		const visibleColumnsCount = visibleHeaders.length

		if (tableWidth <= 560 && visibleColumnsCount <= 4) {
			this.handleSmallContainer(computedWidths, tableWidth, visibleHeaders)
		}

		this.applyColumnWidths(computedWidths)
		requestAnimationFrame(() => {
			this.tableElement.style.visibility = 'visible'
		})

		return computedWidths
	}

	handleSmallContainer(computedWidths, containerWidth, visibleHeaders) {
		const fixedColumns = visibleHeaders.filter(header => {
			const type = header.getAttribute('data-column-type') || 'default'
			return type === 'fixed' || type === 'checkbox' || type === 'icon'
		})

		const flexibleColumns = visibleHeaders.filter(
			header => !fixedColumns.includes(header)
		)

		const totalFlexWidth = flexibleColumns.reduce((sum, header) => {
			const index = this.headerCells.indexOf(header)
			return sum + computedWidths[index]
		}, 0)

		const totalFixedWidth = fixedColumns.reduce((sum, header) => {
			const index = this.headerCells.indexOf(header)
			return sum + computedWidths[index]
		}, 0)

		const remainingWidth = containerWidth - totalFixedWidth
		const scaleFactor = remainingWidth / totalFlexWidth

		flexibleColumns.forEach(header => {
			const index = this.headerCells.indexOf(header)
			const type = header.getAttribute('data-column-type') || 'default'
			const { min, max } =
				ColumnSizeCalculator.CONFIG[type] || ColumnSizeCalculator.CONFIG.default

			let newWidth = computedWidths[index] * scaleFactor
			newWidth = Math.max(min, Math.min(newWidth, max))
			computedWidths[index] = newWidth
		})

		const currentTotal = computedWidths.reduce((a, b) => a + b, 0)
		const widthDiff = containerWidth - currentTotal

		if (widthDiff !== 0) {
			const lastFlexIndex = this.headerCells.indexOf(
				flexibleColumns[flexibleColumns.length - 1]
			)
			computedWidths[lastFlexIndex] += widthDiff
		}
	}

	applyColumnWidths(widths) {
		widths.forEach((width, index) => {
			if (width > 0) {
				const cells = this.tableElement.querySelectorAll(
					`td:nth-child(${index + 1})`
				)
				cells.forEach(cell => {
					cell.style.maxWidth = `${width}px`
				})
				if (this.headerCells[index]) {
					this.headerCells[index].style.maxWidth = `${width}px`
				}
			}
		})
	}

	calculateColumnWidth(col, index, visibleHeaders) {
		const header = this.headerCells[index]
		if (!header || header.classList.contains('hidden')) return 0

		let type = header.getAttribute('data-column-type') || 'default'

		if (
			type === 'select' &&
			header.classList.contains('table__cell-header-sign')
		) {
			type = 'sign'
		}

		const { min, max } =
			ColumnSizeCalculator.CONFIG[type] || ColumnSizeCalculator.CONFIG.default

		let defaultWidth = col.offsetWidth * 2
		if (visibleHeaders.length === 1) {
			defaultWidth = this.calculateMobileWidth()
		}

		return Math.min(Math.max(defaultWidth, min), max)
	}

	calculateMobileWidth() {
		const container = this.tableElement.parentElement
		const scrollbarWidth = container.offsetWidth - container.clientWidth
		return container.offsetWidth - scrollbarWidth - 3
	}
}

class ResizeHandler {
	constructor(tableInstance) {
		this.table = tableInstance
		this.isResizing = false
		this.resizeLineElement = null
	}

	initializeResize(header) {
		const handle = header.querySelector('.table__resize-handle')
		if (!handle) return

		const handler = e => this.startResize(e, header)
		handle.addEventListener('mousedown', handler)
		handle.addEventListener('touchstart', e => {
			e.preventDefault()
			handler(e.touches[0])
		})
		this.table.resizeHandlers.set(handle, handler)
	}

	startResize(event, header) {
		this.isResizing = true
		this.resizedColumn =
			this.table.columnGroup.children[this.table.headerCells.indexOf(header)]
		this.initialX = event.touches ? event.touches[0].clientX : event.clientX
		this.initialWidth = this.resizedColumn.offsetWidth

		document.body.classList.add('resize-active')

		this.createResizeLine()
		this.setupResizeListeners()
	}

	createResizeLine() {
		this.resizeLineElement = DOM_HELPER.createElement(
			'div',
			'table__resize-line'
		)

		const tableRect = this.table.tableElement.getBoundingClientRect()
		const columnRect = this.resizedColumn.getBoundingClientRect()
		const initialLeft = columnRect.right - tableRect.left

		DOM_HELPER.applyStyles(this.resizeLineElement, {
			display: 'block',
			left: `${initialLeft}px`,
			height: `${tableRect.height}px`,
		})

		this.table.tableElement.parentElement.appendChild(this.resizeLineElement)
	}

	setupResizeListeners() {
		const moveHandler = e => {
			e.preventDefault()
			this.handleResizeMove(e)
		}
		const endHandler = () => this.finalizeResize()

		document.addEventListener('mousemove', moveHandler)
		document.addEventListener('mouseup', endHandler)

		document.addEventListener('touchmove', moveHandler, { passive: false })
		document.addEventListener('touchend', endHandler)

		this.moveHandler = moveHandler
		this.endHandler = endHandler
	}

	handleResizeMove(event) {
		if (!this.isResizing) return

		cancelAnimationFrame(this.animationFrame)
		this.animationFrame = requestAnimationFrame(() => {
			const clientX = event.touches ? event.touches[0].clientX : event.clientX
			this.updateResizeLine(clientX)
			this.calculateNewWidth(clientX)
		})
	}

	updateResizeLine(clientX) {
		const tableRect = this.table.tableElement.getBoundingClientRect()
		DOM_HELPER.applyStyles(this.resizeLineElement, {
			left: `${clientX - tableRect.left}px`,
			height: `${tableRect.height}px`,
		})
	}

	calculateNewWidth(clientX) {
		const deltaX = clientX - this.initialX
		this.newWidth = Math.max(
			this.initialWidth + deltaX,
			this.table.minColumnWidth
		)
	}

	finalizeResize() {
		if (!this.isResizing) return

		DOM_HELPER.removeElement(this.resizeLineElement)
		this.applyFinalWidth()
		this.cleanupResize()
	}

	applyFinalWidth() {
		const columnIndex = Array.from(this.table.columnGroup.children).indexOf(
			this.resizedColumn
		)

		DOM_HELPER.applyStyles(this.resizedColumn, {
			width: `${this.newWidth}px`,
			minWidth: `${this.newWidth}px`,
			maxWidth: `${this.newWidth}px`,
		})

		const headerCell = this.table.headerCells[columnIndex]
		if (headerCell) {
			DOM_HELPER.applyStyles(headerCell, {
				maxWidth: `${this.newWidth}px`,
			})
		}

		const cells = this.table.tableElement.querySelectorAll(
			`td:nth-child(${columnIndex + 1})`
		)
		cells.forEach(cell => {
			DOM_HELPER.applyStyles(cell, {
				maxWidth: `${this.newWidth}px`,
			})
		})

		this.table.columnWidths[columnIndex] = this.newWidth
		this.table.updateTableWidth()
	}

	cleanupResize() {
		this.isResizing = false
		this.resizedColumn = null

		document.body.classList.remove('resize-active')

		document.removeEventListener('mousemove', this.moveHandler)
		document.removeEventListener('touchmove', this.moveHandler)
		document.removeEventListener('mouseup', this.endHandler)
		document.removeEventListener('touchend', this.endHandler)

		this.moveHandler = null
		this.endHandler = null
	}
}

class DropdownManager {
	constructor(tableInstance) {
		this.table = tableInstance
		this.currentDropdown = null
		this.currentToggleButton = null
		this.documentClickHandler = this.handleDocumentClick.bind(this)
	}

	async showDropdown(toggleButton) {
		try {
			if (this.currentDropdown && this.currentToggleButton !== toggleButton) {
				this.removeDropdown()
			}

			if (this.currentToggleButton === toggleButton) {
				this.removeDropdown()
				return
			}

			const dropdownContent = await this.fetchDropdownContent()
			const dropdownElement = this.createDropdown(toggleButton, dropdownContent)
			this.setupDropdownInteraction(dropdownElement, toggleButton)

			document.addEventListener('click', this.documentClickHandler)
		} catch (error) {
			console.error('Dropdown error:', error)
		}
	}

	handleDocumentClick(event) {
		if (
			this.currentDropdown &&
			!this.currentDropdown.contains(event.target) &&
			!this.currentToggleButton.contains(event.target)
		) {
			this.removeDropdown()
		}
	}

	async fetchDropdownContent() {
		if (!this.constructor.dropdownContentCache) {
			const response = await fetch('/components/table-dropdown/', {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			this.constructor.dropdownContentCache = await response.text()
		}
		return new DOMParser().parseFromString(
			this.constructor.dropdownContentCache,
			'text/html'
		).body.firstElementChild
	}

	createDropdown(toggleButton, template) {
		const dropdown = template.cloneNode(true)
		this.positionDropdown(toggleButton, dropdown)
		document.body.appendChild(dropdown)
		return dropdown
	}

	positionDropdown(toggleButton, dropdown) {
		const rect = toggleButton.getBoundingClientRect()
		DOM_HELPER.applyStyles(dropdown, {
			left: `${rect.left}px`,
			top: `${rect.bottom}px`,
		})
	}

	setupDropdownInteraction(dropdownElement, toggleButton) {
		this.currentDropdown = dropdownElement
		this.currentToggleButton = toggleButton
		DOM_HELPER.toggleElementClass(toggleButton, 'active', true)
		this.populateDropdownItems(dropdownElement)
	}

	populateDropdownItems(dropdownElement) {
		const template = dropdownElement.querySelector('.table__column-item')
		this.table.headerCells.forEach((header, index) => {
			const item = this.createDropdownItem(header, index, template)
			dropdownElement.appendChild(item)
		})
		DOM_HELPER.removeElement(template)
	}

	createDropdownItem(header, index, template) {
		const item = template.cloneNode(true)
		const checkbox = item.querySelector('input')
		const label = item.querySelector('label')

		const checkboxId = this.configureCheckbox(checkbox, header, index)

		label.setAttribute('for', checkboxId)
		this.configureLabel(label, header.textContent)
		this.addItemInteraction(item, index)

		return item
	}

	configureCheckbox(checkbox, header, index) {
		const checkboxId = `column-${index}`

		checkbox.id = checkboxId
		checkbox.checked = !header.classList.contains('hidden')
		checkbox.disabled = this.table.headerCells.length === 1

		return checkboxId
	}

	configureLabel(label, text) {
		const textSpan = DOM_HELPER.createElement('span', 'checkbox__text')
		textSpan.textContent = text.trim()
		label.appendChild(textSpan)
	}

	addItemInteraction(item, index) {
		const label = item.querySelector('label')

		label.addEventListener('click', e => {
			e.stopPropagation()

			this.table.toggleColumnVisibility(index)
		})
	}

	removeDropdown() {
		document.removeEventListener('click', this.documentClickHandler)

		DOM_HELPER.removeElement(this.currentDropdown)
		if (this.currentToggleButton) {
			DOM_HELPER.toggleElementClass(this.currentToggleButton, 'active', false)
		}
		this.currentDropdown = null
		this.currentToggleButton = null
	}
}

class ColumnVisibilityController {
	constructor(tableInstance) {
		this.table = tableInstance
	}

	toggleVisibility(index) {
		const columnChildren = Array.from(this.table.columnGroup.children)

		const elements = [
			columnChildren[index],
			this.table.headerCells[index],
			...this.table.tableElement.querySelectorAll(`td:nth-child(${index + 1})`),
		]

		elements.forEach(element =>
			DOM_HELPER.toggleElementClass(
				element,
				'hidden',
				!element.classList.contains('hidden')
			)
		)

		this.updateColumnState(index)
		this.table.syncFormColumnVisibility(index)
		this.table.updateLastColumnHighlight()
	}

	updateColumnState(index) {
		const isHidden =
			this.table.columnGroup.children[index].classList.contains('hidden')
		this.table.columnWidths[index] = isHidden
			? 0
			: this.table.columnGroup.children[index].offsetWidth
		this.table.updateTableWidth()
	}
}

class ResizableTable {
	constructor(tableElement, initialColumnWidths = []) {
		this.tableElement = tableElement
		this.minColumnWidth = 50
		this.columnWidths = Array.isArray(initialColumnWidths)
			? initialColumnWidths
			: []
		this.resizeHandlers = new Map()

		this.resizeHandler = new ResizeHandler(this)
		this.dropdownManager = new DropdownManager(this)
		this.visibilityController = new ColumnVisibilityController(this)

		this.initializeTable()
	}

	initializeTable() {
		this.validateTableElement()
		this.cacheTableElements()
		this.setupInitialLayout()
		this.addEventListeners()
	}

	validateTableElement() {
		if (!this.tableElement || !this.tableElement.querySelector('colgroup')) {
			throw new Error('Invalid table structure')
		}
	}

	cacheTableElements() {
		this.headerCells = Array.from(this.tableElement.querySelectorAll('th'))
		this.columnGroup = this.tableElement.querySelector('colgroup')

		if (!this.columnGroup) {
			throw new Error('colgroup element is missing in the table')
		}
	}

	setupInitialLayout() {
		const calculator = new ColumnSizeCalculator(
			this.tableElement,
			this.headerCells,
			this.columnWidths
		)
		this.columnWidths = calculator.calculateInitialWidths()
		this.applyColumnSizes()
	}

	applyColumnSizes() {
		Array.from(this.columnGroup.children).forEach((col, index) => {
			const width = this.columnWidths[index]
			DOM_HELPER.applyStyles(col, {
				width: `${width}px`,
				minWidth: `${width}px`,
				maxWidth: `${width}px`,
			})
		})
		this.updateTableWidth()
	}

	addEventListeners() {
		this.headerCells.forEach(header =>
			this.resizeHandler.initializeResize(header)
		)
		this.addToggleButtons()
	}

	addToggleButtons() {
		this.headerCells.forEach(header => {
			const button = DOM_HELPER.createElement('div', 'table__column-toggle')
			header.appendChild(button)
			button.addEventListener('click', e =>
				this.handleToggleButtonClick(e, button)
			)
		})
	}

	handleToggleButtonClick(event, button) {
		event.stopPropagation()
		this.dropdownManager.showDropdown(button)
	}

	toggleColumnVisibility(index) {
		this.visibilityController.toggleVisibility(index)
	}

	updateTableWidth() {
		const totalWidth = this.columnWidths.reduce((sum, width) => sum + width, 0)
		DOM_HELPER.applyStyles(this.tableElement, { width: `${totalWidth}px` })
	}

	syncFormColumnVisibility(index) {
		const formElement = this.tableElement.nextElementSibling
		if (formElement?.classList.contains('create-form')) {
			const display = this.columnGroup.children[index].classList.contains(
				'hidden'
			)
				? 'none'
				: 'block'
			DOM_HELPER.applyStyles(formElement.children[index], { display })
		}
	}

	updateLastColumnHighlight() {
		const visibleHeaders = this.headerCells.filter(
			h => !h.classList.contains('hidden')
		)

		this.headerCells.forEach(header =>
			DOM_HELPER.toggleElementClass(header, 'table__cell-last', false)
		)

		this.tableElement
			.querySelectorAll('td')
			.forEach(cell =>
				DOM_HELPER.toggleElementClass(cell, 'table__cell-last', false)
			)

		if (visibleHeaders.length > 0) {
			const lastHeader = visibleHeaders[visibleHeaders.length - 1]
			const lastIndex = this.headerCells.indexOf(lastHeader)

			DOM_HELPER.toggleElementClass(lastHeader, 'table__cell-last', true)

			this.tableElement
				.querySelectorAll(`td:nth-child(${lastIndex + 1})`)
				.forEach(cell =>
					DOM_HELPER.toggleElementClass(cell, 'table__cell-last', true)
				)
		}
	}

	async createForm(formId, rowId = null, targetRow = null) {
		const formBuilder = new FormBuilder(
			this.tableElement,
			this.columnWidths,
			this.headerCells
		)
		await formBuilder.buildForm(formId, rowId, targetRow)
	}

	destroy() {
		this.resizeHandlers.forEach((handler, element) => {
			element.removeEventListener('mousedown', handler)
			element.removeEventListener('touchstart', handler)
		})
		this.dropdownManager.removeDropdown()
		this.headerCells = null
		this.columnGroup = null
		this.tableElement = null
	}
}

export const TableManager = {
	tables: new Map(),
	tableFilters: new Map(),

	init() {
		this.destroyTables()
		document.querySelectorAll('.table').forEach(tableEl => {
			if (tableEl.id) {
				this.tables.set(tableEl.id, new ResizableTable(tableEl))
				this.formatCurrencyValues(tableEl.id)
			}
		})
		this.setInitialCellSelection()
		this.attachGlobalCellClickHandler()
	},

	attachGlobalCellClickHandler() {
		document.addEventListener('click', event => this.onTableCellClick(event))
	},

	onTableCellClick(event) {
		const cell = event.target.closest('.table__cell')
		if (!cell) return

		document.querySelectorAll('.table__cell--selected').forEach(el => {
			el.classList.remove('table__cell--selected')
		})

		const table = cell.closest('.table')
		if (table) {
			table.querySelectorAll('.table__row--selected').forEach(row => {
				row.classList.remove('table__row--selected')
			})
		}

		cell.classList.add('table__cell--selected')

		cell.parentElement.classList.add('table__row--selected')
	},

	setInitialCellSelection() {
		const alreadySelected = document.querySelector('.table__cell--selected')
		document.querySelectorAll('.table').forEach((table, index) => {
			if (!table.querySelector('.table__row--selected')) {
				const firstRow = table.querySelector('.table__row')
				if (firstRow) firstRow.classList.add('table__row--selected')
			}
			if (!alreadySelected && index === 0) {
				const firstRow = table.querySelector('.table__row')
				const firstCell = firstRow?.querySelector('.table__cell')
				if (firstCell) firstCell.classList.add('table__cell--selected')
			}
		})
	},

	setInitialSelectionForTable(tableId) {
		const table = document.getElementById(tableId)
		if (!table) return
		const firstRow = table.querySelector('.table__row')
		if (firstRow) firstRow.classList.add('table__row--selected')
	},

	destroyTables() {
		this.tables.forEach(table => table.destroy())
		this.tables.clear()
	},

	formatCurrencyValues(tableId) {
		const table = document.getElementById(tableId)
		if (!table) return

		const headers = Array.from(table.querySelectorAll('thead th'))
		const amountColumnIndexes = headers
			.map((header, index) => (header.dataset.name === 'amount' ? index : -1))
			.filter(index => index !== -1)

		if (amountColumnIndexes.length === 0) return

		amountColumnIndexes.forEach(colIndex => {
			const cells = table.querySelectorAll(
				`tbody td:nth-child(${colIndex + 1})`
			)
			cells.forEach(cell => {
				if (cell.classList.contains('table__cell--summary')) return

				const text = cell.textContent.trim()
				if (text && /^[\d\s,.-]+(\s?р\.)?$/.test(text)) {
					const numText = text.replace(/\s?р\.$/, '').trim()

					const number = parseFloat(
						numText.replace(/\s/g, '').replace(',', '.')
					)
					if (!isNaN(number)) {
						cell.textContent = this.formatNumber(
							number.toFixed(2).replace('.', ',')
						)
					}
				}
			})
		})
	},

	formatCurrencyValuesForRow(tableId, row) {
		const table = document.getElementById(tableId)
		if (!table || !row) return

		const headers = Array.from(table.querySelectorAll('thead th'))
		const amountColumnIndexes = headers
			.map((header, index) => (header.dataset.name === 'amount' ? index : -1))
			.filter(index => index !== -1)

		if (amountColumnIndexes.length === 0) return

		amountColumnIndexes.forEach(colIndex => {
			const cell = row.querySelector(`td:nth-child(${colIndex + 1})`)
			if (cell && !cell.classList.contains('table__cell--summary')) {
				const text = cell.textContent.trim()
				if (text && /^[\d\s,.-]+(\s?р\.)?$/.test(text)) {
					const numText = text.replace(/\s?р\.$/, '').trim()

					const number = parseFloat(
						numText.replace(/\s/g, '').replace(',', '.')
					)
					if (!isNaN(number)) {
						cell.textContent = this.formatNumber(
							number.toFixed(2).replace('.', ',')
						)
					}
				}
			}
		})
	},

	async refresh(url, tableId) {
		const table = document.getElementById(tableId)
		if (!table) {
			console.error(`Table with id "${tableId}" not found.`)
			return
		}

		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const html = await this.fetchTableHTML(url)
			this.replaceTableContent(html, tableId)
			this.reinitializeTable(tableId)
			this.setInitialCellSelection()
			this.attachGlobalCellClickHandler()
		} catch (error) {
			showError(error.message)
		} finally {
			loader.remove()
		}
	},

	reinitializeTable(tableId) {
		const table = document.getElementById(tableId)
		if (!table) return

		let columnWidths = []
		if (this.tables.has(tableId)) {
			const oldTable = this.tables.get(tableId)
			columnWidths = [...oldTable.columnWidths]
			oldTable.destroy()
		}

		const newTable = new ResizableTable(table, columnWidths)
		this.tables.set(tableId, newTable)
		this.formatCurrencyValues(tableId)
	},

	updateTable(htmlContent, tableId) {
		this.replaceTableContent(htmlContent, tableId)

		this.reinitializeTable(tableId)
		this.setInitialCellSelection()
		this.attachGlobalCellClickHandler()
	},

	applyColumnWidthsForRow(tableId, row) {
		const table = document.getElementById(tableId)
		if (!table) {
			console.error(`Table with id "${tableId}" not found.`)
			return
		}

		const columnGroup = table.querySelector('colgroup')
		if (!columnGroup) {
			console.error('Required colgroup element is missing!')
			return
		}

		Array.from(columnGroup.children).forEach((col, index) => {
			const width = col.style.width || `${col.offsetWidth}px`
			const cell = row.querySelector(`td:nth-child(${index + 1})`)
			if (cell) {
				cell.style.maxWidth = width
			}
		})
	},

	async fetchTableHTML(url) {
		const response = await fetch(url, {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`)
		return await response.text()
	},

	async addTableRow(data, tableId) {
		const table = document.getElementById(tableId)
		if (!table) return

		let tableBody = table.querySelector('tbody.table__body')
		if (!tableBody) {
			tableBody = document.createElement('tbody')
			tableBody.className = 'table__body'
			table.appendChild(tableBody)
		}

		if (data.html) {
			table.querySelectorAll('.table__row--selected').forEach(row => {
				row.classList.remove('table__row--selected')
			})
			table.querySelectorAll('.table__cell--selected').forEach(cell => {
				cell.classList.remove('table__cell--selected')
			})

			const summaryRow = tableBody.querySelector('.table__row--summary')
			let newRow

			if (summaryRow) {
				summaryRow.insertAdjacentHTML('beforebegin', data.html)
				newRow = summaryRow.previousElementSibling
			} else {
				tableBody.insertAdjacentHTML('beforeend', data.html)
				newRow = tableBody.lastElementChild
			}

			document.querySelectorAll('.table__cell--selected').forEach(cell => {
				cell.classList.remove('table__cell--selected')
			})

			newRow.classList.add('table__row--selected')
			newRow
				.querySelector('.table__cell')
				?.classList.add('table__cell--selected')

			this.formatCurrencyValuesForRow(tableId, newRow)
			this.applyColumnWidthsForRow(tableId, newRow)
			this.attachRowCellHandlers(newRow)

			return newRow
		}
	},

	updateTableRow(data, tableId) {
		const oldRow = this.getRowById(data.id, tableId)

		if (oldRow) {
			const rowIndex = Array.from(oldRow.parentNode.children).indexOf(oldRow)
			const parent = oldRow.parentNode

			oldRow.outerHTML = data.html

			const updatedRow = parent.children[rowIndex]

			if (updatedRow) {
				updatedRow.setAttribute('data-id', data.id)

				const table = document.getElementById(tableId)

				const allSelectedRows = table.querySelectorAll('.table__row--selected')
				allSelectedRows.forEach(row => {
					row.classList.remove('table__row--selected')
					const selectedCells = row.querySelectorAll('.table__cell--selected')
					selectedCells.forEach(cell =>
						cell.classList.remove('table__cell--selected')
					)
				})

				updatedRow.classList.add('table__row--selected')

				const firstCell = updatedRow.querySelector('.table__cell')
				if (firstCell) {
					firstCell.classList.add('table__cell--selected')
				}

				return updatedRow
			}
		}
	},

	async sendDeleteRequest(id, url, tableId) {
		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const response = await fetch(`${url}${id}/`, {
				method: 'DELETE',
				headers: {
					'X-CSRFToken': getCSRFToken(),
					'Content-Type': 'application/json',
				},
			})
			if (!response.ok)
				throw new Error(`HTTP error! status: ${response.status}`)

			const row = this.getRowById(id, tableId)

			if (row) {
				row.remove()
				const table = document.getElementById(tableId)
				if (table) {
					table
						.querySelectorAll('.table__row--selected, .table__cell--selected')
						.forEach(el => el.classList.remove('selected'))
					table
						.querySelector('.table__row')
						?.classList.add('table__row--selected')
					table
						.querySelector('.table__row .table__cell')
						?.classList.add('table__cell--selected')
				}

				showSuccess()
			}

			const data = await response.json()
			if (data) return data
		} catch (error) {
			console.error('Delete request failed:', error)
			showError(error.message)
		} finally {
			loader.remove()
		}
	},

	removeRow(id, tableId) {
		const row = this.getRowById(id, tableId)
		if (row) {
			row.classList.add('fade-out')
			setTimeout(() => {
				row.remove()
				this.setInitialSelectionForTable(tableId)
			}, 300)
		}
	},

	attachRowCellHandlers(row) {
		row.querySelectorAll('.table__cell').forEach(cell => {
			cell.addEventListener('click', this.onTableCellClick.bind(this))
		})
	},

	replaceTableContent(htmlContent, tableId) {
		const table = document.getElementById(tableId)
		const hiddenColumns = Array.from(table.querySelectorAll('col')).reduce(
			(acc, col, index) => {
				if (col.classList.contains('hidden')) acc.push(index)
				return acc
			},
			[]
		)

		const tableBody = document.querySelector(`#${tableId} .table__body`)
		if (tableBody) {
			tableBody.innerHTML = htmlContent
			const newTable = document.getElementById(tableId)
			hiddenColumns.forEach(index => {
				newTable
					.querySelector(`col:nth-child(${index + 1})`)
					?.classList.add('hidden')
				newTable
					.querySelector(`th:nth-child(${index + 1})`)
					?.classList.add('hidden')
				newTable.querySelectorAll(`tbody tr`).forEach(row => {
					row
						.querySelector(`td:nth-child(${index + 1})`)
						?.classList.add('hidden')
				})
			})
		} else {
			console.error(
				`Table body with id "${tableId}" not found in the provided HTML.`
			)
		}
	},

	replaceEntireTable(htmlContent, containerId, tableId) {
		const container = document.getElementById(containerId)

		if (!container) {
			console.error(`Container with id "${containerId}" not found.`)
			return
		}

		container.innerHTML = ''

		const tempDiv = document.createElement('div')
		tempDiv.innerHTML = htmlContent.trim()

		const newTableContainer = tempDiv.querySelector('.table-container')
		const newTable = tempDiv.querySelector('.table')
		if (!newTableContainer) {
			console.error('No table found in the provided HTML content.')
			container.innerHTML = htmlContent
			return
		}

		newTable.id = tableId
		container.appendChild(newTableContainer)

		this.reinitializeTable(tableId)
		this.setInitialCellSelection()
		this.attachGlobalCellClickHandler()

		return newTableContainer
	},

	getSelectedRowId(tableId) {
		const table = document.getElementById(tableId)
		if (!table) return
		const selectedRow = table.querySelector('.table__row--selected')
		if (!selectedRow) return
		const idCell = selectedRow.querySelector('td:first-child')
		return idCell?.textContent.trim()
	},

	getRowById(id, tableId) {
		const table = document.getElementById(tableId)

		if (!table) return null

		const rowByAttr = table.querySelector(`.table__row[data-id="${id}"]`)
		if (rowByAttr) {
			return rowByAttr
		}

		const rows = table.querySelectorAll('.table__row')
		return Array.from(rows).find(row => {
			const idCell = row.querySelector('td:first-child')
			return idCell?.textContent.trim() === id.toString()
		})
	},

	getSelectedRow(tableId) {
		const table = document.getElementById(tableId)
		if (!table) return null

		return table.querySelector('.table__row--selected')
	},

	async createForm(formId, tableId, rowId = null) {
		const table = document.getElementById(tableId)
		if (!table) return

		this.hideForm(formId, tableId)
		const resizableTable = this.tables.get(tableId)

		if (resizableTable) {
			let targetRow = rowId ? this.getRowById(rowId, tableId) : null
			await resizableTable.createForm(formId, rowId, targetRow)
			if (!rowId) {
				const formButtons =
					table.parentElement.querySelector('.create-form__buttons--bottom') ||
					table.parentElement.querySelector('.create-form')
				formButtons?.scrollIntoView({ behavior: 'smooth', block: 'end' })
			}
		}
	},

	hideForm(formId, tableId) {
		const table = document.getElementById(tableId)
		if (!table) return

		DOM_HELPER.removeElement(document.getElementById(formId))
	},

	async createColumnsForTable(tableId, columnConfigs, summaryOptions = null) {
		const table = document.getElementById(tableId)
		if (!table) {
			console.error(`Таблица с id "${tableId}" не найдена.`)
			return
		}

		const resizableTable = this.tables.get(tableId)
		if (!resizableTable) {
			console.error('ResizableTable instance not found.')
			return
		}

		const headerCells = Array.from(table.querySelectorAll('th'))
		const formColumnsContainer = document.createElement('tr')
		const newHeaderCells = []

		let validSummaryOptions = null
		if (summaryOptions) {
			if (Array.isArray(summaryOptions)) {
				validSummaryOptions = {
					columns: summaryOptions,
					className: null,
				}
			} else if (typeof summaryOptions === 'object') {
				validSummaryOptions = {
					columns: Array.isArray(summaryOptions.columns)
						? summaryOptions.columns
						: [],
					className: summaryOptions.className,
				}
			}

			if (validSummaryOptions && validSummaryOptions.columns.length > 0) {
				const columnNames = headerCells.map(header => header.dataset.name)
				validSummaryOptions.columns = validSummaryOptions.columns.filter(
					colName => columnNames.includes(colName)
				)
			}
		}

		for (let i = 0; i < headerCells.length; i++) {
			const th = headerCells[i]
			const colName = th.getAttribute('data-name')

			const td = document.createElement('td')
			td.className = 'table__cell-header table__filter-cell'

			const columnConfig = columnConfigs.find(config => config.name === colName)

			if (columnConfig) {
				const formBuilder = new FormBuilder(
					table,
					resizableTable.columnWidths,
					headerCells
				)

				const inputElement = await formBuilder.createColumnInput(th, i)

				if (columnConfig.url) {
					SelectHandler.setupSelects({
						url: columnConfig.url,
						select: inputElement,
					})
				}

				this.addFilterHandler(inputElement, table, i, validSummaryOptions)
				td.appendChild(inputElement)
			}

			formColumnsContainer.appendChild(td)
			newHeaderCells.push(td)
		}

		const thead = table.querySelector('thead')
		thead.appendChild(formColumnsContainer)

		this.applyMaxWidthToNewHeaders(newHeaderCells, resizableTable)
	},

	applyMaxWidthToNewHeaders(newHeaderCells, resizableTable) {
		newHeaderCells.forEach((headerCell, index) => {
			const width =
				resizableTable.columnWidths[index] || resizableTable.minColumnWidth
			headerCell.style.maxWidth = `${width}px`
		})
	},

	addFilterHandler(inputElement, table, columnIndex, summaryOptions = null) {
		const tableId = table.id
		const filters = this.getTableFilters(tableId)

		const updateSummary = () => {
			if (summaryOptions?.columns?.length > 0) {
				this.calculateTableSummary(tableId, summaryOptions.columns, {
					className: summaryOptions.className,
				})
			}
		}

		if (inputElement.classList.contains('select')) {
			const selectControl = inputElement.querySelector('.select__control')
			const dropdown = inputElement.querySelector('.select__dropdown')
			const clearButton = inputElement.querySelector('.select__clear')

			if (!selectControl || !dropdown || !clearButton) return

			selectControl.addEventListener('click', () => {
				const observer = new MutationObserver(() => {
					const dropdownOptions = dropdown.querySelectorAll('.select__option')

					dropdownOptions.forEach(option => {
						option.addEventListener('click', () => {
							const filterText = option.textContent.toLowerCase()
							filters.set(columnIndex, {
								type: 'select',
								value: filterText,
							})
							this.applyFilters(table, filters)
							updateSummary()
						})
					})

					observer.disconnect()
				})

				observer.observe(dropdown, { childList: true })
			})

			clearButton.addEventListener('click', () => {
				const selectInput = inputElement.querySelector('.select__input')
				const selectText = inputElement.querySelector('.select__text')

				selectInput.value = ''
				selectText.textContent = ''
				filters.delete(columnIndex)
				this.applyFilters(table, filters)
				updateSummary()
			})
		} else {
			const input = inputElement.querySelector('input')
			const clearButton = inputElement.querySelector('.clear-button')

			if (!input || !clearButton) return

			input.addEventListener('input', () => {
				const filterValue = input.value.toLowerCase()
				if (filterValue) {
					filters.set(columnIndex, {
						type: 'text',
						value: filterValue,
					})
				} else {
					filters.delete(columnIndex)
				}
				this.applyFilters(table, filters)
				updateSummary()
			})

			clearButton.addEventListener('click', () => {
				input.value = ''
				input.focus()
				filters.delete(columnIndex)
				this.applyFilters(table, filters)
				updateSummary()
			})
		}
	},

	getTableFilters(tableId) {
		if (!this.tableFilters.has(tableId)) {
			this.tableFilters.set(tableId, new Map())
		}
		return this.tableFilters.get(tableId)
	},

	applyFilters(table, filters) {
		const tbody = table.querySelector('tbody')

		Array.from(tbody.querySelectorAll('tr')).forEach(row => {
			if (row.classList.contains('table__row--summary')) return

			let shouldShow = true

			filters.forEach((filterValue, colIndex) => {
				const cell = row.querySelector(`td:nth-child(${colIndex + 1})`)
				if (!cell) return

				const cellText = cell.textContent.trim().toLowerCase()

				if (filterValue.type === 'select') {
					shouldShow = shouldShow && cellText === filterValue.value
				} else {
					shouldShow = shouldShow && cellText.includes(filterValue.value)
				}
			})

			row.style.display = shouldShow ? '' : 'none'
		})
	},

	destroyTables() {
		this.tables.forEach(table => table.destroy())
		this.tables.clear()
		this.tableFilters.clear()
	},

	calculateTableSummary(
		tableId,
		columnsToSum,
		options = { grouped: false, total: true, className: null }
	) {
		if (
			!columnsToSum ||
			!Array.isArray(columnsToSum) ||
			columnsToSum.length === 0
		) {
			console.warn(`No columns to sum specified for table "${tableId}"`)
			return
		}

		const table = document.getElementById(tableId)
		if (!table) return

		const tbody = table.querySelector('tbody')
		if (!tbody) return

		tbody.querySelectorAll('.table__row--summary').forEach(row => row.remove())

		const headers = Array.from(table.querySelectorAll('thead th'))
		const columnNames = headers.map(header => header.dataset.name)

		const groupRows = Array.from(tbody.querySelectorAll('.table__group-row'))

		if (options.grouped && groupRows.length > 0) {
			groupRows.forEach(groupRow => {
				let currentRow = groupRow.nextElementSibling
				const rows = []

				while (
					currentRow &&
					!currentRow.classList.contains('table__group-row')
				) {
					if (
						!currentRow.classList.contains('table__row--summary') &&
						currentRow.style.display !== 'none'
					) {
						rows.push(currentRow)
					}
					currentRow = currentRow.nextElementSibling
				}

				if (rows.length > 0) {
					const summaryData = this.calculateSums(
						rows,
						columnsToSum,
						columnNames
					)
					const summaryRow = this.createSummaryRow(
						headers,
						columnNames,
						summaryData,
						'text-blue'
					)
					const lastRow = rows[rows.length - 1]
					this.applyColumnWidthsForRow(tableId, summaryRow)

					tbody.insertBefore(summaryRow, lastRow.nextElementSibling)
				}
			})
		}

		if (!options.grouped || options.total) {
			const rows = Array.from(
				tbody.querySelectorAll(
					'tr:not(.table__row--summary):not(.table__group-row)'
				)
			).filter(row => row.style.display !== 'none')

			if (rows.length > 0) {
				const summaryData = this.calculateSums(rows, columnsToSum, columnNames)
				const summaryRow = this.createSummaryRow(
					headers,
					columnNames,
					summaryData,
					options.className
				)

				this.applyColumnWidthsForRow(tableId, summaryRow)

				tbody.appendChild(summaryRow)
			}
		}
	},

	calculateSums(rows, columnsToSum, columnNames) {
		const summaryData = {}

		columnsToSum.forEach(columnName => {
			const columnIndex = columnNames.indexOf(columnName)
			if (columnIndex === -1) return

			const sum = rows.reduce((acc, row) => {
				const cell = row.cells[columnIndex]
				if (cell) {
					const rawValue = cell.textContent.trim().replace(/[^\d,-]/g, '')
					const value = parseFloat(rawValue.replace(',', '.'))
					if (!isNaN(value)) {
						return acc + value
					}
				}
				return acc
			}, 0)

			summaryData[columnName] = sum.toFixed(2).replace('.', ',')
		})

		return summaryData
	},

	createSummaryRow(headers, columnNames, summaryData, className) {
		const row = document.createElement('tr')
		row.className = 'table__row table__row--summary'

		headers.forEach((_, colIndex) => {
			const cell = document.createElement('td')
			cell.className = 'table__cell'

			const columnName = columnNames[colIndex]
			if (summaryData[columnName] !== undefined) {
				cell.classList.add('table__cell--summary')

				const formattedValue = this.formatNumber(summaryData[columnName])
				cell.textContent = `${formattedValue} р.`

				if (className) {
					cell.classList.add(className)
				} else {
					const value = parseFloat(summaryData[columnName].replace(',', '.'))
					if (value >= 0) {
						cell.classList.add('text-green')
					} else {
						cell.classList.add('text-red')
					}
				}
			}

			row.appendChild(cell)
		})

		return row
	},

	addActionsColumn(tableId, ids, onEdit, onDelete) {
		const table = document.getElementById(tableId)
		if (!table) {
			console.error(`Table with id "${tableId}" not found.`)
			return
		}

		const tbody = table.querySelector('tbody')
		if (!tbody) {
			console.error(`Table body not found for table with id "${tableId}".`)
			return
		}

		const headers = table.querySelector('thead tr')
		if (!headers) {
			console.error(`Table header not found in table with id "${tableId}".`)
			return
		}

		const actionHeader = document.createElement('th')
		actionHeader.className = 'table__cell-header table__header--actions'
		headers.appendChild(actionHeader)

		const rows = Array.from(tbody.querySelectorAll('tr'))
		rows.forEach((row, index) => {
			if (row.classList.contains('table__row--summary')) {
				return
			}

			const id = ids[index]
			row.setAttribute('data-id', id)

			const actionCell = document.createElement('td')
			actionCell.className = 'table__cell table__cell--actions'

			const editButton = document.createElement('button')
			const editIcon = document.createElement('i')
			editIcon.className = 'fas fa-edit'
			editButton.appendChild(editIcon)
			editButton.className = 'table__header--action-edit'
			editButton.addEventListener('click', event => {
				event.stopPropagation()
				const id = ids[index]

				onEdit(id, row, tableId)
			})

			const deleteButton = document.createElement('button')
			const deleteIcon = document.createElement('i')
			deleteIcon.className = 'fas fa-times'
			deleteButton.appendChild(deleteIcon)
			deleteButton.className = 'table__header--action-delete'
			deleteButton.addEventListener('click', event => {
				event.stopPropagation()
				const id = ids[index]

				onDelete(id, row, tableId)
			})

			actionCell.appendChild(editButton)
			actionCell.appendChild(deleteButton)

			row.appendChild(actionCell)
		})
	},

	addActionsToRow(row, id, onEdit, onDelete) {
		if (row.classList.contains('table__row--summary')) {
			return
		}

		const actionCell = document.createElement('td')
		actionCell.className = 'table__cell table__cell--actions'

		const editButton = document.createElement('button')
		const editIcon = document.createElement('i')
		editIcon.className = 'fas fa-edit'
		editButton.appendChild(editIcon)
		editButton.className = 'table__header--action-edit'
		editButton.addEventListener('click', event => {
			event.stopPropagation()
			onEdit(id, row, row.closest('.table').id)
		})

		const deleteButton = document.createElement('button')
		const deleteIcon = document.createElement('i')
		deleteIcon.className = 'fas fa-times'
		deleteButton.appendChild(deleteIcon)
		deleteButton.className = 'table__header--action-delete'
		deleteButton.addEventListener('click', event => {
			event.stopPropagation()

			onDelete(id, row, row.closest('.table').id)
		})

		actionCell.appendChild(editButton)
		actionCell.appendChild(deleteButton)

		row.appendChild(actionCell)
	},

	formatNumber(num) {
		return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
	},
}
