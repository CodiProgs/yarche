import { Modal } from '/static/js/modal.js'
import SelectHandler from '/static/js/selectHandler.js'
import { TableManager } from '/static/js/table.js'
import {
	createLoader,
	getCSRFToken,
	showError,
	showSuccess,
} from '/static/js/ui-utils.js'

export class DynamicFormHandler {
	constructor(config) {
		this.config = {
			submitUrl: '',
			formId: '',
			queryParams: {},
			...config,
		}
		this.currentEditId = null
		this.modal = null
	}

	async init(editId = null) {
		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			this.currentEditId = editId ?? null
			await this.initializeForm()

			const modalContent = await this.fetchModalContent()

			if (modalContent) await this.openModal(modalContent)

			if (Array.isArray(this.config.dataUrls)) {
				for (const {
					id,
					url,
					includeValuesInSearch = false,
					parentSelect,
					parentParam,
				} of this.config.dataUrls) {
					const select = document.getElementById(id)

					if (select) {
						const selectParent = select.closest('.select')

						// Функция для загрузки опций
						const loadSelectOptions = async selectUrl => {
							console.log(
								`[DynamicFormHandler] loadSelectOptions called with:`,
								selectUrl,
								{ selectParent },
							)
							if (Array.isArray(selectUrl)) {
								console.log(
									`[DynamicFormHandler] selectUrl is array, using data directly`,
								)
								SelectHandler.updateSelectOptions(selectParent, selectUrl)
							} else if (typeof selectUrl === 'string') {
								// Если это URL (строка), всегда делаем fetch
								console.log(
									`[DynamicFormHandler] selectUrl is string, fetching from:`,
									selectUrl,
								)
								try {
									const response = await fetch(selectUrl, {
										headers: { 'X-Requested-With': 'XMLHttpRequest' },
									})

									if (response.ok) {
										const data = await response.json()
										console.log(
											`[DynamicFormHandler] Received data from ${selectUrl}:`,
											data,
										)
										SelectHandler.updateSelectOptions(selectParent, data)
									} else {
										console.error(
											`[DynamicFormHandler] Failed to load from ${selectUrl}:`,
											response.status,
										)
										throw new Error(
											`Failed to load select data: ${response.status}`,
										)
									}
								} catch (err) {
									console.error(
										`[DynamicFormHandler] Error loading select data:`,
										err,
									)
									throw err
								}
							}
						}

						if (Array.isArray(url)) {
							await SelectHandler.setupSelects({
								data: url,
								select: selectParent,
								includeValuesInSearch,
							})
						} else {
							const initialUrl =
								parentSelect && parentParam
									? (() => {
											const parentField = document.getElementById(parentSelect)
											const parentValue = parentField?.value
											return parentValue
												? `${url}?${parentParam}=${parentValue}`
												: url
										})()
									: url

							const initialData =
								await SelectHandler.fetchSelectOptions(initialUrl)
							await SelectHandler.setupSelects({
								data: initialData,
								select: selectParent,
								includeValuesInSearch,
							})
						}

						// Если есть parentSelect, добавляем слушатель на событие change
						if (parentSelect && parentParam && !Array.isArray(url)) {
							const parentField = document.getElementById(parentSelect)
							if (parentField) {
								console.log(
									`[DynamicFormHandler] Adding change listener to field "${parentSelect}" for filtering "${id}"`,
									{ parentSelect, parentParam, url },
								)
								parentField.addEventListener('change', async event => {
									const parentValue = parentField.value
									console.log(
										`[DynamicFormHandler] Parent field "${parentSelect}" changed to:`,
										parentValue,
									)
									const newUrl = parentValue
										? `${url}?${parentParam}=${parentValue}`
										: url
									console.log(
										`[DynamicFormHandler] Loading options for "${id}" from URL:`,
										newUrl,
									)
									await loadSelectOptions(newUrl)
									console.log(`[DynamicFormHandler] Options loaded for "${id}"`)
								})
								console.log(
									`[DynamicFormHandler] Change listener added successfully`,
								)
							} else {
								console.warn(
									`[DynamicFormHandler] Parent field with id "${parentSelect}" not found`,
								)
							}
						}
					} else {
						console.warn(`Select with id "${id}" not found.`)
					}
				}
			}
			if (this.shouldLoadEditData()) await this.loadEditData()

			this.setupForm()
		} catch (error) {
			console.error('Initialization error:', error)
			showError('Form initialization failed. Please try again.')
		} finally {
			loader.remove()
		}
	}

	async initializeForm() {
		if (this.config.createFormFunction) {
			await this.config.createFormFunction(this.config.formId)
		}
	}

	async fetchModalContent() {
		if (!this.config.modalConfig?.url) return null

		const url = new URL(this.config.modalConfig.url, window.location.origin)

		if (this.config.modalConfig.context) {
			Object.keys(this.config.modalConfig.context).forEach(key => {
				url.searchParams.append(key, this.config.modalConfig.context[key])
			})
		}

		const response = await fetch(url, {
			method: 'GET',
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		return response.text()
	}

	async loadEditData() {
		try {
			const response = await fetch(
				`${this.config.getUrl}${this.currentEditId}/`,
				{ headers: { 'X-Requested-With': 'XMLHttpRequest' } },
			)

			if (!response.ok) throw new Error('Failed to load edit data')

			const { data, department_works } = await response.json()

			this.departmentWorks = department_works

			this.fillFormFields(data)
		} catch (error) {
			console.error('Data loading error:', error)
			showError(error.message || 'Failed to load required data')
		}
	}

	fillFormFields(data) {
		const form = document.getElementById(this.config.formId)

		if (!form) return

		for (const [fieldName, value] of Object.entries(data)) {
			const element = form.querySelector(`[name="${fieldName}"], #${fieldName}`)

			if (!element) continue

			const processedValue =
				fieldName === 'amount' ? Math.round(Math.abs(parseFloat(value))) : value
			this.setFieldValue(element, processedValue)

			element.dispatchEvent(new Event('change', { bubbles: true }))
		}
	}

	setFieldValue(element, value) {
		if (element.type === 'checkbox') {
			element.checked = Boolean(value)
		} else if (element.classList.contains('select__input')) {
			this.setSelectValue(element, value)
		} else {
			if (element.id === 'report_date' && value) {
				const dateParts = value.split('-')
				if (dateParts.length === 3) {
					value = `${dateParts[0]}-${dateParts[1]}`
				}
			}

			if (element.type === 'date' && value) {
				value = value.split('T')[0].split(' ')[0]
				if (/^\d{2}\.\d{2}\.\d{4}$/.test(value)) {
					const [day, month, year] = value.split('.')
					value = `${year}-${month}-${day}`
				}
				element.value = value
			} else {
				element.value = value ?? ''
			}

			if (element.type === 'hidden' || element.hasAttribute('hidden')) {
				element.setAttribute('value', value)
			}
		}
	}

	setSelectValue(selectInput, value) {
		const selectContainer = selectInput.closest('.select')
		const multiple = selectContainer?.dataset.multiple === 'true'

		if (multiple) {
			let values = Array.isArray(value)
				? value
				: String(value)
						.split(',')
						.map(v => v.trim())
						.filter(Boolean)
			const textElement = selectContainer.querySelector('.select__text')
			let selectedNames = []

			values.forEach(val => {
				const option = selectContainer.querySelector(
					`.select__option[data-value="${val}"]`,
				)
				if (option) {
					const checkbox = option.querySelector('.select__checkbox')
					if (checkbox) checkbox.innerHTML = '✔️'
					selectedNames.push(option.textContent)
				}
			})

			selectInput.value = values.join(',')
			if (textElement) {
				textElement.textContent = selectedNames.length
					? `Выбрано: ${selectedNames.length}`
					: selectInput.getAttribute('placeholder') || ''
				textElement.classList.toggle(
					'select__placeholder',
					selectedNames.length === 0,
				)
			}
			selectContainer.classList.toggle('has-value', selectedNames.length > 0)
		} else {
			const option = selectContainer?.querySelector(
				`.select__option[data-value="${value}"]`,
			)
			if (option) {
				const textElement = selectContainer.querySelector('.select__text')
				if (textElement) {
					textElement.textContent = option.textContent
					textElement.classList.remove('select__placeholder')
				}
				selectInput.value = value
			} else {
				if (
					selectInput.type === 'hidden' ||
					selectInput.hasAttribute('hidden')
				) {
					selectInput.setAttribute('value', value)
				}
			}
		}
	}

	async openModal(content) {
		this.modal = new Modal()
		await this.modal.open(content, this.config.modalConfig.title || 'Форма')
	}

	setupForm() {
		const form = document.getElementById(this.config.formId)
		if (form) {
			form.addEventListener('submit', this.handleSubmit.bind(this))
		}
	}

	async handleSubmit(e) {
		e.preventDefault()
		const form = e.target

		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const formData = new FormData(form)
			const csrfToken = this.getCSRFToken(form)

			let url = new URL(this.config.submitUrl, window.location.origin)
			if (this.currentEditId) {
				url.pathname += `${this.currentEditId}/`
			}
			if (this.config.queryParams) {
				Object.keys(this.config.queryParams).forEach(key => {
					url.searchParams.append(key, this.config.queryParams[key])
				})
			}

			let requestOptions = {
				method: 'POST',
				headers: {
					'X-CSRFToken': csrfToken,
				},
			}

			requestOptions.body = formData

			const response = await fetch(url.toString(), requestOptions)

			await this.handleFormResponse(response)
		} catch (error) {
			this.handleFormError(error)
		} finally {
			loader.remove()
		}
	}

	getCSRFToken(form) {
		return (
			form.querySelector('[name=csrfmiddlewaretoken]')?.value || getCSRFToken()
		)
	}

	async handleFormResponse(response) {
		if (!response.ok) {
			const error = await response.json()
			throw new Error(error.message || 'Form submission failed')
		}

		const result = await response.json()

		if (this.config.onSuccess) {
			this.config.onSuccess?.(result)
		}

		this.closeForm()
		showSuccess()
	}

	handleFormError(error) {
		console.error('Form error:', error)
		showError(error.message)
	}

	closeForm() {
		if (this.modal) {
			this.modal.close()
		} else {
			TableManager.hideForm(this.config.formId, this.config.tableId)
		}
	}

	shouldLoadEditData() {
		return this.currentEditId && this.config.getUrl
	}
}
