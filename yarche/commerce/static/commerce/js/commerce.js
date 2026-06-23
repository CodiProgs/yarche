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
const USERS = 'users'

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
					'tbody tr:not(.table__row--empty):not(.table__row--summary)',
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
	users: {
		containerId: `${USERS}-list-container`,
		tableId: `${USERS}-list-table`,
		formId: `${USERS}-form`,
		getUrl: `/${USERS}/`,
		addUrl: `/${USERS}/create/`,
		editUrl: `/${USERS}/update/`,
		deleteUrl: `/${USERS}/delete/`,
		modalConfig: {
			addModalUrl: `/components/users/add_user`,
			editModalUrl: `/components/users/add_user`,
			addModalTitle: 'Добавить пользователя',
			editModalTitle: 'Изменить пользователя',
		},
		dataUrls: [{ id: 'user_type', url: `/${USERS}/types/` }],
		editFunc: () => {
			const form = document.getElementById('users-form')
			if (!form) return

			const is_active = form.querySelector('#is_active')
			if (is_active) {
				const modalFormGroup = is_active.closest('.modal-form__group')
				if (modalFormGroup) {
					modalFormGroup.hidden = false
				}
			}
		},
	},
	user_types: {
		containerId: `user-types-container`,
		tableId: `user-types-table`,
		formId: `user-types-form`,
		getUrl: `/users/types/`,
		addUrl: `/users/types/create/`,
		editUrl: `/users/types/update/`,
		deleteUrl: `/users/types/delete/`,
		modalConfig: {
			addModalUrl: `/components/users/add_user_type`,
			editModalUrl: `/components/users/add_user_type`,
			addModalTitle: 'Добавить тип пользователя',
			editModalTitle: 'Изменить тип пользователя',
		},
		dataUrls: [{ id: 'permissions', url: `/users/permissions/` }],
	},
	order_work_statuses: {
		containerId: 'order-work-statuses-container',
		tableId: 'order-work-statuses-table',
		formId: 'order-work-statuses-form',
		getUrl: '/departments/work-status/',
		addUrl: '/departments/work-status/create/',
		editUrl: '/departments/work-status/update/',
		deleteUrl: '/departments/work-status/delete/',
		modalConfig: {
			addModalUrl: '/components/departments/add_work_status',
			editModalUrl: '/components/departments/add_work_status',
			addModalTitle: 'Добавить статус работы',
			editModalTitle: 'Редактировать статус работы',
		},
		dataUrls: [{ id: 'department', url: '/departments/list/' }],
	},
	filetypes: {
		containerId: 'filetypes-container',
		tableId: 'filetypes-table',
		formId: 'filetypes-form',
		getUrl: '/commerce/filetypes/',
		addUrl: '/commerce/filetypes/add/',
		editUrl: '/commerce/filetypes/edit/',
		deleteUrl: '/commerce/filetypes/delete/',
		modalConfig: {
			addModalUrl: '/components/commerce/add_filetype',
			editModalUrl: '/components/commerce/add_filetype',
			addModalTitle: 'Добавить тип файла',
			editModalTitle: 'Изменить тип файла',
		},
		dataUrls: [{ id: 'user_type', url: '/users/types/' }],
	},
	messages: {
		containerId: 'messages-container',
		tableId: 'messages-table',
		formId: 'message-form',
		getUrl: '/commerce/messages/',
		addUrl: '/commerce/messages/add/',
		editUrl: '/commerce/messages/edit/',
		deleteUrl: '/commerce/messages/delete/',
		modalConfig: {
			addModalUrl: '/components/departments/message',
			editModalUrl: '/components/departments/message',
			addModalTitle: 'Новое сообщение',
			editModalTitle: 'Редактировать сообщение',
		},
		dataUrls: [{ id: 'recipient', url: '/users/chat-recipients/' }],
	},
}

