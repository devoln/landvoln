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


class LvI extends HTMLElement
{
	connectedCallback()
	{
		if(this.hasAttribute('aria-hidden') || this.hasAttribute('aria-label') || this.hasAttribute('aria-labelledby')) return;
		this.setAttribute('aria-hidden', 'true');
	}
}
customElements.define('lv-i', LvI);


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
		this.rawText = this.rawText.replaceAll('<\\/script>', '</script>');

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
		button.innerHTML = '<span class="lv-code__copy-text">Copy</span><lv-i class="lv-code__copy-icon" aria-hidden="true">&#xF328;</lv-i>';

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


class LvCarousel extends HTMLElement
{
	#scrollEl;
	#slides;
	#dots;
	#activeIndex = 0;
	#onScroll;
	#onPointerDown;
	#overlay;
	#onKeyDown;
	#overlayIndex = -1;
	#onFullscreenClick;
	#dragMoved = false;
	#dragStartX = 0;
	#overlayClosePointerId = null;
	#overlayPendingClose = false;
	#overlayTitleCleanup = null;
	#getOverlayMediaBounds = null;
	#getOverlayKeepRects = null;
	#overlayCard = null;

	connectedCallback()
	{
		this.classList.add('lv-carousel');

		if(this.querySelector(':scope > .lv-carousel__viewport')) return;

		const viewport = document.createElement('div');
		viewport.className = 'lv-carousel__viewport';

		const track = document.createElement('div');
		track.className = 'lv-carousel__track';

		const slides = Array.from(this.children);
		for(const slide of slides)
		{
			if(slide.nodeType !== 1) continue;
			if(slide.classList.contains('lv-carousel__viewport')) continue;
			if(slide.classList.contains('lv-carousel__dots')) continue;
			if(slide.classList.contains('lv-carousel__arrows')) continue;

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

		if(this.hasAttribute('fullscreen'))
		{
			this.#onFullscreenClick = (e) => {
				if(e.button !== undefined && e.button !== 0) return;
				const underPointer = document.elementFromPoint(e.clientX, e.clientY);
				const img = underPointer && underPointer.closest? underPointer.closest('img'): null;
				if(!img) return;
				if(this.#dragMoved) return;
				this.openFullscreenFromSlide(img.closest('.lv-carousel__slide'));
			};
			this.#scrollEl.addEventListener('pointerup', this.#onFullscreenClick);
		}

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
		let startScrollLeft = 0;
		let prevUserSelect = '';
		const stopDrag = () => {
			if(!isDown) return;
			isDown = false;
			this.#dragStartX = 0;
			this.#scrollEl.style.scrollBehavior = '';
			this.#scrollEl.classList.remove('is-dragging');
			document.documentElement.style.userSelect = prevUserSelect;
		};
		this.#onPointerDown = (e) => {
			if(e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label')) return;
			if(e.button !== undefined && e.button !== 0) return;
			e.preventDefault();
			isDown = true;
			this.#dragStartX = e.clientX;
			this.#dragMoved = false;
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
			const dx = e.clientX - this.#dragStartX;
			if(Math.abs(dx) > 6) this.#dragMoved = true;
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
		if(this.#onFullscreenClick) this.#scrollEl.removeEventListener('pointerup', this.#onFullscreenClick);
		if(this.#onKeyDown) window.removeEventListener('keydown', this.#onKeyDown);
	}

	openFullscreenFromSlide(slideEl)
	{
		if(!slideEl) return;
		if(!this.#slides || !this.#slides.length) return;
		const index = this.#slides.indexOf(slideEl);
		if(index < 0) return;
		this.openFullscreenIndex(index);
	}

	openFullscreenIndex(index)
	{
		if(!this.hasAttribute('fullscreen')) return;
		if(!this.#slides || !this.#slides.length) return;

		const i = clamp(index, 0, this.#slides.length - 1);
		this.scrollToIndex(i);
		this.#overlayIndex = i;

		if(!this.#overlay)
		{
			const overlay = document.createElement('div');
			overlay.className = 'lv-carousel__overlay';
			overlay.addEventListener('pointerdown', (e) => {
				if(this.#shouldKeepOverlayOpen(e.target, e.clientX, e.clientY))
				{
					this.#overlayPendingClose = false;
					this.#overlayClosePointerId = null;
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				overlay.setPointerCapture?.(e.pointerId);
				this.#overlayClosePointerId = e.pointerId;
				this.#overlayPendingClose = true;
			});
			overlay.addEventListener('pointerup', (e) => {
				if(this.#overlayClosePointerId !== e.pointerId) return;
				overlay.releasePointerCapture?.(e.pointerId);
				e.preventDefault();
				e.stopPropagation();
			});
			overlay.addEventListener('click', (e) => {
				if(!this.#overlayPendingClose) return;
				if(this.#shouldKeepOverlayOpen(e.target, e.clientX, e.clientY))
				{
					this.#overlayPendingClose = false;
					this.#overlayClosePointerId = null;
					return;
				}
				e.preventDefault();
				e.stopPropagation();
				this.#overlayPendingClose = false;
				this.#overlayClosePointerId = null;
				this.closeFullscreen();
			});
			overlay.addEventListener('pointercancel', (e) => {
				if(this.#overlayClosePointerId !== e.pointerId) return;
				this.#overlayClosePointerId = null;
				this.#overlayPendingClose = false;
				overlay.releasePointerCapture?.(e.pointerId);
			});
			this.#overlay = overlay;
		}

		this.#overlay.replaceChildren();
		if(this.#overlayTitleCleanup)
		{
			this.#overlayTitleCleanup();
			this.#overlayTitleCleanup = null;
		}
		const sourceSlide = this.#slides[i];
		const slideClone = sourceSlide.cloneNode(true);
		slideClone.classList.add('is-fullscreen', 'lv-carousel__overlay-item');
		const titleEl = slideClone.querySelector('h3');
		const mediaVisual = slideClone.querySelector('img, video, canvas');
		const chelochka = document.createElement('div');
		chelochka.className = 'lv-carousel__overlay-chelochka';
		slideClone.append(chelochka);
		if(titleEl)
		{
			titleEl.classList.add('lv-carousel__overlay-title');
			titleEl.style.color = 'rgba(255,255,255,0.996)';
			titleEl.style.textShadow = '0 1px 2px rgba(0,0,0,0.65)';
		}
		const computeMediaBounds = () => {
			const targetEl = mediaVisual;
			if(!targetEl) return null;
			const rect = targetEl.getBoundingClientRect();
			if(!rect.width || !rect.height) return null;
			let width = rect.width;
			let height = rect.height;
			const naturalWidth = 'naturalWidth' in targetEl ? targetEl.naturalWidth : ('videoWidth' in targetEl ? targetEl.videoWidth : null);
			const naturalHeight = 'naturalHeight' in targetEl ? targetEl.naturalHeight : ('videoHeight' in targetEl ? targetEl.videoHeight : null);
			if(naturalWidth && naturalHeight)
			{
				const intrinsicRatio = naturalWidth / naturalHeight;
				const boxRatio = rect.width / rect.height;
				if(boxRatio > intrinsicRatio)
				{
					height = rect.height;
					width = rect.height * intrinsicRatio;
				}
				else
				{
					width = rect.width;
					height = rect.width / intrinsicRatio;
				}
			}
			const left = rect.left + (rect.width - width) / 2;
			const top = rect.top + (rect.height - height) / 2;
			return { left, top, right: left + width, bottom: top + height, width, height };
		};
		this.#getOverlayMediaBounds = computeMediaBounds;
		const keepNodes = Array.from(slideClone.querySelectorAll('p, ul, ol, li, button, a, textarea, input, [data-overlay-keep], .lv-carousel__overlay-keep'));
		if(titleEl) keepNodes.push(titleEl);
		this.#getOverlayKeepRects = () => keepNodes
			.filter((node) => node && node.isConnected)
			.map((node) => node.getBoundingClientRect());
		const updateTitleBackdrop = () => {
			if(!titleEl)
			{
				chelochka.classList.remove('is-visible');
				return;
			}
			const mediaRect = computeMediaBounds();
			const titleRect = titleEl.getBoundingClientRect();
			const overlaps = Boolean(mediaRect &&
				titleRect.bottom > mediaRect.top &&
				titleRect.top < mediaRect.bottom &&
				titleRect.right > mediaRect.left &&
				titleRect.left < mediaRect.right);
			titleEl.classList.toggle('is-over-media', overlaps);
			if(!mediaRect || !overlaps)
			{
				chelochka.classList.remove('is-visible');
				return;
			}
			const slideRect = slideClone.getBoundingClientRect();
			const desired = titleRect.height ? (titleRect.height * 0.55) + 12 : Math.min(mediaRect.height * 0.12, 32);
			const capHeight = Math.min(Math.max(desired, 14), Math.min(mediaRect.height * 0.18, 34));
			chelochka.style.left = `${mediaRect.left - slideRect.left}px`;
			chelochka.style.top = `${mediaRect.top - slideRect.top}px`;
			chelochka.style.width = `${mediaRect.width}px`;
			chelochka.style.height = `${capHeight}px`;
			chelochka.classList.add('is-visible');
		};
		const resizeHandler = () => window.requestAnimationFrame(updateTitleBackdrop);
		let resizeObserver = null;
		let mediaLoadHandler = null;
		if(typeof window !== 'undefined')
		{
			window.addEventListener('resize', resizeHandler);
			if('ResizeObserver' in window && (titleEl || mediaVisual))
			{
				resizeObserver = new ResizeObserver(() => updateTitleBackdrop());
				if(titleEl) resizeObserver.observe(titleEl);
				if(mediaVisual) resizeObserver.observe(mediaVisual);
			}
		}
		if(mediaVisual && 'addEventListener' in mediaVisual)
		{
			mediaLoadHandler = () => window.requestAnimationFrame(updateTitleBackdrop);
			mediaVisual.addEventListener('load', mediaLoadHandler);
		}
		this.#overlayTitleCleanup = () => {
			if(typeof window !== 'undefined') window.removeEventListener('resize', resizeHandler);
			resizeObserver?.disconnect();
			if(mediaVisual && mediaLoadHandler) mediaVisual.removeEventListener('load', mediaLoadHandler);
			this.#getOverlayMediaBounds = null;
		};
		const slideWrapper = document.createElement('div');
		slideWrapper.className = 'lv-carousel__overlay-slide';
		const slideContent = document.createElement('div');
		slideContent.className = 'lv-carousel__overlay-content';
		const swipeTarget = slideClone;
		let swipePointerId = null;
		let swipeStartX = 0;
		let swipeStartY = 0;
		let swipeActive = false;
		const resetSwipeVisual = () => {
			swipeTarget.style.transition = 'transform 220ms ease, opacity 220ms ease';
			swipeTarget.style.transform = 'translateX(0)';
			swipeTarget.style.opacity = '1';
		};
		const getSwipeThreshold = () => {
			const width = swipeTarget.clientWidth || slideContent.clientWidth || window.innerWidth || 600;
			return Math.min(Math.max(width * 0.33, 120), 420);
		};
		swipeTarget.addEventListener('pointerdown', (e) => {
			if(e.button !== undefined && e.button !== 0) return;
			swipePointerId = e.pointerId;
			swipeStartX = e.clientX;
			swipeStartY = e.clientY;
			swipeActive = false;
			swipeTarget.style.transition = 'none';
			swipeTarget.style.opacity = '1';
			swipeTarget.setPointerCapture?.(e.pointerId);
		});
		swipeTarget.addEventListener('pointermove', (e) => {
			if(swipePointerId !== e.pointerId) return;
			const dx = e.clientX - swipeStartX;
			const dy = e.clientY - swipeStartY;
			if(!swipeActive)
			{
				if(Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
				swipeActive = true;
			}
			e.preventDefault();
			swipeTarget.style.transform = `translateX(${dx}px)`;
			swipeTarget.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, 0.4));
		});
		swipeTarget.addEventListener('pointerup', (e) => {
			if(swipePointerId !== e.pointerId) return;
			const dx = e.clientX - swipeStartX;
			const dy = e.clientY - swipeStartY;
			swipePointerId = null;
			swipeTarget.releasePointerCapture?.(e.pointerId);
			const threshold = getSwipeThreshold();
			const farEnough = swipeActive && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);
			const direction = dx < 0? 1: -1;
			const nextIndex = this.#overlayIndex + direction;
			if(farEnough && nextIndex >= 0 && nextIndex < this.#slides.length)
			{
				swipeTarget.style.transition = 'transform 220ms ease, opacity 220ms ease';
				swipeTarget.style.transform = `translateX(${dx < 0? -220: 220}px)`;
				swipeTarget.style.opacity = '0';
				window.setTimeout(() => this.openFullscreenIndex(nextIndex), 170);
			}
			else
			{
				resetSwipeVisual();
			}
			swipeActive = false;
		});
		swipeTarget.addEventListener('pointercancel', () => {
			swipePointerId = null;
			swipeActive = false;
			resetSwipeVisual();
		});
		resetSwipeVisual();
		slideContent.append(slideClone);
		slideWrapper.append(slideContent);
		this.#overlay.append(slideWrapper);
		this.#overlayCard = slideClone;

		const closeBtn = document.createElement('button');
		closeBtn.type = 'button';
		closeBtn.className = 'lv-carousel__overlay-close';
		closeBtn.setAttribute('aria-label', 'Close');
		closeBtn.textContent = '×';
		closeBtn.addEventListener('click', (e) => {
			e.stopPropagation();
			this.closeFullscreen();
		});
		this.#overlay.append(closeBtn);

		if(this.#slides.length > 1)
		{
			const arrows = document.createElement('div');
			arrows.className = 'lv-carousel__overlay-arrows';
			const prev = document.createElement('button');
			prev.type = 'button';
			prev.className = 'lv-carousel__overlay-arrow is-prev';
			prev.setAttribute('aria-label', 'Previous slide');
			prev.textContent = '‹';
			prev.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openFullscreenIndex(this.#overlayIndex - 1);
			});
			const next = document.createElement('button');
			next.type = 'button';
			next.className = 'lv-carousel__overlay-arrow is-next';
			next.setAttribute('aria-label', 'Next slide');
			next.textContent = '›';
			next.addEventListener('click', (e) => {
				e.stopPropagation();
				this.openFullscreenIndex(this.#overlayIndex + 1);
			});
			arrows.append(prev, next);
			this.#overlay.append(arrows);
		}

		document.body.append(this.#overlay);
		window.requestAnimationFrame(updateTitleBackdrop);

		if(!this.#onKeyDown)
		{
			this.#onKeyDown = (e) => {
				if(!this.#overlay || !this.#overlay.isConnected) return;
				if(e.key === 'Escape') return void this.closeFullscreen();
				if(e.key === 'ArrowLeft') return void this.openFullscreenIndex(this.#overlayIndex - 1);
				if(e.key === 'ArrowRight') return void this.openFullscreenIndex(this.#overlayIndex + 1);
			};
			window.addEventListener('keydown', this.#onKeyDown);
		}
	}

	closeFullscreen()
	{
		if(this.#overlayTitleCleanup)
		{
			this.#overlayTitleCleanup();
			this.#overlayTitleCleanup = null;
		}
		if(this.#overlay) this.#overlay.remove();
		this.#overlayIndex = -1;
		this.#overlayCard = null;
		this.#getOverlayMediaBounds = null;
		this.#getOverlayKeepRects = null;
	}

	#shouldKeepOverlayOpen(target, clientX, clientY)
	{
		const onControl = target?.closest?.('.lv-carousel__overlay-close, .lv-carousel__overlay-arrow');
		if(onControl) return true;
		const mediaBounds = this.#getOverlayMediaBounds?.();
		if(mediaBounds && clientY >= mediaBounds.top && clientY <= mediaBounds.bottom)
		{
			return clientX >= mediaBounds.left && clientX <= mediaBounds.right;
		}
		const keepRects = this.#getOverlayKeepRects?.() ?? [];
		if(keepRects.some((rect) => clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom))
		{
			return true;
		}
		return false;
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
customElements.define('lv-carousel', LvCarousel);
