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


const normalizeText = (text) => {
	text = text.replace(/^\n/, '').replace(/\n\s*$/, '');

	const lines = text.split('\n');
	let minIndent = Number.POSITIVE_INFINITY;
	for(const line of lines)
	{
		if(!line.trim()) continue;
		const m = line.match(/^\s*/);
		const indent = m? m[0].length: 0;
		if(indent < minIndent) minIndent = indent;
	}
	if(!Number.isFinite(minIndent) || minIndent <= 0) return text;

	return lines.map((line) => {
		if(!line.trim()) return '';
		return line.slice(minIndent);
	}).join('\n');
};


class LvCode extends HTMLElement
{
	codeEl;
	rawText = '';
	copyButton;

	connectedCallback()
	{
		this.classList.add('lv-code');
		if(this.querySelector(':scope > pre')) return;

		const script = this.querySelector(':scope > script[type="text/plain"]');
		const template = this.querySelector(':scope > template');
		if(!script && !template) return;

		this.rawText = normalizeText(script? script.textContent || '': template.innerHTML);

		const pre = document.createElement('pre');
		const code = document.createElement('code');
		code.textContent = this.rawText;
		pre.append(code);
		this.append(pre);
		this.codeEl = code;

		if(this.querySelector(':scope > .lv-code__copy')) return;

		const button = document.createElement('button');
		button.type = 'button';
		button.className = 'lv-code__copy';
		button.setAttribute('aria-label', 'Copy');
		button.innerHTML = '<span class="lv-code__copy-text">Copy</span><span class="lv-icon-mask i-copy lv-code__copy-icon" aria-hidden="true"></span>';

		button.addEventListener('pointerdown', (e) => {
			e.stopPropagation();
		});

		button.addEventListener('click', async (e) => {
			e.stopPropagation();
			try {
				await navigator.clipboard.writeText(this.rawText);
				button.style.opacity = '1';
				button.setAttribute('aria-label', 'Copied');
				window.setTimeout(() => {
					button.setAttribute('aria-label', 'Copy');
				}, 900);
			}
			catch {
				const ta = document.createElement('textarea');
				ta.value = this.rawText;
				ta.style.position = 'fixed';
				ta.style.left = '-9999px';
				document.body.append(ta);
				ta.select();
				try { document.execCommand('copy'); }
				finally { ta.remove(); }
			}
		});

		this.copyButton = button;
		this.append(button);
		this.highlight();
	}

	highlight() {}
}
customElements.define('lv-code', LvCode);


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
		this.classList.add('lv-carousel');

		if(this.querySelector(':scope > .lv-carousel__viewport')) return;

		const viewport = document.createElement('div');
		viewport.className = 'lv-carousel__viewport';

		const track = document.createElement('div');
		track.className = 'lv-carousel__track';

		const slides = Array.from(this.querySelectorAll(':scope > lv-slide'));
		for(const slide of slides)
		{
			slide.classList.add('lv-carousel__slide');
			for(const img of slide.querySelectorAll('img'))
			{
				img.draggable = false;
				img.addEventListener('dragstart', (e) => e.preventDefault());
			}
			track.append(slide);
		}

		viewport.append(track);

		const arrows = document.createElement('div');
		arrows.className = 'lv-carousel__arrows';
		const prev = document.createElement('button');
		prev.type = 'button';
		prev.className = 'lv-carousel__arrow is-prev';
		prev.setAttribute('aria-label', 'Previous');
		prev.textContent = '‹';
		const next = document.createElement('button');
		next.type = 'button';
		next.className = 'lv-carousel__arrow is-next';
		next.setAttribute('aria-label', 'Next');
		next.textContent = '›';
		arrows.append(prev, next);

		const dots = document.createElement('div');
		dots.className = 'lv-carousel__dots';

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
			if(e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label')) return;
			if(e.button !== undefined && e.button !== 0) return;
			e.preventDefault();
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
			dot.className = 'lv-carousel__dot';
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
customElements.define('lv-carousel', LwCarousel);