function addSwapButtonToModalHeader() {
	const modalHeader = document.querySelector('.modal__header')
	if (modalHeader) {
		const existingSwap = modalHeader.querySelector('.button--swap')
		if (existingSwap) return

		const swapButton = document.createElement('button')
		swapButton.className = 'button--swap'
		swapButton.innerHTML =
			'<img src="/static/images/swap.svg" alt="Swap" style="width: 14px; height: 14px;" />'
		swapButton.style.position = 'absolute'
		swapButton.style.right = '30px'
		swapButton.style.width = '30px'
		swapButton.style.height = '30px'
		swapButton.style.opacity = '0.5'

		swapButton.addEventListener('mouseover', () => {
			swapButton.style.opacity = '1.0'
		})
		swapButton.addEventListener('mouseout', () => {
			swapButton.style.opacity = '0.5'
		})

		swapButton.addEventListener('click', async () => {
			const documentsContainer = document.getElementById('documents-container')
			if (!documentsContainer) return
			const orderId = documentsContainer.dataset.orderId
			const currentView = documentsContainer.dataset.viewType
			const newView = currentView === 'table' ? 'cards' : 'table'
			documentsContainer.dataset.viewType = newView
			localStorage.setItem('orderFilesView', newView)
			await reloadOrderFiles(orderId, newView, documentsContainer)
		})

		modalHeader.appendChild(swapButton)
	}
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

const tableHtmlToTsv = html => {
	if (!html) return ''
	try {
		const doc = new DOMParser().parseFromString(html, 'text/html')
		const rows = Array.from(doc.querySelectorAll('table tr'))
		if (!rows.length) return ''
		return rows
			.map(row => {
				const cells = Array.from(row.querySelectorAll('th,td'))
				return cells
					.map(cell => (cell.textContent || '').replace(/\s+/g, ' ').trim())
					.join('\t')
			})
			.join('\n')
	} catch (e) {
		return ''
	}
}

const buildClipboardFile = clipboardData => {
	if (!clipboardData) return null

	const items = Array.from(clipboardData.items || [])
	const ts = new Date().toISOString().replace(/[:.]/g, '-')

	const imageItem = items.find(
		item => item.kind === 'file' && item.type && item.type.startsWith('image/'),
	)
	if (imageItem) {
		const blob = imageItem.getAsFile()
		if (blob) {
			const ext = (blob.type.split('/')[1] || 'png').replace(/[^a-z0-9]/gi, '')
			return new File([blob], `clipboard-image-${ts}.${ext}`, {
				type: blob.type || 'image/png',
			})
		}
	}

	const html = clipboardData.getData('text/html') || ''
	const plain = clipboardData.getData('text/plain') || ''

	if (html && /<table[\s>]/i.test(html)) {
		const tsv = tableHtmlToTsv(html) || plain || html
		return new File([tsv], `clipboard-table-${ts}.xlsx`, {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		})
	}

	if (plain && /\t/.test(plain)) {
		return new File([plain], `clipboard-table-${ts}.xlsx`, {
			type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
		})
	}

	if (plain) {
		return new File([plain], `clipboard-text-${ts}.doc`, {
			type: 'text/plain',
		})
	}

	if (html) {
		return new File([html], `clipboard-text-${ts}.doc`, {
			type: 'text/html',
		})
	}

	return null
}

const bindPasteUploadToModal = ({ modal, fileInput, canUpload }) => {
	if (!modal || !fileInput) return
	if (modal.dataset.pasteUploadBound === '1') return
	modal.dataset.pasteUploadBound = '1'

	modal.addEventListener('paste', e => {
		const target = e.target
		const tagName = target && target.tagName ? target.tagName.toLowerCase() : ''
		const isEditable =
			tagName === 'input' ||
			tagName === 'textarea' ||
			(target && target.isContentEditable)
		if (isEditable) return

		const file = buildClipboardFile(e.clipboardData)
		if (!file) return

		if (typeof canUpload === 'function' && !canUpload()) {
			showError('Загрузка файлов сейчас недоступна для выбранной вкладки')
			return
		}

		e.preventDefault()
		e.stopPropagation()

		const dt = new DataTransfer()
		dt.items.add(file)
		fileInput.files = dt.files
		fileInput.dispatchEvent(new Event('change', { bubbles: true }))
	})
}

const enforceMeasurementsTypeInUploadModal = async ({
	documentsContainer,
	modalInstance,
	modalFileTypeGroup,
	modalFileTypeInput,
}) => {
	const onlyMeasurements =
		documentsContainer && documentsContainer.dataset
			? documentsContainer.dataset.onlyMeasurements === '1'
			: false

	if (!onlyMeasurements) {
		return { ok: true, forcedFileTypeId: '' }
	}

	if (!modalFileTypeGroup || !modalFileTypeInput) {
		if (modalInstance && typeof modalInstance.close === 'function') {
			modalInstance.close()
		}
		showError('Вы не можете добавлять замеры')
		return { ok: false, forcedFileTypeId: '' }
	}

	modalFileTypeGroup.style.display = 'block'

	const modalSelect = modalFileTypeInput.closest('.select')
	if (!modalSelect) {
		if (modalInstance && typeof modalInstance.close === 'function') {
			modalInstance.close()
		}
		showError('Вы не можете добавлять замеры')
		return { ok: false, forcedFileTypeId: '' }
	}

	const types = await SelectHandler.fetchSelectOptions(
		`${BASE_URL}documents/types/`,
	)
	const measurementsType = Array.isArray(types)
		? types.find(
				t => (t && t.name ? t.name.trim().toLowerCase() : '') === 'замеры',
			)
		: null

	if (!measurementsType || !measurementsType.id) {
		if (modalInstance && typeof modalInstance.close === 'function') {
			modalInstance.close()
		}
		showError('Вы не можете добавлять замеры')
		return { ok: false, forcedFileTypeId: '' }
	}

	SelectHandler.updateSelectOptions(modalSelect, types)
	const forcedFileTypeId = String(measurementsType.id)
	modalFileTypeInput.value = forcedFileTypeId
	SelectHandler.restoreSelectValue(modalSelect, forcedFileTypeId)
	modalFileTypeInput.dispatchEvent(new Event('change', { bubbles: true }))

	const control = modalSelect.querySelector('.select__control')
	modalSelect.classList.add('select--locked')
	if (control) {
		control.style.pointerEvents = 'none'
		control.tabIndex = -1
		control.setAttribute('aria-disabled', 'true')
		control.title = 'Тип файла фиксирован: Замеры'
	}
	const clear = modalSelect.querySelector('.select__clear')
	if (clear) {
		clear.style.display = 'none'
	}
	modalSelect.classList.remove('active')

	return { ok: true, forcedFileTypeId }
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
 * Перезагружает содержимое файлов заказа в зависимости от viewType
 * @param {string} orderId - ID заказа
 * @param {string} viewType - 'table' или 'cards'
 * @param {HTMLElement} documentsContainer - контейнер для документов
 */
async function reloadOrderFiles(orderId, viewType, documentsContainer) {
	if (!documentsContainer) return

	addSwapButtonToModalHeader()
	const onlyMeasurements = documentsContainer.dataset.onlyMeasurements === '1'
	const docsTableUrl = `${BASE_URL}documents/table/${orderId}/${onlyMeasurements ? '?only_measurements=1' : ''}`
	const cardsUrl = `/commerce/order/${orderId}/files/cards/${onlyMeasurements ? '?only_measurements=1' : ''}`

	const orderFilesBtn = document.getElementById('order-files-btn')
	const measurementsFilesBtn = document.getElementById('measurements-files-btn')
	if (orderFilesBtn) {
		const isActive = !onlyMeasurements
		orderFilesBtn.setAttribute('aria-selected', isActive.toString())
		orderFilesBtn.classList.toggle('is-active', isActive)
	}
	if (measurementsFilesBtn) {
		const isActive = onlyMeasurements
		measurementsFilesBtn.setAttribute('aria-selected', isActive.toString())
		measurementsFilesBtn.classList.toggle('is-active', isActive)
	}

	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		if (viewType === 'table') {
			if (orderId) {
				const docsResp = await fetch(docsTableUrl, {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				const data = await docsResp.json()
				if (docsResp.ok) {
					documentsContainer.innerHTML = data.html || ''

					try {
						const urls = Array.isArray(data.urls) ? data.urls : []
						if (urls.length) {
							const table =
								documentsContainer.querySelector(
									`table#order-documents-${orderId}`,
								) || documentsContainer.querySelector('table')
							if (table) {
								const ths = Array.from(table.querySelectorAll('thead th'))
								const fileColIndex = ths.findIndex(
									th => th && th.dataset && th.dataset.name === 'file_display',
								)
								if (fileColIndex !== -1) {
									const rows = table.querySelectorAll(
										'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
							err,
						)
					}
					if (data && data.ids) {
						setIds(data.ids, data.table_id || `order-documents-${orderId}`)
					}
				} else {
					documentsContainer.innerHTML = data.html || ''
					showError(
						data.error || data.message || 'Ошибка загрузки документов заказа',
					)
				}
			} else {
				documentsContainer.innerHTML = '<div class="info">Не выбран заказ</div>'
			}
		} else {
			if (orderId) {
				const filesResp = await fetch(cardsUrl, {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				const data = await filesResp.json()
				if (filesResp.ok && data.status === 'success') {
					displayFiles(data.images, data.others, documentsContainer)
				} else {
					documentsContainer.innerHTML = data.html || ''
					showError(
						data.error || data.message || 'Ошибка загрузки файлов заказа',
					)
				}
			} else {
				documentsContainer.innerHTML = '<div class="info">Не выбран заказ</div>'
			}
		}
	} catch (err) {
		showError(err.message || 'Ошибка загрузки файлов заказа')
	} finally {
		loader.remove()
	}

	try {
		const uploadForm = document.getElementById('upload-form')
		const uploadBtn = document.getElementById('upload-btn')
		const fileInput = document.getElementById('upload-file-input')
		const fileTypeInput = document.getElementById('file_type')
		const canUploadNow = () =>
			updateUploadAvailabilityInOrderFilesModal(documentsContainer)
		canUploadNow()

		if (uploadBtn && fileInput) {
			uploadBtn.onclick = () => {
				if (!canUploadNow()) {
					showError('Загрузка файлов сейчас недоступна для выбранной вкладки')
					return
				}
				fileInput.click()
			}
		}

		const modal = document.querySelector('.modal')
		if (modal && documentsContainer) {
			bindPasteUploadToModal({
				modal,
				fileInput,
				canUpload: () => isUploadAllowedInOrderFilesModal(documentsContainer),
			})

			let dragCounter = 0

			modal.ondragover = e => {
				e.preventDefault()
				e.stopPropagation()
			}

			modal.ondragenter = e => {
				e.preventDefault()
				e.stopPropagation()
				if (!canUploadNow()) return
				dragCounter++
				if (dragCounter === 1) {
					const orderDocumentsDiv =
						document.querySelector('.order-documents') || documentsContainer
					orderDocumentsDiv.style.border = '2px dashed #ccc'
				}
			}

			modal.ondragleave = e => {
				e.preventDefault()
				e.stopPropagation()
				if (!canUploadNow()) {
					dragCounter = 0
					const orderDocumentsDiv =
						document.querySelector('.order-documents') || documentsContainer
					orderDocumentsDiv.style.border = ''
					return
				}
				dragCounter--
				if (dragCounter === 0) {
					const orderDocumentsDiv =
						document.querySelector('.order-documents') || documentsContainer
					orderDocumentsDiv.style.border = ''
				}
			}

			modal.ondrop = async e => {
				e.preventDefault()
				e.stopPropagation()
				dragCounter = 0
				const orderDocumentsDiv =
					document.querySelector('.order-documents') || documentsContainer
				orderDocumentsDiv.style.border = ''
				if (!canUploadNow()) {
					showError('Загрузка файлов сейчас недоступна для выбранной вкладки')
					return
				}

				const files = e.dataTransfer.files
				if (files.length > 0) {
					const f = files[0]

					if (!orderId) {
						showError('Не выбран заказ')
						return
					}
					const initialFileTypeVal = fileTypeInput ? fileTypeInput.value : ''

					const modalFileName = new Modal()
					const resp = await fetch('/components/commerce/file_name', {
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					})
					const html = await resp.text()
					await modalFileName.open(html, 'Введите название файла')

					const form = document.getElementById('file_name-form')
					const nameInput = form.querySelector('#name')
					const modalFileTypeGroup = form.querySelector('#file_type_group')
					const modalFileTypeInput = form.querySelector('#file_type')
					let forcedFileTypeId = ''
					const measurementsSetup = await enforceMeasurementsTypeInUploadModal({
						documentsContainer,
						modalInstance: modalFileName,
						modalFileTypeGroup,
						modalFileTypeInput,
					})
					if (!measurementsSetup.ok) {
						return
					}
					forcedFileTypeId = measurementsSetup.forcedFileTypeId
					if (!initialFileTypeVal && modalFileTypeGroup) {
						modalFileTypeGroup.style.display = 'block'
						const modalSelect = modalFileTypeInput
							? modalFileTypeInput.closest('.select')
							: null
						if (modalSelect && !forcedFileTypeId) {
							SelectHandler.setupSelects({
								select: modalSelect,
								url: `${BASE_URL}documents/types/`,
							})
						}
					}
					nameInput.value = f.name.replace(/\.[^/.]+$/, '')
					nameInput.focus()

					return new Promise(resolve => {
						form.onsubmit = async e => {
							e.preventDefault()
							let newName = nameInput.value.trim()
							if (!newName) {
								showError('Имя файла не может быть пустым')
								return
							}
							const ext = f.name.substring(f.name.lastIndexOf('.'))
							const finalName = newName + ext

							const l = createLoader()
							document.body.appendChild(l)
							uploadBtn.disabled = true

							try {
								const fileTypeVal = (
									forcedFileTypeId ||
									(fileTypeInput ? fileTypeInput.value : '') ||
									(modalFileTypeInput ? modalFileTypeInput.value : '')
								).trim()
								if (!fileTypeVal) {
									if (modalFileTypeGroup)
										modalFileTypeGroup.style.display = 'block'
									showError('Выберите тип файла')
									uploadBtn.disabled = false
									return
								}

								const fd = new FormData()
								const fileWithNewName = new File([f], finalName, {
									type: f.type,
								})
								fd.append('file', fileWithNewName)
								fd.append('order', orderId)
								fd.append('file_type', fileTypeVal)
								fd.append('filename', finalName)

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
										payload.message || payload.error || 'Ошибка загрузки файла',
									)
								} else {
									const tableId = `order-documents-${orderId}`
									const newRow = await TableManager.addTableRow(
										payload,
										tableId,
									)
									if (
										newRow &&
										payload &&
										(payload.id || payload.pk) &&
										!newRow.hasAttribute('data-id')
									) {
										newRow.setAttribute(
											'data-id',
											String(payload.id || payload.pk),
										)
									}

									showSuccess('Файл успешно загружен')

									try {
										const table = document.getElementById(tableId)
										if (table && payload.url) {
											const ths = Array.from(table.querySelectorAll('thead th'))
											const fileColIndex = ths.findIndex(
												th =>
													th &&
													th.dataset &&
													th.dataset.name === 'file_display',
											)
											if (fileColIndex !== -1) {
												const row = table.querySelector('tbody tr:last-child')
												if (row) {
													const cell = row.children[fileColIndex]
													if (cell) {
														const text = cell.textContent.trim()
														if (payload.url && text) {
															cell.innerHTML = `<a href="${payload.url}" target="_blank" rel="noopener noreferrer">${text}</a>`
														}
													}
												}
											}
										}
									} catch (e) {
										console.warn(
											'Не удалось применить ссылку к новой строке:',
											e,
										)
									}

									if (viewType === 'cards') {
										const filesResp = await fetch(
											`/commerce/order/${orderId}/files/cards/`,
											{
												headers: { 'X-Requested-With': 'XMLHttpRequest' },
											},
										)
										const data = await filesResp.json()
										if (filesResp.ok && data.status === 'success') {
											displayFiles(data.images, data.others, documentsContainer)
										}
									}
								}
								modalFileName.close()
							} catch (err) {
								showError(err.message || 'Ошибка загрузки файла')
							} finally {
								l.remove()
								uploadBtn.disabled = false
							}
						}
						form.querySelector('.button--cancel').onclick = () => {
							modalFileName.close()
						}
					})
				}
			}
		}

		if (fileInput) {
			fileInput.onchange = async () => {
				if (!canUploadNow()) {
					showError('Загрузка файлов сейчас недоступна для выбранной вкладки')
					try {
						fileInput.value = ''
					} catch (e) {}
					return
				}

				const f = fileInput.files && fileInput.files[0]
				if (!f) return

				if (!orderId) {
					showError('Не выбран заказ')
					fileInput.value = ''
					return
				}
				const initialFileTypeVal = fileTypeInput ? fileTypeInput.value : ''

				const modal = new Modal()
				const resp = await fetch('/components/commerce/file_name', {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				const html = await resp.text()
				await modal.open(html, 'Введите название файла')

				const form = document.getElementById('file_name-form')
				const nameInput = form.querySelector('#name')
				const modalFileTypeGroup = form.querySelector('#file_type_group')
				const modalFileTypeInput = form.querySelector('#file_type')
				let forcedFileTypeId = ''
				const measurementsSetup = await enforceMeasurementsTypeInUploadModal({
					documentsContainer,
					modalInstance: modal,
					modalFileTypeGroup,
					modalFileTypeInput,
				})
				if (!measurementsSetup.ok) {
					try {
						fileInput.value = ''
					} catch (e) {}
					return
				}
				forcedFileTypeId = measurementsSetup.forcedFileTypeId
				if (!initialFileTypeVal && modalFileTypeGroup) {
					modalFileTypeGroup.style.display = 'block'
					const modalSelect = modalFileTypeInput
						? modalFileTypeInput.closest('.select')
						: null
					if (modalSelect && !forcedFileTypeId) {
						SelectHandler.setupSelects({
							select: modalSelect,
							url: `${BASE_URL}documents/types/`,
						})
					}
				}
				nameInput.value = f.name.replace(/\.[^/.]+$/, '')
				nameInput.focus()

				return new Promise(resolve => {
					form.onsubmit = async e => {
						e.preventDefault()
						let newName = nameInput.value.trim()
						if (!newName) {
							showError('Имя файла не может быть пустым')
							return
						}
						const ext = f.name.substring(f.name.lastIndexOf('.'))
						const finalName = newName + ext

						const l = createLoader()
						document.body.appendChild(l)
						uploadBtn.disabled = true

						try {
							const fileTypeVal = (
								forcedFileTypeId ||
								(fileTypeInput ? fileTypeInput.value : '') ||
								(modalFileTypeInput ? modalFileTypeInput.value : '')
							).trim()
							if (!fileTypeVal) {
								if (modalFileTypeGroup)
									modalFileTypeGroup.style.display = 'block'
								showError('Выберите тип файла')
								uploadBtn.disabled = false
								return
							}

							const fd = new FormData()
							const fileWithNewName = new File([f], finalName, {
								type: f.type,
							})

							const commentInput = form.querySelector('#comment')
							const comment = commentInput.value

							fd.append('file', fileWithNewName)
							fd.append('order', orderId)
							fd.append('file_type', fileTypeVal)
							fd.append('filename', finalName)
							fd.append('comment', comment)

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
									payload.message || payload.error || 'Ошибка загрузки файла',
								)
							} else {
								const tableId = `order-documents-${orderId}`
								const newRow = await TableManager.addTableRow(payload, tableId)
								if (
									newRow &&
									payload &&
									(payload.id || payload.pk) &&
									!newRow.hasAttribute('data-id')
								) {
									newRow.setAttribute(
										'data-id',
										String(payload.id || payload.pk),
									)
								}
								showSuccess('Файл успешно загружен')

								try {
									const table = document.getElementById(tableId)
									if (table && payload.url) {
										const ths = Array.from(table.querySelectorAll('thead th'))
										const fileColIndex = ths.findIndex(
											th =>
												th && th.dataset && th.dataset.name === 'file_display',
										)
										if (fileColIndex !== -1) {
											const row = table.querySelector('tbody tr:last-child')
											if (row) {
												const cell = row.children[fileColIndex]
												if (cell) {
													const text = cell.textContent.trim()
													if (payload.url && text) {
														cell.innerHTML = `<a href="${payload.url}" target="_blank" rel="noopener noreferrer">${text}</a>`
													}
												}
											}
										}
									}
								} catch (e) {
									console.warn('Не удалось применить ссылку к новой строке:', e)
								}

								if (viewType === 'cards') {
									const filesResp = await fetch(cardsUrl, {
										headers: { 'X-Requested-With': 'XMLHttpRequest' },
									})
									const data = await filesResp.json()
									if (filesResp.ok && data.status === 'success') {
										displayFiles(data.images, data.others, documentsContainer)
									}
								}
							}
							modal.close()
						} catch (err) {
							showError(err.message || 'Ошибка загрузки файла')
						} finally {
							l.remove()
							uploadBtn.disabled = false
							try {
								fileInput.value = ''
							} catch (e) {}
						}
					}
					form.querySelector('.button--cancel').onclick = () => {
						modal.close()
						fileInput.value = ''
					}
				})
			}
		}
	} catch (e) {
		console.warn(
			'Ошибка инициализации загрузчика документов в модальном окне:',
			e,
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
		refreshButton.onclick = async () => {
			if (!orderId) return
			const loader2 = createLoader()
			document.body.appendChild(loader2)
			try {
				if (viewType === 'table') {
					const docsResp2 = await fetch(docsTableUrl, {
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					})
					const data = await docsResp2.json()
					if (docsResp2.ok) {
						documentsContainer.innerHTML = data.html || ''

						try {
							const urls = Array.isArray(data.urls) ? data.urls : []
							if (urls.length) {
								const table =
									documentsContainer.querySelector(
										`table#order-documents-${orderId}`,
									) || documentsContainer.querySelector('table')
								if (table) {
									const ths = Array.from(table.querySelectorAll('thead th'))
									const fileColIndex = ths.findIndex(
										th =>
											th && th.dataset && th.dataset.name === 'file_display',
									)

									if (fileColIndex !== -1) {
										const rows = table.querySelectorAll(
											'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
								err,
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
							console.warn(
								'Не удалось инициализировать таблицу документов после обновления:',
								e,
							)
						}
					} else {
						documentsContainer.innerHTML = data.html || ''
						showError(
							data.error || data.message || 'Ошибка загрузки документов заказа',
						)
					}
				} else {
					const filesResp = await fetch(cardsUrl, {
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					})
					const data = await filesResp.json()
					if (filesResp.ok && data.status === 'success') {
						displayFiles(data.images, data.others, documentsContainer)
					} else {
						documentsContainer.innerHTML = data.html || ''
						showError(
							data.error || data.message || 'Ошибка загрузки файлов заказа',
						)
					}
				}
			} catch (err) {
				showError(err.message || 'Ошибка загрузки файлов заказа')
			} finally {
				loader2.remove()
			}
		}
	}
}

/**
 * Универсальный обработчик для кнопки "Файлы заказа"
 * @param {HTMLElement} button - DOM элемент кнопки
 * @param {function(): (number|null)} [getOrderId] - функция для получения orderId (опционально)
 */
function setupOrderFilesButton(button, getOrderId) {
	if (!button) return
	button.addEventListener('click', async () => {
		const modal = new Modal()
		const resp = await fetch('/components/commerce/order_documents', {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		const html = await resp.text()
		await modal.open(html, 'Файлы заказа')
		hideUploadGroupInOrderFilesModal()

		addSwapButtonToModalHeader()

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
		if (typeof getOrderId === 'function') {
			orderId = getOrderId()
		} else {
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
		}

		const documentsContainer = document.getElementById('documents-container')
		if (!documentsContainer) return

		const viewType = localStorage.getItem('orderFilesView') || 'table'
		documentsContainer.dataset.orderId = orderId
		documentsContainer.dataset.viewType = viewType
		documentsContainer.dataset.onlyMeasurements = '0'

		await reloadOrderFiles(orderId, viewType, documentsContainer)
	})
}

/**
 * Экспериментальная функция для отображения файлов заказа: изображения как карточки, остальные как список.
 * @param {HTMLElement} button - DOM элемент кнопки
 * @param {function(): (number|null)} [getOrderId] - функция для получения orderId (опционально)
 */
function setupOrderFilesButton2(button, getOrderId) {
	if (!button) return
	button.addEventListener('click', async () => {
		const modal = new Modal()
		const resp = await fetch('/components/commerce/order_documents', {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		const html = await resp.text()
		await modal.open(html, 'Файлы заказа')
		hideUploadGroupInOrderFilesModal()

		addSwapButtonToModalHeader()

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
		if (typeof getOrderId === 'function') {
			orderId = getOrderId()
		} else {
			const selectedRow = document.querySelector('tr.table__row--selected')
			if (selectedRow) {
				const firstCell = selectedRow.querySelector('td:first-child')
				if (firstCell) {
					const v = firstCell.textContent.trim()
					orderId = Number.isNaN(Number(v)) ? null : parseInt(v, 10)
				}
			}
		}

		const documentsContainer = document.getElementById('documents-container')
		if (!documentsContainer) return

		const viewType = localStorage.getItem('orderFilesView') || 'cards'
		documentsContainer.dataset.orderId = orderId
		documentsContainer.dataset.viewType = viewType
		documentsContainer.dataset.onlyMeasurements = '0'
		await reloadOrderFiles(orderId, viewType, documentsContainer)
	})
}

function hideUploadGroupInOrderFilesModal() {
	const documentsContainer = document.getElementById('documents-container')
	return updateUploadAvailabilityInOrderFilesModal(documentsContainer)
}

function isUploadAllowedInOrderFilesModal(documentsContainer) {
	const pathSegments = window.location.pathname.split('/').filter(Boolean)
	const currentPage = pathSegments[pathSegments.length - 1] || ''
	const isOrdersWorksArchive = ['orders', 'works', 'archive'].includes(
		currentPage,
	)
	const onlyMeasurements =
		documentsContainer && documentsContainer.dataset
			? documentsContainer.dataset.onlyMeasurements === '1'
			: false

	return isOrdersWorksArchive ? onlyMeasurements : !onlyMeasurements
}

function updateUploadAvailabilityInOrderFilesModal(documentsContainer) {
	const canUpload = isUploadAllowedInOrderFilesModal(documentsContainer)

	const fileInput = document.getElementById('upload-file-input')
	if (fileInput) {
		fileInput.disabled = !canUpload
		if (!canUpload) {
			try {
				fileInput.value = ''
			} catch (e) {}
		}
	}

	const uploadBtn = document.getElementById('upload-btn')
	if (!uploadBtn) return canUpload

	const uploadGroup = uploadBtn.closest('.modal-form__group')
	if (uploadGroup) {
		uploadGroup.style.display = canUpload ? '' : 'none'
	}

	return canUpload
}

document.addEventListener('click', async e => {
	const orderFilesBtn = e.target.closest('#order-files-btn')
	const measurementsFilesBtn = e.target.closest('#measurements-files-btn')
	if (!orderFilesBtn && !measurementsFilesBtn) return

	const documentsContainer = document.getElementById('documents-container')
	if (!documentsContainer) return

	let orderId = documentsContainer.dataset.orderId
	if (!orderId) {
		const table = documentsContainer.querySelector(
			'table[id^="order-documents-"]',
		)
		if (table) {
			const match = table.id.match(/^order-documents-(\d+)/)
			if (match) orderId = match[1]
		}
	}

	if (!orderId) {
		showError('Не выбран заказ')
		return
	}

	documentsContainer.dataset.orderId = String(orderId)
	const currentView =
		documentsContainer.dataset.viewType ||
		localStorage.getItem('orderFilesView') ||
		'table'
	const nextOnlyMeasurements = measurementsFilesBtn ? '1' : '0'
	if (documentsContainer.dataset.onlyMeasurements === nextOnlyMeasurements) {
		return
	}
	documentsContainer.dataset.viewType = currentView
	documentsContainer.dataset.onlyMeasurements = nextOnlyMeasurements
	localStorage.setItem('orderFilesView', currentView)

	await reloadOrderFiles(orderId, currentView, documentsContainer)
})

function displayFiles(images, others, container) {
	if (!container) return

	container.innerHTML = ''

	if (images.length > 0) {
		const imagesRow = document.createElement('div')
		imagesRow.className = 'images-row'
		imagesRow.style.display = 'flex'
		imagesRow.style.flexWrap = 'wrap'
		imagesRow.style.gap = '30px 10px'

		images.forEach(img => {
			const card = document.createElement('div')
			card.className = 'image-card'
			card.style.border = '1px solid #ccc'
			card.style.textAlign = 'center'
			card.style.width = '100px'
			card.style.height = '100px'

			const imgElement = document.createElement('img')
			imgElement.src = img.url
			imgElement.alt = img.name
			imgElement.style.width = '100%'
			imgElement.style.height = '100%'
			imgElement.style.objectFit = 'contain'
			imgElement.style.cursor = 'pointer'

			imgElement.addEventListener('click', () => {
				window.open(img.url, '_blank')
			})

			const nameElement = document.createElement('p')
			nameElement.textContent = img.name
			nameElement.style.fontSize = '12px'
			nameElement.style.margin = '5px 0 0 0'
			nameElement.style.overflow = 'hidden'
			nameElement.style.textOverflow = 'ellipsis'
			nameElement.style.whiteSpace = 'nowrap'
			nameElement.title = img.name

			card.appendChild(imgElement)
			card.appendChild(nameElement)
			imagesRow.appendChild(card)
		})

		container.appendChild(imagesRow)
	}

	if (others.length > 0) {
		const othersList = document.createElement('ul')
		othersList.className = 'files-list'
		othersList.style.marginTop = '30px'

		others.forEach(file => {
			const li = document.createElement('li')
			const link = document.createElement('a')
			link.href = file.url
			link.textContent = file.name
			link.target = '_blank'
			link.style.textDecoration = 'none'
			link.style.color = 'var(--color-primary)'
			link.style.cursor = 'pointer'
			link.title = file.name

			link.addEventListener('mouseover', () => {
				link.style.textDecoration = 'underline'
			})
			link.addEventListener('mouseout', () => {
				link.style.textDecoration = 'none'
			})

			li.appendChild(link)
			othersList.appendChild(li)
		})

		container.appendChild(othersList)
	}

	if (images.length === 0 && others.length === 0) {
		container.innerHTML = '<div class="info">Нет файлов</div>'
	}
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
	if (!input) return null

	if (input.autoNumeric) input.autoNumeric.remove()

	const options = {
		alwaysAllowDecimalCharacter: decimalPlaces > 0,
		currencySymbol: CURRENCY_SUFFIX,
		currencySymbolPlacement: 's',
		decimalCharacter: ',',
		decimalCharacterAlternative: '.',
		decimalPlaces: decimalPlaces,
		decimalPlacesRawValue: decimalPlaces,
		digitGroupSeparator: ' ',
		emptyInputBehavior: 'null',
		minimumValue: '0',
		allowEmpty: true,
	}
	if (decimalPlaces > 0) {
		options.allowDecimalPadding = true
	}

	const anElement = new AutoNumeric(input, options)
	input.autoNumeric = anElement
	return anElement
}

const setIds = (ids, tableId) => {
	const tableRows = document.querySelectorAll(
		`#${tableId} tbody tr:not(.table__row--summary)`,
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

const getSelectedDocumentFileName = () => {
	const selectedRow =
		document.querySelector('tr.table__row--selected') ||
		document.querySelector('td.table__cell--selected')?.closest('tr')
	if (!selectedRow) {
		return { error: 'Выберите строку с документом' }
	}

	const table = selectedRow.closest('table')
	if (!table) {
		return { error: 'Не удалось определить таблицу' }
	}

	const headers = Array.from(table.querySelectorAll('thead th'))
	const fileColumnIndex = headers.findIndex(
		th => th && th.dataset && th.dataset.name === 'file_display',
	)
	if (fileColumnIndex === -1) {
		return { error: 'В таблице нет колонки file_display' }
	}

	const fileCell = selectedRow.children[fileColumnIndex]
	if (!fileCell) {
		return { error: 'Не удалось получить ячейку файла' }
	}

	const fileLink = fileCell.querySelector('a')
	const fileName = (
		fileLink ? fileLink.textContent : fileCell.textContent || ''
	).trim()
	if (!fileName) {
		return { error: 'Не удалось определить имя файла' }
	}

	return { fileName }
}

const printDocumentByFileName = async fileName => {
	if (!fileName) {
		showError('Не указано имя файла')
		return
	}

	const response = await fetch(
		`${BASE_URL}documents/by-name/?name=${encodeURIComponent(fileName)}`,
		{
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		},
	)
	const payload = await response.json().catch(() => ({}))

	if (!response.ok || payload.status !== 'success') {
		showError(payload.message || 'Не удалось получить документ')
		return
	}

	const fileUrl = payload?.data?.url || ''
	if (!fileUrl) {
		showError('У документа отсутствует ссылка на файл')
		return
	}

	let blobResponse = null
	try {
		blobResponse = await fetch(fileUrl, {
			credentials: 'same-origin',
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
	} catch (e) {
		showError('Не удалось загрузить файл для печати')
		return
	}

	if (!blobResponse || !blobResponse.ok) {
		showError('Не удалось загрузить файл для печати')
		return
	}

	let fileBlob = null
	try {
		fileBlob = await blobResponse.blob()
	} catch (e) {
		showError('Не удалось подготовить файл к печати')
		return
	}

	const blobUrl = URL.createObjectURL(fileBlob)

	const iframe = document.createElement('iframe')
	iframe.style.position = 'fixed'
	iframe.style.right = '0'
	iframe.style.bottom = '0'
	iframe.style.width = '1px'
	iframe.style.height = '1px'
	iframe.style.border = '0'
	iframe.style.opacity = '0'
	iframe.src = blobUrl

	iframe.onload = () => {
		try {
			iframe.contentWindow.focus()
			iframe.contentWindow.print()
		} catch (e) {
			showError('Не удалось запустить печать файла')
		}
		setTimeout(() => {
			try {
				URL.revokeObjectURL(blobUrl)
			} catch (e) {}
			try {
				iframe.remove()
			} catch (e) {}
		}, 2000)
	}

	document.body.appendChild(iframe)
}

const downloadDocumentByFileName = async fileName => {
	if (!fileName) {
		showError('Не указано имя файла')
		return
	}

	const response = await fetch(
		`${BASE_URL}documents/by-name/?name=${encodeURIComponent(fileName)}`,
		{
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		},
	)
	const payload = await response.json().catch(() => ({}))

	if (!response.ok || payload.status !== 'success') {
		showError(payload.message || 'Не удалось получить документ')
		return
	}

	const fileUrl = payload?.data?.url || ''
	const downloadName = (payload?.data?.name || fileName || '').trim()
	if (!fileUrl) {
		showError('У документа отсутствует ссылка на файл')
		return
	}

	let blobResponse = null
	try {
		blobResponse = await fetch(fileUrl, {
			credentials: 'same-origin',
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
	} catch (e) {
		showError('Не удалось загрузить файл для скачивания')
		return
	}

	if (!blobResponse || !blobResponse.ok) {
		showError('Не удалось загрузить файл для скачивания')
		return
	}

	let fileBlob = null
	try {
		fileBlob = await blobResponse.blob()
	} catch (e) {
		showError('Не удалось подготовить файл к скачиванию')
		return
	}

	const blobUrl = URL.createObjectURL(fileBlob)
	const link = document.createElement('a')
	link.href = blobUrl
	link.download = downloadName
	link.style.display = 'none'
	document.body.appendChild(link)
	link.click()
	setTimeout(() => {
		try {
			link.remove()
		} catch (e) {}
		try {
			URL.revokeObjectURL(blobUrl)
		} catch (e) {}
	}, 300)
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
	const printButton = document.getElementById('print-doc-button')
	const downloadButton = document.getElementById('download-doc-button')

	const renameOrderDocumentButton = document.getElementById(
		'rename-order-document-button',
	)
	const deleteOrderDocumentButton = document.getElementById(
		'delete-order-document-button',
	)
	const viewOrderPayments = document.getElementById(
		'view_order_payments-button',
	)
	const goToClientButton = document.getElementById('go-to-client-button')
	const assignExecutorButton = document.getElementById('assign_executor-button')
	const updateStatusButton = document.getElementById('update_status-button')
	const updateDepartmentWorkStatusButton = document.getElementById(
		'update_department_work_status-button',
	)
	const archiveOrderButton = document.getElementById('archive_order-button')
	const viewCorrespondenceButton = document.getElementById(
		'view_correspondence-button',
	)

	const addEmergencyButton = document.getElementById('add-emergency-button')
	const editEmergencyButton = document.getElementById('edit-emergency-button')
	const closeEmergencyButton = document.getElementById('close-emergency-button')

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
				'tbody tr:not(.table__row--summary):not(.table__row--empty)',
			)

			const pathname = window.location.pathname

			const regex = /^(?:\/[\w-]+)?\/([\w-]+)\/?$/
			const match = pathname.match(regex)

			const urlName = match ? match[1].replace(/-/g, '_') : null

			if (goToClientButton) {
				goToClientButton.style.display = 'none'
			}

			if (updateDepartmentWorkStatusButton) {
				updateDepartmentWorkStatusButton.style.display = 'none'
			}
			if (archiveOrderButton) {
				archiveOrderButton.style.display = 'none'
			}

			if (urlName === 'works') {
				const deptCard = e.target.closest(
					'.department-card:not(.department-card--add)',
				)
				if (deptCard) {
					e.preventDefault()

					document
						.querySelectorAll('.department-card--context-selected')
						.forEach(card => {
							card.classList.remove('department-card--context-selected')
						})
					deptCard.classList.add('department-card--context-selected')

					if (addButton) addButton.style.display = 'none'
					if (editButton) editButton.style.display = 'none'
					if (deleteButton) deleteButton.style.display = 'none'
					if (paymentButton) paymentButton.style.display = 'none'
					if (hideButton) hideButton.style.display = 'none'
					if (updateStatusButton) updateStatusButton.style.display = 'none'
					if (archiveOrderButton) archiveOrderButton.style.display = 'none'
					if (updateDepartmentWorkStatusButton) {
						updateDepartmentWorkStatusButton.style.display = 'block'
					}

					const viewOrderFilesBtn = document.getElementById(
						'view_order_files-button',
					)
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
					if (assignExecutorButton) assignExecutorButton.style.display = 'none'
					if (viewCorrespondenceButton) {
						viewCorrespondenceButton.style.display = 'none'
					}

					showMenu(e.pageX, e.pageY)
					return
				}
			}

			const table = e.target.closest('table')
			if (printButton) printButton.style.display = 'none'
			if (downloadButton) downloadButton.style.display = 'none'
			if (row && table) {
				e.preventDefault()

				if (goToClientButton) {
					goToClientButton.style.display = 'none'
				}

				if (addButton) {
					if (urlName === 'clients' && table.id === 'contacts-table') {
						if (addButton) addButton.style.display = 'none'
						if (deleteButton) deleteButton.style.display = 'none'
					} else {
						if (addButton) addButton.style.display = 'block'
						if (deleteButton) deleteButton.style.display = 'block'
					}

					if (table.id === 'transactions-bank-accounts-table') {
						addButton.style.display = 'none'
					} else {
						addButton.style.display = 'block'
					}

					if (urlName === 'works') {
						addButton.textContent = 'Новый расчет'
					}

					if (
						table.id &&
						(table.id.startsWith('order-viewers-') ||
							table.id.startsWith('order-documents-'))
					) {
						addButton.style.display = 'none'
					}
				}

				if (editButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						editButton.style.display = 'none'
					} else {
						editButton.style.display = 'block'
					}

					if (
						table.id.startsWith('order-viewers-') ||
						table.id.startsWith('order-documents-')
					) {
						editButton.style.display = 'none'
					}
				}

				if (deleteButton) {
					if (table.id === 'transactions-bank-accounts-table') {
						deleteButton.style.display = 'none'
					} else {
						deleteButton.style.display = 'block'
					}

					if (table.id.startsWith('order-viewers-')) {
						deleteButton.textContent = 'Убрать из списка'
					}

					if (table.id.startsWith('order-documents-')) {
						deleteButton.style.display = 'none'
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
							'td.table__cell--selected',
						)
						if (selectedCell) {
							const cellIndex = Array.from(
								selectedCell.parentNode.children,
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
				if (viewOrderPayments) {
					viewOrderPayments.style.display =
						table.id === 'orders-table' ? 'block' : 'none'
				}
				if (viewCorrespondenceButton) {
					viewCorrespondenceButton.style.display = 'block'
				}
				if (updateStatusButton) {
					updateStatusButton.style.display = 'block'
				}
				if (assignExecutorButton) {
					assignExecutorButton.style.display = 'block'
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

				const isPrintDownloadTable =
					table.id.startsWith('order-documents-') ||
					table.id === 'department_orders-table'
				if (printButton) {
					printButton.style.display = isPrintDownloadTable ? 'block' : 'none'
				}
				if (downloadButton) {
					downloadButton.style.display = isPrintDownloadTable ? 'block' : 'none'
				}

				const viewOrderFilesBtn = document.getElementById(
					'view_order_files-button',
				)
				const emergencyButton = document.getElementById('emergency-button')
				const updateStatusBtn = document.getElementById('update_status-button')
				const assignExecutorBtn = document.getElementById(
					'assign_executor-button',
				)
				const viewCorrespondenceBtn = document.getElementById(
					'view_correspondence-button',
				)
				const newMessageBtn = document.getElementById('new_message-button')
				const editMessageBtn = document.getElementById('edit_message-button')
				const deleteMessageBtn = document.getElementById(
					'delete_message-button',
				)
				const refreshMessagesBtn = document.getElementById(
					'refresh_messages-button',
				)
				const markMessageReadBtn = document.getElementById(
					'mark_message_read-button',
				)
				const viewOrderCorrespondenceBtn = document.getElementById(
					'view_order_correspondence-button',
				)

				if (
					table.id.startsWith('order-documents-') ||
					table.id.startsWith('order-work-messages-') ||
					table.id.startsWith('order-messages-')
				) {
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
					if (emergencyButton) emergencyButton.style.display = 'none'
					if (updateStatusBtn) updateStatusBtn.style.display = 'none'
					if (assignExecutorBtn) assignExecutorBtn.style.display = 'none'
					if (viewCorrespondenceBtn)
						viewCorrespondenceBtn.style.display = 'none'
					if (viewOrderCorrespondenceBtn)
						viewOrderCorrespondenceBtn.style.display = 'none'
				} else if (table.id === 'messages-table') {
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
					if (viewCorrespondenceBtn)
						viewCorrespondenceBtn.style.display = 'none'
				} else {
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'block'
					if (emergencyButton) emergencyButton.style.display = 'block'
					if (updateStatusBtn) updateStatusBtn.style.display = 'block'
					if (assignExecutorBtn) assignExecutorBtn.style.display = 'block'
					if (viewCorrespondenceBtn)
						viewCorrespondenceBtn.style.display = 'block'
				}

				if (
					table.id.startsWith('order-work-messages-') ||
					table.id.startsWith('order-messages-')
				) {
					if (newMessageBtn) newMessageBtn.style.display = 'block'
					if (editMessageBtn) editMessageBtn.style.display = 'block'
					if (deleteMessageBtn) deleteMessageBtn.style.display = 'block'
					if (refreshMessagesBtn) refreshMessagesBtn.style.display = 'block'
					if (addButton) addButton.style.display = 'none'
					if (editButton) editButton.style.display = 'none'
					if (deleteButton) deleteButton.style.display = 'none'
					if (markMessageReadBtn) markMessageReadBtn.style.display = 'none'
				} else if (table.id === 'messages-table') {
					const currentUserId = getChatCurrentUserId()
					const authorId = row.dataset.authorId
					const isRead = row.dataset.isRead === 'true'
					const orderId = row.dataset.orderId
					const recipientId = row.dataset.recipientId

					if (addButton) addButton.style.display = 'block'
					if (editButton) {
						editButton.style.display =
							authorId === String(currentUserId) && !isRead ? 'block' : 'none'
					}
					if (deleteButton) {
						deleteButton.style.display =
							authorId === String(currentUserId) && !isRead ? 'block' : 'none'
					}
					if (markMessageReadBtn) {
						markMessageReadBtn.style.display =
							recipientId === String(currentUserId) && !isRead
								? 'block'
								: 'none'
					}
					if (viewOrderCorrespondenceBtn) {
						viewOrderCorrespondenceBtn.style.display = orderId ? 'block' : 'none'
					}
					if (viewOrderFilesBtn) {
						viewOrderFilesBtn.style.display = orderId ? 'block' : 'none'
					}
					if (newMessageBtn) newMessageBtn.style.display = 'none'
					if (editMessageBtn) editMessageBtn.style.display = 'none'
					if (deleteMessageBtn) deleteMessageBtn.style.display = 'none'
					if (refreshMessagesBtn) refreshMessagesBtn.style.display = 'none'
				} else {
					if (newMessageBtn) newMessageBtn.style.display = 'none'
					if (editMessageBtn) editMessageBtn.style.display = 'none'
					if (deleteMessageBtn) deleteMessageBtn.style.display = 'none'
					if (refreshMessagesBtn) refreshMessagesBtn.style.display = 'none'
				}

				if (
					table.id.startsWith('product-orders-') ||
					table.id.startsWith('orders-no-object-')
				) {
					if (addButton) {
						addButton.style.display = 'block'
						addButton.textContent = 'Новый расчет'
					}

					if (editButton) {
						editButton.style.display = 'block'
						editButton.textContent = 'Редактировать расчет'
					}

					if (deleteButton) {
						deleteButton.style.display = 'block'
						deleteButton.textContent = 'Удалить расчет'
					}

					if (urlName === 'works' && archiveOrderButton) {
						archiveOrderButton.style.display = 'block'
					}
				}

				const addViewerButton = document.getElementById('add-viewer-button')
				if (addViewerButton && urlName === 'works') {
					addViewerButton.style.display = 'block'

					if (
						table.id &&
						(table.id.startsWith('order-viewers-') ||
							table.id.startsWith('order-documents-'))
					) {
						addViewerButton.style.display = 'none'
					}
				} else if (addViewerButton) {
					addViewerButton.style.display = 'none'
				}

				if (table.id && table.id.startsWith('order-documents-')) {
					if (renameOrderDocumentButton)
						renameOrderDocumentButton.style.display = 'block'
					if (deleteOrderDocumentButton)
						deleteOrderDocumentButton.style.display = 'block'
				} else {
					if (renameOrderDocumentButton)
						renameOrderDocumentButton.style.display = 'none'
					if (deleteOrderDocumentButton)
						deleteOrderDocumentButton.style.display = 'none'
				}

				if (table.id && table.id.startsWith('emergencies-')) {
					if (addEmergencyButton) addEmergencyButton.style.display = 'block'
					if (editEmergencyButton) editEmergencyButton.style.display = 'block'
					if (closeEmergencyButton) closeEmergencyButton.style.display = 'block'

					if (assignExecutorButton) assignExecutorButton.style.display = 'none'
					if (updateStatusButton) updateStatusButton.style.display = 'none'
					if (viewCorrespondenceButton)
						viewCorrespondenceButton.style.display = 'none'
					if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
					if (emergencyButton) emergencyButton.style.display = 'none'
				} else {
					if (addEmergencyButton) addEmergencyButton.style.display = 'none'
					if (editEmergencyButton) editEmergencyButton.style.display = 'none'
					if (closeEmergencyButton) closeEmergencyButton.style.display = 'none'
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
				if (renameOrderDocumentButton)
					renameOrderDocumentButton.style.display = 'none'
				if (deleteOrderDocumentButton)
					deleteOrderDocumentButton.style.display = 'none'

				if (editContactButton) editContactButton.style.display = 'none'
				if (deleteContactButton) deleteContactButton.style.display = 'none'

				if (refreshButton) refreshButton.style.display = 'none'
				if (printButton) printButton.style.display = 'none'
				if (downloadButton) downloadButton.style.display = 'none'
				if (addEmergencyButton) addEmergencyButton.style.display = 'none'
				if (editEmergencyButton) editEmergencyButton.style.display = 'none'
				if (closeEmergencyButton) closeEmergencyButton.style.display = 'none'
				if (goToClientButton) goToClientButton.style.display = 'none'

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
								if (goToClientButton) goToClientButton.style.display = 'block'
							} else if (row.dataset.target.startsWith('object-')) {
								addButton.style.display = 'none'

								editButton.style.display = 'block'
								editButton.textContent = 'Редактировать объект'

								deleteButton.style.display = 'block'
								deleteButton.textContent = 'Удалить объект'
								if (goToClientButton) goToClientButton.style.display = 'none'
							} else if (row.dataset.target.startsWith('product-')) {
								addButton.style.display = 'block'
								addButton.textContent = 'Новый расчет'
								if (goToClientButton) goToClientButton.style.display = 'none'
							}
						} else {
							addButton.style.display = 'none'
							editButton.style.display = 'none'
							deleteButton.style.display = 'none'
							if (goToClientButton) goToClientButton.style.display = 'none'
						}
					} else {
						addButton.style.display = 'none'
						editButton.style.display = 'none'
						deleteButton.style.display = 'none'
						if (goToClientButton) goToClientButton.style.display = 'none'
					}
				}

				const viewOrderFilesBtn = document.getElementById(
					'view_order_files-button',
				)
				const emergencyButton = document.getElementById('emergency-button')
				const updateStatusBtn = document.getElementById('update_status-button')
				const assignExecutorBtn = document.getElementById(
					'assign_executor-button',
				)
				const viewCorrespondenceBtn = document.getElementById(
					'view_correspondence-button',
				)
				const viewOrderPayments = document.getElementById(
					'view_order_payments-button',
				)
				const viewCorrespondenceButton = document.getElementById(
					'view_correspondence-button',
				)
				const updateStatusButton = document.getElementById(
					'update_status-button',
				)
				const assignExecutorButton = document.getElementById(
					'assign_executor-button',
				)

				if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
				if (emergencyButton) emergencyButton.style.display = 'none'
				if (viewOrderPayments) {
					viewOrderPayments.style.display = 'none'
				}
				if (viewCorrespondenceButton) {
					viewCorrespondenceButton.style.display = 'none'
				}
				if (updateStatusButton) {
					updateStatusButton.style.display = 'none'
				}
				if (assignExecutorButton) {
					assignExecutorButton.style.display = 'none'
				}
				if (updateStatusBtn) updateStatusBtn.style.display = 'none'
				if (assignExecutorBtn) assignExecutorBtn.style.display = 'none'
				if (viewCorrespondenceBtn) viewCorrespondenceBtn.style.display = 'none'

				const newMessageBtn = document.getElementById('new_message-button')
				const editMessageBtn = document.getElementById('edit_message-button')
				const deleteMessageBtn = document.getElementById(
					'delete_message-button',
				)
				const refreshMessagesBtn = document.getElementById(
					'refresh_messages-button',
				)
				if (newMessageBtn) newMessageBtn.style.display = 'none'
				if (editMessageBtn) editMessageBtn.style.display = 'none'
				if (deleteMessageBtn) deleteMessageBtn.style.display = 'none'
				if (refreshMessagesBtn) refreshMessagesBtn.style.display = 'none'

				const markMessageReadBtn = document.getElementById(
					'mark_message_read-button',
				)
				const viewOrderCorrespondenceBtn = document.getElementById(
					'view_order_correspondence-button',
				)
				if (markMessageReadBtn) markMessageReadBtn.style.display = 'none'
				if (viewOrderCorrespondenceBtn)
					viewOrderCorrespondenceBtn.style.display = 'none'

				if (urlName === 'messages' && hideButton) {
					hideButton.style.display = 'block'
				}

				const addViewerButton = document.getElementById('add-viewer-button')
				if (addViewerButton) addViewerButton.style.display = 'none'

				showMenu(e.pageX, e.pageY)
			}

			const tbody = table ? table.querySelector('tbody') : null

			if (urlName === 'enterprise_balance_report') {
				if (tbody) {
					e.preventDefault()
					addButton.style.display = 'block'
					showMenu(e.pageX, e.pageY)
					return
				} else {
					e.preventDefault()
					addButton.style.display = 'none'
					showMenu(e.pageX, e.pageY)
				}
			}

			const item = e.target.closest('.debtors-office-list__row-item')
			if (item) {
				const h4 = item.querySelector('h4')
				const settleDebtButton = document.getElementById('settle-debt-button')
				if (
					h4 &&
					['Оборудование', 'Кредит', 'Краткосрочные обязательства'].includes(
						h4.textContent.trim(),
					)
				) {
					if (settleDebtButton) {
						settleDebtButton.style.display = 'block'
						settleDebtButton.textContent = 'Изменить сумму'
						settleDebtButton.dataset.type = h4.textContent.trim()
					}
				}
			}

			if (e.target.closest('.correspondence-container')) {
				e.preventDefault()

				const newMessageBtn = document.getElementById('new_message-button')
				const editMessageBtn = document.getElementById('edit_message-button')
				const deleteMessageBtn = document.getElementById(
					'delete_message-button',
				)
				const refreshMessagesBtn = document.getElementById(
					'refresh_messages-button',
				)
				if (newMessageBtn) newMessageBtn.style.display = 'block'
				if (editMessageBtn) editMessageBtn.style.display = 'block'
				if (deleteMessageBtn) deleteMessageBtn.style.display = 'block'
				if (refreshMessagesBtn) refreshMessagesBtn.style.display = 'block'

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
				if (printButton) printButton.style.display = 'none'
				if (downloadButton) downloadButton.style.display = 'none'

				const viewOrderFilesBtn = document.getElementById(
					'view_order_files-button',
				)
				const emergencyButton = document.getElementById('emergency-button')
				const updateStatusBtn = document.getElementById('update_status-button')
				const assignExecutorBtn = document.getElementById(
					'assign_executor-button',
				)
				const viewCorrespondenceBtn = document.getElementById(
					'view_correspondence-button',
				)

				if (viewOrderFilesBtn) viewOrderFilesBtn.style.display = 'none'
				if (emergencyButton) emergencyButton.style.display = 'none'
				if (updateStatusBtn) updateStatusBtn.style.display = 'none'
				if (assignExecutorBtn) assignExecutorBtn.style.display = 'none'
				if (viewCorrespondenceBtn) viewCorrespondenceBtn.style.display = 'none'
				if (goToClientButton) goToClientButton.style.display = 'none'

				showMenu(e.pageX, e.pageY)
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
			{ passive: true },
		)

		document.addEventListener(
			'touchmove',
			function () {
				if (touchTimer) {
					clearTimeout(touchTimer)
					touchTimer = null
				}
			},
			{ passive: true },
		)

		document.addEventListener(
			'touchend',
			function () {
				if (touchTimer) {
					clearTimeout(touchTimer)
					touchTimer = null
				}
			},
			{ passive: true },
		)

		document.addEventListener('click', () => {
			menu.style.display = 'none'
		})
	}
}

function filterList(listEl, query, selector) {
	if (!listEl) return
	const items = listEl.querySelectorAll(':scope > li')
	const q = query.trim().toLowerCase()
	items.forEach(li => {
		const target = li.querySelector(selector)
		const text = target ? target.textContent.trim().toLowerCase() : ''
		li.style.display = !q || text.includes(q) ? '' : 'none'
	})
}

function addSearchInput(
	listEl,
	placeholder,
	selector,
	marginLeft = '0px',
	type = 'clients',
) {
	if (!listEl) return
	const wrapper = document.createElement('div')
	wrapper.classList.add('debtors-search-input-wrapper', type)
	const input = document.createElement('input')
	input.type = 'text'
	input.className = 'debtors-search-input'
	input.placeholder = placeholder
	wrapper.appendChild(input)
	listEl.parentNode.insertBefore(wrapper, listEl)

	input.addEventListener('input', () => {
		filterList(listEl, input.value, selector)
	})
}

async function deleteDepartmentWork(workId, card) {
	showQuestion(
		'Вы действительно хотите удалить работу отдела?',
		'Удаление работы отдела',
		async () => {
			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				const resp = await fetch(`/departments/work/delete/${workId}/`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'X-CSRFToken': getCSRFToken(),
					},
					credentials: 'same-origin',
				})
				const data = await resp.json()
				loader.remove()
				if (!resp.ok || data.status !== 'success') {
					showError(
						data.message || data.error || 'Ошибка при удалении работы отдела',
					)
					return
				}
				if (card && card.parentNode) card.remove()
				showSuccess('Работа отдела успешно удалена')
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка при удалении работы отдела')
			}
		},
	)
}

function getDepartmentIcon(departmentName) {
	const depIconByName = {
		дизайн: 'dizayn.png',
		монтаж: 'montazh.png',
		накатка: 'nakatka.png',
		'печать ифп': 'pechat.png',
		печать: 'pechat.png',
		раскрой: 'raskroy.png',
		сборка: 'sborka.png',
		сварка: 'svarka.png',
		замер: 'zamer.png',
		бортогиб: 'bortogib.png',
		доставка: 'dostavka.png',
		покраска: 'pokraska.png',
		plotter: 'plotter.png',
		плоттер: 'plotter.png',
	}
	const key = String(departmentName || '').trim().toLowerCase()
	return depIconByName[key] || 'dizayn.png'
}

function buildDepartmentWorkCard(dw, orderId) {
	const depImg = getDepartmentIcon(dw.department_name)

	const card = document.createElement('div')
	card.className = 'department-card'
	card.dataset.id = dw.id
	card.dataset.departmentId = String(dw.department)
	card.dataset.departmentSlug = dw.department_slug || ''
	card.dataset.orderId = orderId || ''
	card.dataset.executorName = dw.executor_name || ''
	card.dataset.startedAt = dw.started_at || ''
	card.dataset.completedAt = dw.completed_at || ''
	card.dataset.isActive = dw.is_active ? '1' : '0'

	const actionButtons = `
		${!dw.is_active ? `<button class="department-card__action-btn department-card__action-btn--start" title="Начать работу" data-action="start"><img src="/static/images/play.svg" alt="Начать"></button>` : ''}
		${dw.is_active ? `<button class="department-card__action-btn department-card__action-btn--stop" title="Остановить работу" data-action="stop"><img src="/static/images/stop.svg" alt="Остановить"></button>` : ''}
	`

	const workInfo = `
		${dw.started_at ? `<div class="department-card__info"><span class="info-label">Начало:</span> <span class="info-value">${dw.started_at}</span></div>` : ''}
		${dw.completed_at ? `<div class="department-card__info"><span class="info-label">Конец:</span> <span class="info-value">${dw.completed_at}</span></div>` : ''}
		${dw.executor_name ? `<div class="department-card__info"><span class="info-label">Исполнитель:</span> <span class="info-value">${dw.executor_name}</span></div>` : ''}
	`

	card.innerHTML = `
		<div class="department-card__body">
			<button class="department-card__delete" title="Удалить отдел">&times;</button>
			<img src="/static/images/departments/${depImg}" alt="${dw.department_name || 'Отдел'}" class="department-card__img">
			<div class="department-card__title">${dw.department_name || 'Отдел'}</div>
			<p class="department-card__work-status">${dw.status_name || ''}</p>
			<div class="department-card__actions">
				${actionButtons}
			</div>
		</div>
		<div class="department-card__details">
			${workInfo}
		</div>
	`

	card.querySelector('.department-card__delete').onclick = () => {
		deleteDepartmentWork(dw.id, card)
	}

	const startBtn = card.querySelector('[data-action="start"]')
	if (startBtn) {
		startBtn.onclick = async e => {
			e.stopPropagation()
			await updateDepartmentWorkStatus(dw.id, 'start', card)
		}
	}

	const stopBtn = card.querySelector('[data-action="stop"]')
	if (stopBtn) {
		stopBtn.onclick = async e => {
			e.stopPropagation()
			await updateDepartmentWorkStatus(dw.id, 'stop', card)
		}
	}

	return card
}

async function updateDepartmentWorkStatus(workId, action, card) {
	try {
		const loader = createLoader()
		document.body.appendChild(loader)

		// Получаем карточку работы отдела
		if (!card) {
			card = document.querySelector(`.department-card[data-id="${workId}"]`)
		}
		if (!card) {
			showError('Не удалось найти карточку работы отдела')
			loader.remove()
			return
		}

		// Отправляем запрос на переключение активности (только is_active)
		const resp = await fetch(`/departments/work/set-active/${workId}/`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-CSRFToken': getCSRFToken(),
			},
			credentials: 'same-origin',
			body: JSON.stringify({ action: action }),
		})

		const data = await resp.json()
		loader.remove()

		if (!resp.ok || data.status !== 'success') {
			showError(data.message || 'Ошибка при переключении активности работы')
			return
		}

		showSuccess(
			data.is_active
				? 'Работа помечена как активная'
				: 'Работа помечена как неактивная',
		)

		updateDepartmentWorkCardActions(card, {
			is_active: data.is_active,
			is_completed: data.is_completed,
			started_at: data.started_at,
			completed_at: data.completed_at,
		})
	} catch (err) {
		const loader = document.querySelector('.loader')
		if (loader) loader.remove()
		showError(err.message || 'Ошибка при переключении активности работы')
	}
}

function updateDepartmentWorkCardActions(card, dw) {
	const actionsEl = card.querySelector('.department-card__actions')
	if (!actionsEl) return

	let html = ''
	if (!dw.is_active) {
		html += `<button class="department-card__action-btn department-card__action-btn--start" title="Начать работу" data-action="start"><img src="/static/images/play.svg" alt="Начать"></button>`
	}
	if (dw.is_active) {
		html += `<button class="department-card__action-btn department-card__action-btn--stop" title="Остановить работу" data-action="stop"><img src="/static/images/stop.svg" alt="Остановить"></button>`
	}
	actionsEl.innerHTML = html

	const workId = card.dataset.id
	const startBtn = actionsEl.querySelector('[data-action="start"]')
	if (startBtn) {
		startBtn.onclick = async e => {
			e.stopPropagation()
			await updateDepartmentWorkStatus(workId, 'start', card)
		}
	}
	const stopBtn = actionsEl.querySelector('[data-action="stop"]')
	if (stopBtn) {
		stopBtn.onclick = async e => {
			e.stopPropagation()
			await updateDepartmentWorkStatus(workId, 'stop', card)
		}
	}

	if (dw.started_at !== undefined) {
		card.dataset.startedAt = dw.started_at || ''
	}
	if (dw.completed_at !== undefined) {
		card.dataset.completedAt = dw.completed_at || ''
	}
	card.dataset.isActive = dw.is_active ? '1' : '0'

	const detailsEl = card.querySelector('.department-card__details')
	if (detailsEl) {
		const executorName = card.dataset.executorName || ''
		detailsEl.innerHTML = `
			${dw.started_at ? `<div class="department-card__info"><span class="info-label">Начало:</span> <span class="info-value">${dw.started_at}</span></div>` : ''}
			${dw.completed_at ? `<div class="department-card__info"><span class="info-label">Конец:</span> <span class="info-value">${dw.completed_at}</span></div>` : ''}
			${executorName ? `<div class="department-card__info"><span class="info-label">Исполнитель:</span> <span class="info-value">${executorName}</span></div>` : ''}
		`
	}
}

const WORKS_CLIENTS_LIST_URL = `${BASE_URL}works/clients/list/`
const WORKS_CLIENT_TREE_URL = `${BASE_URL}works/client-tree/`
const WORKS_OBJECT_PRODUCTS_URL = `${BASE_URL}works/object-products/`

const WORKS_ORDER_TABLE_COLUMNS = [
	{ name: 'id' },
	{ name: 'status', url: '/commerce/orders/statuses/' },
	{ name: 'created' },
	{ name: 'deadline' },
	{ name: 'required_documents' },
	{ name: 'unit_price' },
	{ name: 'quantity' },
	{ name: 'amount' },
	{ name: 'paid_amount' },
	{ name: 'comment' },
	{ name: 'additional_info' },
]

function initWorksOrdersTable(details, data, orderIdFromQuery) {
	details.innerHTML = `<div>${data.html}</div>`
	details.dataset.loaded = '1'

	const table = details.querySelector('table')
	if (!table) return

	TableManager.initTable(data.table_id)
	TableManager.createColumnsForTable(data.table_id, WORKS_ORDER_TABLE_COLUMNS)

	if (!orderIdFromQuery) return

	const tableId = data.table_id
	const observer = new MutationObserver(() => {
		const idInput = document.querySelector(`#${tableId} thead input[name="id"]`)
		if (idInput) {
			idInput.value = orderIdFromQuery
			idInput.dispatchEvent(new Event('input', { bubbles: true }))
			idInput.dispatchEvent(new Event('change', { bubbles: true }))
			observer.disconnect()
		}
	})
	observer.observe(document.getElementById(tableId), {
		childList: true,
		subtree: true,
	})
}

async function loadWorksProductOrders(row, details, orderIdFromQuery) {
	const productId = row.dataset.productId
	const clientId = row.dataset.clientId
	const objectId = row.dataset.objectId
	if (!productId || !clientId || !objectId) return

	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		const resp = await fetch(
			`/commerce/product_orders/?product_id=${productId}&client_id=${clientId}&object_id=${objectId}`,
		)
		const data = await resp.json()
		loader.remove()

		if (!resp.ok) {
			showError(data.error || 'Ошибка загрузки данных')
			return
		}

		initWorksOrdersTable(details, data, orderIdFromQuery)
	} catch (err) {
		loader.remove()
		showError(err.message || 'Ошибка загрузки данных')
	}
}

async function loadWorksNoObjectOrders(row, details, orderIdFromQuery) {
	const parts = row.dataset.target.replace('no-object-', '').split('-')
	const rowClientId = parts[0]
	const rowProductId = parts[1]
	if (!rowProductId || !rowClientId) return

	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		const resp = await fetch(
			`/commerce/product_orders_without_object/?product_id=${rowProductId}&client_id=${rowClientId}`,
		)
		const data = await resp.json()
		loader.remove()

		if (!resp.ok) {
			showError(data.error || 'Ошибка загрузки данных')
			return
		}

		initWorksOrdersTable(details, data, orderIdFromQuery)
	} catch (err) {
		loader.remove()
		showError(err.message || 'Ошибка загрузки данных')
	}
}

async function loadWorksObjectProducts(row, details) {
	const clientId = row.dataset.clientId
	const objectId = row.dataset.objectId
	if (!clientId || !objectId) return

	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		const resp = await fetch(
			`${WORKS_OBJECT_PRODUCTS_URL}?client_id=${clientId}&object_id=${objectId}`,
		)
		const data = await resp.json()
		loader.remove()

		if (!resp.ok) {
			showError(data.error || 'Ошибка загрузки данных')
			return
		}

		details.innerHTML = data.html
		details.dataset.loaded = '1'

		const productsList = details.querySelector('ul')
		if (productsList && !details.querySelector('.debtors-search-input')) {
			addSearchInput(
				productsList,
				'Поиск продукции...',
				'.debtors-office-list__title',
				'32px',
				'products',
			)
		}
	} catch (err) {
		loader.remove()
		showError(err.message || 'Ошибка загрузки данных')
	}
}

async function loadWorksClientTree(clientId, details) {
	const loader = createLoader()
	document.body.appendChild(loader)
	try {
		const resp = await fetch(`${WORKS_CLIENT_TREE_URL}?client_id=${clientId}`)
		const data = await resp.json()
		loader.remove()

		if (!resp.ok) {
			showError(data.error || 'Ошибка загрузки данных')
			return
		}

		details.innerHTML = data.html
		details.dataset.loaded = '1'

		const objectsList = details.querySelector('ul')
		if (objectsList && !details.querySelector('.debtors-search-input')) {
			addSearchInput(objectsList, 'Поиск объекта...', 'h4', '16px', 'objects')
		}
	} catch (err) {
		loader.remove()
		showError(err.message || 'Ошибка загрузки данных')
	}
}

async function handleWorksRowClick(row, orderIdFromQuery) {
	const targetId = row.getAttribute('data-target')
	if (!targetId) return

	const details = document.getElementById(targetId)
	if (!details) return

	const btn = row.querySelector('.debtors-office-list__toggle')
	if (btn) btn.classList.toggle('open')
	details.classList.toggle('open')

	if (targetId.startsWith('branch-') && !details.dataset.loaded) {
		const branchClientId = targetId.replace('branch-', '')
		await loadWorksClientTree(branchClientId, details)
		return
	}

	if (
		targetId.startsWith('object-') &&
		!details.dataset.loaded &&
		!details.querySelector('ul')
	) {
		await loadWorksObjectProducts(row, details)
		return
	}

	if (targetId.startsWith('product-') && !details.dataset.loaded) {
		await loadWorksProductOrders(row, details, orderIdFromQuery)
		return
	}

	if (targetId.startsWith('no-object-') && !details.dataset.loaded) {
		await loadWorksNoObjectOrders(row, details, orderIdFromQuery)
	}
}

const initWorksPage = () => {
	let clientId = null
	let objectId = null
	let productId = null

	const clientsList = document.getElementById('works-clients-list')
	const searchInput = document.getElementById('works-client-search')
	const firstPageButton = document.getElementById('works-first-page')
	const prevPageButton = document.getElementById('works-prev-page')
	const nextPageButton = document.getElementById('works-next-page')
	const lastPageButton = document.getElementById('works-last-page')
	const currentPageInput = document.getElementById('works-current-page')
	const totalPagesSpan = document.getElementById('works-total-pages')

	let currentPage = 1
	let totalPages = 1
	let currentSearch = ''
	let searchDebounceTimer = null
	let activeClientsRequest = null
	let clientsRequestSeq = 0

	const updatePaginationButtons = () => {
		const isFirstPage = currentPage <= 1
		const isLastPage = currentPage >= totalPages

		if (firstPageButton) firstPageButton.disabled = isFirstPage
		if (prevPageButton) prevPageButton.disabled = isFirstPage
		if (nextPageButton) nextPageButton.disabled = isLastPage
		if (lastPageButton) lastPageButton.disabled = isLastPage
		if (currentPageInput) currentPageInput.value = String(currentPage)
		if (totalPagesSpan) totalPagesSpan.textContent = String(totalPages)
	}

	const fetchWorksClients = async (page = 1, search = currentSearch) => {
		if (!clientsList) return

		if (activeClientsRequest) {
			activeClientsRequest.abort()
		}
		const requestController = new AbortController()
		activeClientsRequest = requestController
		const requestId = ++clientsRequestSeq

		const loader = createLoader()
		document.body.appendChild(loader)

		try {
			const query = new URLSearchParams({ page: String(page) })
			if (search.trim()) {
				query.set('q', search.trim())
			}

			const resp = await fetch(`${WORKS_CLIENTS_LIST_URL}?${query.toString()}`, {
				signal: requestController.signal,
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const data = await resp.json()
			loader.remove()

			if (requestId !== clientsRequestSeq) return

			if (!resp.ok) {
				showError(data.error || 'Ошибка загрузки клиентов')
				return
			}

			clientsList.innerHTML = data.html || ''
			currentPage = data.current_page || 1
			totalPages = Math.max(1, data.total_pages || 1)
			updatePaginationButtons()
		} catch (err) {
			loader.remove()
			if (requestId !== clientsRequestSeq) return
			if (err.name !== 'AbortError') {
				showError(err.message || 'Ошибка загрузки клиентов')
			}
		}
	}

	const ensureWorksClientRow = async clientIdToLoad => {
		let clientRow = document.querySelector(
			`.debtors-office-list__row[data-target="branch-${clientIdToLoad}"]`,
		)
		if (clientRow) return clientRow

		const loader = createLoader()
		document.body.appendChild(loader)
		try {
			const resp = await fetch(
				`${WORKS_CLIENTS_LIST_URL}?client_id=${clientIdToLoad}`,
			)
			const data = await resp.json()
			loader.remove()

			if (resp.ok && data.html && clientsList && !currentSearch.trim()) {
				clientsList.insertAdjacentHTML('beforeend', data.html)
			}
		} catch (err) {
			loader.remove()
		}

		return document.querySelector(
			`.debtors-office-list__row[data-target="branch-${clientIdToLoad}"]`,
		)
	}

	if (searchInput) {
		searchInput.addEventListener('input', () => {
			clearTimeout(searchDebounceTimer)
			searchDebounceTimer = setTimeout(() => {
				currentSearch = searchInput.value
				currentPage = 1
				fetchWorksClients(1, currentSearch)
			}, 300)
		})
	}

	if (firstPageButton) {
		firstPageButton.addEventListener('click', () => {
			if (currentPage > 1) fetchWorksClients(1, currentSearch)
		})
	}
	if (prevPageButton) {
		prevPageButton.addEventListener('click', () => {
			if (currentPage > 1) fetchWorksClients(currentPage - 1, currentSearch)
		})
	}
	if (nextPageButton) {
		nextPageButton.addEventListener('click', () => {
			if (currentPage < totalPages) fetchWorksClients(currentPage + 1, currentSearch)
		})
	}
	if (lastPageButton) {
		lastPageButton.addEventListener('click', () => {
			if (currentPage < totalPages) fetchWorksClients(totalPages, currentSearch)
		})
	}
	if (currentPageInput) {
		currentPageInput.addEventListener('change', () => {
			const pageNum = Math.max(
				1,
				Math.min(totalPages, Number(currentPageInput.value) || 1),
			)
			fetchWorksClients(pageNum, currentSearch)
		})
	}

	function getQueryParam(name) {
		const url = new URL(window.location.href)
		return url.searchParams.get(name)
	}

	const orderIdFromQuery = getQueryParam('order_id')
	const clientIdFromQuery = getQueryParam('client_id')
	const productIdFromQuery = getQueryParam('product_id')
	const objectIdFromQuery = getQueryParam('client_object_id')

	if (clientsList) {
		clientsList.addEventListener('click', async function (e) {
			const row = e.target.closest('.debtors-office-list__row')
			if (!row || !clientsList.contains(row)) return

			await handleWorksRowClick(row, orderIdFromQuery)
		})
	}

	const getRowTitle = row => {
		if (!row) return ''
		const titleElement = row.querySelector(
			'.debtors-office-list__title, h4, h3',
		)
		return titleElement?.textContent?.trim() || row.textContent?.trim() || ''
	}

	const getWorksOrderSelectData = () => {
		const clientRow = clientId
			? document.querySelector(
					`.debtors-office-list__row[data-target="branch-${clientId}"]`,
				)
			: null

		const productRow = productId
			? document.querySelector(
					`.debtors-office-list__row[data-target="product-${clientId}-${objectId}-${productId}"], .debtors-office-list__row[data-target="no-object-${clientId}-${productId}"]`,
				)
			: null

		const objectRow =
			clientId && objectId
				? document.querySelector(
						`.debtors-office-list__row[data-target="object-${clientId}-${objectId}"]`,
					)
				: null

		return {
			clientOptions: clientId
				? [
						{
							id: clientId,
							name: getRowTitle(clientRow) || `Клиент ${clientId}`,
						},
					]
				: [],
			productOptions: productId
				? [
						{
							id: productId,
							name: getRowTitle(productRow) || `Продукт ${productId}`,
						},
					]
				: [],
			clientObjectUrl: clientId
				? `/commerce/clients/objects/list/?client_id=${clientId}`
				: `/commerce/clients/objects/list/`,
			objectName: getRowTitle(objectRow),
		}
	}

	const applyWorksOrderFormValues = ({ clientId, productId, objectId }) => {
		const setSelectValue = (fieldId, value) => {
			const input = document.getElementById(fieldId)
			if (!input || value === undefined || value === null) return

			input.value = value
			const selectWrapper = input.closest('.select')
			if (selectWrapper) {
				SelectHandler.restoreSelectValue(selectWrapper, String(value))
			}
		}

		setSelectValue('client', clientId)
		setSelectValue('product', productId)
		if (objectId) {
			setSelectValue('client_object', objectId)
		}
	}

	document.addEventListener('contextmenu', e => {
		const row = e.target.closest('.debtors-office-list__row')
		if (row) {
			const dataTarget = row.getAttribute('data-target')
			if (dataTarget && dataTarget.startsWith('branch-')) {
				const id = dataTarget.replace('branch-', '')
				clientId = id
				objectId = null
				productId = null
			} else if (dataTarget && dataTarget.startsWith('no-object-')) {
				const parts = dataTarget.replace('no-object-', '').split('-')
				if (parts.length >= 2) {
					clientId = parts[0]
					productId = parts[1]
					objectId = null
				}
			} else if (dataTarget && dataTarget.startsWith('object-')) {
				const parts = dataTarget.replace('object-', '').split('-')
				if (parts.length >= 2) {
					clientId = parts[0]
					objectId = parts[1]
					productId = null
				}
			} else if (dataTarget && dataTarget.startsWith('product-')) {
				const parts = dataTarget.replace('product-', '').split('-')
				if (parts.length >= 3) {
					clientId = parts[0]
					objectId = parts[1]
					productId = parts[2]
				}
			} else {
				clientId = null
				objectId = null
				productId = null
			}
		}
	})

	const openLevels = async () => {
		if (!clientIdFromQuery || !objectIdFromQuery || !productIdFromQuery) return

		const clientRow = await ensureWorksClientRow(clientIdFromQuery)
		if (clientRow) {
			await handleWorksRowClick(clientRow, orderIdFromQuery)
			await new Promise(resolve => setTimeout(resolve, 150))
		}

		const objectRow = document.querySelector(
			`.debtors-office-list__row[data-target="object-${clientIdFromQuery}-${objectIdFromQuery}"]`,
		)
		if (objectRow) {
			await handleWorksRowClick(objectRow, orderIdFromQuery)
			await new Promise(resolve => setTimeout(resolve, 150))
		}

		const productRow = document.querySelector(
			`.debtors-office-list__row[data-target="product-${clientIdFromQuery}-${objectIdFromQuery}-${productIdFromQuery}"]`,
		)
		if (productRow) {
			await handleWorksRowClick(productRow, orderIdFromQuery)
		}
	}

	fetchWorksClients(1, '').then(() => openLevels())

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
								`branch-${result.client_id}`,
							)
							if (branchDetails) {
								let ul = branchDetails.querySelector('ul')

								if (ul) {
									const noObjectsLis = ul.querySelectorAll('li')
									noObjectsLis.forEach(li => {
										if (
											li.textContent.trim() === 'Нет объектов' &&
											li.className === 'debtors-office-list__row'
										) {
											li.remove()
										}
									})
								}

								if (!ul) {
									ul = document.createElement('ul')
									branchDetails.appendChild(ul)
								}

								ul.insertAdjacentHTML('beforeend', result.html)
								branchDetails.dataset.loaded = '1'
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
				// Проверяем, это заказ без объекта или с объектом
				const noObjectRow = document.querySelector(
					'.debtors-office-list__row[data-target^="no-object-"]',
				)
				const productRow = document.querySelector(
					'.debtors-office-list__row[data-target^="product-"]',
				)
				const row = noObjectRow || productRow

				if (!row) {
					showError('Не выбран продукт для создания расчета.')
					return
				}

				// Если выбран заказ без объекта
				if (noObjectRow && objectId === null) {
					if (!productId || !clientId) {
						showError('Не удалось определить параметры для создания расчета.')
						return
					}
				} else if (productRow) {
					// Если выбран заказ с объектом
					if (!productId || !clientId || !objectId) {
						showError('Не удалось определить параметры для создания расчета.')
						return
					}
				}

				const worksOrderSelectData = getWorksOrderSelectData()

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
						{ id: 'client', url: worksOrderSelectData.clientOptions },
						{ id: 'product', url: worksOrderSelectData.productOptions },
						{
							id: 'client_object',
							url: worksOrderSelectData.clientObjectUrl,
						},
					],
					onSuccess: async result => {
						if (result.status === 'success' && result.id) {
							// Определяем правильное место для вставки заказа
							let debtorsOfficeDetails
							if (objectId !== null && objectId !== undefined) {
								// Заказ с объектом
								debtorsOfficeDetails = document.getElementById(
									`product-${clientId}-${objectId}-${productId}`,
								)
							} else {
								// Заказ без объекта
								debtorsOfficeDetails = document.getElementById(
									`no-object-${clientId}-${productId}`,
								)
							}

							if (!debtorsOfficeDetails) return

							const isOpen = debtorsOfficeDetails.classList.contains('open')

							const tableId = result.table_id

							let table = document.getElementById(tableId)

							if (table) {
								const newRow = await TableManager.addTableRow(
									result,
									tableId,
									true,
								)

								if (newRow) {
									TableManager.attachRowCellHandlers(newRow)
									TableManager.formatCurrencyValuesForRow(tableId, newRow)
									TableManager.applyColumnWidthsForRow(tableId, newRow)

									showSuccess('Расчет успешно создан')
								}
							} else if (isOpen) {
								const tableHtml = `
        <table class="table" id="${tableId}" style="visibility: visible; width: 1034px;">
            <colgroup>
                <col id="col-0" style="width: 50px; min-width: 50px; max-width: 50px;">
                <col id="col-1" style="width: 150px; min-width: 150px; max-width: 150px;">
                <col id="col-2" style="width: 80px; min-width: 80px; max-width: 80px;">
                <col id="col-3" style="width: 80px; min-width: 80px; max-width: 80px;">
                <col id="col-4" style="width: 78px; min-width: 78px; max-width: 78px;">
                <col id="col-5" style="width: 71px; min-width: 71px; max-width: 71px;">
                <col id="col-6" style="width: 124px; min-width: 124px; max-width: 124px;">
                <col id="col-7" style="width: 71px; min-width: 71px; max-width: 71px;">
                <col id="col-8" style="width: 71px; min-width: 71px; max-width: 71px;">
                <col id="col-9" style="width: 143px; min-width: 143px; max-width: 143px;">
                <col id="col-10" style="width: 116px; min-width: 116px; max-width: 116px;">
            </colgroup>
            <thead class="table__header">
                <tr>
                    <th class="table__cell-header" data-column="0" data-column-type="text" data-name="id" style="max-width: 50px;">Заказ<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="1" data-column-type="select" data-name="status" style="max-width: 150px;">Статус<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="2" data-column-type="date" data-name="created" style="max-width: 80px;">Создан<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="3" data-column-type="date" data-name="deadline" style="max-width: 80px;">Срок сдачи<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="4" data-column-type="checkbox" data-name="required_documents" style="max-width: 78px;">Док-ты<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="5" data-column-type="amount" data-name="unit_price" style="max-width: 71px;">Стоимость<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="6" data-column-type="text" data-name="quantity" style="max-width: 124px;">Количество<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="7" data-column-type="amount" data-name="amount" style="max-width: 71px;">Сумма<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="8" data-column-type="amount" data-name="paid_amount" style="max-width: 71px;">Погашено<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header" data-column="9" data-column-type="text" data-name="comment" style="max-width: 143px;">Комментарий<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                    <th class="table__cell-header table__cell-last" data-column="10" data-column-type="text" data-name="additional_info" style="max-width: 116px;">Доп. инф-я<div class="table__resize-handle"></div><div class="table__column-toggle"></div></th>
                </tr>
                <tr>
                    <td class="table__cell-header table__filter-cell" style="max-width: 50px;"><div class="input-container"><input type="text" class="create-form__input" name="id"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 150px;"><div class="select" data-multiple="false"><input type="text" hidden="" class="select__input" id="id_status" name="status" placeholder=""><div class="select__control" tabindex="0"><span class="select__text"></span><img src="/static/images/chevron-down.svg" alt="Close" class="select__arrow" height="28" width="28"><img src="/static/images/close.svg" alt="Close" class="select__clear" height="28" width="28"></div><div class="select__dropdown"></div></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 80px;"><div class="input-container"><input type="text" class="create-form__input" name="created"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 80px;"><div class="input-container"><input type="text" class="create-form__input" name="deadline"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 78px;"></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 71px;"><div class="input-container"><input type="text" class="create-form__input" name="unit_price"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 124px;"></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 71px;"><div class="input-container"><input type="text" class="create-form__input" name="amount"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 71px;"><div class="input-container"><input type="text" class="create-form__input" name="paid_amount"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 143px;"><div class="input-container"><input type="text" class="create-form__input" name="comment"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                    <td class="table__cell-header table__filter-cell" style="max-width: 116px;"><div class="input-container"><input type="text" class="create-form__input" name="additional_info"><img src="/static/images/close.svg" alt="Close" class="clear-button"></div></td>
                </tr>
            </thead>
            <tbody class="table__body"></tbody>
        </table>
    `

								debtorsOfficeDetails.innerHTML = tableHtml
								const table = document.getElementById(tableId)
								if (table && result.html) {
									table
										.querySelector('tbody')
										.insertAdjacentHTML('beforeend', result.html)
									TableManager.initTable(tableId)
									const newRow = table.querySelector('tbody tr:last-child')
									if (newRow) {
										TableManager.attachRowCellHandlers(newRow)
										TableManager.formatCurrencyValuesForRow(tableId, newRow)
										TableManager.applyColumnWidthsForRow(tableId, newRow)
									}
									showSuccess('Расчет успешно создан')
								}
							}
						}
					},
				}

				const formHandler = new DynamicFormHandler(config)
				await formHandler.init()
				applyWorksOrderFormValues({ clientId, productId, objectId })

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
									unit_priceInput.value.replace(/\s/g, '').replace(',', '.'),
								) || 0
						const quantity =
							parseFloat(
								quantityInput.value.replace(/\s/g, '').replace(',', '.'),
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

				try {
					const resp = await fetch(
						`/commerce/products/${productId}/departments/`,
						{
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						},
					)
					const data = await resp.json()

					if (!resp.ok || !Array.isArray(data)) return

					const modalBody = document.querySelector('.modal__body')
					if (!modalBody) return

					const form = modalBody.querySelector('form.modal-form')
					if (!form) return

					let carousel = modalBody.querySelector('.departments-carousel')
					if (!carousel) {
						carousel = document.createElement('div')
						carousel.className = 'departments-carousel'
						form.insertAdjacentElement('afterend', carousel)
					}

					if (data.length === 0) {
						const noDepartmentsMessage = document.createElement('div')
						noDepartmentsMessage.style.textAlign = 'center'
						noDepartmentsMessage.style.padding = '20px'
						noDepartmentsMessage.style.fontSize = '16px'
						noDepartmentsMessage.style.color = '#666'
						noDepartmentsMessage.textContent =
							'Стандартные отделы для продукта не заданы.'

						carousel.appendChild(noDepartmentsMessage)
					} else {
						data.forEach(dep => {
							const card = document.createElement('div')
							card.className = 'department-card'
							card.dataset.id = dep.id
							card.innerHTML = `
            <img src="/static/images/departments/${dep.slug || 'default'}.png" alt="${dep.name}" class="department-card__img">
            <div class="department-card__title">${dep.name}</div>
        `
							carousel.appendChild(card)
						})
					}
				} catch (e) {
					console.warn('Ошибка загрузки отделов:', e)
				}
			}
		})
	}

	if (editButton) {
		editButton.addEventListener('click', async () => {
			if (editButton.textContent.trim() === 'Редактировать объект') {
				if (!clientId || !objectId) {
					showError('Не выбран объект для редактирования.')
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
									`[data-target="object-${result.client_id}-${result.id}"]`,
								)
								?.closest('li')

							if (existingObjectItem) {
								existingObjectItem.outerHTML = result.html
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
			} else if (editButton.textContent.trim() === 'Редактировать расчет') {
				const selectedRow = document.querySelector('.table__row--selected')
				const table = selectedRow?.closest('table')
				const orderId = TableManager.getSelectedRowId(table?.id)

				if (!orderId) {
					showError('Не выбран расчет для редактирования.')
					return
				}

				const worksOrderSelectData = getWorksOrderSelectData()

				const editConfig = {
					submitUrl: `/commerce/orders/edit/`,
					getUrl: `/commerce/orders/`,
					tableId: table.id,
					formId: `orders-form`,
					modalConfig: {
						url: `/components/commerce/add_order`,
						title: 'Редактировать расчет',
						context: {},
					},
					dataUrls: [
						{ id: 'client', url: worksOrderSelectData.clientOptions },
						{ id: 'product', url: worksOrderSelectData.productOptions },
						{
							id: 'client_object',
							url: worksOrderSelectData.clientObjectUrl,
						},
					],
					onSuccess: async result => {
						if (result.status === 'success' && result.html && result.id) {
							if (result.table_id && result.table_id !== editConfig.tableId) {
								TableManager.removeRow(result.id, editConfig.tableId)

								const targetTable = document.getElementById(result.table_id)
								if (targetTable) {
									await TableManager.addTableRow(result, result.table_id, true)
								}
							} else {
								TableManager.updateTableRow(result, editConfig.tableId)
							}
							showSuccess('Расчет успешно обновлен')
						}
					},
				}
				const formHandler = new DynamicFormHandler(editConfig)
				await formHandler.init(orderId)

				const departmentWorks = formHandler.departmentWorks

				function renderDepartmentsCarousel(
					departmentWorks,
					orderIdParam = null,
				) {
					const modalBody = document.querySelector('.modal__body')
					if (!modalBody) return

					const form = modalBody.querySelector('form.modal-form')
					if (!form) return

					// Сохраняем orderId для использования в обработчиках кнопок
					const carouselOrderId = orderIdParam || orderId

					let carousel = modalBody.querySelector('.departments-carousel')
					if (!carousel) {
						carousel = document.createElement('div')
						carousel.className = 'departments-carousel'
						form.insertAdjacentElement('afterend', carousel)
					} else {
						carousel
							.querySelectorAll('.department-card:not(.department-card--add)')
							.forEach(card => card.remove())
					}

					const departments = [
						{ name: 'Дизайн', img: 'dizayn.png' },
						{ name: 'Монтаж', img: 'montazh.png' },
						{ name: 'Накатка', img: 'nakatka.png' },
						{ name: 'Печать ИФП', img: 'pechat.png' },
						{ name: 'Раскрой', img: 'raskroy.png' },
						{ name: 'Сборка', img: 'sborka.png' },
						{ name: 'Сварка', img: 'svarka.png' },
						{ name: 'Замер', img: 'zamer.png' },
					]

					let addCard = carousel.querySelector('.department-card--add')
					if (!addCard) {
						addCard = document.createElement('div')
						addCard.className = 'department-card department-card--add'
						addCard.innerHTML = `<button class="department-card__add" title="Добавить отдел">+</button>`
						carousel.appendChild(addCard)
					}

					departmentWorks.forEach(dw => {
						const card = buildDepartmentWorkCard(dw, carouselOrderId)
						carousel.insertBefore(card, addCard)
					})

					const addBtn = carousel.querySelector('.department-card__add')
					if (addBtn) {
						addBtn.onclick = async () => {
							if (!orderId) {
								showError(
									'Не удалось определить заказ для добавления работы отделу',
								)
								return
							}

							const escapeHtml = value =>
								String(value)
									.replace(/&/g, '&amp;')
									.replace(/</g, '&lt;')
									.replace(/>/g, '&gt;')
									.replace(/"/g, '&quot;')
									.replace(/'/g, '&#39;')

							const existingDepartmentIds = new Set(
								Array.from(
									carousel.querySelectorAll(
										'.department-card:not(.department-card--add)[data-department-id]',
									),
								)
									.map(cardEl => cardEl.dataset.departmentId)
									.filter(Boolean),
							)

							const departmentsFromApi =
								await SelectHandler.fetchSelectOptions('/departments/list/')

							const deptIconByName = {
								дизайн: 'dizayn.png',
								монтаж: 'montazh.png',
								накатка: 'nakatka.png',
								'печать ифп': 'pechat.png',
								печать: 'pechat.png',
								раскрой: 'raskroy.png',
								сборка: 'sborka.png',
								сварка: 'svarka.png',
								замер: 'zamer.png',
							}

							const cardsMarkup = departmentsFromApi
								.map(department => {
									const id = String(department.id)
									const rawName = String(department.name || '').trim()
									const safeName = escapeHtml(rawName)
									const icon =
										deptIconByName[rawName.toLowerCase()] || 'dizayn.png'
									const isExisting = existingDepartmentIds.has(id)
									const existingClass = isExisting
										? ' department-pick-card--existing'
										: ''
									const disabledAttr = isExisting ? ' disabled' : ''
									const checkMarkup = isExisting
										? '<img class="department-pick-card__check" src="/static/images/check_one.svg" alt="Уже добавлен">'
										: ''

									return `
										<button type="button" class="department-pick-card${existingClass}" data-department-id="${id}"${disabledAttr}>
											${checkMarkup}
											<img src="/static/images/departments/${icon}" alt="${safeName}" class="department-pick-card__img">
											<span class="department-pick-card__title">${safeName}</span>
										</button>
									`
								})
								.join('')

							const modal = new Modal()
							const modalContent = `
								<form class="modal-form department-picker-form" id="department-picker-form" method="post">
									<div class="department-picker-grid">${cardsMarkup}</div>
									<div class="modal-form__buttons department-picker-form__buttons">
										<button class="button modal-form__button" type="submit" id="department-picker-submit" disabled>Добавить</button>
										<button class="button modal-form__button button--cancel" type="button">Отменить</button>
									</div>
								</form>
							`

							const modalEl = await modal.open(
								modalContent,
								'Добавить работу отделу',
							)
							const pickerForm = modalEl?.querySelector(
								'#department-picker-form',
							)
							const pickerSubmit = modalEl?.querySelector(
								'#department-picker-submit',
							)
							const selectableCards = modalEl
								? Array.from(
										modalEl.querySelectorAll(
											'.department-pick-card:not(.department-pick-card--existing)',
										),
									)
								: []
							const selectedDepartmentIds = new Set()

							const updateSubmitState = () => {
								if (pickerSubmit) {
									pickerSubmit.disabled = selectedDepartmentIds.size === 0
								}
							}

							selectableCards.forEach(cardEl => {
								cardEl.onclick = () => {
									const depId = cardEl.dataset.departmentId
									if (!depId) return

									if (selectedDepartmentIds.has(depId)) {
										selectedDepartmentIds.delete(depId)
										cardEl.classList.remove('is-selected')
									} else {
										selectedDepartmentIds.add(depId)
										cardEl.classList.add('is-selected')
									}

									updateSubmitState()
								}
							})

							if (pickerForm) {
								pickerForm.onsubmit = async event => {
									event.preventDefault()

									if (!selectedDepartmentIds.size) {
										showError('Выберите хотя бы один отдел')
										return
									}

									const loader = createLoader()
									document.body.appendChild(loader)

									try {
										const formData = new FormData()
										formData.append('order', orderId)
										formData.append(
											'department',
											Array.from(selectedDepartmentIds).join(','),
										)

										const response = await fetch('/departments/work/create/', {
											method: 'POST',
											headers: {
												'X-CSRFToken': getCSRFToken(),
											},
											credentials: 'same-origin',
											body: formData,
										})

										const result = await response.json()
										if (
											!response.ok ||
											result.status !== 'success' ||
											!Array.isArray(result.created)
										) {
											showError(
												result.message || 'Не удалось добавить работу отделу',
											)
											return
										}

										result.created.forEach(createdWork => {
											const card = buildDepartmentWorkCard(
												{
													...createdWork,
													is_active: createdWork.is_active ?? false,
													is_completed: createdWork.is_completed ?? false,
													started_at: createdWork.started_at ?? null,
													completed_at: createdWork.completed_at ?? null,
													executor_name: createdWork.executor_name ?? '',
												},
												orderId,
											)

											const addCard = carousel.querySelector(
												'.department-card--add',
											)
											carousel.insertBefore(card, addCard)
										})

										showSuccess('Работа отдела успешно добавлена')
										modal.close()

										if (Array.isArray(result.errors) && result.errors.length) {
											const firstMessage = result.errors[0]?.message
											if (firstMessage) {
												showError(firstMessage)
											}
										}
									} catch (error) {
										showError(
											error.message || 'Ошибка при добавлении работы отделу',
										)
									} finally {
										loader.remove()
									}
								}
							}
						}
					}
				}

				renderDepartmentsCarousel(departmentWorks)

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
									unit_priceInput.value.replace(/\s/g, '').replace(',', '.'),
								) || 0
						const quantity =
							parseFloat(
								quantityInput.value.replace(/\s/g, '').replace(',', '.'),
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

	if (deleteButton) {
		deleteButton.addEventListener('click', async () => {
			if (deleteButton.textContent.trim() === 'Удалить объект') {
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
								},
							)

							const data = await resp.json()
							loader.remove()

							if (!resp.ok || data.status !== 'success') {
								showError(
									data.message || data.error || 'Ошибка при удалении объекта',
								)
								return
							}

							const objectItem = document
								.querySelector(`[data-target="object-${clientId}-${objectId}"]`)
								?.closest('li')

							if (objectItem) {
								objectItem.remove()

								const branchDetails = document.getElementById(
									`branch-${clientId}`,
								)
								if (branchDetails) {
									const ul = branchDetails.querySelector('ul')
									const remainingObjects = ul?.querySelectorAll(
										'li.debtors-office-list__item',
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
					},
				)
			} else if (deleteButton.textContent.trim() === 'Удалить расчет') {
				const selectedRow = document.querySelector('.table__row--selected')
				const table = selectedRow?.closest('table')
				const orderId = TableManager.getSelectedRowId(table?.id)

				if (!orderId) {
					showError('Не выбран расчет для удаления.')
					return
				}

				showQuestion(
					'Вы действительно хотите удалить расчет?',
					'Удаление расчета',
					async () => {
						const loader = createLoader()
						document.body.appendChild(loader)
						try {
							const resp = await fetch(`/commerce/orders/delete/${orderId}/`, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'X-CSRFToken': getCSRFToken(),
								},
								credentials: 'same-origin',
							})
							const data = await resp.json()
							loader.remove()

							if (!resp.ok || data.status !== 'success') {
								showError(
									data.message || data.error || 'Ошибка при удалении расчета',
								)
								return
							}

							selectedRow.remove()
							showSuccess('Расчет успешно удален')
						} catch (err) {
							loader.remove()
							showError(err.message || 'Ошибка при удалении расчета')
						}
					},
				)
			} else if (deleteButton.textContent.trim() === 'Убрать из списка') {
				const selectedRow = document.querySelector('.table__row--selected')
				const table = selectedRow?.closest('table')
				const tableId = table?.id || ''
				if (!selectedRow || !tableId.startsWith('order-viewers-')) {
					showError(
						'Выберите пользователя для удаления из списка наблюдателей.',
					)
					return
				}
				const userId = TableManager.getSelectedRowId(tableId)
				const orderIdMatch = tableId.match(/^order-viewers-(\d+)/)

				const orderId = orderIdMatch ? orderIdMatch[1] : null
				if (!userId || !orderId) {
					showError('Не удалось определить пользователя или заказ.')
					return
				}
				showQuestion(
					'Вы действительно хотите закрыть доступ этому пользователю к заказу?',
					'Удаление наблюдателя',
					async () => {
						const loader = createLoader()
						document.body.appendChild(loader)
						try {
							const resp = await fetch(
								`/commerce/orders/${orderId}/remove_viewer/`,
								{
									method: 'POST',
									headers: {
										'Content-Type': 'application/x-www-form-urlencoded',
										'X-CSRFToken': getCSRFToken(),
									},
									body: `user_id=${encodeURIComponent(userId)}`,
									credentials: 'same-origin',
								},
							)
							const data = await resp.json()
							loader.remove()
							if (!resp.ok || data.status !== 'success') {
								showError(
									data.message ||
										data.error ||
										'Ошибка при удалении пользователя из списка',
								)
								return
							}
							selectedRow.remove()
							showSuccess('Пользователь успешно удалён из списка наблюдателей')
						} catch (err) {
							loader.remove()
							showError(
								err.message || 'Ошибка при удалении пользователя из списка',
							)
						}
					},
				)
			}
		})
	}

	const addViewerButton = document.getElementById('add-viewer-button')
	if (addViewerButton) {
		addViewerButton.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			let orderId = null
			if (selectedRow) {
				const firstCell = selectedRow.querySelector('td')
				if (firstCell) {
					orderId = firstCell.textContent.trim()
				}
			}
			if (!orderId) {
				showError('Сначала выберите заказ в таблице.')
				return
			}

			const modal = new Modal()
			const resp = await fetch(`/components/commerce/order-viewers`, {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const html = await resp.text()
			await modal.open(html, 'Открыть доступ к заказу')

			const viewersSelectInput = document.getElementById('viewers')
			const viewersSelect =
				viewersSelectInput && viewersSelectInput.closest('.select')
			if (viewersSelect) {
				viewersSelect.setAttribute('data-multiple', 'true')
				SelectHandler.setupSelects({
					select: viewersSelect,
					url: '/users/managers/?role=viewer',
				})
			}

			const container = document.getElementById('order-viewers-container')
			if (container) {
				const viewersResp = await fetch(
					`/commerce/orders/${orderId}/viewers/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					},
				)
				const viewersData = await viewersResp.json()
				container.innerHTML = viewersData.html || '<div>Нет наблюдателей</div>'

				TableManager.initTable(viewersData.table_id)
			}

			const orderViewerBtn = document.getElementById('order-viewers-btn')
			if (orderViewerBtn) {
				orderViewerBtn.addEventListener('click', async () => {
					const viewersSelectInput = document.getElementById('viewers')
					let viewers = []
					if (viewersSelectInput) {
						if (viewersSelectInput.multiple) {
							viewers = Array.from(viewersSelectInput.selectedOptions).map(
								opt => opt.value,
							)
						} else {
							if (viewersSelectInput.value) viewers = [viewersSelectInput.value]
						}
					}
					if (!viewers.length) {
						showError('Выберите хотя бы одного пользователя для добавления.')
						return
					}

					const loader = createLoader()
					document.body.appendChild(loader)
					try {
						const resp = await fetch(
							`/commerce/orders/${orderId}/add_viewers/`,
							{
								method: 'POST',
								headers: {
									'Content-Type': 'application/x-www-form-urlencoded',
									'X-CSRFToken': getCSRFToken(),
								},
								body: viewers
									.map(id => `viewers[]=${encodeURIComponent(id)}`)
									.join('&'),
								credentials: 'same-origin',
							},
						)
						const data = await resp.json()
						loader.remove()
						if (!resp.ok || data.status !== 'success') {
							showError(
								data.message || data.error || 'Ошибка добавления наблюдателей',
							)
							return
						}
						if (container && Array.isArray(data.html)) {
							container.innerHTML = data.html.join('')
							showSuccess('Пользователи успешно добавлены в наблюдатели')
							TableManager.initTable(`order-viewers-${orderId}`)
						}
						modal.close()
					} catch (err) {
						loader.remove()
						showError(err.message || 'Ошибка добавления наблюдателей')
					}
				})
			}
		})
	}

	const viewOrderFilesBtn = document.getElementById('view_order_files-button')
	if (viewOrderFilesBtn) {
		setupOrderFilesButton2(viewOrderFilesBtn)
	}

	const updateStatusButton = document.getElementById('update_status-button')
	if (updateStatusButton) {
		updateStatusButton.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			const table = selectedRow?.closest('table')
			const tableId = table?.id

			if (
				!selectedRow ||
				!tableId ||
				(!tableId.startsWith('product-orders-') &&
					!tableId.startsWith('orders-no-object-'))
			) {
				showError('Выберите расчет для изменения статуса.')
				return
			}

			const orderId = TableManager.getSelectedRowId(tableId)
			if (!orderId) {
				showError('Не удалось определить ID заказа.')
				return
			}

			const config = {
				submitUrl: `/commerce/orders/status/edit/`,
				getUrl: `/commerce/orders/`,
				tableId,
				formId: 'update-status-form',
				modalConfig: {
					url: '/components/commerce/update-status',
					title: `Изменить статус заказа №${orderId}`,
				},
				dataUrls: [
					{
						id: 'status',
						url: '/commerce/orders/statuses/',
					},
				],
				onSuccess: async result => {
					if (result.status === 'success' && result.html && result.id) {
						if (result.archived) {
							const rows = document.querySelectorAll(`#${tableId} tbody tr`)
							const archivedRow = Array.from(rows).find(tr => {
								const firstCell = tr.querySelector('td')
								return (
									firstCell &&
									firstCell.textContent.trim() === String(result.id)
								)
							})
							if (archivedRow) archivedRow.remove()
							showSuccess('Заказ убран в архив')
						} else {
							TableManager.updateTableRow(result, tableId)

							const updatedRow = Array.from(
								document.querySelectorAll(`#${tableId} tbody tr`),
							).find(tr => {
								const firstCell = tr.querySelector('td')
								return (
									firstCell &&
									firstCell.textContent.trim() === String(result.id)
								)
							})

							if (updatedRow) {
								updatedRow.classList.add('table__row--selected')
								TableManager.attachRowCellHandlers(updatedRow)
								TableManager.formatCurrencyValuesForRow(tableId, updatedRow)
								TableManager.applyColumnWidthsForRow(tableId, updatedRow)
							}

							showSuccess(result.message || 'Статус заказа успешно изменен')
						}
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(orderId)
		})
	}

	const updateDepartmentWorkStatusButton = document.getElementById(
		'update_department_work_status-button',
	)
	if (updateDepartmentWorkStatusButton) {
		updateDepartmentWorkStatusButton.addEventListener('click', async () => {
			const card = document.querySelector('.department-card--context-selected')
			if (!card) {
				showError('Выберите работу отдела')
				return
			}

			const orderId = card.dataset.orderId
			const departmentSlug = card.dataset.departmentSlug
			if (!orderId || !departmentSlug) {
				showError('Не удалось определить работу отдела')
				return
			}

			const config = {
				submitUrl: `/departments/${departmentSlug}/orders/update-status/${orderId}/`,
				getUrl: `/departments/${departmentSlug}/orders/`,
				formId: 'update-status-form',
				modalConfig: {
					url: '/components/departments/update_status',
					title: 'Сменить статус работы отдела',
				},
				dataUrls: [
					{
						id: 'status',
						url: `/departments/statuses/${departmentSlug}/`,
					},
				],
				onSuccess: async result => {
					if (result.status === 'success') {
						const statusEl = card.querySelector('.department-card__work-status')
						if (statusEl && result.status_name) {
							statusEl.textContent = result.status_name
						}
						updateDepartmentWorkCardActions(card, {
							is_active: result.is_active,
							started_at: result.started_at,
							completed_at: result.completed_at,
						})
						showSuccess(result.message || 'Статус успешно изменен')
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(orderId)
		})
	}

	const archiveOrderButton = document.getElementById('archive_order-button')
	if (archiveOrderButton) {
		archiveOrderButton.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			const table = selectedRow?.closest('table')
			const tableId = table?.id

			if (
				!selectedRow ||
				!tableId ||
				(!tableId.startsWith('product-orders-') &&
					!tableId.startsWith('orders-no-object-'))
			) {
				showError('Выберите заказ для архивации.')
				return
			}

			const orderId = TableManager.getSelectedRowId(tableId)
			if (!orderId) {
				showError('Не удалось определить ID заказа.')
				return
			}

			showQuestion(
				'Отправить заказ в архив?',
				'Архивация',
				async () => {
					const loader = createLoader()
					document.body.appendChild(loader)
					try {
						const resp = await fetch(`/commerce/orders/archive/${orderId}/`, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/json',
								'X-CSRFToken': getCSRFToken(),
							},
							credentials: 'same-origin',
						})
						const data = await resp.json()
						loader.remove()
						if (!resp.ok || data.status !== 'success') {
							showError(data.message || 'Ошибка архивации заказа')
							return
						}
						selectedRow.remove()
						showSuccess(data.message || 'Заказ отправлен в архив')
					} catch (err) {
						loader.remove()
						showError(err.message || 'Ошибка архивации заказа')
					}
				},
			)
		})
	}

	const goToClientButton = document.getElementById('go-to-client-button')
	if (goToClientButton) {
		goToClientButton.addEventListener('click', () => {
			if (!clientId) {
				showError('Не выбран клиент.')
				return
			}
			window.location.href = `/commerce/clients/?client_id=${clientId}`
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
		'tbody tr:not(.table__row--empty):not(.table__row--summary)',
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
					(it, i) => (it.style.background = i === active ? '#eef' : ''),
				)
				items[active].scrollIntoView({ block: 'nearest' })
			} else if (e.key === 'ArrowUp') {
				e.preventDefault()
				active = Math.max(active - 1, 0)
				items.forEach(
					(it, i) => (it.style.background = i === active ? '#eef' : ''),
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
					'.dadata-suggestions',
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

function initOrdersPagination() {
	return initTablePagination({
		tableId: 'orders-table',
		paginateUrl: `${BASE_URL}orders/list/paginate/`,
		rowIdsKey: 'order_ids',
	})
}

function initArchivePagination() {
	return initTablePagination({
		tableId: 'orders_archive-table',
		paginateUrl: `${BASE_URL}orders/archive/list/paginate/`,
		rowIdsKey: 'order_ids',
	})
}

function initTablePagination({
	tableId,
	paginateUrl,
	rowIdsKey = 'ids',
	onNoRows,
}) {
	const nextPageButton = document.getElementById('next-page')
	const lastPageButton = document.getElementById('last-page')
	const prevPageButton = document.getElementById('prev-page')
	const firstPageButton = document.getElementById('first-page')
	const currentPageInput = document.getElementById('current-page')
	const totalPagesSpan = document.getElementById('total-pages')
	const refreshButton = document.getElementById('refresh')

	if (
		!currentPageInput ||
		!totalPagesSpan ||
		!nextPageButton ||
		!lastPageButton ||
		!prevPageButton ||
		!firstPageButton
	) {
		return null
	}

	let currentFilters = {}
	let activeRequestController = null

	const updateButtons = (currentPage, totalPages) => {
		const isFirstPage = currentPage <= 1
		const isLastPage = currentPage >= totalPages

		nextPageButton.disabled = isLastPage
		lastPageButton.disabled = isLastPage
		prevPageButton.disabled = isFirstPage
		firstPageButton.disabled = isFirstPage
	}

	const fetchAndUpdateTable = async page => {
		const pageNum = Math.max(1, Number(page) || 1)
		const loader = createLoader()
		document.body.appendChild(loader)

		if (activeRequestController) {
			activeRequestController.abort()
		}
		const requestController = new AbortController()
		activeRequestController = requestController

		try {
			const query = new URLSearchParams({ page: String(pageNum) })
			if (currentFilters && Object.keys(currentFilters).length > 0) {
				query.set('filters', JSON.stringify(currentFilters))
			}

			const response = await fetch(`${paginateUrl}?${query.toString()}`, {
				signal: requestController.signal,
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const data = await response.json()

			if (response.ok && typeof data.html === 'string' && data.context) {
				TableManager.updateTable(data.html, tableId)

				const { current_page = 1, total_pages = 1 } = data.context
				const rowIds = Array.isArray(data.context[rowIdsKey])
					? data.context[rowIdsKey]
					: []

				currentPageInput.value = current_page
				currentPageInput.max = total_pages
				currentPageInput.disabled = total_pages <= 0
				totalPagesSpan.textContent = total_pages
				updateButtons(current_page, total_pages)

				let hasRows = false
				const tableElem = document.getElementById(tableId)
				if (tableElem) {
					const rows = tableElem.querySelectorAll(
						'tbody tr:not(.table__row--summary):not(.table__row--empty)',
					)
					hasRows = rows.length > 0
					if (hasRows && rowIds.length === rows.length) {
						rows.forEach((row, idx) => {
							row.setAttribute('data-id', rowIds[idx])
						})
					}
				}

				if (!hasRows && typeof onNoRows === 'function') {
					onNoRows()
				}
			} else {
				TableManager.updateTable('', tableId)
				currentPageInput.value = 1
				currentPageInput.max = 1
				currentPageInput.disabled = true
				totalPagesSpan.textContent = '1'
				updateButtons(1, 1)
				if (!response.ok) {
					showError(data?.error || data?.message || 'Ошибка загрузки данных.')
				}
			}
		} catch (err) {
			if (err?.name === 'AbortError') {
				return
			}
			console.error('Ошибка при загрузке страницы таблицы:', err)
			showError('Произошла ошибка при загрузке данных.')
		} finally {
			if (activeRequestController === requestController) {
				activeRequestController = null
			}
			loader.remove()
		}
	}

	TableManager.setServerFilterConfig(tableId, {
		debounceMs: 600,
		onFiltersChange: async filters => {
			currentFilters = filters || {}
			await fetchAndUpdateTable(1)
		},
	})

	refreshButton?.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput.value, 10) || 1
		fetchAndUpdateTable(currentPage)
	})
	nextPageButton.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput.value, 10) || 1
		fetchAndUpdateTable(currentPage + 1)
	})
	lastPageButton.addEventListener('click', () => {
		const totalPages =
			parseInt(totalPagesSpan.textContent || currentPageInput.max, 10) || 1
		fetchAndUpdateTable(totalPages)
	})
	prevPageButton.addEventListener('click', () => {
		const currentPage = parseInt(currentPageInput.value, 10) || 1
		fetchAndUpdateTable(Math.max(1, currentPage - 1))
	})
	firstPageButton.addEventListener('click', () => fetchAndUpdateTable(1))

	currentPageInput.addEventListener('input', () => {
		const totalPages =
			parseInt(totalPagesSpan.textContent || currentPageInput.max, 10) || 1
		let currentPage = parseInt(currentPageInput.value, 10)
		if (isNaN(currentPage) || currentPage < 1) currentPageInput.value = 1
		else if (currentPage > totalPages) currentPageInput.value = totalPages
	})

	currentPageInput.addEventListener('change', () => {
		const totalPages =
			parseInt(totalPagesSpan.textContent || currentPageInput.max, 10) || 1
		let targetPage = parseInt(currentPageInput.value, 10)
		if (isNaN(targetPage) || targetPage < 1) targetPage = 1
		else if (targetPage > totalPages) targetPage = totalPages
		currentPageInput.value = targetPage
		fetchAndUpdateTable(targetPage)
	})

	const initialPage = parseInt(currentPageInput.value, 10) || 1
	fetchAndUpdateTable(initialPage)

	return { fetchAndUpdateTable }
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
	let currentFilters = {}
	let activeRequestController = null

	const fetchAndUpdateClients = async page => {
		const pageNum = Math.max(1, Number(page) || 1)
		const loader = createLoader()
		document.body.appendChild(loader)

		if (activeRequestController) {
			activeRequestController.abort()
		}
		const requestController = new AbortController()
		activeRequestController = requestController

		try {
			const query = new URLSearchParams({ page: String(pageNum) })
			if (currentFilters && Object.keys(currentFilters).length > 0) {
				query.set('filters', JSON.stringify(currentFilters))
			}

			const response = await fetch(
				`${BASE_URL}clients/list/paginate/?${query.toString()}`,
				{
					signal: requestController.signal,
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				},
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
						'tbody tr:not(.table__row--summary):not(.table__row--empty)',
					)
					hasRows = rows && rows.length > 0
					if (rows && client_ids && client_ids.length === rows.length) {
						rows.forEach((row, idx) => {
							row.setAttribute('data-id', client_ids[idx])
						})
					}
				}

				if (!hasRows) {
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
						data?.error || data?.message || 'Ошибка загрузки списка клиентов.',
					)
				}
			}
		} catch (err) {
			if (err?.name === 'AbortError') {
				return
			}
			console.error('Ошибка при загрузке клиентов:', err)
			showError('Произошла ошибка при загрузке списка клиентов.')
			TableManager.updateTable('', clientsTableId)
		} finally {
			if (activeRequestController === requestController) {
				activeRequestController = null
			}
			loader.remove()
		}
	}

	TableManager.setServerFilterConfig(clientsTableId, {
		debounceMs: 600,
		onFiltersChange: async filters => {
			currentFilters = filters || {}
			await fetchAndUpdateClients(1)
		},
	})

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
		else if (targetPage > totalPages) targetPage = totalPages
		currentPageInput.value = targetPage
		fetchAndUpdateClients(targetPage)
	})

	const initialPage = parseInt(currentPageInput?.value, 10) || 1
	fetchAndUpdateClients(initialPage)

	// Handle client_id query parameter
	function getQueryParam(name) {
		const url = new URL(window.location.href)
		return url.searchParams.get(name)
	}

	const clientIdFromQuery = getQueryParam('client_id')
	if (clientIdFromQuery) {
		const observer = new MutationObserver(async () => {
			const table = document.getElementById(clientsTableId)
			if (!table) return

			const rows = table.querySelectorAll(
				'tbody tr:not(.table__row--empty):not(.table__row--summary)',
			)
			if (rows.length > 0) {
				// Find row with matching client_id
				for (const row of rows) {
					const dataId = row.getAttribute('data-id')
					if (dataId === clientIdFromQuery) {
						// Remove all previous selections from all rows and cells
						table
							.querySelectorAll('tbody tr.table__row--selected')
							.forEach(r => {
								r.classList.remove('table__row--selected')
							})
						table
							.querySelectorAll('tbody .table__cell--selected')
							.forEach(cell => {
								cell.classList.remove('table__cell--selected')
							})

						// Select this row and its first cell
						row.classList.add('table__row--selected')
						const firstCell = row.querySelector('.table__cell')
						if (firstCell) {
							firstCell.classList.add('table__cell--selected')
						}

						// Load client data and initialize contacts
						await loadClientToForm(Number(clientIdFromQuery))
						initGenericPage(configs['clients_contacts'])

						observer.disconnect()
						return
					}
				}
			}
		})

		observer.observe(document.getElementById(clientsTableId) || document.body, {
			childList: true,
			subtree: true,
		})
	}
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

	initArchivePagination()

	const viewButton = document.getElementById('view-button')

	if (viewButton) {
		viewButton.addEventListener('click', async () => {
			const modal = new Modal()
			const resp = await fetch('/components/commerce/order_documents', {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const html = await resp.text()
			await modal.open(html, 'Файлы заказа')
			addSwapButtonToModalHeader()
			hideUploadGroupInOrderFilesModal()

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
			documentsContainer.dataset.orderId = orderId ? String(orderId) : ''
			documentsContainer.dataset.viewType = 'table'
			documentsContainer.dataset.onlyMeasurements = '0'

			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				if (orderId) {
					const docsResp = await fetch(
						`${BASE_URL}documents/table/${orderId}/`,
						{
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						},
					)
					const data = await docsResp.json()
					if (docsResp.ok) {
						documentsContainer.innerHTML = data.html || ''

						try {
							const urls = Array.isArray(data.urls) ? data.urls : []
							if (urls.length) {
								const table =
									documentsContainer.querySelector(
										`table#order-documents-${orderId}`,
									) || documentsContainer.querySelector('table')
								if (table) {
									const ths = Array.from(table.querySelectorAll('thead th'))
									const fileColIndex = ths.findIndex(
										th =>
											th && th.dataset && th.dataset.name === 'file_display',
									)
									if (fileColIndex !== -1) {
										const rows = table.querySelectorAll(
											'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
								err,
							)
						}
					} else {
						documentsContainer.innerHTML = data.html || ''
						showError(
							data.error || data.message || 'Ошибка загрузки документов заказа',
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
				const canUploadNow = () =>
					updateUploadAvailabilityInOrderFilesModal(documentsContainer)
				canUploadNow()
				const modalRoot = document.querySelector('.modal')
				if (modalRoot) {
					bindPasteUploadToModal({
						modal: modalRoot,
						fileInput,
						canUpload: () =>
							isUploadAllowedInOrderFilesModal(documentsContainer),
					})
				}

				if (uploadBtn && fileInput) {
					uploadBtn.onclick = () => {
						if (!canUploadNow()) {
							showError(
								'Загрузка файлов сейчас недоступна для выбранной вкладки',
							)
							return
						}
						fileInput.click()
					}
				}

				if (fileInput) {
					fileInput.onchange = async () => {
						if (!canUploadNow()) {
							showError(
								'Загрузка файлов сейчас недоступна для выбранной вкладки',
							)
							try {
								fileInput.value = ''
							} catch (e) {}
							return
						}

						const f = fileInput.files && fileInput.files[0]
						if (!f) return

						if (!orderId) {
							showError('Не выбран заказ')
							fileInput.value = ''
							return
						}
						const initialFileTypeVal = fileTypeInput ? fileTypeInput.value : ''

						const modal = new Modal()
						const resp = await fetch('/components/commerce/file_name', {
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						})
						const html = await resp.text()
						await modal.open(html, 'Введите название файла')

						const form = document.getElementById('file_name-form')
						const nameInput = form.querySelector('#name')
						const modalFileTypeGroup = form.querySelector('#file_type_group')
						const modalFileTypeInput = form.querySelector('#file_type')
						let forcedFileTypeId = ''
						const measurementsSetup =
							await enforceMeasurementsTypeInUploadModal({
								documentsContainer,
								modalInstance: modal,
								modalFileTypeGroup,
								modalFileTypeInput,
							})
						if (!measurementsSetup.ok) {
							try {
								fileInput.value = ''
							} catch (e) {}
							return
						}
						forcedFileTypeId = measurementsSetup.forcedFileTypeId
						if (!initialFileTypeVal && modalFileTypeGroup) {
							modalFileTypeGroup.style.display = 'block'
							const modalSelect = modalFileTypeInput
								? modalFileTypeInput.closest('.select')
								: null
							if (modalSelect && !forcedFileTypeId) {
								SelectHandler.setupSelects({
									select: modalSelect,
									url: `${BASE_URL}documents/types/`,
								})
							}
						}
						nameInput.value = f.name.replace(/\.[^/.]+$/, '')
						nameInput.focus()

						return new Promise(resolve => {
							form.onsubmit = async e => {
								e.preventDefault()
								let newName = nameInput.value.trim()
								if (!newName) {
									showError('Имя файла не может быть пустым')
									return
								}
								const ext = f.name.substring(f.name.lastIndexOf('.'))
								const finalName = newName + ext

								const l = createLoader()
								document.body.appendChild(l)
								uploadBtn.disabled = true

								try {
									const fileTypeVal = (
										forcedFileTypeId ||
										(fileTypeInput ? fileTypeInput.value : '') ||
										(modalFileTypeInput ? modalFileTypeInput.value : '')
									).trim()
									if (!fileTypeVal) {
										if (modalFileTypeGroup)
											modalFileTypeGroup.style.display = 'block'
										showError('Выберите тип файла')
										uploadBtn.disabled = false
										return
									}

									const fd = new FormData()
									const fileWithNewName = new File([f], finalName, {
										type: f.type,
									})
									fd.append('file', fileWithNewName)
									fd.append('order', orderId)
									fd.append('file_type', fileTypeVal)
									fd.append('filename', finalName)

									const uploadResp = await fetch(
										`${BASE_URL}documents/upload/`,
										{
											method: 'POST',
											headers: {
												'X-CSRFToken': getCSRFToken(),
												'X-Requested-With': 'XMLHttpRequest',
											},
											credentials: 'same-origin',
											body: fd,
										},
									)

									const payload = await uploadResp.json()

									if (!uploadResp.ok || payload.status !== 'success') {
										showError(
											payload.message ||
												payload.error ||
												'Ошибка загрузки файла',
										)
									} else {
										const tableId = `order-documents-${orderId}`
										const newRow = await TableManager.addTableRow(
											payload,
											tableId,
										)
										if (
											newRow &&
											payload &&
											(payload.id || payload.pk) &&
											!newRow.hasAttribute('data-id')
										) {
											newRow.setAttribute(
												'data-id',
												String(payload.id || payload.pk),
											)
										}
										showSuccess('Файл успешно загружен')

										try {
											const table = document.getElementById(tableId)
											if (table && payload.url) {
												const ths = Array.from(
													table.querySelectorAll('thead th'),
												)
												const fileColIndex = ths.findIndex(
													th =>
														th &&
														th.dataset &&
														th.dataset.name === 'file_display',
												)
												if (fileColIndex !== -1) {
													const row = table.querySelector('tbody tr:last-child')
													if (row) {
														const cell = row.children[fileColIndex]
														if (cell) {
															const text = cell.textContent.trim()
															if (payload.url && text) {
																cell.innerHTML = `<a href="${payload.url}" target="_blank" rel="noopener noreferrer">${text}</a>`
															}
														}
													}
												}
											}
										} catch (e) {
											console.warn(
												'Не удалось применить ссылку к новой строке:',
												e,
											)
										}
									}
									modal.close()
								} catch (err) {
									showError(err.message || 'Ошибка загрузки файла')
								} finally {
									l.remove()
									uploadBtn.disabled = false
									try {
										fileInput.value = ''
									} catch (e) {}
								}
							}
							form.querySelector('.button--cancel').onclick = () => {
								modal.close()
								fileInput.value = ''
							}
						})
					}
				}
			} catch (e) {
				console.warn(
					'Ошибка инициализации загрузчика документов в модальном окне:',
					e,
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
							{ headers: { 'X-Requested-With': 'XMLHttpRequest' } },
						)
						const data = await docsResp2.json()
						if (docsResp2.ok) {
							documentsContainer.innerHTML = data.html || ''

							try {
								const urls = Array.isArray(data.urls) ? data.urls : []
								if (urls.length) {
									const table =
										documentsContainer.querySelector(
											`table#order-documents-${orderId}`,
										) || documentsContainer.querySelector('table')
									if (table) {
										const ths = Array.from(table.querySelectorAll('thead th'))
										const fileColIndex = ths.findIndex(
											th =>
												th && th.dataset && th.dataset.name === 'file_display',
										)

										if (fileColIndex !== -1) {
											const rows = table.querySelectorAll(
												'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
									err,
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
									e,
								)
							}
						} else {
							documentsContainer.innerHTML = data.html || ''
							showError(
								data.error ||
									data.message ||
									'Ошибка загрузки документов заказа',
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

	const updateStatusButton = document.getElementById('update_status-button')
	if (updateStatusButton) {
		updateStatusButton.addEventListener('click', async () => {
			const selectedRow = document.querySelector(
				'#orders_archive-table .table__row--selected',
			)
			if (!selectedRow) {
				showError('Выберите сделку для изменения статуса.')
				return
			}

			const firstCell = selectedRow.querySelector('td')
			const orderId = firstCell ? firstCell.textContent.trim() : null

			if (!orderId) {
				showError('Не удалось определить ID сделки.')
				return
			}

			const config = {
				submitUrl: `/commerce/orders/status/edit/`,
				getUrl: `/commerce/orders/`,
				tableId: 'orders_archive-table',
				formId: 'update-status-form',
				modalConfig: {
					url: '/components/commerce/update-status',
					title: `Изменить статус заказа №${orderId}`,
				},
				dataUrls: [
					{
						id: 'status',
						url: '/commerce/orders/statuses/',
					},
				],
				onSuccess: async result => {
					if (result.status !== 'success' || !result.id) return

					if (!result.archived) {
						const rows = document.querySelectorAll(
							'#orders_archive-table tbody tr',
						)
						const rowToRemove = Array.from(rows).find(tr => {
							const cell = tr.querySelector('td')
							return cell && cell.textContent.trim() === String(result.id)
						})

						if (rowToRemove) rowToRemove.remove()
						showSuccess('Сделка убрана из архива')
						return
					}

					showSuccess(result.message || 'Статус сделки успешно изменен')
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(orderId)
		})
	}

	document.addEventListener('dblclick', function (e) {
		const row = e.target.closest(
			'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
					new MouseEvent('click', { bubbles: true, cancelable: true }),
				)
			}
		}
	})
}

function getDragAfterElement(list, y) {
	const items = [...list.querySelectorAll('.menu-item-row:not(.dragging)')]
	return items.reduce(
		(closest, child) => {
			const box = child.getBoundingClientRect()
			const offset = y - box.top - box.height / 2
			if (offset < 0 && offset > closest.offset) {
				return { offset: offset, element: child }
			} else {
				return closest
			}
		},
		{ offset: -Infinity, element: null },
	).element
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
		{ name: 'department_work_created' },
		{ name: 'department_started' },
		{ name: 'department_completed' },
		{ name: 'legal_name' },
	])

	function getQueryParam(name) {
		const url = new URL(window.location.href)
		return url.searchParams.get(name)
	}

	const orderIdFromQuery = getQueryParam('order_id')
	if (orderIdFromQuery) {
		const observer = new MutationObserver(() => {
			const idInput = document.querySelector(
				'#department_orders-table thead input[name="id"]',
			)
			if (idInput) {
				idInput.value = orderIdFromQuery
				idInput.dispatchEvent(new Event('input', { bubbles: true }))
				idInput.dispatchEvent(new Event('change', { bubbles: true }))
				observer.disconnect()
			}
		})
		observer.observe(document.getElementById('department_orders-table'), {
			childList: true,
			subtree: true,
		})
	}

	const orderIds = JSON.parse(
		document.getElementById('order-ids').textContent || '[]',
	)

	setIds(orderIds, tableId)

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
				submitUrl: `/departments/${departmentSlug}/orders/assign-executor/`,
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
				submitUrl: `/departments/${departmentSlug}/orders/update-status/`,
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
		setupOrderFilesButton2(viewOrderFilesBtn)
	}

	document.addEventListener('dblclick', function (e) {
		const row = e.target.closest(
			'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
						`.view_order_files-button[data-row-id="${rowId}"]`,
					) || null
			}
		}

		if (viewBtn) {
			try {
				viewBtn.click()
			} catch (err) {
				viewBtn.dispatchEvent(
					new MouseEvent('click', { bubbles: true, cancelable: true }),
				)
			}
		}
	})

	const viewCorrespondenceBtn = document.getElementById(
		'view_correspondence-button',
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

			let orderWorkId = null

			try {
				const orderWorkResp = await fetch(
					`/departments/${departmentSlug}/orders/${orderId}/work/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					},
				)

				if (!orderWorkResp.ok) {
					loader.remove()
					showError('Не удалось получить данные о работе отдела')
					return
				}

				const orderWorkData = await orderWorkResp.json()
				orderWorkId = orderWorkData.order_work_id

				if (!orderWorkId) {
					loader.remove()
					showError('Работа отдела не найдена для этого заказа')
					return
				}

				async function loadMessages(type) {
					let url, title

					if (type === 'order') {
						url = `/departments/work-messages/0/?order_id=${orderId}`
						title = `Переписка по заказу №${orderId}`
					} else {
						url = `/departments/work-messages/${orderWorkId}/`
						title = `Переписка отдела по заказу №${orderId}`
					}

					const messagesResp = await fetch(url, {
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					})
					const messagesData = await messagesResp.json()

					const modalBody = document.querySelector('.modal__body')
					if (!modalBody) return

					let messagesHtml = messagesData.html

					let isEmpty = false
					if (messagesHtml) {
						const tbodyMatch = messagesHtml.match(
							/<tbody[^>]*>([\s\S]*?)<\/tbody>/i,
						)
						if (tbodyMatch) {
							const tbodyContent = tbodyMatch[1].trim()
							isEmpty = !/<tr[\s\S]*?>[\s\S]*?<\/tr>/i.test(tbodyContent)
							if (isEmpty) {
								messagesHtml = messagesHtml.replace(
									/<tbody[^>]*>[\s\S]*?<\/tbody>/i,
									`<tbody>
                    <tr class="table__row--empty">
                        <td colspan="100%" style="text-align: center; padding: 20px;">
                            Нет сообщений
                        </td>
                    </tr>
                </tbody>`,
								)
							}
						}
					}
					if (!messagesHtml) {
						messagesHtml = `
        <table class="table">
            <thead>
                <tr><th>Сообщение</th></tr>
            </thead>
            <tbody>
                <tr class="table__row--empty">
                    <td colspan="100%" style="text-align: center; padding: 20px;">
                        Нет сообщений
                    </td>
                </tr>
            </tbody>
        </table>
    `
					}

					modalBody.innerHTML = `
        <div style="margin: 16px 8px; display: flex; gap: 8px;">
            <button id="switch-to-order" class="button button--small${
							type === 'order' ? ' button--primary' : ''
						}">Сообщения заказа</button>
            <button id="switch-to-department" class="button button--small${
							type === 'department' ? ' button--primary' : ''
						}">Сообщения отдела</button>
        </div>
        <div class="correspondence-container" id="messages-container">
            ${messagesHtml}
        </div>
    `

					document.getElementById('switch-to-order').onclick = () =>
						loadMessages('order')
					document.getElementById('switch-to-department').onclick = () =>
						loadMessages('department')

					try {
						const table = document.querySelector('#messages-container table')
						if (table && messagesData.messages_meta) {
							const ths = Array.from(table.querySelectorAll('thead th'))
							const authorColIndex = ths.findIndex(
								th => th && th.dataset && th.dataset.name === 'author',
							)

							if (authorColIndex !== -1) {
								const rows = table.querySelectorAll(
									'tbody tr:not(.table__row--summary):not(.table__row--empty)',
								)

								messagesData.messages_meta.forEach((meta, idx) => {
									if (meta.unread_type && rows[idx]) {
										const authorCell = rows[idx].children[authorColIndex]
										if (authorCell) {
											const old = authorCell.querySelector('.unread-indicator')
											if (old) old.remove()

											let indicator = document.createElement('span')
											indicator.className = 'unread-indicator'
											indicator.style.display = 'inline-block'
											indicator.style.verticalAlign = 'middle'
											indicator.style.marginRight = '6px'
											indicator.style.marginBottom = '2px'

											if (meta.unread_type === 'sent') {
												indicator.innerHTML = `<img src="/static/images/check_one.svg" alt="Не прочитано" style="width:14px;height:14px;vertical-align:middle;">`
												indicator.title = 'Ваше сообщение не прочитано'
											} else if (meta.unread_type === 'sent_read') {
												indicator.innerHTML = `<img src="/static/images/check_two.svg" alt="Прочитано" style="width:14px;height:14px;vertical-align:middle;">`
												indicator.title = 'Ваше сообщение прочитали'
											} else if (meta.unread_type === 'received') {
												indicator.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:50%;"></span>`
												indicator.title = 'Новое сообщение для вас'
											}

											authorCell.insertBefore(indicator, authorCell.firstChild)
										}
									}
								})
							}
						}
					} catch (e) {
						console.warn(
							'Не удалось добавить индикаторы непрочитанных сообщений:',
							e,
						)
					}

					try {
						const table = document.querySelector('#messages-container table')
						if (table) {
							table.id =
								type === 'order'
									? `order-messages-${orderId}`
									: `order-work-messages-${orderWorkId}`
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
							type === 'order'
								? `order-messages-${orderId}`
								: `order-work-messages-${orderWorkId}`,
						)
					}
				}

				const modal = new Modal()
				await modal.open(
					'<div class="modal__body"></div>',
					`Переписка по заказу №${orderId}`,
				)
				loader.remove()

				loadMessages('department')
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
			const tableIdOrderMatch = messagesTable.id.match(/order-messages-(\d+)/)
			let orderWorkId = null
			let orderId = null
			let isOrderMessagesTab = false

			if (tableIdMatch && tableIdMatch[1]) {
				orderWorkId = tableIdMatch[1]
			} else if (tableIdOrderMatch && tableIdOrderMatch[1]) {
				orderId = tableIdOrderMatch[1]
				isOrderMessagesTab = true
			}
			if (!orderWorkId && !orderId) {
				showError('Не удалось определить ID работы отдела или заказа')
				return
			}

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
					isOrderMessagesTab
						? {
								id: 'recipient',
								url: `/users/orders/${orderId}/users/`,
							}
						: {
								id: 'recipient',
								url: `/departments/users/${departmentSlug}/?order_work_id=${orderWorkId}`,
							},
				],
				onSuccess: async result => {
					if (
						result.status === 'success' &&
						result.html &&
						result.message_meta
					) {
						const tbody = messagesTable.querySelector('tbody')
						if (tbody) {
							const emptyRow = tbody.querySelector('.table__row--empty')
							if (emptyRow) emptyRow.remove()

							tbody.insertAdjacentHTML('afterbegin', result.html)
							const newRow = tbody.firstElementChild

							if (newRow && newRow.tagName === 'TR') {
								if (result.id && !newRow.hasAttribute('data-id')) {
									newRow.setAttribute('data-id', String(result.id))
								}

								try {
									const ths = Array.from(
										messagesTable.querySelectorAll('thead th'),
									)
									const authorColIndex = ths.findIndex(
										th => th && th.dataset && th.dataset.name === 'author',
									)

									if (
										authorColIndex !== -1 &&
										result.message_meta &&
										result.message_meta.unread_type
									) {
										const authorCell = newRow.children[authorColIndex]
										if (authorCell) {
											const old = authorCell.querySelector('.unread-indicator')
											if (old) old.remove()

											let indicator = document.createElement('span')
											indicator.className = 'unread-indicator'
											indicator.style.display = 'inline-block'
											indicator.style.verticalAlign = 'middle'
											indicator.style.marginRight = '6px'
											indicator.style.marginBottom = '2px'

											if (result.message_meta.unread_type === 'sent') {
												indicator.innerHTML = `<img src="/static/images/check_one.svg" alt="Не прочитано" style="width:14px;height:14px;vertical-align:middle;">`
												indicator.title = 'Ваше сообщение не прочитано'
											} else if (
												result.message_meta.unread_type === 'sent_read'
											) {
												indicator.innerHTML = `<img src="/static/images/check_two.svg" alt="Прочитано" style="width:14px;height:14px;vertical-align:middle;">`
												indicator.title = 'Ваше сообщение прочитали'
											} else if (
												result.message_meta.unread_type === 'received'
											) {
												indicator.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:50%;"></span>`
												indicator.title = 'Новое сообщение для вас'
											}

											authorCell.insertBefore(indicator, authorCell.firstChild)
										}
									}
								} catch (e) {
									console.warn(
										'Не удалось добавить индикатор к новому сообщению:',
										e,
									)
								}

								TableManager.attachRowCellHandlers(newRow)
								TableManager.formatCurrencyValuesForRow(
									messagesTable.id,
									newRow,
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
				if (!hiddenInput && orderWorkId) {
					hiddenInput = document.createElement('input')
					hiddenInput.type = 'hidden'
					hiddenInput.id = 'order_work'
					hiddenInput.name = 'order_work'
					messageForm.appendChild(hiddenInput)
				}
				if (hiddenInput && orderWorkId) hiddenInput.value = orderWorkId

				if (isOrderMessagesTab) {
					let orderInput = messageForm.querySelector('#order')
					if (!orderInput) {
						orderInput = document.createElement('input')
						orderInput.type = 'hidden'
						orderInput.id = 'order'
						orderInput.name = 'order'
						messageForm.appendChild(orderInput)
					}
					orderInput.value = orderId
				}
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
							existingRow,
						)

						existingRow.outerHTML = result.html

						const newRow = tbody.children[existingRowIndex]

						if (newRow && newRow.tagName === 'TR') {
							if (rowId && !newRow.hasAttribute('data-id')) {
								newRow.setAttribute('data-id', String(rowId))
							}

							try {
								const ths = Array.from(
									messagesTable.querySelectorAll('thead th'),
								)
								const authorColIndex = ths.findIndex(
									th => th && th.dataset && th.dataset.name === 'author',
								)

								if (
									authorColIndex !== -1 &&
									result.message_meta &&
									result.message_meta.unread_type
								) {
									const authorCell = newRow.children[authorColIndex]
									if (authorCell) {
										const old = authorCell.querySelector('.unread-indicator')
										if (old) old.remove()

										let indicator = document.createElement('span')
										indicator.className = 'unread-indicator'
										indicator.style.display = 'inline-block'
										indicator.style.verticalAlign = 'middle'
										indicator.style.marginRight = '6px'
										indicator.style.marginBottom = '2px'

										if (result.message_meta.unread_type === 'sent') {
											indicator.innerHTML = `<img src="/static/images/check_one.svg" alt="Не прочитано" style="width:14px;height:14px;vertical-align:middle;">`
											indicator.title = 'Ваше сообщение не прочитано'
										} else if (
											result.message_meta.unread_type === 'sent_read'
										) {
											indicator.innerHTML = `<img src="/static/images/check_two.svg" alt="Прочитано" style="width:14px;height:14px;vertical-align:middle;">`
											indicator.title = 'Ваше сообщение прочитали'
										} else if (result.message_meta.unread_type === 'received') {
											indicator.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:50%;"></span>`
											indicator.title = 'Новое сообщение для вас'
										}

										authorCell.insertBefore(indicator, authorCell.firstChild)
									}
								}
							} catch (e) {
								console.warn(
									'Не удалось обновить индикатор непрочитанности:',
									e,
								)
							}

							TableManager.attachRowCellHandlers(newRow)
							TableManager.formatCurrencyValuesForRow(messagesTable.id, newRow)
							TableManager.applyColumnWidthsForRow(messagesTable.id, newRow)

							showSuccess('Сообщение успешно обновлено')
						} else {
							console.warn(
								'Не удалось найти или заменить строку после обновления',
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
							},
						)

						const data = await resp.json()
						loader.remove()

						if (!resp.ok || data.status !== 'success') {
							showError(
								data.message || data.error || 'Ошибка при удалении сообщения',
							)
							return
						}

						selectedRow.remove()

						const remainingRows = messagesTable.querySelectorAll(
							'tbody tr:not(.table__row--summary):not(.table__row--empty)',
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
				},
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
			const tableIdOrderMatch = messagesTable.id.match(/order-messages-(\d+)/)

			let url = null

			if (tableIdMatch && tableIdMatch[1]) {
				const orderWorkId = tableIdMatch[1]
				url = `${DEPARTMENTS_BASE_URL}work-messages/${orderWorkId}/`
			} else if (tableIdOrderMatch && tableIdOrderMatch[1]) {
				const orderId = tableIdOrderMatch[1]
				url = `${DEPARTMENTS_BASE_URL}work-messages/0/?order_id=${orderId}`
			} else {
				showError('Не удалось определить ID работы отдела или заказа')
				return
			}

			const loader = createLoader()
			document.body.appendChild(loader)

			try {
				const messagesResp = await fetch(url, {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})

				const messagesData = await messagesResp.json()
				loader.remove()

				if (!messagesResp.ok) {
					showError(
						messagesData.error ||
							messagesData.message ||
							'Ошибка загрузки сообщений',
					)
					return
				}

				messagesContainer.innerHTML =
					messagesData.html ||
					`
                                    <tr class="table__row--empty">
                                        <td colspan="100%" style="text-align: center; padding: 20px;">
                                            Нет сообщений
                                        </td>
                                    </tr>
                                `

				try {
					const messagesResp = await fetch(url, {
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					})

					const messagesData = await messagesResp.json()
					loader.remove()

					if (!messagesResp.ok) {
						showError(
							messagesData.error ||
								messagesData.message ||
								'Ошибка загрузки сообщений',
						)
						return
					}

					messagesContainer.innerHTML =
						messagesData.html ||
						`
                                    <tr class="table__row--empty">
                                        <td colspan="100%" style="text-align: center; padding: 20px;">
                                            Нет сообщений
                                        </td>
                                    </tr>
                                `

					try {
						const table = messagesContainer.querySelector('table')
						if (table && messagesData.messages_meta) {
							const ths = Array.from(table.querySelectorAll('thead th'))
							const authorColIndex = ths.findIndex(
								th => th && th.dataset && th.dataset.name === 'author',
							)

							if (authorColIndex !== -1) {
								const rows = table.querySelectorAll(
									'tbody tr:not(.table__row--summary):not(.table__row--empty)',
								)

								messagesData.messages_meta.forEach((meta, idx) => {
									if (meta.unread_type && rows[idx]) {
										const authorCell = rows[idx].children[authorColIndex]
										if (authorCell) {
											const old = authorCell.querySelector('.unread-indicator')
											if (old) old.remove()

											let indicator = document.createElement('span')
											indicator.className = 'unread-indicator'
											indicator.style.display = 'inline-block'
											indicator.style.verticalAlign = 'middle'
											indicator.style.marginRight = '6px'
											indicator.style.marginBottom = '2px'

											if (meta.unread_type === 'sent') {
												indicator.innerHTML = `<img src="/static/images/check_one.svg" alt="Не прочитано" style="width:14px;height:14px;vertical-align:middle;">`
												indicator.title = 'Ваше сообщение не прочитано'
											} else if (meta.unread_type === 'sent_read') {
												indicator.innerHTML = `<img src="/static/images/check_two.svg" alt="Прочитано" style="width:14px;height:14px;vertical-align:middle;">`
												indicator.title = 'Ваше сообщение прочитали'
											} else if (meta.unread_type === 'received') {
												indicator.innerHTML = `<span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:50%;"></span>`
												indicator.title = 'Новое сообщение для вас'
											}

											authorCell.insertBefore(indicator, authorCell.firstChild)
										}
									}
								})
							}
						}
					} catch (e) {
						console.warn(
							'Не удалось добавить индикаторы непрочитанных сообщений:',
							e,
						)
					}

					try {
						const table = messagesContainer.querySelector('table')
						if (table) {
							if (!table.id) {
								if (tableIdMatch && tableIdMatch[1]) {
									table.id = `order-work-messages-${tableIdMatch[1]}`
								} else if (tableIdOrderMatch && tableIdOrderMatch[1]) {
									table.id = `order-messages-${tableIdOrderMatch[1]}`
								}
							}
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
							tableIdMatch && tableIdMatch[1]
								? `order-work-messages-${tableIdMatch[1]}`
								: `order-messages-${tableIdOrderMatch[1]}`,
						)
					}

					showSuccess('Сообщения обновлены')
				} catch (err) {
					loader.remove()
					showError(err.message || 'Ошибка при обновлении сообщений')
				}

				if (messagesData.messages_id_list) {
					setIds(
						messagesData.messages_id_list,
						tableIdMatch && tableIdMatch[1]
							? `order-work-messages-${tableIdMatch[1]}`
							: `order-messages-${tableIdOrderMatch[1]}`,
					)
				}

				showSuccess('Сообщения обновлены')
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка при обновлении сообщений')
			}
		})
	}

	const emergencyButton = document.getElementById('emergency-button')
	if (emergencyButton) {
		emergencyButton.addEventListener('click', async () => {
			const selectedRow = document.querySelector('.table__row--selected')
			if (!selectedRow) {
				showError('Выберите заказ для просмотра аварий')
				return
			}

			const orderIdCell = selectedRow.querySelector('td:first-child')
			const orderId = orderIdCell?.textContent.trim()

			if (!orderId) {
				showError('Не удалось определить ID заказа')
				return
			}

			const orderDepartmentWorkId =
				selectedRow.getAttribute('data-id') || orderId

			const modal = new Modal()
			await modal.open('<div id="emergencies-container"></div>', 'Аварии')

			const container = document.getElementById('emergencies-container')
			const loader = createLoader()
			document.body.appendChild(loader)

			try {
				const resp = await fetch(
					`/commerce/emergencies/list/${orderDepartmentWorkId}/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					},
				)
				const data = await resp.json()
				loader.remove()

				if (resp.ok) {
					container.innerHTML = data.html || ''

					const tbody = container.querySelector('tbody')
					if (tbody) {
						const hasRows = tbody.querySelector(
							'tr:not(.table__row--empty):not(.table__row--summary)',
						)
						if (!hasRows) {
							tbody.innerHTML =
								'<tr class="table__row"><td colspan="100%" style="text-align: center; padding: 20px; max-width: 90px;">Нет аварий</td></tr>'
						}
					}

					const table = container.querySelector('table')
					if (table) {
						table.id = data.table_id || `emergencies-${orderDepartmentWorkId}`
						TableManager.initTable(table.id)
						table.querySelectorAll('tbody tr').forEach(row => {
							TableManager.attachRowCellHandlers(row)
							TableManager.formatCurrencyValuesForRow(table.id, row)
							TableManager.applyColumnWidthsForRow(table.id, row)
						})
					}

					if (data.ids) {
						setIds(
							data.ids,
							data.table_id || `emergencies-${orderDepartmentWorkId}`,
						)
					}
				} else {
					container.innerHTML = '<div class="info">Ошибка загрузки аварий</div>'
					showError(data.message || 'Ошибка загрузки аварий')
				}
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка загрузки аварий')
			}
		})
	}

	const addEmergencyButton = document.getElementById('add-emergency-button')
	if (addEmergencyButton) {
		addEmergencyButton.addEventListener('click', async () => {
			const table = document.querySelector('table[id^="emergencies-"]')
			if (!table) {
				showError('Таблица аварий не найдена')
				return
			}
			const orderDepartmentWorkId = table.id.replace('emergencies-', '')
			if (!orderDepartmentWorkId) {
				showError('Не удалось определить ID работы отдела')
				return
			}

			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				const workResp = await fetch(
					`/departments/work/${orderDepartmentWorkId}/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					},
				)
				const workData = await workResp.json()
				loader.remove()
				if (!workResp.ok) {
					showError('Не удалось получить данные работы отдела')
					return
				}

				const modal = new Modal()
				const resp = await fetch('/components/commerce/add_emergency', {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				const html = await resp.text()
				await modal.open(html, 'Добавить аварию')

				const orderInput = document.getElementById('order')
				const departmentInput = document.getElementById('department')
				if (orderInput) orderInput.value = workData.order_id || ''
				if (departmentInput)
					departmentInput.value = workData.department_id || ''

				const resolverSelect = document.getElementById('resolver')
				if (resolverSelect) {
					const selectWrapper = resolverSelect.closest('.select')
					if (selectWrapper) {
						SelectHandler.setupSelects({
							select: selectWrapper,
							url: `/users/departments/${workData.department_id}/workers/`,
						})
					}
				}

				const form = document.getElementById('emergency-form')
				if (form) {
					form.onsubmit = async e => {
						e.preventDefault()
						const formData = new FormData(form)
						const submitResp = await fetch('/commerce/emergencies/create/', {
							method: 'POST',
							headers: {
								'X-CSRFToken': getCSRFToken(),
							},
							body: formData,
						})
						const data = await submitResp.json()
						if (submitResp.ok && data.status === 'success') {
							showSuccess('Авария успешно добавлена')
							modal.close()
							const emergenciesContainer = document.getElementById(
								'emergencies-container',
							)
							if (emergenciesContainer) {
								const listResp = await fetch(
									`/commerce/emergencies/list/${orderDepartmentWorkId}/`,
									{
										headers: { 'X-Requested-With': 'XMLHttpRequest' },
									},
								)
								const listData = await listResp.json()
								if (listResp.ok) {
									emergenciesContainer.innerHTML = listData.html || ''
									const updatedTable =
										emergenciesContainer.querySelector('table')
									if (updatedTable) {
										updatedTable.id =
											listData.table_id ||
											`emergencies-${orderDepartmentWorkId}`
										TableManager.initTable(updatedTable.id)
										updatedTable.querySelectorAll('tbody tr').forEach(row => {
											TableManager.attachRowCellHandlers(row)
											TableManager.formatCurrencyValuesForRow(
												updatedTable.id,
												row,
											)
											TableManager.applyColumnWidthsForRow(updatedTable.id, row)
										})
										if (listData.ids) {
											setIds(listData.ids, updatedTable.id)
										}
									}
								}
							}
						} else {
							showError(data.message || 'Ошибка добавления аварии')
						}
					}

					const cancelBtn = form.querySelector('.button--cancel')
					if (cancelBtn) {
						cancelBtn.onclick = () => modal.close()
					}
				}
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка загрузки формы добавления аварии')
			}
		})
	}

	const editEmergencyButton = document.getElementById('edit-emergency-button')
	if (editEmergencyButton) {
		editEmergencyButton.addEventListener('click', async () => {
			const table = document.querySelector('table[id^="emergencies-"]')
			if (!table) {
				showError('Таблица аварий не найдена')
				return
			}

			let selectedRow =
				table.querySelector('tbody tr.table__row--selected') ||
				table.querySelector('tbody tr td.table__cell--selected')?.closest('tr')
			if (!selectedRow) {
				showError('Выберите аварию для редактирования')
				return
			}

			const emergencyId =
				selectedRow.getAttribute('data-id') ||
				selectedRow.querySelector('td')?.textContent?.trim()
			if (!emergencyId) {
				showError('Не удалось определить ID аварии')
				return
			}

			const orderDepartmentWorkId = table.id.replace('emergencies-', '')

			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				const detailResp = await fetch(
					`/commerce/emergencies/${emergencyId}/`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					},
				)
				const detailData = await detailResp.json()
				loader.remove()
				if (!detailResp.ok) {
					showError('Не удалось загрузить данные аварии')
					return
				}

				const modal = new Modal()
				const resp = await fetch('/components/commerce/add_emergency', {
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				})
				const html = await resp.text()
				await modal.open(html, 'Редактировать аварию')

				const workLoader = createLoader()
				document.body.appendChild(workLoader)
				try {
					const workResp = await fetch(
						`/departments/work/${orderDepartmentWorkId}/`,
						{
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						},
					)
					const workData = await workResp.json()
					workLoader.remove()
					if (!workResp.ok) {
						showError('Не удалось получить данные работы отдела')
						return
					}

					const resolverSelect = document.getElementById('resolver')
					if (resolverSelect) {
						const selectWrapper = resolverSelect.closest('.select')
						if (selectWrapper) {
							SelectHandler.setupSelects({
								select: selectWrapper,
								url: `/users/departments/${workData.department_id}/workers/`,
							})
							await SelectHandler.populateSelectOptions(
								selectWrapper,
								`/users/departments/${workData.department_id}/workers/`,
							)
						}
					}

					const orderInput = document.getElementById('order')
					const departmentInput = document.getElementById('department')
					if (orderInput) orderInput.value = workData.order_id || ''
					if (departmentInput)
						departmentInput.value = workData.department_id || ''

					const descriptionInput = document.getElementById('description')
					const resolverInput = document.getElementById('resolver')
					if (descriptionInput && detailData.data.description) {
						descriptionInput.value = detailData.data.description
					}
					if (resolverInput && detailData.data.resolver) {
						resolverInput.value = detailData.data.resolver
						const selectWrapper = resolverInput.closest('.select')
						if (selectWrapper) {
							SelectHandler.restoreSelectValue(
								selectWrapper,
								detailData.data.resolver,
							)
						}
					}

					const form = document.getElementById('emergency-form')
					if (form) {
						form.onsubmit = async e => {
							e.preventDefault()
							const formData = new FormData(form)
							if (formData.has('resolver')) {
								formData.set('resolver_id', formData.get('resolver'))
								formData.delete('resolver')
							}
							const submitResp = await fetch(
								`/commerce/emergencies/update/${emergencyId}/`,
								{
									method: 'POST',
									headers: {
										'X-CSRFToken': getCSRFToken(),
									},
									body: formData,
								},
							)
							const data = await submitResp.json()
							if (submitResp.ok && data.status === 'success') {
								showSuccess('Авария успешно обновлена')
								modal.close()
								if (data.html) {
									selectedRow.outerHTML = data.html
									const newRow = table.querySelector(
										`tbody tr[data-id="${emergencyId}"]`,
									)
									if (newRow) {
										TableManager.attachRowCellHandlers(newRow)
										TableManager.formatCurrencyValuesForRow(table.id, newRow)
										TableManager.applyColumnWidthsForRow(table.id, newRow)
									}
								}
							} else {
								showError(data.message || 'Ошибка обновления аварии')
							}
						}

						const cancelBtn = form.querySelector('.button--cancel')
						if (cancelBtn) {
							cancelBtn.onclick = () => modal.close()
						}
					}
				} catch (workErr) {
					workLoader.remove()
					showError(workErr.message || 'Ошибка загрузки данных работы отдела')
					return
				}
			} catch (err) {
				loader.remove()
				showError(err.message || 'Ошибка загрузки формы редактирования аварии')
			}
		})
	}

	const closeEmergencyButton = document.getElementById('close-emergency-button')
	if (closeEmergencyButton) {
		closeEmergencyButton.addEventListener('click', async () => {
			const table = document.querySelector('table[id^="emergencies-"]')
			if (!table) {
				showError('Таблица аварий не найдена')
				return
			}

			let selectedRow =
				table.querySelector('tbody tr.table__row--selected') ||
				table.querySelector('tbody tr td.table__cell--selected')?.closest('tr')
			if (!selectedRow) {
				showError('Выберите аварию для закрытия')
				return
			}

			const emergencyId =
				selectedRow.getAttribute('data-id') ||
				selectedRow.querySelector('td')?.textContent?.trim()
			if (!emergencyId) {
				showError('Не удалось определить ID аварии')
				return
			}

			showQuestion(
				'Вы действительно хотите закрыть аварию?',
				'Закрытие аварии',
				async () => {
					const loader = createLoader()
					document.body.appendChild(loader)
					try {
						const resp = await fetch('/commerce/emergencies/resolve/', {
							method: 'POST',
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'X-CSRFToken': getCSRFToken(),
							},
							body: `emergency_id=${encodeURIComponent(emergencyId)}`,
						})
						const data = await resp.json()
						loader.remove()
						if (!resp.ok || data.status !== 'success') {
							showError(data.message || 'Ошибка закрытия аварии')
							return
						}
						if (data.html) {
							selectedRow.outerHTML = data.html
							const newRow = table.querySelector(
								`tbody tr[data-id="${emergencyId}"]`,
							)
							if (newRow) {
								TableManager.attachRowCellHandlers(newRow)
								TableManager.formatCurrencyValuesForRow(table.id, newRow)
								TableManager.applyColumnWidthsForRow(table.id, newRow)
							}
						}
						showSuccess('Авария успешно закрыта')
					} catch (err) {
						loader.remove()
						showError(err.message || 'Ошибка закрытия аварии')
					}
				},
			)
		})
	}
}

function initEnterpriseBalanceReportPage() {
	document.querySelectorAll('.debtors-office-list__row').forEach(row => {
		row.addEventListener('click', async function (e) {
			const li = row.closest('.debtors-office-list__item')
			if (!li) return
			const content = li.querySelector('.expand-content')
			if (!content) return

			const toggle = row.querySelector('.debtors-office-list__toggle')
			if (!content.hasAttribute('data-loaded')) {
				content.innerHTML = '<div class="loader">Загрузка...</div>'
				const type = row.querySelector('.debtors-office-list__toggle')?.dataset
					.type
				if (!type) return
				const resp = await fetch(
					`/ledger/enterprise-balance-expand/?type=${type}`,
					{
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					},
				)
				const data = await resp.json()
				content.innerHTML = data.html
				const tbody = content.querySelector('tbody')
				if (tbody && tbody.children.length === 0) {
					tbody.style.height = '50px'
				}
				content.setAttribute('data-loaded', '1')
				content.style.display = ''
				if (toggle) toggle.classList.add('open')
				TableManager.init()

				Object.keys(ENTERPRISE_BALANCE_MODEL_MAP).forEach(tableId => {
					if (content.querySelector(`#${tableId}`)) {
						setupEnterpriseBalanceTable(tableId)
					}
				})
			} else {
				const isOpen =
					content.style.display === '' || content.style.display === 'block'
				content.style.display = isOpen ? 'none' : ''
				if (toggle) {
					if (isOpen) {
						toggle.classList.remove('open')
					} else {
						toggle.classList.add('open')
					}
				}
			}
		})
	})
	drawCapitalProfitabilityChart()
}

async function drawCapitalProfitabilityChart() {
	const ctx = document.getElementById('statsChart').getContext('2d')
	const response = await fetch('/ledger/capital-by-month/')
	const data = await response.json()

	// Пример структуры: { months: ['Янв', 'Фев', ...], profitability: [2.1, 3.5, ...] }
	const labels = data.months
	const values = data.capitals

	// Найти красивый максимум для оси Y
	function getNiceMax(value) {
		if (value <= 10) return 10
		if (value <= 100) return Math.ceil(value / 10) * 10
		if (value <= 1000) return Math.ceil(value / 100) * 100
		return Math.ceil(value / 1000) * 1000
	}
	const yMax = getNiceMax(Math.max(...values) * 1.1)

	// Удаляем старый график, если есть
	if (window.capitalProfitabilityChart) {
		window.capitalProfitabilityChart.destroy()
	}

	window.capitalProfitabilityChart = new Chart(ctx, {
		type: 'bar',
		data: {
			labels: labels,
			datasets: [
				{
					label: '',
					data: values,
					backgroundColor: 'rgba(54, 162, 235, 0.5)',
					borderColor: 'rgba(54, 162, 235, 1)',
					borderWidth: 1,
					borderRadius: 6,
					maxBarThickness: 32,
				},
			],
		},
		options: {
			layout: { padding: { top: 24 } },
			scales: {
				x: {
					ticks: {
						font: { size: 10 },
						maxRotation: 45,
						minRotation: 0,
						autoSkip: true,
						autoSkipPadding: 2,
					},
				},
				y: {
					beginAtZero: true,
					max: yMax,
					ticks: {
						font: { size: 12 },
						color: '#222',
						callback: v => v.toLocaleString('ru-RU'),
					},
					grid: { color: '#eee' },
				},
			},
			plugins: {
				legend: { display: false },
				tooltip: { enabled: false },
				datalabels: {
					anchor: 'end',
					align: 'end',
					font: { size: 10, weight: 'bold' },
					color: '#1976d2',
					formatter: value => value, // просто число, без %
				},
			},
		},
		plugins: [ChartDataLabels],
	})
}

const ENTERPRISE_BALANCE_MODEL_MAP = {
	'fixed-asset-table': 'fixedasset',
	'inventory-item-table': 'inventoryitem',
	'credit-table': 'credit',
	'accounts-payable-table': 'accountspayable',
	'short-term-liability-table': 'shorttermliability',
	'bonus-table': 'bonus',
}

function setupEnterpriseBalanceTable(tableId) {
	const modelKey = ENTERPRISE_BALANCE_MODEL_MAP[tableId]
	const table = document.getElementById(tableId)
	if (!table || !modelKey) return

	const addBtn = document.querySelector('#add-button')
	if (addBtn) {
		addBtn.addEventListener('click', async () => {
			const config = {
				submitUrl: '/commerce/assets/items/add/',
				getUrl: '/commerce/assets/items/',
				tableId: tableId,
				formId: 'assets-form',
				modalConfig: {
					url: '/components/commerce/add_assets',
					title: 'Добавить элемент',
					context: {},
				},
				onSuccess: async result => {
					if (result.html) {
						const tbody = table.querySelector('tbody')
						if (tbody) {
							TableManager.addTableRow(result, tableId)
						}

						if (result.totals) {
							for (const [key, value] of Object.entries(result.totals)) {
								const el = document.querySelector(`[data-total-key="${key}"]`)
								if (el) el.textContent = value
							}
						}

						showSuccess('Элемент успешно добавлен')
					} else if (result.message) {
						showError(result.message)
					}
				},
			}
			const formHandler = new DynamicFormHandler(config)
			await formHandler.init()

			const form = document.getElementById('assets-form')
			if (form) {
				const modelKeyInput = form.querySelector('input[name="model"]')
				if (modelKeyInput) modelKeyInput.value = modelKey

				setupCurrencyInput('amount', 0)
			}
		})
	}

	const editBtn = document.querySelector('#edit-button')
	if (editBtn) {
		editBtn.addEventListener('click', async () => {
			const itemId = TableManager.getSelectedRowId(tableId)
			if (!itemId) {
				showError('Не удалось определить элемент')
				return
			}

			const config = {
				submitUrl: `/commerce/assets/items/edit/`,
				getUrl: `/commerce/assets/items/${modelKey}/`,
				tableId: tableId,
				formId: 'assets-form',
				modalConfig: {
					url: '/components/commerce/add_assets',
					title: 'Редактировать элемент',
				},
				onSuccess: async result => {
					if (result.html) {
						TableManager.updateTableRow(result, tableId)
						if (result.totals) {
							for (const [key, value] of Object.entries(result.totals)) {
								const el = document.querySelector(`[data-total-key="${key}"]`)
								if (el) el.textContent = value
							}
						}
						showSuccess('Элемент успешно обновлён')
					} else if (result.message) {
						showError(result.message)
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(itemId)

			const form = document.getElementById('assets-form')
			if (form) {
				const modelKeyInput = form.querySelector('input[name="model"]')
				if (modelKeyInput) modelKeyInput.value = modelKey
				setupCurrencyInput('amount', 0)
			}
		})
	}

	const deleteBtn = document.querySelector('#delete-button')
	if (deleteBtn) {
		deleteBtn.addEventListener('click', async () => {
			TableManager.hideForm('assets-form', tableId)
			const selectedRowId = TableManager.getSelectedRowId(tableId)
			if (selectedRowId) {
				showQuestion(
					'Вы действительно хотите удалить элемент?',
					'Удаление',
					async () => {
						const result = await TableManager.sendDeleteRequest(
							selectedRowId,
							'/commerce/assets/items/delete/',
							tableId,
						)

						if (result && result.totals) {
							for (const [key, value] of Object.entries(result.totals)) {
								const el = document.querySelector(`[data-total-key="${key}"]`)
								if (el) el.textContent = value
							}
						}
						showSuccess('Элемент успешно удалён')
					},
				)
			} else {
				showError('Выберите строку для удаления!')
			}
		})
	}
}

async function loadManagerOrders(managerId, page = 1, details = null) {
	// Получаем даты из фильтров (например, input#salary-start-date и input#salary-end-date)
	const startInput = document.getElementById('start-date')
	const endInput = document.getElementById('end-date')
	const startDate = startInput?.value
	const endDate = endInput?.value

	const url = `/commerce/manager-orders-table/${managerId}/?start_date=${startDate}&end_date=${endDate}&page=${page}`

	if (!details) {
		// ищем по DOM, если не передали
		const row = document.querySelector(
			`.debtors-office-list__row[data-manager-id="${managerId}"]`,
		)
		details = row?.parentElement.querySelector('.expand-content')
	}
	if (details) details.innerHTML = '<div class="loader"></div>'

	try {
		const response = await fetch(url, {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		const data = await response.json()
		if (details) {
			details.innerHTML = data.html

			if (data.pagination) {
				// Удаляем старую пагинацию, если есть
				let oldPagination = details.querySelector('.pagination-controls')
				if (oldPagination) oldPagination.remove()

				// Создаём блок пагинации (можно через шаблон или строкой)
				const paginationHtml = `
        <div class="pagination-controls">
            <button class="pagination-button" data-page="first" title="Первая страница"${data.pagination.current_page === 1 ? ' disabled' : ''}>
                <img src="/static/images/angle-double-left.svg" alt="First" class="icon">
            </button>
            <button class="pagination-button" data-page="prev" title="Предыдущая страница"${data.pagination.current_page === 1 ? ' disabled' : ''}>
                <img src="/static/images/angle-left.svg" alt="Previous" class="icon">
            </button>
            <div class="pagination-line"></div>
            <div class="pagination-input-container">
                <span>Страница</span>
                <input type="text" class="pagination-input" value="${data.pagination.current_page}" style="width:40px">
                <span>из</span>
                <span>${data.pagination.total_pages}</span>
            </div>
            <div class="pagination-line"></div>
            <button class="pagination-button" data-page="next" title="Следующая страница"${data.pagination.current_page === data.pagination.total_pages ? ' disabled' : ''}>
                <img src="/static/images/angle-right.svg" alt="Next" class="icon">
            </button>
            <button class="pagination-button" data-page="last" title="Последняя страница"${data.pagination.current_page === data.pagination.total_pages ? ' disabled' : ''}>
                <img src="/static/images/angle-double-right.svg" alt="Last" class="icon">
            </button>
            <div class="pagination-line"></div>
            <button class="pagination-button" data-page="refresh" title="Обновить">
                <img src="/static/images/arrows-rotate.svg" alt="Refresh" class="icon">
            </button>
        </div>
        `
				details.insertAdjacentHTML('beforeend', paginationHtml)

				// Навесить обработчики на кнопки пагинации
				const pag = details.querySelector('.pagination-controls')
				if (pag) {
					pag.querySelectorAll('.pagination-button').forEach(btn => {
						btn.addEventListener('click', e => {
							const type = btn.getAttribute('data-page')
							let page = data.pagination.current_page
							if (type === 'first') page = 1
							else if (type === 'prev') page = Math.max(1, page - 1)
							else if (type === 'next')
								page = Math.min(data.pagination.total_pages, page + 1)
							else if (type === 'last') page = data.pagination.total_pages
							else if (type === 'refresh') page = data.pagination.current_page
							else return
							loadManagerOrders(managerId, page, details)
						})
					})
					// Обработка ввода номера страницы
					const input = pag.querySelector('.pagination-input')
					input?.addEventListener('change', () => {
						let val = parseInt(input.value, 10)
						if (isNaN(val) || val < 1) val = 1
						if (val > data.pagination.total_pages)
							val = data.pagination.total_pages
						loadManagerOrders(managerId, val, details)
					})
				}
			}
		}

		TableManager.initTable(`manager-orders-${managerId}`)

		// Навесить обработчики пагинации для этого менеджера
		if (details) {
			details.querySelectorAll('.pagination-btn').forEach(btn => {
				btn.addEventListener('click', e => {
					const page = btn.getAttribute('data-page')
					if (page) loadManagerOrders(managerId, page)
				})
			})
		}
	} catch (e) {
		if (details)
			details.innerHTML = '<div class="error">Ошибка загрузки заказов</div>'
	}
}

function getChatCurrentUserId() {
	const container = document.getElementById('messages-page-container')
	return container ? Number(container.dataset.currentUserId) : null
}

function getSelectedMessageRow(tableId = 'messages-table') {
	const table = document.getElementById(tableId)
	if (!table) return null
	return (
		table.querySelector('tbody tr.table__row--selected') ||
		table.querySelector('tbody tr td.table__cell--selected')?.closest('tr') ||
		null
	)
}

function disableMessageRecipientField() {
	const recipientInput = document.getElementById('recipient')
	if (!recipientInput) return
	const group = recipientInput.closest('.modal-form__group')
	if (group) group.style.display = 'none'
	recipientInput.disabled = true
}

function updateMessageReadCell(row, isRead) {
	if (!row) return
	const isReadCell = row.querySelector('td.table__cell')
	if (!isReadCell) return
	const label = isRead ? 'Да' : 'Нет'
	const checkbox = isReadCell.querySelector('input[type="checkbox"]')
	if (checkbox) checkbox.checked = isRead
	const labelEl = isReadCell.querySelector('label')
	if (labelEl) labelEl.textContent = label
	row.dataset.isRead = isRead ? 'true' : 'false'
}

async function openChatOrderMessagesModal(orderId) {
	const loader = createLoader()
	document.body.appendChild(loader)

	try {
		const messagesResp = await fetch(
			`/departments/work-messages/0/?order_id=${orderId}`,
			{ headers: { 'X-Requested-With': 'XMLHttpRequest' } },
		)
		if (!messagesResp.ok) {
			showError('Не удалось загрузить переписку по заказу')
			return
		}

		const messagesData = await messagesResp.json()
		let messagesHtml = messagesData.html || ''
		if (messagesHtml) {
			const tbodyMatch = messagesHtml.match(/<tbody[^>]*>([\s\S]*?)<\/tbody>/i)
			if (tbodyMatch) {
				const tbodyContent = tbodyMatch[1].trim()
				const isEmpty = !/<tr[\s\S]*?>[\s\S]*?<\/tr>/i.test(tbodyContent)
				if (isEmpty) {
					messagesHtml = messagesHtml.replace(
						/<tbody[^>]*>[\s\S]*?<\/tbody>/i,
						`<tbody>
                            <tr class="table__row--empty">
                                <td colspan="100%" style="text-align: center; padding: 20px;">
                                    Нет сообщений
                                </td>
                            </tr>
                        </tbody>`,
					)
				}
			}
		}

		const modal = new Modal()
		await modal.open(
			`<div class="correspondence-container" id="messages-container">${messagesHtml}</div>`,
			`Переписка по заказу №${orderId}`,
		)

		const table = document.querySelector('#messages-container table')
		if (table) {
			table.id = `order-messages-${orderId}`
			try {
				TableManager.init()
			} catch (e) {
				console.warn('Не удалось инициализировать таблицу сообщений:', e)
			}
			if (messagesData.messages_id_list) {
				setIds(messagesData.messages_id_list, table.id)
			}
		}
	} catch (err) {
		showError(err.message || 'Ошибка загрузки переписки')
	} finally {
		loader.remove()
	}
}

function setupChatOrderMessageModalHandlers() {
	const newMessageBtn = document.getElementById('new_message-button')
	const editMessageBtn = document.getElementById('edit_message-button')
	const deleteMessageBtn = document.getElementById('delete_message-button')

	if (newMessageBtn && !newMessageBtn.dataset.chatHandlersAttached) {
		newMessageBtn.dataset.chatHandlersAttached = '1'
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

			const tableIdOrderMatch = messagesTable.id.match(/order-messages-(\d+)/)
			const orderId = tableIdOrderMatch ? tableIdOrderMatch[1] : null
			if (!orderId) {
				showError('Не удалось определить ID заказа')
				return
			}

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
						url: `/users/orders/${orderId}/users/`,
					},
				],
				onSuccess: async result => {
					if (result.status === 'success' && result.html) {
						const tbody = messagesTable.querySelector('tbody')
						if (tbody) {
							const emptyRow = tbody.querySelector('.table__row--empty')
							if (emptyRow) emptyRow.remove()
							tbody.insertAdjacentHTML('afterbegin', result.html)
							const newRow = tbody.firstElementChild
							if (newRow && result.id) {
								newRow.setAttribute('data-id', String(result.id))
							}
							if (newRow) {
								TableManager.attachRowCellHandlers(newRow)
								TableManager.applyColumnWidthsForRow(messagesTable.id, newRow)
							}
							showSuccess('Сообщение успешно отправлено')
						}
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init()

			const messageForm = document.getElementById('message-form')
			if (messageForm) {
				let orderInput = messageForm.querySelector('#order')
				if (!orderInput) {
					orderInput = document.createElement('input')
					orderInput.type = 'hidden'
					orderInput.id = 'order'
					orderInput.name = 'order'
					messageForm.appendChild(orderInput)
				}
				orderInput.value = orderId
			}
		})
	}

	if (editMessageBtn && !editMessageBtn.dataset.chatHandlersAttached) {
		editMessageBtn.dataset.chatHandlersAttached = '1'
		editMessageBtn.addEventListener('click', async () => {
			const messagesContainer = document.getElementById('messages-container')
			if (!messagesContainer) return

			const messagesTable = messagesContainer.querySelector('table')
			if (!messagesTable) return

			const selectedRow = getSelectedMessageRow(messagesTable.id)
			if (!selectedRow) {
				showError('Выберите сообщение для редактирования')
				return
			}

			const messageId = selectedRow.dataset.id
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
				onSuccess: async result => {
					if (result.status === 'success' && result.html) {
						selectedRow.outerHTML = result.html
						const newRow = messagesTable.querySelector(
							`tbody tr[data-id="${messageId}"]`,
						)
						if (newRow) {
							TableManager.attachRowCellHandlers(newRow)
							TableManager.applyColumnWidthsForRow(messagesTable.id, newRow)
						}
						showSuccess('Сообщение успешно обновлено')
					}
				},
			}

			const formHandler = new DynamicFormHandler(config)
			await formHandler.init(messageId)
			disableMessageRecipientField()
		})
	}

	if (deleteMessageBtn && !deleteMessageBtn.dataset.chatHandlersAttached) {
		deleteMessageBtn.dataset.chatHandlersAttached = '1'
		deleteMessageBtn.addEventListener('click', async () => {
			const messagesContainer = document.getElementById('messages-container')
			if (!messagesContainer) return

			const messagesTable = messagesContainer.querySelector('table')
			if (!messagesTable) return

			const selectedRow = getSelectedMessageRow(messagesTable.id)
			if (!selectedRow) {
				showError('Выберите сообщение для удаления')
				return
			}

			const messageId = selectedRow.dataset.id
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
							},
						)
						const data = await resp.json()
						loader.remove()
						if (!resp.ok || data.status !== 'success') {
							showError(
								data.message || data.error || 'Ошибка при удалении сообщения',
							)
							return
						}
						selectedRow.remove()
						showSuccess('Сообщение успешно удалено')
					} catch (err) {
						loader.remove()
						showError(err.message || 'Ошибка при удалении сообщения')
					}
				},
			)
		})
	}
}

function initMessagesPage() {
	const config = configs.messages
	if (!config) return

	const idsScript = document.getElementById('message-ids')
	if (idsScript) {
		try {
			const ids = JSON.parse(idsScript.textContent)
			setIds(ids, config.tableId)
		} catch (e) {
			console.warn('Не удалось установить ID сообщений:', e)
		}
	}

	setupChatOrderMessageModalHandlers()

	const addButton = document.getElementById('add-button')
	if (addButton) {
		const addFormHandler = new DynamicFormHandler({
			dataUrls: config.dataUrls,
			submitUrl: config.addUrl,
			tableId: config.tableId,
			formId: config.formId,
			modalConfig: {
				url: config.modalConfig.addModalUrl,
				title: config.modalConfig.addModalTitle,
			},
			onSuccess: result => {
				TableManager.addTableRow(result, config.tableId)
				const tbody = document.querySelector(`#${config.tableId} tbody`)
				const newRow = tbody?.firstElementChild
				if (newRow && result.id) {
					newRow.setAttribute('data-id', String(result.id))
					const currentUserId = getChatCurrentUserId()
					if (currentUserId) {
						newRow.dataset.authorId = String(currentUserId)
						newRow.dataset.isRead = 'false'
						newRow.dataset.orderId = ''
					}
				}
			},
		})
		addButton.addEventListener('click', () => addFormHandler.init())
	}

	const editButton = document.getElementById('edit-button')
	if (editButton) {
		editButton.addEventListener('click', async () => {
			const selectedRow = getSelectedMessageRow(config.tableId)
			if (!selectedRow) {
				showError('Выберите сообщение для редактирования')
				return
			}

			const currentUserId = getChatCurrentUserId()
			if (selectedRow.dataset.authorId !== String(currentUserId)) {
				showError('Вы можете редактировать только свои сообщения')
				return
			}
			if (selectedRow.dataset.isRead === 'true') {
				showError('Нельзя редактировать просмотренное сообщение')
				return
			}

			const messageId = selectedRow.dataset.id
			if (!messageId) {
				showError('Не удалось определить ID сообщения')
				return
			}

			const editFormHandler = new DynamicFormHandler({
				dataUrls: config.dataUrls,
				submitUrl: config.editUrl,
				tableId: config.tableId,
				formId: config.formId,
				getUrl: config.getUrl,
				modalConfig: {
					url: config.modalConfig.editModalUrl,
					title: config.modalConfig.editModalTitle,
				},
				onSuccess: result => {
					TableManager.updateTableRow(result, config.tableId)
					const updatedRow = document.querySelector(
						`#${config.tableId} tbody tr[data-id="${messageId}"]`,
					)
					if (updatedRow) {
						updatedRow.dataset.authorId = String(currentUserId)
						updatedRow.dataset.isRead = selectedRow.dataset.isRead
						updatedRow.dataset.orderId = selectedRow.dataset.orderId || ''
						updatedRow.dataset.recipientId =
							selectedRow.dataset.recipientId || ''
					}
				},
			})
			await editFormHandler.init(messageId)
			disableMessageRecipientField()
		})
	}

	const deleteButton = document.getElementById('delete-button')
	if (deleteButton) {
		deleteButton.addEventListener('click', async () => {
			const selectedRow = getSelectedMessageRow(config.tableId)
			if (!selectedRow) {
				showError('Выберите сообщение для удаления')
				return
			}

			const currentUserId = getChatCurrentUserId()
			if (selectedRow.dataset.authorId !== String(currentUserId)) {
				showError('Вы можете удалять только свои сообщения')
				return
			}
			if (selectedRow.dataset.isRead === 'true') {
				showError('Нельзя удалить просмотренное сообщение')
				return
			}

			const messageId = selectedRow.dataset.id
			if (!messageId) {
				showError('Не удалось определить ID сообщения')
				return
			}

			showQuestion(
				'Вы действительно хотите удалить это сообщение?',
				'Удаление сообщения',
				async () => {
					await TableManager.sendDeleteRequest(
						messageId,
						config.deleteUrl,
						config.tableId,
					)
				},
			)
		})
	}

	const markReadButton = document.getElementById('mark_message_read-button')
	if (markReadButton) {
		markReadButton.addEventListener('click', async () => {
			const selectedRow = getSelectedMessageRow(config.tableId)
			if (!selectedRow) {
				showError('Выберите сообщение')
				return
			}

			const currentUserId = getChatCurrentUserId()
			if (selectedRow.dataset.recipientId !== String(currentUserId)) {
				showError('Отметить просмотренным может только получатель')
				return
			}
			if (selectedRow.dataset.isRead === 'true') {
				showError('Сообщение уже просмотрено')
				return
			}

			const messageId = selectedRow.dataset.id
			const loader = createLoader()
			document.body.appendChild(loader)
			try {
				const resp = await fetch(
					`/departments/work-messages/${messageId}/mark-read/`,
					{
						method: 'POST',
						headers: {
							'Content-Type': 'application/json',
							'X-CSRFToken': getCSRFToken(),
						},
						credentials: 'same-origin',
					},
				)
				const data = await resp.json()
				loader.remove()
				if (!resp.ok || data.status !== 'success') {
					showError(data.message || 'Не удалось отметить сообщение')
					return
				}
				updateMessageReadCell(selectedRow, true)
				showSuccess('Сообщение отмечено как просмотренное')
			} catch (err) {
				loader.remove()
				showError(err.message || 'Не удалось отметить сообщение')
			}
		})
	}

	const viewOrderCorrespondenceBtn = document.getElementById(
		'view_order_correspondence-button',
	)
	if (viewOrderCorrespondenceBtn) {
		viewOrderCorrespondenceBtn.addEventListener('click', async () => {
			const selectedRow = getSelectedMessageRow(config.tableId)
			if (!selectedRow) {
				showError('Выберите сообщение')
				return
			}
			const orderId = selectedRow.dataset.orderId
			if (!orderId) {
				showError('У сообщения нет заказа')
				return
			}
			await openChatOrderMessagesModal(orderId)
		})
	}

	const viewOrderFilesBtn = document.getElementById('view_order_files-button')
	if (viewOrderFilesBtn) {
		setupOrderFilesButton2(viewOrderFilesBtn, () => {
			const selectedRow = getSelectedMessageRow(config.tableId)
			if (!selectedRow || !selectedRow.dataset.orderId) return null
			return parseInt(selectedRow.dataset.orderId, 10)
		})
	}
}

function initNotesPage() {
	const notesContainer = document.getElementById('notes-container')
	const calendarGrid = document.getElementById('calendar-grid')
	const calendarTitle = document.getElementById('calendar-title')
	const prevMonthButton = document.getElementById('prev-month-btn')
	const nextMonthButton = document.getElementById('next-month-btn')
	const menu = document.getElementById('context-menu')
	const addNoteButton = document.getElementById('add-note-button')
	const editNoteButton = document.getElementById('edit-note-button')
	const deleteNoteButton = document.getElementById('delete-note-button')

	if (!notesContainer || !calendarGrid || !calendarTitle || !menu) return

	const MONTHS = [
		'Январь',
		'Февраль',
		'Март',
		'Апрель',
		'Май',
		'Июнь',
		'Июль',
		'Август',
		'Сентябрь',
		'Октябрь',
		'Ноябрь',
		'Декабрь',
	]
	const WEEK_DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

	let currentDate = new Date()
	let selectedDate = null
	let notesByDate = {}
	let selectedNoteId = null

	if (menu.parentNode !== document.body) {
		document.body.appendChild(menu)
	}
	menu.style.position = 'fixed'
	menu.style.zIndex = 10000
	menu.style.display = 'none'

	function toDateKey(year, month, day) {
		return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(
			2,
			'0',
		)}`
	}

	function parseErrorMessage(data, fallbackMessage) {
		if (data && typeof data === 'object' && data.error) return data.error
		return fallbackMessage
	}

	function escapeHtml(value) {
		return String(value ?? '')
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('"', '&quot;')
			.replaceAll("'", '&#39;')
	}

	function sortNotes(notes) {
		return [...notes].sort((first, second) => {
			const firstTime = first.time || ''
			const secondTime = second.time || ''
			return firstTime.localeCompare(secondTime) || first.id - second.id
		})
	}

	function getNotesForDate(dateKey) {
		return notesByDate[dateKey] || []
	}

	function getSelectedNote() {
		if (!selectedDate || selectedNoteId === null) return null
		const note = getNotesForDate(selectedDate).find(
			item => item.id === selectedNoteId,
		)
		if (!note) selectedNoteId = null
		return note || null
	}

	function buildNotePreview(note) {
		const timeHtml = note.time
			? `<span class="calendar-note-item__time">${escapeHtml(note.time)}</span>`
			: '<span class="calendar-note-item__time calendar-note-item__time--empty">Без времени</span>'
		return `
			<div class="calendar-note-item${selectedDate === note.date && selectedNoteId === note.id ? ' calendar-note-item--selected' : ''}" data-note-id="${note.id}">
				${timeHtml}
				<div class="calendar-note-item__text">${escapeHtml(note.text)}</div>
			</div>
		`
	}

	function hideContextMenu() {
		menu.style.display = 'none'
	}

	function showContextMenu(pageX, pageY, dateKey, noteId = null) {
		selectedDate = dateKey
		selectedNoteId = noteId
		const selectedNote = getSelectedNote()

		if (addNoteButton) addNoteButton.style.display = 'block'
		if (editNoteButton)
			editNoteButton.style.display = selectedNote ? 'block' : 'none'
		if (deleteNoteButton)
			deleteNoteButton.style.display = selectedNote ? 'block' : 'none'

		menu.style.display = 'block'

		const viewportWidth =
			window.innerWidth || document.documentElement.clientWidth
		const viewportHeight =
			window.innerHeight || document.documentElement.clientHeight
		const rect = menu.getBoundingClientRect()
		const menuWidth = rect.width || 220
		const menuHeight = rect.height || 150
		const margin = 8

		let left = pageX + 8
		let top = pageY + 8

		if (left + menuWidth > viewportWidth - margin) {
			left = Math.max(margin, viewportWidth - menuWidth - margin)
		}
		if (top + menuHeight > viewportHeight - margin) {
			top = Math.max(margin, viewportHeight - menuHeight - margin)
		}

		menu.style.left = `${left}px`
		menu.style.top = `${top}px`
	}

	function renderCalendar() {
		const year = currentDate.getFullYear()
		const month = currentDate.getMonth() + 1
		const now = new Date()

		calendarTitle.textContent = `${MONTHS[month - 1]} ${year}`
		calendarGrid.innerHTML = ''

		WEEK_DAYS.forEach(dayName => {
			const dayHeader = document.createElement('div')
			dayHeader.className = 'calendar-day-name'
			dayHeader.textContent = dayName
			calendarGrid.appendChild(dayHeader)
		})

		const firstDay = new Date(year, month - 1, 1)
		let startWeekday = firstDay.getDay()
		startWeekday = startWeekday === 0 ? 6 : startWeekday - 1

		const daysInMonth = new Date(year, month, 0).getDate()
		const daysInPrevMonth = new Date(year, month - 1, 0).getDate()

		for (let i = 0; i < startWeekday; i++) {
			const day = daysInPrevMonth - startWeekday + i + 1
			const cell = document.createElement('div')
			cell.className = 'calendar-cell calendar-cell--other-month'
			cell.innerHTML = `<div class="calendar-cell__date">${day}</div>`
			calendarGrid.appendChild(cell)
		}

		for (let day = 1; day <= daysInMonth; day++) {
			const dateKey = toDateKey(year, month, day)
			const notes = getNotesForDate(dateKey)
			const cell = document.createElement('div')
			cell.className = 'calendar-cell'

			if (
				now.getFullYear() === year &&
				now.getMonth() + 1 === month &&
				now.getDate() === day
			) {
				cell.classList.add('calendar-cell--today')
			}

			if (selectedDate === dateKey) {
				cell.classList.add('calendar-cell--selected')
			}

			cell.dataset.date = dateKey
			const noteItemsHtml = notes
				.slice(0, 3)
				.map(note => buildNotePreview(note))
				.join('')
			const moreCount = Math.max(notes.length - 3, 0)
			cell.innerHTML = `
				<div class="calendar-cell__date">${day}</div>
				<div class="calendar-cell__meta">${notes.length ? `${notes.length} ${notes.length === 1 ? 'заметка' : notes.length < 5 ? 'заметки' : 'заметок'}` : ''}</div>
				<div class="calendar-cell__notes">${noteItemsHtml}</div>
				${moreCount ? `<div class="calendar-cell__more">Еще ${moreCount}</div>` : ''}
			`

			cell.addEventListener('click', () => {
				selectedDate = dateKey
				selectedNoteId = null
				renderCalendar()
			})

			cell.addEventListener('dblclick', async () => {
				selectedDate = dateKey
				selectedNoteId = null
				await openNoteForm()
			})

			cell.addEventListener('contextmenu', e => {
				e.preventDefault()
				showContextMenu(e.pageX, e.pageY, dateKey)
			})

			cell.querySelectorAll('.calendar-note-item').forEach(noteElement => {
				const noteId = Number(noteElement.dataset.noteId)
				noteElement.addEventListener('click', e => {
					e.stopPropagation()
					selectedDate = dateKey
					selectedNoteId = noteId
					renderCalendar()
				})

				noteElement.addEventListener('dblclick', async e => {
					e.stopPropagation()
					selectedDate = dateKey
					selectedNoteId = noteId
					const note = getNotesForDate(dateKey).find(item => item.id === noteId)
					if (note) await openNoteForm(note)
				})

				noteElement.addEventListener('contextmenu', e => {
					e.preventDefault()
					e.stopPropagation()
					showContextMenu(e.pageX, e.pageY, dateKey, noteId)
				})
			})

			calendarGrid.appendChild(cell)
		}

		const totalCells = startWeekday + daysInMonth
		const trailingCells = (7 - (totalCells % 7)) % 7

		for (let i = 1; i <= trailingCells; i++) {
			const cell = document.createElement('div')
			cell.className = 'calendar-cell calendar-cell--other-month'
			cell.innerHTML = `<div class="calendar-cell__date">${i}</div>`
			calendarGrid.appendChild(cell)
		}
	}

	async function loadNotes() {
		const year = currentDate.getFullYear()
		const month = currentDate.getMonth() + 1

		try {
			const response = await fetch(
				`/commerce/notes/list/?year=${year}&month=${month}`,
				{
					headers: { 'X-Requested-With': 'XMLHttpRequest' },
				},
			)

			if (!response.ok) {
				showError('Не удалось загрузить заметки')
				return
			}

			const data = await response.json()
			notesByDate = {}
			;(data.notes || []).forEach(note => {
				if (!notesByDate[note.date]) notesByDate[note.date] = []
				notesByDate[note.date].push(note)
			})
			Object.keys(notesByDate).forEach(dateKey => {
				notesByDate[dateKey] = sortNotes(notesByDate[dateKey])
			})

			renderCalendar()
		} catch (error) {
			showError('Не удалось загрузить заметки')
		}
	}

	async function openNoteForm(existingNote = null) {
		if (!selectedDate) {
			showError('Выберите день в календаре')
			return
		}

		try {
			const modal = new Modal()
			const response = await fetch('/components/commerce/note_form', {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const formHtml = await response.text()

			const [year, month, day] = selectedDate.split('-')
			const title = existingNote
				? 'Редактировать заметку'
				: `Заметка: ${Number(day)} ${MONTHS[Number(month) - 1]} ${year}`

			await modal.open(formHtml, title)

			const form = document.getElementById('note-form')
			const noteIdInput = document.getElementById('note_id')
			const dateInput = document.getElementById('date')
			const timeInput = document.getElementById('time')
			const textInput = document.getElementById('text')

			if (!form || !dateInput || !timeInput || !textInput) {
				showError('Не удалось открыть форму заметки')
				return
			}

			dateInput.value = selectedDate
			if (existingNote && noteIdInput) {
				noteIdInput.value = existingNote.id
				timeInput.value = existingNote.time || ''
				textInput.value = existingNote.text || ''
			} else {
				timeInput.value = ''
			}

			form.addEventListener(
				'submit',
				async e => {
					e.preventDefault()

					const text = textInput.value.trim()
					const time = timeInput.value.trim()
					if (!text) {
						showError('Введите текст заметки')
						return
					}
					if (!time) {
						showError('Выберите время выполнения')
						return
					}

					try {
						let endpoint = '/commerce/notes/add/'
						let method = 'POST'
						let payload = { date: selectedDate, time, text }

						if (existingNote) {
							endpoint = `/commerce/notes/edit/${existingNote.id}/`
							method = 'PATCH'
							payload = { time, text }
						}

						const saveResponse = await fetch(endpoint, {
							method,
							headers: {
								'Content-Type': 'application/json',
								'X-CSRFToken': getCSRFToken(),
								'X-Requested-With': 'XMLHttpRequest',
							},
							body: JSON.stringify(payload),
						})

						let responseData = null
						try {
							responseData = await saveResponse.json()
						} catch (jsonError) {
							responseData = null
						}

						if (!saveResponse.ok) {
							showError(
								parseErrorMessage(responseData, 'Не удалось сохранить заметку'),
							)
							return
						}

						modal.close()
						showSuccess('Заметка сохранена')
						await loadNotes()
					} catch (error) {
						showError('Не удалось сохранить заметку')
					}
				},
				{ once: true },
			)
		} catch (error) {
			showError('Не удалось открыть форму заметки')
		}
	}

	async function deleteNote() {
		const note = getSelectedNote()
		if (!selectedDate || !note) {
			showError('Заметка не выбрана')
			return
		}

		showQuestion('Удалить заметку?', 'Подтверждение', async () => {
			try {
				const response = await fetch(`/commerce/notes/delete/${note.id}/`, {
					method: 'DELETE',
					headers: {
						'X-CSRFToken': getCSRFToken(),
						'X-Requested-With': 'XMLHttpRequest',
					},
				})

				let responseData = null
				try {
					responseData = await response.json()
				} catch (jsonError) {
					responseData = null
				}

				if (!response.ok) {
					showError(
						parseErrorMessage(responseData, 'Не удалось удалить заметку'),
					)
					return
				}

				showSuccess('Заметка удалена')
				await loadNotes()
			} catch (error) {
				showError('Не удалось удалить заметку')
			}
		})
	}

	prevMonthButton?.addEventListener('click', async () => {
		currentDate = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth() - 1,
			1,
		)
		hideContextMenu()
		await loadNotes()
	})

	nextMonthButton?.addEventListener('click', async () => {
		currentDate = new Date(
			currentDate.getFullYear(),
			currentDate.getMonth() + 1,
			1,
		)
		hideContextMenu()
		await loadNotes()
	})

	addNoteButton?.addEventListener('click', async e => {
		e.preventDefault()
		hideContextMenu()
		selectedNoteId = null
		await openNoteForm()
	})

	editNoteButton?.addEventListener('click', async e => {
		e.preventDefault()
		hideContextMenu()
		const note = getSelectedNote()
		if (!note) {
			showError('Выберите заметку для редактирования')
			return
		}
		await openNoteForm(note)
	})

	deleteNoteButton?.addEventListener('click', async e => {
		e.preventDefault()
		hideContextMenu()
		await deleteNote()
	})

	document.addEventListener('click', e => {
		if (!menu.contains(e.target)) hideContextMenu()
	})

	document.addEventListener('keydown', e => {
		if (e.key === 'Escape') hideContextMenu()
	})

	window.addEventListener('scroll', hideContextMenu)
	window.addEventListener('resize', hideContextMenu)

	selectedDate = toDateKey(
		currentDate.getFullYear(),
		currentDate.getMonth() + 1,
		currentDate.getDate(),
	)

	loadNotes()
}

document.addEventListener('DOMContentLoaded', () => {
	const pathname = window.location.pathname

	const segments = pathname.split('/').filter(Boolean)
	const urlName = segments.length
		? segments[segments.length - 1].replace(/-/g, '_')
		: null

	TableManager.init()

	if (urlName !== 'notes') {
		addMenuHandler()
	}

	if (urlName) {
		if (urlName === 'notes') {
			initNotesPage()
		} else if (urlName === 'clients') {
			if (configs[urlName]) {
				initGenericPage(configs[urlName])
			} else {
				console.error(`Config not found for generic page: ${urlName}`)
			}

			attachClientsTableClickHandler()
			attachFormCancelHandler()
			attachClientFormHandlers()

			// Don't load first client if client_id query parameter is present
			const urlParams = new URLSearchParams(window.location.search)
			const clientIdFromQuery = urlParams.get('client_id')

			if (!clientIdFromQuery) {
				loadFirstClientFromTable()
			}

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

			const viewOrderFilesBtn = document.getElementById(
				'view_order_files-button',
			)
			if (viewOrderFilesBtn) {
				setupOrderFilesButton2(viewOrderFilesBtn)
			}

			const viewOrderPaymentsBtn = document.getElementById(
				'view_order_payments-button',
			)

			if (viewOrderPaymentsBtn) {
				viewOrderPaymentsBtn.addEventListener('click', () => {
					let orderId = null
					const selectedCell = document.querySelector(
						'td.table__cell--selected',
					)
					if (selectedCell) {
						const v = selectedCell.textContent.trim()
						orderId = Number.isNaN(Number(v)) ? null : parseInt(v, 10)
					}
					if (!orderId) {
						const selectedRow = document.querySelector(
							'tr.table__row--selected',
						)
						if (selectedRow) {
							const firstCell = selectedRow.querySelector('td')
							if (firstCell) {
								const v = firstCell.textContent.trim()
								orderId = Number.isNaN(Number(v)) ? null : parseInt(v, 10)
							}
						}
					}
					if (!orderId) {
						showError('Сначала выберите заказ в таблице.')
						return
					}
					window.location.href = `/ledger/payments/?order_id=${orderId}`
				})
			}

			initOrdersPagination()
		} else if (segments[0] === 'departments' && segments[1]) {
			const departmentSlug = segments[1]
			initDepartmentPage(departmentSlug)
		} else if (pathname.includes('/users/list')) {
			initGenericPage(configs['users'])
		} else if (pathname.includes('/users/types')) {
			initGenericPage(configs['user_types'])

			const menuSettingsButton = document.getElementById('menu-settings-button')
			if (menuSettingsButton) {
				menuSettingsButton.addEventListener('click', async () => {
					const selectedRow = document.querySelector(
						'#user-types-table .table__row--selected',
					)
					if (!selectedRow) {
						showError('Сначала выберите тип пользователя в таблице.')
						return
					}
					const typeId = selectedRow.querySelector('td')?.textContent?.trim()
					if (!typeId) {
						showError('Не удалось определить тип пользователя.')
						return
					}

					const modal = new Modal()
					await modal.open(
						'<div id="menu-settings-modal-body"></div>',
						'Настройка пунктов меню',
					)

					const modalBody = document.getElementById('menu-settings-modal-body')
					if (!modalBody) return

					const resp = await fetch(`/users/types/${typeId}/menu_items/`, {
						headers: { 'X-Requested-With': 'XMLHttpRequest' },
					})
					const data = await resp.json()

					modalBody.innerHTML = `
            <div id="menu-settings-categories">
                ${data
									.map(
										cat => `
                    <div class="menu-category-block" data-category-id="${cat.category_id}">
                        <h4>${cat.category_name}</h4>
                        <ul class="menu-items-list" data-category-id="${cat.category_id}">
                            ${cat.items
															.map(
																item => `
                                <li class="menu-item-row" draggable="true" data-id="${item.id}">
                                    <input type="text" value="${item.name}" />
                                    <button class="remove-menu-item" title="Удалить">✕</button>
                                </li>
                            `,
															)
															.join('')}
                        </ul>
                        <button class="add-menu-item" data-category-id="${cat.category_id}">Добавить пункт</button>
                    </div>
                `,
									)
									.join('')}
            </div>
            <div class="menu-settings-modal-footer">
                <button id="save-menu-settings" class="button button--primary">Сохранить</button>
                <button id="cancel-menu-settings" class="button button--cancel">Отмена</button>
            </div>
        `

					const lists = modalBody.querySelectorAll('.menu-items-list')
					lists.forEach(list => {
						let draggedItem = null

						list.addEventListener('dragstart', e => {
							if (e.target.classList.contains('menu-item-row')) {
								draggedItem = e.target
								e.dataTransfer.effectAllowed = 'move'
								e.dataTransfer.setData('text/plain', e.target.dataset.id)
								e.dataTransfer.setData(
									'source-category',
									list.dataset.categoryId,
								)
								e.target.classList.add('dragging')
							}
						})

						list.addEventListener('dragend', e => {
							e.target.classList.remove('dragging')
							draggedItem = null
						})

						list.addEventListener('dragover', e => {
							e.preventDefault()
							e.dataTransfer.dropEffect = 'move'

							const afterElement = getDragAfterElement(list, e.clientY)
							list
								.querySelectorAll('.drag-over')
								.forEach(el => el.classList.remove('drag-over'))
							if (afterElement) afterElement.classList.add('drag-over')
						})

						list.addEventListener('dragleave', e => {
							list
								.querySelectorAll('.drag-over')
								.forEach(el => el.classList.remove('drag-over'))
						})

						list.addEventListener('drop', e => {
							e.preventDefault()
							list
								.querySelectorAll('.drag-over')
								.forEach(el => el.classList.remove('drag-over'))
							const id = e.dataTransfer.getData('text/plain')
							const sourceCat = e.dataTransfer.getData('source-category')
							const targetCat = list.dataset.categoryId
							const dragged = modalBody.querySelector(
								`.menu-item-row[data-id="${id}"]`,
							)
							if (!dragged) return

							if (sourceCat !== targetCat) {
								list.appendChild(dragged)
								return
							}

							const afterElement = getDragAfterElement(list, e.clientY)
							if (afterElement && afterElement !== dragged) {
								list.insertBefore(dragged, afterElement)
							} else {
								list.appendChild(dragged)
							}
						})
					})

					modalBody.querySelectorAll('.add-menu-item').forEach(btn => {
						btn.addEventListener('click', async () => {
							if (btn.parentNode.querySelector('.menu-settings-select')) return

							btn.style.display = 'none'

							const categoryId = btn.dataset.categoryId
							const availableResp = await fetch(
								`/users/types/${typeId}/menu_items/available/`,
								{ headers: { 'X-Requested-With': 'XMLHttpRequest' } },
							)
							const available = await availableResp.json()
							if (!available.length) {
								showError('Нет доступных пунктов меню для добавления.')
								btn.style.display = ''
								return
							}

							const select = document.createElement('select')
							select.className = 'menu-settings-select'
							available.forEach(item => {
								const option = document.createElement('option')
								option.value = item.id
								option.textContent = item.title
								select.appendChild(option)
							})

							const addBtn = document.createElement('button')
							addBtn.textContent = 'Добавить'
							addBtn.type = 'button'
							addBtn.className = 'button button--primary'

							const cancelBtn = document.createElement('button')
							cancelBtn.textContent = 'Отмена'
							cancelBtn.type = 'button'
							cancelBtn.className = 'button button--cancel'

							const buttonsWrapper = document.createElement('div')
							buttonsWrapper.className = 'menu-settings-buttons-wrapper'
							buttonsWrapper.appendChild(addBtn)
							buttonsWrapper.appendChild(cancelBtn)

							const wrapper = document.createElement('div')
							wrapper.className = 'menu-settings-add-wrapper'
							wrapper.appendChild(select)
							wrapper.appendChild(buttonsWrapper)

							addBtn.onclick = () => {
								const selectedId = select.value
								const selectedItem = available.find(i => i.id == selectedId)
								const ul = modalBody.querySelector(
									`.menu-items-list[data-category-id="${categoryId}"]`,
								)
								const li = document.createElement('li')
								li.className = 'menu-item-row'
								li.draggable = true
								li.dataset.id = selectedItem.id
								li.innerHTML = `<input type="text" value="${selectedItem.title}" />
                <button class="remove-menu-item" title="Удалить">✕</button>`
								ul.appendChild(li)
								wrapper.remove()
								btn.style.display = ''
								li.querySelector('.remove-menu-item').addEventListener(
									'click',
									e => {
										const li = e.target.closest('li')
										if (li) li.remove()
									},
								)
							}
							cancelBtn.onclick = () => {
								wrapper.remove()
								btn.style.display = ''
							}

							btn.parentNode.insertBefore(wrapper, btn)
						})
					})

					modalBody.querySelectorAll('.remove-menu-item').forEach(btn => {
						btn.addEventListener('click', e => {
							const li = btn.closest('li')
							if (li) li.remove()
						})
					})

					modalBody.querySelector('#save-menu-settings').onclick = async () => {
						const categories = []
						modalBody
							.querySelectorAll('.menu-category-block')
							.forEach(catBlock => {
								const catId = catBlock.dataset.categoryId
								const items = []
								catBlock
									.querySelectorAll('.menu-item-row')
									.forEach((li, idx) => {
										items.push({
											id: li.dataset.id,
											name: li.querySelector('input').value,
											order: idx,
										})
									})
								categories.push({
									category_id: catId,
									items: items,
								})
							})
						const resp = await fetch(
							`/users/types/${typeId}/menu_items/update/`,
							{
								method: 'POST',
								headers: {
									'Content-Type': 'application/json',
									'X-CSRFToken': getCSRFToken(),
								},
								body: JSON.stringify(categories),
							},
						)
						const result = await resp.json()
						if (result.status === 'success') {
							showSuccess('Пункты меню успешно сохранены')
							modal.close()
						} else {
							showError(result.message || 'Ошибка сохранения')
						}
					}

					modalBody.querySelector('#cancel-menu-settings').onclick = () => {
						modal.close()
					}
				})
			}
		} else if (urlName === 'work_statuses_table') {
			initGenericPage(configs['order_work_statuses'])
		} else if (pathname.includes('/filetypes/table')) {
			if (configs['filetypes']) {
				initGenericPage(configs['filetypes'])
			} else {
				console.error('Config not found for generic page: filetypes')
			}
		} else if (urlName === 'messages') {
			initMessagesPage()
		} else if (urlName === 'enterprise_balance_report') {
			initEnterpriseBalanceReportPage()
		} else if (urlName === 'salary_calculation') {
			// Настройка дат (последние 30 дней)
			const today = new Date()
			const firstDay = new Date(today.getFullYear(), today.getMonth(), 1)
			const pickers = {
				start: initDatePicker(
					'#start-date',
					'.date-filter__icon[data-target="start-date"]',
					formatDate(firstDay),
				),
				end: initDatePicker(
					'#end-date',
					'.date-filter__icon[data-target="end-date"]',
					formatDate(today),
				),
			}

			document.addEventListener('click', async function (e) {
				const row = e.target.closest(
					'.debtors-office-list__row[data-manager-id]',
				)
				if (!row) return

				const managerId = row.getAttribute('data-manager-id')
				const details = row.parentElement.querySelector('.expand-content')
				const toggle = row.querySelector('.debtors-office-list__toggle')

				// Если уже открыт — просто скрыть
				if (details && details.style.display !== 'none') {
					details.style.display = 'none'
					if (toggle) toggle.classList.remove('open')
					return
				}

				// Если еще не подгружено — грузим
				if (!details || !details.hasChildNodes()) {
					await loadManagerOrders(managerId, 1, details)
				}

				// Показать блок
				if (details) {
					details.style.display = ''
					if (toggle) toggle.classList.add('open')
				}
			})

			document
				.getElementById('load-data')
				?.addEventListener('click', async () => {
					const startInput = document.getElementById('start-date')
					const endInput = document.getElementById('end-date')
					const startDate = startInput?.value
					const endDate = endInput?.value

					const container = document.getElementById(
						'salary-calculation-container',
					)
					if (!startDate || !endDate || !container) return

					// Показываем лоадер
					const stats = container.querySelector('.salary-calculation__stats')
					if (stats) stats.innerHTML = '<div class="loader">Загрузка...</div>'

					try {
						const url = `/commerce/salary-calculation/?start_date=${startDate}&end_date=${endDate}`
						const resp = await fetch(url, {
							headers: { 'X-Requested-With': 'XMLHttpRequest' },
						})
						const html = await resp.text()
						if (stats) {
							stats.innerHTML = html
							const ul = stats.querySelector('.debtors-office-list')
							if (ul) ul.classList.add('salary-calculation__list')
						}
					} catch (e) {
						if (stats)
							stats.innerHTML = '<div class="error">Ошибка загрузки</div>'
					}
				})
		} else {
			console.error(
				`No specific initialization logic defined for URL segment: ${urlName}`,
			)
		}
	} else {
		console.error(
			'Could not determine page context from URL pathname:',
			pathname,
		)
	}

	const hideButton = document.getElementById('hide-button')
	const showAllButton = document.getElementById('show-all-button')
	const printDocButton = document.getElementById('print-doc-button')
	const downloadDocButton = document.getElementById('download-doc-button')

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

	if (printDocButton) {
		printDocButton.addEventListener('click', async () => {
			const result = getSelectedDocumentFileName()
			if (result.error) {
				showError(result.error)
				return
			}

			await printDocumentByFileName(result.fileName)
		})
	}

	if (downloadDocButton) {
		downloadDocButton.addEventListener('click', async () => {
			const result = getSelectedDocumentFileName()
			if (result.error) {
				showError(result.error)
				return
			}

			await downloadDocumentByFileName(result.fileName)
		})
	}

	const renameOrderDocumentButton = document.getElementById(
		'rename-order-document-button',
	)

	if (renameOrderDocumentButton) {
		renameOrderDocumentButton.addEventListener('click', async () => {
			let selectedRow =
				document.querySelector('tr.table__row--selected') ||
				document.querySelector('td.table__cell--selected')?.closest('tr')
			if (!selectedRow) {
				showError('Выберите файл в таблице для переименования')
				return
			}

			const table = selectedRow.closest('table')
			if (!table || !/^order-documents-/.test(table.id)) {
				showError('Выберите файл заказа в списке документов')
				return
			}

			const docId =
				selectedRow.getAttribute('data-id') ||
				selectedRow.querySelector('td')?.textContent?.trim()
			if (!docId) {
				showError('Не удалось определить ID файла')
				return
			}

			let fileColIndex = -1
			try {
				const ths = Array.from(table.querySelectorAll('thead th'))
				fileColIndex = ths.findIndex(
					th => th && th.dataset && th.dataset.name === 'file_display',
				)
			} catch (e) {
				fileColIndex = -1
			}

			const fileCell =
				fileColIndex >= 0
					? selectedRow.children[fileColIndex]
					: selectedRow.querySelector('td')
			if (!fileCell) {
				showError('Не удалось определить ячейку с именем файла')
				return
			}

			let currentName = ''
			const existingLink = fileCell.querySelector('a')
			if (existingLink) currentName = existingLink.textContent.trim()
			else currentName = fileCell.textContent.trim()

			const extMatch = currentName.match(/(\.[^.]*)$/)
			const ext = extMatch ? extMatch[1] : ''
			const nameOnly = currentName.replace(/\.[^/.]+$/, '')

			const modal = new Modal()
			const resp = await fetch('/components/commerce/file_name', {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			const html = await resp.text()
			await modal.open(html, 'Введите название файла')

			const form = document.getElementById('file_name-form')
			if (!form) {
				showError('Форма не найдена')
				return
			}
			const nameInput = form.querySelector('#name')
			const commentInput = form.querySelector('#comment')
			if (!nameInput) {
				showError('Поле имени не найдено')
				return
			}
			nameInput.value = nameOnly
			nameInput.focus()

			const commentColIndex = Array.from(
				selectedRow.closest('table').querySelectorAll('thead th'),
			).findIndex(th => th.dataset.name === 'comment')

			commentInput.value =
				commentColIndex !== -1
					? selectedRow.children[commentColIndex]?.textContent.trim() || ''
					: ''

			form.onsubmit = async e => {
				e.preventDefault()
				let newNameRaw = nameInput.value.trim()
				let newComment = commentInput.value.trim()

				if (!newNameRaw) {
					showError('Имя файла не может быть пустым')
					return
				}
				const finalName = newNameRaw + ext

				const l = createLoader()
				document.body.appendChild(l)
				try {
					const renameResp = await fetch(
						`${BASE_URL}documents/rename/${docId}/`,
						{
							method: 'POST',
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'X-CSRFToken': getCSRFToken(),
								'X-Requested-With': 'XMLHttpRequest',
							},
							credentials: 'same-origin',
							body: `name=${encodeURIComponent(finalName)}&comment=${encodeURIComponent(newComment)}`,
						},
					)
					const payload = await renameResp.json()
					if (!renameResp.ok || payload.status !== 'success') {
						showError(
							payload.message ||
								payload.error ||
								'Ошибка при переименовании файла',
						)
						return
					}

					const newDisplay = payload.name || finalName
					const newUrl = payload.url || (existingLink ? existingLink.href : '')
					if (fileCell) {
						if (newUrl) {
							fileCell.innerHTML = `<a href="${newUrl}" target="_blank" rel="noopener noreferrer" data-name="file_display">${newDisplay}</a>`
						} else {
							fileCell.textContent = newDisplay
						}
					}

					const commentCell = selectedRow.children[commentColIndex]
					if (commentCell) {
						commentCell.textContent = payload.comment || newComment
					}

					showSuccess('Файл успешно переименован')
					modal.close()
				} catch (err) {
					showError(err.message || 'Ошибка при переименовании файла')
				} finally {
					l.remove()
				}
			}

			form.querySelector('.button--cancel')?.addEventListener('click', () => {
				modal.close()
			})
		})
	}

	const deleteOrderDocumentButton = document.getElementById(
		'delete-order-document-button',
	)

	if (deleteOrderDocumentButton) {
		deleteOrderDocumentButton.addEventListener('click', async () => {
			let selectedRow =
				document.querySelector('tr.table__row--selected') ||
				document.querySelector('td.table__cell--selected')?.closest('tr')
			if (!selectedRow) {
				showError('Выберите файл в таблице для удаления')
				return
			}

			const table = selectedRow.closest('table')
			if (!table || !/^order-documents-/.test(table.id)) {
				showError('Выберите файл заказа в списке документов')
				return
			}

			const docId =
				selectedRow.getAttribute('data-id') ||
				selectedRow.querySelector('td')?.textContent?.trim()
			if (!docId) {
				showError('Не удалось определить ID файла')
				return
			}

			showQuestion(
				'Вы действительно хотите удалить файл?',
				'Удаление файла',
				async () => {
					const l = createLoader()
					document.body.appendChild(l)
					try {
						const resp = await fetch(`${BASE_URL}documents/delete/${docId}/`, {
							method: 'POST',
							headers: {
								'Content-Type': 'application/x-www-form-urlencoded',
								'X-CSRFToken': getCSRFToken(),
								'X-Requested-With': 'XMLHttpRequest',
							},
							credentials: 'same-origin',
						})
						const payload = await resp.json()
						l.remove()
						if (!resp.ok || payload.status !== 'success') {
							showError(
								payload.message || payload.error || 'Ошибка при удалении файла',
							)
							return
						}

						selectedRow.remove()

						try {
							const tbody = table.querySelector('tbody')
							const remaining = tbody.querySelectorAll(
								'tr:not(.table__row--summary):not(.table__row--empty)',
							)
							if (remaining.length === 0) {
								tbody.innerHTML = `<tr class="table__row--empty"><td colspan="100%" style="text-align:center;padding:20px">Нет файлов</td></tr>`
							}
						} catch (e) {}

						try {
							const documentsContainer = document.getElementById(
								'documents-container',
							)
							if (documentsContainer) {
								const tidMatch = table.id.match(/^order-documents-(\d+)/)
								const orderId = tidMatch
									? tidMatch[1]
									: documentsContainer.dataset.orderId
								const viewType = documentsContainer.dataset.viewType || 'table'
								if (viewType === 'cards' && orderId) {
									await reloadOrderFiles(orderId, viewType, documentsContainer)
								}
							}
						} catch (e) {}

						showSuccess('Файл успешно удалён')
					} catch (err) {
						l.remove()
						showError(err.message || 'Ошибка при удалении файла')
					}
				},
			)
		})
	}
})

let currentPreview = null
let previewCloseHandler = null

document.addEventListener(
	'mouseover',
	function (e) {
		const link = e.target.closest('a')
		if (!link || !link.href) return

		const td = link.closest('td')
		const tr = td && td.closest('tr')
		const table = tr && tr.closest('table')
		if (!table || !/^order-documents-/.test(table.id)) return

		const href = link.href
		const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(href)
		const isPdf = /\.pdf$/i.test(href)
		const isTxt = /\.txt$/i.test(href)
		const isWord = /\.(docx?|odt)$/i.test(href)
		const isExcel = /\.(xlsx?|ods)$/i.test(href)

		if (!isImage && !isPdf && !isTxt && !isWord && !isExcel) return

		if (currentPreview && currentPreview.dataset.contextmenu === 'true') return

		let preview = document.createElement('div')
		preview.className = 'file-preview-popup'
		preview.style.position = 'fixed'
		preview.style.zIndex = 99999
		preview.style.background = '#fff'
		preview.style.border = '1px solid #ccc'
		preview.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'
		preview.style.padding = '6px'
		preview.style.maxWidth = '400px'
		preview.style.maxHeight = '400px'
		preview.style.overflow = 'auto'

		if (isImage) {
			const img = document.createElement('img')
			img.src = href
			img.style.maxWidth = '380px'
			img.style.maxHeight = '380px'
			img.style.display = 'block'
			preview.appendChild(img)
		} else if (isPdf) {
			const pdfjsUrl =
				'/static/pdfjs/web/viewer.html?file=' + encodeURIComponent(href)
			const iframe = document.createElement('iframe')
			iframe.src = pdfjsUrl
			iframe.style.width = '380px'
			iframe.style.height = '380px'
			iframe.style.border = 'none'
			preview.appendChild(iframe)
		} else if (isTxt) {
			const pre = document.createElement('pre')
			pre.textContent = 'Загрузка...'
			pre.style.maxWidth = '380px'
			pre.style.maxHeight = '380px'
			pre.style.overflow = 'auto'
			preview.appendChild(pre)
			fetch(href)
				.then(r => r.text())
				.then(text => {
					pre.textContent = text
				})
				.catch(() => {
					pre.textContent = 'Не удалось загрузить файл'
				})
		} else if (isWord || isExcel) {
			const officeUrl =
				'https://view.officeapps.live.com/op/view.aspx?src=' +
				encodeURIComponent(href)
			const iframe = document.createElement('iframe')
			iframe.src = officeUrl
			iframe.style.width = '380px'
			iframe.style.height = '380px'
			iframe.style.border = 'none'
			preview.appendChild(iframe)
		}

		document.body.appendChild(preview)

		const movePreview = ev => {
			const x = ev.clientX + 20
			const y = ev.clientY + 20
			preview.style.left = x + 'px'
			preview.style.top = y + 'px'
		}
		movePreview(e)

		const mouseMoveHandler = movePreview
		document.addEventListener('mousemove', mouseMoveHandler)

		const removePreview = () => {
			if (preview && preview.parentNode) preview.parentNode.removeChild(preview)
			document.removeEventListener('mousemove', mouseMoveHandler)
			link.removeEventListener('mouseleave', removePreview)
		}

		link.addEventListener('mouseleave', removePreview)
	},
	true,
)

document.addEventListener(
	'contextmenu',
	function (e) {
		const link = e.target.closest('a')
		if (!link || !link.href) return

		const td = link.closest('td')
		const tr = td && td.closest('tr')
		const table = tr && tr.closest('table')
		if (!table || !/^order-documents-/.test(table.id)) return

		e.preventDefault()

		const href = link.href
		const isImage = /\.(jpe?g|png|gif|bmp|webp)$/i.test(href)
		const isPdf = /\.pdf$/i.test(href)
		const isTxt = /\.txt$/i.test(href)
		const isWord = /\.(docx?|odt)$/i.test(href)
		const isExcel = /\.(xlsx?|ods)$/i.test(href)

		if (!isImage && !isPdf && !isTxt && !isWord && !isExcel) return

		if (currentPreview && currentPreview.parentNode) {
			currentPreview.parentNode.removeChild(currentPreview)
		}
		if (previewCloseHandler) {
			document.removeEventListener('mousedown', previewCloseHandler, true)
			previewCloseHandler = null
		}

		let preview = document.createElement('div')
		preview.className = 'file-preview-popup'
		preview.style.position = 'fixed'
		preview.style.zIndex = 99999
		preview.style.background = '#fff'
		preview.style.border = '1px solid #ccc'
		preview.style.boxShadow = '0 2px 12px rgba(0,0,0,0.15)'
		preview.style.padding = '6px'
		preview.style.maxWidth = '400px'
		preview.style.maxHeight = '400px'
		preview.style.overflow = 'auto'
		preview.dataset.contextmenu = 'true'

		if (isImage) {
			const img = document.createElement('img')
			img.src = href
			img.style.maxWidth = '380px'
			img.style.maxHeight = '380px'
			img.style.display = 'block'
			preview.appendChild(img)
		} else if (isPdf) {
			const pdfjsUrl =
				'/static/pdfjs/web/viewer.html?file=' + encodeURIComponent(href)
			const iframe = document.createElement('iframe')
			iframe.src = pdfjsUrl
			iframe.style.width = '380px'
			iframe.style.height = '380px'
			iframe.style.border = 'none'
			preview.appendChild(iframe)
		} else if (isTxt) {
			const pre = document.createElement('pre')
			pre.textContent = 'Загрузка...'
			pre.style.maxWidth = '380px'
			pre.style.maxHeight = '380px'
			pre.style.overflow = 'auto'
			preview.appendChild(pre)
			fetch(href)
				.then(r => r.text())
				.then(text => {
					pre.textContent = text
				})
				.catch(() => {
					pre.textContent = 'Не удалось загрузить файл'
				})
		} else if (isWord || isExcel) {
			const officeUrl =
				'https://view.officeapps.live.com/op/view.aspx?src=' +
				encodeURIComponent(href)
			const iframe = document.createElement('iframe')
			iframe.src = officeUrl
			iframe.style.width = '380px'
			iframe.style.height = '380px'
			iframe.style.border = 'none'
			preview.appendChild(iframe)
		}

		document.body.appendChild(preview)
		preview.style.left = e.clientX + 20 + 'px'
		preview.style.top = e.clientY + 20 + 'px'

		currentPreview = preview

		previewCloseHandler = function (ev) {
			if (!preview.contains(ev.target)) {
				if (preview && preview.parentNode)
					preview.parentNode.removeChild(preview)
				document.removeEventListener('mousedown', previewCloseHandler, true)
				currentPreview = null
				previewCloseHandler = null
			}
		}
		setTimeout(() => {
			document.addEventListener('mousedown', previewCloseHandler, true)
		}, 0)
	},
	true,
)
