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

class LwPage extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-page');
	}
}

class LwHeader extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-header');
		const bg = this.getAttribute('bg');
		if(bg && !this.style.getPropertyValue('--lw-header-bg'))
			this.style.setProperty('--lw-header-bg', bg);
		if(this.querySelector(':scope > .lw-header__inner')) return;
		const inner = document.createElement('div');
		inner.className = 'lw-header__inner';
		while(this.firstChild)
			inner.append(this.firstChild);
		this.append(inner);
	}
}

class LwBanner extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-banner');
		const bg = this.getAttribute('bg');
		if(bg && !this.style.getPropertyValue('--lw-banner-bg')) this.style.setProperty('--lw-banner-bg', bg);
		if(this.querySelector(':scope > .lw-banner__inner')) return;
		const inner = document.createElement('div');
		inner.className = 'lw-banner__inner';
		while(this.firstChild)
			inner.append(this.firstChild);
		this.append(inner);
	}
}

class LwSection extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-section');
		if(this.querySelector(':scope > .lw-section__container')) return;
		const container = document.createElement('div');
		container.className = 'lw-section__container';
		while(this.firstChild)
			container.append(this.firstChild);
		this.append(container);
	}
}

class LwAvatar extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-avatar');
		if(this.querySelector(':scope > img')) return;
		const img = document.createElement('img');
		img.src = this.getAttribute('src') || '';
		img.alt = this.getAttribute('alt') || '';
		img.loading = 'lazy';
		img.decoding = 'async';
		img.className = 'lw-avatar__img';
		this.append(img);
	}
}

class LwSocials extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-socials');
		for(const link of this.querySelectorAll('a'))
		{
			link.classList.add('lw-socials__item');
			if(!link.hasAttribute('target')) link.setAttribute('target', '_top');
			if(!link.hasAttribute('rel')) link.setAttribute('rel', 'noopener');
		}
	}
}

class LwButtons extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-buttons');
		for(const link of this.querySelectorAll('a'))
		{
			link.classList.add('lw-button');
			if(!link.hasAttribute('target')) link.setAttribute('target', '_blank');
			if(!link.hasAttribute('rel')) link.setAttribute('rel', 'noopener');
		}
	}
}

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

class LwFeatureList extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-feature-list');
	}
}

class LwFeature extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-feature');
		const media = document.createElement('div');
		media.className = 'lw-feature__media';
		const body = document.createElement('div');
		body.className = 'lw-feature__body';
		const image = this.getAttribute('image');
		const icon = this.getAttribute('icon');
		if(image)
		{
			const span = document.createElement('span');
			span.className = 'lw-feature__image';
			span.style.backgroundImage = `url(${image})`;
			media.append(span);
		}
		else if(icon)
		{
			const span = document.createElement('span');
			span.className = 'lw-feature__icon';
			const value = icon.trim();
			if(value.startsWith('<')) span.innerHTML = value;
			else span.classList.add(value);
			media.append(span);
		}
		else
		{
			media.classList.add('is-empty');
			this.classList.add('is-no-media');
		}
		while(this.firstChild)
			body.append(this.firstChild);
		this.replaceChildren(media, body);
	}
}

class LwCardMedia extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-card__media');
		const image = this.getAttribute('image');
		if(image) this.style.backgroundImage = `url(${image})`;
	}
}

class LwHeroGrid extends HTMLElement
{
	connectedCallback()
	{
		this.classList.add('lw-hero-grid');
		const img = this.getAttribute('image');
		const photo = this.querySelector('.lw-hero-grid__photo');
		if(photo && img) photo.style.backgroundImage = `url(${img})`;
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
			const card = slide.querySelector(':scope > .lw-card');
			track.append(slide);
			if(!card) continue;
			const maybeMedia = card.querySelector(':scope > div');
			if(!maybeMedia || maybeMedia.classList.contains('lw-card__media')) continue;
			const style = maybeMedia.getAttribute('style') || '';
			if(style.includes('background-image'))
				maybeMedia.classList.add('lw-card__media');
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

customElements.define('lw-page', LwPage);
customElements.define('lw-section', LwSection);
customElements.define('lw-avatar', LwAvatar);
customElements.define('lw-socials', LwSocials);
customElements.define('lw-buttons', LwButtons);
customElements.define('lw-divider', LwDivider);
customElements.define('lw-feature-list', LwFeatureList);
customElements.define('lw-feature', LwFeature);
customElements.define('lw-hero-grid', LwHeroGrid);
customElements.define('lw-header', LwHeader);
customElements.define('lw-banner', LwBanner);
customElements.define('lw-carousel', LwCarousel);
customElements.define('lw-slide', LwSlide);
customElements.define('lw-card-media', LwCardMedia);
