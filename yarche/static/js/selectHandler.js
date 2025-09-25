import { createLoader } from '/static/js/ui-utils.js'

export default class SelectHandler {
	static setupSelects({
		data = null,
		url = null,
		select = null,
		includeValuesInSearch = false,
	}) {
		if (select) {
			if (data) {
				const multiple = select.dataset.multiple === 'true'
				const dropdown = select.querySelector('.select__dropdown')

				if (dropdown) {
					dropdown.replaceChildren(...this.createSelectOptions(data, multiple))
					this.attachOptionHandlers(select, multiple)
				}
			}
			this.setupSelectBehavior(select, url, includeValuesInSearch)
		} else {
			const selects = document.querySelectorAll('.select')

			if (!selects.length) return

			selects.forEach(select => {
				if (data) {
					const multiple = select.dataset.multiple === 'true'

					const dropdown = select.querySelector('.select__dropdown')
					if (dropdown) {
						dropdown.replaceChildren(
							...this.createSelectOptions(data, multiple)
						)
						this.attachOptionHandlers(select, multiple)
					}
				}
				this.setupSelectBehavior(select, url, includeValuesInSearch)
			})
		}
	}

	static updateSelectOptions(select, data) {
		if (!select || !data) return
		const dropdown = select.querySelector('.select__dropdown')
		if (!dropdown) return

		const multiple = select.dataset.multiple === 'true'
		const options = this.createSelectOptions(data, multiple)

		dropdown.replaceChildren(...options)
		this.attachOptionHandlers(select, multiple)

		const input = select.querySelector('.select__input')
		const text = select.querySelector('.select__text')
		if (input) input.value = ''
		if (text) {
			const ph = input ? input.getAttribute('placeholder') || '' : ''
			text.textContent = ph
			text.classList.add('select__placeholder')
		}
		select.classList.remove('has-value')
		return dropdown
	}

	static createSelectOptions(data, multiple = false, selectedValues = []) {
		return data.map(item => {
			const option = document.createElement('div')
			option.className = 'select__option'
			option.tabIndex = 0
			option.dataset.value = item.id
			option.textContent = item.name

			if (multiple) {
				const checkbox = document.createElement('span')
				checkbox.className = 'select__checkbox'
				checkbox.innerHTML = selectedValues.includes(item.id) ? '✔️' : ''
				option.prepend(checkbox)
			}

			return option
		})
	}

	static async fetchSelectOptions(url) {
		const loader = createLoader()
		document.body.appendChild(loader)
		try {
			const response = await fetch(url, {
				headers: { 'X-Requested-With': 'XMLHttpRequest' },
			})
			if (!response.ok) {
				throw new Error(`Ошибка загрузки данных с ${url}: ${response.status}`)
			}
			return await response.json()
		} catch (error) {
			console.error('Ошибка получения данных для select:', error)
			return []
		} finally {
			loader.remove()
		}
	}

	static async populateSelectOptions(select, url) {
		const dropdown = select.querySelector('.select__dropdown')
		if (!dropdown) return

		const data = await this.fetchSelectOptions(url)
		const multiple = select.dataset.multiple === 'true'

		dropdown.replaceChildren(...this.createSelectOptions(data, multiple))
		this.attachOptionHandlers(select, multiple)
	}

	static setupSelectBehavior(select, url, includeValuesInSearch = false) {
		const control = select.querySelector('.select__control')
		const dropdown = select.querySelector('.select__dropdown')
		const clearButton = select.querySelector('.select__clear')
		const input = select.querySelector('.select__input')
		const text = select.querySelector('.select__text')

		const updateClearButton = () => {
			if (input.value) {
				select.classList.add('has-value')
			} else {
				select.classList.remove('has-value')
			}
		}

		if (clearButton) {
			clearButton.addEventListener('click', e => {
				e.stopPropagation()
				input.value = ''
				const placeholder = input.getAttribute('placeholder') || ''
				text.textContent = placeholder
				text.classList.add('select__placeholder')
				select.classList.remove('has-value')
				if (includeValuesInSearch) {
					dropdown.querySelectorAll('.select__option').forEach(opt => {
						opt.style.display = ''
					})
				}
			})
		}

		const toggleSelect = async () => {
			if (!dropdown.hasChildNodes() && url) {
				await this.populateSelectOptions(select, url)

				if (includeValuesInSearch && dropdown) {
					let searchInput = dropdown.querySelector('.select__search-input')
					if (!searchInput) {
						searchInput = document.createElement('input')
						searchInput.type = 'text'
						searchInput.className = 'select__search-input'
						searchInput.placeholder = 'Поиск'
						dropdown.prepend(searchInput)
					}
					searchInput.addEventListener('input', () => {
						const search = searchInput.value.trim().toLowerCase()
						dropdown.querySelectorAll('.select__option').forEach(opt => {
							const text = opt.textContent.trim().toLowerCase()
							opt.style.display = text.includes(search) ? '' : 'none'
						})
					})
				}
			}

			select.classList.toggle('active')
		}

		control.addEventListener('click', toggleSelect)
		control.addEventListener('keydown', e => {
			if (e.key === 'Enter') toggleSelect()
		})

		document.addEventListener('click', e => {
			if (!select.contains(e.target)) {
				select.classList.remove('active')
			}
		})

		updateClearButton()
	}

	static attachOptionHandlers(select, multiple = false) {
		const input = select.querySelector('.select__input')
		const text = select.querySelector('.select__text')

		if (multiple) {
			select.querySelectorAll('.select__option').forEach(option => {
				option.addEventListener('click', () => {
					let selectedValues = input.value
						? input.value
								.split(',')
								.map(v => v.trim())
								.filter(Boolean)
						: []
					const value = option.dataset.value
					const checkbox = option.querySelector('.select__checkbox')
					if (selectedValues.includes(value)) {
						selectedValues = selectedValues.filter(v => v !== value)
						checkbox.innerHTML = ''
					} else {
						selectedValues.push(value)
						checkbox.innerHTML = '✔️'
					}
					select.querySelectorAll('.select__option').forEach(opt => {
						const cb = opt.querySelector('.select__checkbox')
						if (cb)
							cb.innerHTML = selectedValues.includes(opt.dataset.value)
								? '✔️'
								: ''
					})
					input.value = selectedValues.join(',')
					text.textContent = selectedValues.length
						? `Выбрано: ${selectedValues.length}`
						: input.getAttribute('placeholder') || ''
					text.classList.toggle(
						'select__placeholder',
						selectedValues.length === 0
					)
					select.classList.toggle('has-value', selectedValues.length > 0)
				})
			})
		} else {
			select.querySelectorAll('.select__option').forEach(option => {
				const handleSelect = () => {
					text.textContent = option.textContent
					input.value = option.dataset.value
					select.classList.remove('active')
					select.classList.add('has-value')
					text.classList.remove('select__placeholder')

					input.dispatchEvent(new Event('change', { bubbles: true }))
				}
				option.addEventListener('click', handleSelect)
				option.addEventListener('keydown', e => {
					if (e.key === 'Enter') handleSelect()
				})
			})
		}
	}

	static restoreSelectValue(select, value = null) {
		if (!select) return

		const input = select.querySelector('.select__input')
		const text = select.querySelector('.select__text')
		if (!input || !text) return

		const val = value || input.value || input.getAttribute('value')
		if (!val) return

		const option = select.querySelector(
			`.select__option[data-value="${CSS.escape(val)}"]`
		)
		if (!option) return

		input.value = val
		text.textContent = option.textContent
		text.classList.remove('select__placeholder')
		select.classList.add('has-value')
	}
}
