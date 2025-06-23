import { DynamicFormHandler } from '/static/js/dynamicFormHandler.js'
import { TableManager } from '/static/js/table.js'
import { showError, showQuestion } from '/static/js/ui-utils.js'

export function initTableHandlers(config) {
	const container = document.getElementById(config.containerId)
	if (!container) return

	const table = document.getElementById(config.tableId)
	if (!table) return

	TableManager.init()

	const addFormHandler = new DynamicFormHandler({
		dataUrls: config.dataUrls,
		submitUrl: config.addUrl,
		tableId: config.tableId,
		formId: config.formId,
		...(config.addModalUrl
			? {
					modalUrl: config.addModalUrl,
					modalTitle: 'Добавить запись',
					...(config.modalContext ? { modalContext: config.modalContext } : {}),
			  }
			: {
					createFormFunction: formId =>
						TableManager.createForm(formId, config.tableId),
			  }),
		onSuccess: result => TableManager.addTableRow(result, config.tableId),
	})

	const editFormHandler = new DynamicFormHandler({
		dataUrls: config.dataUrls,
		submitUrl: config.editUrl,
		tableId: config.tableId,
		formId: config.formId,
		getUrl: config.getUrl,
		...(config.editModalUrl
			? {
					modalUrl: config.editModalUrl,
					modalTitle: 'Изменить запись',
					...(config.modalContext ? { modalContext: config.modalContext } : {}),
			  }
			: {
					createFormFunction: formId =>
						TableManager.createForm(formId, config.tableId),
			  }),
		onSuccess: result => TableManager.updateTableRow(result, config.tableId),
	})

	if (config.refreshUrl) {
		container.querySelector('#refresh-button').addEventListener('click', () => {
			TableManager.hideForm(config.formId, config.tableId)
			TableManager.refresh(config.refreshUrl, config.tableId)
		})
	}

	container.querySelector('#add-button').addEventListener('click', () => {
		addFormHandler.init()
	})

	container.querySelector('#edit-button').addEventListener('click', () => {
		const selectedRowId = TableManager.getSelectedRowId(config.tableId)
		if (selectedRowId) {
			if (!config.editModalUrl) {
				editFormHandler.config.createFormFunction = formId =>
					TableManager.createForm(formId, config.tableId, selectedRowId)
			}
			editFormHandler.init(selectedRowId)
		} else {
			showError('Выберите строку для редактирования!')
		}
	})

	container.querySelector('#delete-button').addEventListener('click', () => {
		TableManager.hideForm(config.formId, config.tableId)
		const selectedRowId = TableManager.getSelectedRowId(config.tableId)
		if (selectedRowId) {
			showQuestion('Вы действительно хотите удалить запись?', 'Удаление', () =>
				TableManager.sendDeleteRequest(
					selectedRowId,
					config.deleteUrl,
					config.tableId
				)
			)
		} else {
			showError('Выберите строку для удаления!')
		}
	})
}
