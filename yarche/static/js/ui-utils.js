import { Modal } from '/static/js/modal.js'

export function createLoader() {
	const loader = document.createElement('div')
	loader.className = 'loader'
	loader.innerHTML = `
        <div class="loader__spinner"></div>
        <span>Загрузка</span>
    `
	return loader
}

export async function showError(error) {
	const loader = createLoader()
	document.body.appendChild(loader)

	try {
		const errorModal = new Modal()
		const content = `
		<div class='modal__message'>
			<div class='modal__message-content'>
				<i class="fas fa-exclamation-circle modal__message-icon modal__message-icon--error"></i>
				<p>${error}</p>
			</div>
			<div class='modal__message-buttons'>
				<button class='button button--cancel'>Ок</button>
			</div>
		</div>
	`

		await errorModal.open(content, 'Ошибка')
	} catch (error) {
		console.error('Ошибка при открытии модального окна:', error)
	} finally {
		loader.remove()
	}
}

export async function showQuestion(question, title, onConfirm) {
	const loader = createLoader()
	document.body.appendChild(loader)

	try {
		const questionModal = new Modal()
		const content = `
		<div class='modal__message'>
			<div class='modal__message-content'>
				<i class="fas fa-question-circle modal__message-icon modal__message-icon--question"></i>
				<p>${question}</p>
			</div>
			<div class='modal__message-buttons'>
				<button id='modal__message-yes' class='button'>Да</button>
				<button class='button button--cancel'>Нет</button>
			</div>
		</div>
	`

		return questionModal.open(content, title).then(() => {
			document
				.getElementById('modal__message-yes')
				.addEventListener('click', () => {
					onConfirm()
					questionModal.close()
				})
		})
	} catch (error) {
		console.error('Ошибка при открытии модального окна:', error)
	} finally {
		loader.remove()
	}
}

export async function showSuccess(success = 'Успешно') {
	const loader = createLoader()
	document.body.appendChild(loader)

	try {
		const successModal = new Modal()
		const content = `
		<div class='modal__message'>
			<div class='modal__message-content'>
				<i class="fas fa-check-circle modal__message-icon modal__message-icon--success"></i>
				<p>${success}</p>
			</div>
			<div class='modal__message-buttons'>
				<button class='button button--cancel'>Ок</button>
			</div>
		</div>
	`

		successModal.open(content, 'Ошибка')
	} catch (error) {
		console.error('Ошибка при открытии модального окна:', error)
	} finally {
		loader.remove()
	}
}

export function getCSRFToken() {
	const cookie = document.cookie
		.split(';')
		.find(c => c.trim().startsWith('csrftoken'))

	if (cookie) {
		return cookie.split('=')[1]
	}
}

export function collapseContainer(containerId, title) {
	const container = document.getElementById(containerId)
	if (!container) return

	container.style.position = 'relative'

	const collapseBtn = document.createElement('button')
	const collapsedContent = document.createElement('div')

	collapseBtn.className = 'collapse-btn'
	collapseBtn.innerHTML = '<i class="fas fa-chevron-left"></i>'

	collapsedContent.className = 'collapsed-content'
	collapsedContent.style.opacity = '0'
	collapsedContent.innerHTML = `
        <span class="vertical-text">${title}</span>
        <button class="collapse-btn expand-btn">
            <i class="fas fa-chevron-right"></i>
        </button>
    `

	container.appendChild(collapseBtn)
	container.appendChild(collapsedContent)

	const style = document.createElement('style')
	style.textContent = `
        #${containerId} {
            transition: width 0.3s ease, opacity 0.3s ease;
        }
    `
	document.head.appendChild(style)

	collapseBtn.addEventListener('click', () => {
		container.style.width = '30px'
		collapseBtn.style.display = 'none'
		collapsedContent.style.display = 'flex'
		setTimeout(() => {
			collapsedContent.style.opacity = '1'
		}, 50)
	})

	collapsedContent
		.querySelector('.expand-btn')
		.addEventListener('click', () => {
			collapsedContent.style.opacity = '0'

			container.style.removeProperty('width')

			collapsedContent.style.display = 'none'
			collapseBtn.style.display = 'block'
		})
}

export function enableResize(elementId) {
	const el = document.getElementById(elementId)
	if (!el) {
		console.warn(`Element with id="${elementId}" not found.`)
		return
	}

	const computed = getComputedStyle(el)
	if (computed.position === 'static') {
		el.style.position = 'relative'
	}

	const handle = document.createElement('div')
	handle.className = 'resize-handle'
	el.appendChild(handle)

	let startX = 0
	let startWidth = 0
	let resizeLine = null

	handle.addEventListener('pointerdown', onPointerDown)

	function onPointerDown(e) {
		e.preventDefault()
		startX = e.clientX
		startWidth = el.getBoundingClientRect().width

		resizeLine = document.createElement('div')
		resizeLine.className = 'table__resize-line'
		Object.assign(resizeLine.style, {
			position: 'absolute',
			top: '0px',
			left: `${startWidth}px`,
			height: `${el.getBoundingClientRect().height}px`,
			width: '10px',
			backgroundColor: 'var(--color-text-secondary)',
			opacity: '0.5',
			pointerEvents: 'none',
			zIndex: '999',
		})
		el.appendChild(resizeLine)
		document.body.style.userSelect = 'none'

		document.addEventListener('pointermove', onPointerMove)
		document.addEventListener('pointerup', onPointerUp)
	}

	function onPointerMove(e) {
		e.preventDefault()
		if (!resizeLine) return
		const dx = e.clientX - startX
		const newLeft = startWidth + dx
		if (newLeft >= 0) {
			resizeLine.style.left = `${newLeft}px`
		}
	}

	function onPointerUp(e) {
		e.preventDefault()
		const dx = e.clientX - startX
		const newWidth = startWidth + dx
		if (newWidth > 0) {
			el.style.width = `${newWidth}px`
		}

		if (resizeLine) {
			resizeLine.remove()
			resizeLine = null
		}
		document.body.style.userSelect = ''

		document.removeEventListener('pointermove', onPointerMove)
		document.removeEventListener('pointerup', onPointerUp)
	}
}
