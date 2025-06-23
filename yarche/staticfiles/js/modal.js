export class Modal {
	constructor() {
		this.modal = null
	}

	async init() {
		const response = await fetch('/components/modal/', {
			headers: { 'X-Requested-With': 'XMLHttpRequest' },
		})
		const html = await response.text()

		this.modal = document.createElement('div')
		this.modal.innerHTML = html
		this.modal = this.modal.firstElementChild

		const content = document.querySelector('.container')
		content.inert = true
	}

	addEventListeners() {
		const closeBtn = this.modal.querySelector('.modal__close')
		const cancelBtn = this.modal.querySelector('.button--cancel')

		closeBtn.addEventListener('click', () => this.close())

		if (cancelBtn) {
			cancelBtn.addEventListener('click', () => {
				this.close()
			})
		}
	}

	async open(content, title = '') {
		if (!this.modal) await this.init()

		this.modal.querySelector('.modal__title').textContent = title
		this.modal.querySelector('.modal__body').innerHTML = content

		this.addEventListeners()

		document.body.appendChild(this.modal)

		return this.modal
	}

	close() {
		const content = document.querySelector('.container')
		content.inert = false

		this.modal.remove()
	}
}
