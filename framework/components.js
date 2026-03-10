const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getClosestIndex = (elements, targetCenterX) => {
	let bestIndex = 0;
	let bestDist = Number.POSITIVE_INFINITY;
	for(let i = 0; i < elements.length; i++)
	{
		const el = elements[i];
		const rect = el.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const dist = Math.abs(center - targetCenterX);
		if(dist >= bestDist) continue;
		bestDist = dist;
		bestIndex = i;
	}
	return bestIndex;
};

const resetScrollX = () => {
	const x = window.scrollX || window.pageXOffset || 0;
	if(!x) return;
	window.scrollTo({ left: 0, top: window.scrollY, behavior: 'instant' });
};

class LwDivider extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-divider');
		if(this.querySelector(':scope > .lw-divider__icon') &&
			this.querySelector(':scope > .lw-divider__line')) return;
		const left = document.createElement('div');
		left.className = 'lw-divider__line is-left';
		const icon = document.createElement('div');
		icon.className = 'lw-divider__icon';
		icon.textContent = '';
		const right = document.createElement('div');
		right.className = 'lw-divider__line is-right';
		this.replaceChildren(left, icon, right);
	}
}

class LwCarousel extends HTMLElement
{
	#scrollEl;
	#slides;
	#dots;
	#activeIndex = 0;
	#onScroll;
	#onPointerDown;

	connectedCallback()
	{
		this.classList.add('lw-carousel');

		if(this.querySelector(':scope > .lw-carousel__viewport')) return;

		const viewport = document.createElement('div');
		viewport.className = 'lw-carousel__viewport';

		const track = document.createElement('div');
		track.className = 'lw-carousel__track';

		const slides = Array.from(this.querySelectorAll(':scope > lw-slide'));
		for(const slide of slides)
		{
			slide.classList.add('lw-carousel__slide');
			track.append(slide);
		}

		viewport.append(track);

		const arrows = document.createElement('div');
		arrows.className = 'lw-carousel__arrows';
		const prev = document.createElement('button');
		prev.type = 'button';
		prev.className = 'lw-carousel__arrow is-prev';
		prev.setAttribute('aria-label', 'Previous');
		prev.textContent = '‹';
		const next = document.createElement('button');
		next.type = 'button';
		next.className = 'lw-carousel__arrow is-next';
		next.setAttribute('aria-label', 'Next');
		next.textContent = '›';
		arrows.append(prev, next);

		const dots = document.createElement('div');
		dots.className = 'lw-carousel__dots';

		this.replaceChildren(viewport, dots, arrows);

		this.#scrollEl = track;
		this.#slides = slides;
		this.#dots = dots;

		prev.addEventListener('click', () => this.scrollBySlides(-1));
		next.addEventListener('click', () => this.scrollBySlides(1));

		this.renderDots();
		this.#activeIndex = 0;
		this.updateActive();

		this.#onScroll = () => {
			window.clearTimeout(this.#onScroll.t);
			this.#onScroll.t = window.setTimeout(() => {
				this.syncActiveFromScroll();
			}, 50);
		};

		this.#scrollEl.addEventListener('scroll', this.#onScroll, { passive: true });

		let isDown = false;
		let startX = 0;
		let startScrollLeft = 0;
		let prevUserSelect = '';
		const stopDrag = () => {
			if(!isDown) return;
			isDown = false;
			this.#scrollEl.style.scrollBehavior = '';
			this.#scrollEl.classList.remove('is-dragging');
			document.documentElement.style.userSelect = prevUserSelect;
		};
		this.#onPointerDown = (e) => {
			if(e.button !== undefined && e.button !== 0) return;
			isDown = true;
			startX = e.clientX;
			startScrollLeft = this.#scrollEl.scrollLeft;
			this.#scrollEl.setPointerCapture?.(e.pointerId);
			this.#scrollEl.style.scrollBehavior = 'auto';
			this.#scrollEl.classList.add('is-dragging');
			prevUserSelect = document.documentElement.style.userSelect;
			document.documentElement.style.userSelect = 'none';
		};

		this.#scrollEl.addEventListener('pointerdown', this.#onPointerDown);
		this.#scrollEl.addEventListener('pointermove', (e) => {
			if(!isDown) return;
			e.preventDefault();
			const dx = e.clientX - startX;
			this.#scrollEl.scrollLeft = startScrollLeft - dx;
		});
		window.addEventListener('pointerup', stopDrag);
		window.addEventListener('pointercancel', stopDrag);
		resetScrollX();
	}

	disconnectedCallback()
	{
		if(!this.#scrollEl) return;
		if(this.#onScroll) this.#scrollEl.removeEventListener('scroll', this.#onScroll);
		if(this.#onPointerDown) this.#scrollEl.removeEventListener('pointerdown', this.#onPointerDown);
	}

	renderDots()
	{
		this.#dots.replaceChildren();
		for(let i = 0; i < this.#slides.length; i++)
		{
			const dot = document.createElement('button');
			dot.type = 'button';
			dot.className = 'lw-carousel__dot';
			dot.setAttribute('aria-label', `Slide ${i + 1}`);
			dot.addEventListener('click', () => this.scrollToIndex(i));
			this.#dots.append(dot);
		}
	}

	scrollToIndex(index)
	{
		if(!this.#scrollEl || !this.#slides.length) return;
		const i = clamp(index, 0, this.#slides.length - 1);
		const slide = this.#slides[i];
		const targetLeft = slide.offsetLeft - (this.#scrollEl.clientWidth - slide.clientWidth) / 2;
		const maxScrollLeft = this.#scrollEl.scrollWidth - this.#scrollEl.clientWidth;
		this.#scrollEl.scrollTo({ left: clamp(targetLeft, 0, maxScrollLeft), behavior: 'smooth' });
		this.#activeIndex = i;
		this.updateActive();
		resetScrollX();
	}

	scrollBySlides(delta)
	{
		this.scrollToIndex(this.#activeIndex + delta);
	}

	syncActiveFromScroll()
	{
		if(!this.#slides.length) return;
		const rect = this.#scrollEl.getBoundingClientRect();
		const center = rect.left + rect.width / 2;
		const nextIndex = getClosestIndex(this.#slides, center);
		if(nextIndex === this.#activeIndex) return;
		this.#activeIndex = nextIndex;
		this.updateActive();
	}

	updateActive()
	{
		for(let i = 0; i < this.#slides.length; i++)
		{
			this.#slides[i].classList.toggle('is-active', i === this.#activeIndex);
			const dot = this.#dots.children[i];
			if(dot) dot.classList.toggle('is-active', i === this.#activeIndex);
		}
	}
}

class LwSlide extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-slide');
	}
}

customElements.define('lw-divider', LwDivider);
customElements.define('lw-carousel', LwCarousel);
customElements.define('lw-slide', LwSlide);
