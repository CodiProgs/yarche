document.querySelectorAll('.menu__category').forEach(category => {
	const content = category.querySelector('.menu__content')
	const header = category.querySelector('.menu__header')

	function toggleCategory() {
		const contentHeight = content.scrollHeight

		if (category.classList.contains('menu__category--active')) {
			content.style.maxHeight = `${contentHeight}px`
			requestAnimationFrame(() => {
				content.style.maxHeight = '0'
				category.classList.remove('menu__category--active')
			})
		} else {
			content.style.maxHeight = '0'
			requestAnimationFrame(() => {
				content.style.maxHeight = `${contentHeight}px`
				category.classList.add('menu__category--active')
			})
		}
	}

	header.addEventListener('click', toggleCategory)
	header.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			toggleCategory()
		}
	})
})

function toggleMenu() {
	const menuWrapper = document.getElementById('menu')

	menuWrapper.classList.toggle('menu--active')
}

document.addEventListener('DOMContentLoaded', function () {
	const burgerMenu = document.querySelector('.burger-menu')
	const overlay = document.querySelector('.overlay')
	const menu = document.querySelector('.menu')

	function toggleMenu() {
		menu.classList.toggle('menu--active')
	}

	burgerMenu.addEventListener('click', toggleMenu)
	overlay.addEventListener('click', toggleMenu)
})

document.querySelectorAll('.menu__subitem').forEach(item => {
	item.addEventListener('keydown', e => {
		if (e.key === 'Enter') {
			window.location.href = item.dataset.href
		}
	})
})
