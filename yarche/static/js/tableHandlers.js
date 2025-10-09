import { DynamicFormHandler } from '/static/js/dynamicFormHandler.js'
import { TableManager } from '/static/js/table.js'
import { showError, showQuestion } from '/static/js/ui-utils.js'

export function initTableHandlers(config) {
	const container = document.getElementById(config.containerId)
	if (!container) return

	const table = document.getElementById(config.tableId)
	if (!table) return

	const hasModalConfig =
		config.modalConfig && typeof config.modalConfig === 'object'
	const addModalUrl = hasModalConfig
		? config.modalConfig.addModalUrl
		: config.addModalUrl
	const editModalUrl = hasModalConfig
		? config.modalConfig.editModalUrl
		: config.editModalUrl
	const addModalTitle = hasModalConfig
		? config.modalConfig.addModalTitle
		: 'Добавить запись'
	const editModalTitle = hasModalConfig
		? config.modalConfig.editModalTitle
		: 'Изменить запись'

	const addBtnSelector = config.addButtonId
		? `#${config.addButtonId}`
		: '#add-button'
	const editBtnSelector = config.editButtonId
		? `#${config.editButtonId}`
		: '#edit-button'
	const deleteBtnSelector = config.deleteButtonId
		? `#${config.deleteButtonId}`
		: '#delete-button'
	const refreshBtnSelector = config.refreshButtonId
		? `#${config.refreshButtonId}`
		: '#refresh-button'

	const addFormHandler = new DynamicFormHandler({
		dataUrls: config.dataUrls,
		submitUrl: config.addUrl,
		tableId: config.tableId,
		formId: config.formId,
		...(addModalUrl
			? {
					modalConfig: {
						url: addModalUrl,
						title: addModalTitle,
						...(config.modalConfig.context
							? { context: config.modalConfig.context }
							: {}),
					},
			  }
			: {
					createFormFunction: formId =>
						TableManager.createForm(formId, config.tableId),
			  }),
		onSuccess: result => {
			TableManager.addTableRow(result, config.tableId)

			if (config.afterAddFunc) {
				config.afterAddFunc(result)
			}
		},
	})

	const editFormHandler = new DynamicFormHandler({
		dataUrls: config.dataUrls,
		submitUrl: config.editUrl,
		tableId: config.tableId,
		formId: config.formId,
		getUrl: config.getUrl,
		...(editModalUrl
			? {
					modalConfig: {
						url: editModalUrl,
						title: editModalTitle,
						...(config.modalConfig.context
							? { context: config.modalConfig.context }
							: {}),
					},
			  }
			: {
					createFormFunction: formId =>
						TableManager.createForm(formId, config.tableId),
			  }),
		onSuccess: result => {
			TableManager.updateTableRow(result, config.tableId)

			if (config.afterEditFunc) {
				config.afterEditFunc(result)
			}
		},
	})

	if (config.refreshUrl) {
		const refreshButton = document.querySelector(refreshBtnSelector)
		if (refreshButton) {
			refreshButton.addEventListener('click', async () => {
				await TableManager.hideForm(config.formId, config.tableId)
				await TableManager.refresh(config.refreshUrl, config.tableId)

				if (config.refreshFunc) {
					config.refreshFunc()
				}
			})
		}
	}

	const addButton = document.querySelector(addBtnSelector)
	const editButton = document.querySelector(editBtnSelector)
	const deleteButton = document.querySelector(deleteBtnSelector)

	if (addButton) {
		addButton.addEventListener('click', async () => {
			await addFormHandler.init()

			if (config.addFunc) {
				config.addFunc()
			}
		})
	}

	if (editButton) {
		editButton.addEventListener('click', async () => {
			const selectedRowId = TableManager.getSelectedRowId(config.tableId)

			if (selectedRowId) {
				if (!editModalUrl) {
					editFormHandler.config.createFormFunction = formId =>
						TableManager.createForm(formId, config.tableId, selectedRowId)
				}
				await editFormHandler.init(selectedRowId)

				if (config.editFunc) {
					config.editFunc()
				}
			} else {
				showError('Выберите строку для редактирования!')
			}
		})
	}

	if (deleteButton) {
		deleteButton.addEventListener('click', async () => {
			TableManager.hideForm(config.formId, config.tableId)
			const selectedRowId = TableManager.getSelectedRowId(config.tableId)
			if (selectedRowId) {
				showQuestion(
					'Вы действительно хотите удалить запись?',
					'Удаление',
					async () =>
						await TableManager.sendDeleteRequest(
							selectedRowId,
							config.deleteUrl,
							config.tableId
						).then(result => {
							if (config.afterDeleteFunc) {
								config.afterDeleteFunc(result)
							}
						})
				)
			} else {
				showError('Выберите строку для удаления!')
			}
		})
	}
}
