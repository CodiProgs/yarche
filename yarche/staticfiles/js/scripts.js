document.addEventListener('DOMContentLoaded', () => {
	const processInputContainers = () => {
		const inputContainers = document.querySelectorAll('.input-container')

		inputContainers.forEach(container => {
			const input = container.querySelector('input, textarea')
			const clearButton = container.querySelector('.clear-button')

			if (!input || !clearButton) return

			const updateClearButton = () => {
				if (input.value.trim() !== '') {
					container.classList.add('has-value')
					clearButton.style.display = 'flex'
				} else {
					container.classList.remove('has-value')
					clearButton.style.display = 'none'
				}
			}

			clearButton.addEventListener('click', () => {
				input.value = ''
				input.focus()
				updateClearButton()
			})

			input.addEventListener('input', () => {
				updateClearButton()
			})

			updateClearButton()
		})
	}

	processInputContainers()

	const observerInputs = new MutationObserver(() => {
		processInputContainers()
	})

	observerInputs.observe(document.body, { childList: true, subtree: true })
})

document.addEventListener('DOMContentLoaded', () => {
	const processCheckboxes = () => {
		const checkboxes = document.querySelectorAll('.checkbox')

		checkboxes.forEach(checkbox => {
			const checkboxInput = checkbox.querySelector('.checkbox__input')
			const checkboxBox = checkbox.querySelector('.checkbox__box')

			if (!checkboxInput || !checkboxBox) return

			if (checkboxBox.dataset.initialized === 'true') return
			checkboxBox.dataset.initialized = 'true'

			checkboxBox.addEventListener('keydown', event => {
				if (event.code === 'Space' && !checkboxInput.disabled) {
					event.preventDefault()
					checkboxInput.checked = !checkboxInput.checked
					checkboxInput.dispatchEvent(new Event('change'))
				}
			})
		})
	}

	processCheckboxes()

	const observer = new MutationObserver(() => {
		processCheckboxes()
	})

	observer.observe(document.body, { childList: true, subtree: true })
})

document.addEventListener('DOMContentLoaded', () => {
	const count = window.UNREAD_NOTIFICATIONS || 0
	if (count <= 0) return

	const notifUrl =
		document.querySelector('a[href*="notifications"]')?.getAttribute('href') ||
		'#'

	const toast = document.createElement('div')
	toast.className = 'toast toast--notification'
	toast.innerHTML = `
		<img src="/static/images/notification.svg" alt="уведомления" class="toast__icon">
		<span class="toast__message"><a href="${notifUrl}" style="color:inherit;text-decoration:underline;">У вас ${count} непрочитанн${count === 1 ? 'ое' : count < 5 ? 'ых' : 'ых'} уведомлени${count === 1 ? 'е' : count < 5 ? 'я' : 'й'}</a></span>
		<button class="toast__close" title="Закрыть">×</button>
	`
	document.body.appendChild(toast)

	const close = () => {
		toast.style.opacity = '0'
		toast.style.transform = 'translateY(-16px)'
		setTimeout(() => toast.remove(), 300)
	}

	toast.querySelector('.toast__close').addEventListener('click', close)

	setTimeout(close, 4000)
})
