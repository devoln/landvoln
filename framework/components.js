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


const createOverlayButton = (className, label, text, onClick) => {
	const button = document.createElement('button');
	button.type = 'button';
	button.className = className;
	if(label) button.setAttribute('aria-label', label);
	button.textContent = text;
	button.addEventListener('click', (e) => {
		e.stopPropagation();
		onClick(e);
	});
	return button;
};


class LvLightbox
{
	#slidesSource;
	#overlay = null;
	#contentHost = null;
	#arrows = null;
	#index = -1;
	#titleCleanup = null;
	#swipeCleanup = null;
	#wheelCleanup = null;
	#keyHandler = null;
	#onIndexChange;
	#onClose;
	#onNavigate;
	#getMediaBounds = null;
	#getKeepRects = null;
	#closePointerId = null;
	#closePointerStarted = false;
	#wheelAccumX = 0;
	#wheelNavigateLock = false;

	constructor(slides, options = {})
	{
		this.#slidesSource = slides;
		this.#onIndexChange = options.onIndexChange || (() => {});
		this.#onClose = options.onClose || (() => {});
		this.#onNavigate = options.onNavigate || null;
	}

	setSlides(slides)
	{
		this.#slidesSource = slides;
	}

	open(index = 0)
	{
		if(!this.#getSlidesArray().length) return;
		this.#ensureOverlay();
		if(!this.#overlay.isConnected) document.body.append(this.#overlay);
		this.#setIndex(index);
	}

	close()
	{
		if(!this.#overlay) return;
		this.#teardownActiveSlide();
		this.#overlay.remove();
		this.#index = -1;
		this.#onClose();
	}

	destroy()
	{
		this.close();
		if(this.#keyHandler && typeof window !== 'undefined')
		{
			window.removeEventListener('keydown', this.#keyHandler);
			this.#keyHandler = null;
		}
		this.#overlay = null;
		this.#contentHost = null;
		this.#arrows = null;
	}

	#ensureOverlay()
	{
		if(this.#overlay) return;
		const overlay = document.createElement('div');
		overlay.className = 'lv-lightbox';
		overlay.addEventListener('pointerdown', (e) => {
			if(this.#shouldCloseFromEvent(e))
			{
				e.preventDefault();
				e.stopPropagation();
			}
			this.#closePointerId = e.pointerId ?? null;
			this.#closePointerStarted = this.#shouldCloseFromEvent(e);
		});
		overlay.addEventListener('pointerup', (e) => {
			if(this.#closePointerId !== (e.pointerId ?? null)) return;
			const shouldClose = this.#closePointerStarted && this.#shouldCloseFromEvent(e);
			if(shouldClose)
			{
				e.preventDefault();
				e.stopPropagation();
			}
			this.#closePointerId = null;
			this.#closePointerStarted = false;
			if(shouldClose)
			{
				const suppressClick = (event) => {
					event.preventDefault();
					event.stopPropagation();
					window.removeEventListener('click', suppressClick, true);
				};
				window.addEventListener('click', suppressClick, true);
				window.setTimeout(() => this.close(), 0);
			}
		});
		overlay.addEventListener('pointercancel', () => {
			this.#closePointerId = null;
			this.#closePointerStarted = false;
		});

		const slideWrapper = document.createElement('div');
		slideWrapper.className = 'lv-lightbox__slide';
		const content = document.createElement('div');
		content.className = 'lv-lightbox__content';
		slideWrapper.append(content);
		overlay.append(slideWrapper);

		const closeBtn = createOverlayButton('lv-lightbox__close', 'Close', '×', () => this.close());
		overlay.append(closeBtn);

		const arrows = document.createElement('div');
		arrows.className = 'lv-lightbox__arrows';
		const prevBtn = createOverlayButton('lv-lightbox__arrow is-prev', 'Previous slide', '‹', () => this.#go(-1));
		const nextBtn = createOverlayButton('lv-lightbox__arrow is-next', 'Next slide', '›', () => this.#go(1));
		arrows.append(prevBtn, nextBtn);
		overlay.append(arrows);

		this.#overlay = overlay;
		this.#contentHost = content;
		this.#arrows = arrows;

		if(!this.#keyHandler && typeof window !== 'undefined')
		{
			this.#keyHandler = (e) => {
				if(!this.#overlay || !this.#overlay.isConnected) return;
				if(e.key === 'Escape') return void this.close();
				if(e.key === 'ArrowLeft') return void this.#go(-1);
				if(e.key === 'ArrowRight') return void this.#go(1);
			};
			window.addEventListener('keydown', this.#keyHandler);
		}
	}

	#go(delta)
	{
		const slides = this.#getSlidesArray();
		const nextIndex = this.#index + delta;
		if(nextIndex >= 0 && nextIndex < slides.length)
			return void this.#setIndex(nextIndex);
		if(this.#onNavigate)
			return void this.#onNavigate(delta);
		this.#setIndex(nextIndex);
	}

	#animateGo(delta)
	{
		if(this.#wheelNavigateLock) return;
		const slides = this.#getSlidesArray();
		const nextIndex = this.#index + delta;
		if(nextIndex < 0 || nextIndex >= slides.length)
		{
			if(this.#onNavigate)
			{
				this.#wheelNavigateLock = true;
				this.#onNavigate(delta);
				window.setTimeout(() => {
					this.#wheelNavigateLock = false;
				}, 280);
			}
			return;
		}

		const activeItem = this.#contentHost?.firstElementChild;
		if(!(activeItem instanceof HTMLElement))
		{
			this.#wheelNavigateLock = true;
			this.#go(delta);
			window.setTimeout(() => {
				this.#wheelNavigateLock = false;
			}, 280);
			return;
		}

		this.#wheelNavigateLock = true;
		activeItem.style.transition = 'transform 220ms ease, opacity 220ms ease';
		activeItem.style.transform = `translateX(${delta > 0? -220: 220}px)`;
		activeItem.style.opacity = '0';
		window.setTimeout(() => {
			this.#setIndex(nextIndex);
		}, 170);
		window.setTimeout(() => {
			this.#wheelNavigateLock = false;
		}, 280);
	}

	#getSlidesArray()
	{
		const source = typeof this.#slidesSource === 'function'? this.#slidesSource(): this.#slidesSource;
		if(Array.isArray(source)) return source;
		if(!source) return [];
		return Array.from(source);
	}

	#setIndex(index)
	{
		const slides = this.#getSlidesArray();
		if(!slides.length) return;
		const nextIndex = clamp(index, 0, slides.length - 1);
		if(this.#arrows) this.#arrows.hidden = slides.length <= 1;
		this.#index = nextIndex;
		this.#renderActiveSlide(slides[nextIndex]);
		this.#onIndexChange(this.#index);
	}

	#renderActiveSlide(sourceSlide)
	{
		if(!sourceSlide || !this.#contentHost) return;
		this.#teardownActiveSlide();

		const clone = sourceSlide.cloneNode(true);
		clone.classList.add('lv-lightbox__item');

		const headerUnderlay = document.createElement('div');
		headerUnderlay.className = 'lv-lightbox__h3underlay';
		clone.append(headerUnderlay);

		const titleEl = clone.querySelector('h3');
		if(titleEl) titleEl.classList.add('lv-lightbox__title');
		const mediaVisual = clone.querySelector('img, video, canvas');

		const computeMediaBounds = () => {
			if(!mediaVisual) return null;
			const rect = mediaVisual.getBoundingClientRect();
			if(!rect.width || !rect.height) return null;
			let { width, height } = rect;
			const naturalWidth = mediaVisual.naturalWidth ?? mediaVisual.videoWidth ?? null;
			const naturalHeight = mediaVisual.naturalHeight ?? mediaVisual.videoHeight ?? null;
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
		this.#getMediaBounds = computeMediaBounds;

		const keepNodes = Array.from(clone.querySelectorAll("p, button, a, input, select, textarea, label"));
		keepNodes.push(...(this.#arrows?.children || []));
		//if(titleEl) keepNodes.push(titleEl);
		this.#getKeepRects = () => keepNodes
			.filter((node) => node && node.isConnected)
			.map((node) => node.getBoundingClientRect());

		this.#wireInteractiveClone(clone, sourceSlide);

		this.#contentHost.replaceChildren(clone);
		this.#titleCleanup = this.#setupTitleEffects(clone, titleEl, mediaVisual, headerUnderlay, computeMediaBounds);
		this.#swipeCleanup = this.#attachSwipe(clone);
		this.#wheelCleanup = this.#attachWheel(clone);
	}

	#wireInteractiveClone(clone, sourceSlide)
	{
		const cloneButtons = Array.from(clone.querySelectorAll('button'));
		const sourceButtons = Array.from(sourceSlide.querySelectorAll('button'));
		cloneButtons.forEach((button, index) => {
			const sourceButton = sourceButtons[index];
			if(!sourceButton) return;
			button.disabled = sourceButton.disabled;
			button.addEventListener('click', (event) => {
				event.preventDefault();
				event.stopPropagation();
				if(sourceButton.disabled) return;
				sourceButton.dispatchEvent(new MouseEvent('click', {
					bubbles: true,
					cancelable: true,
					composed: true,
					view: window
				}));
				window.setTimeout(() => {
					const slides = this.#getSlidesArray();
					const nextSourceSlide = slides[this.#index];
					if(nextSourceSlide) this.#renderActiveSlide(nextSourceSlide);
				}, 0);
			});
		});
	}

	#shouldCloseFromEvent(event)
	{
		const clientX = typeof event?.clientX === 'number'? event.clientX: Number.POSITIVE_INFINITY;
		const clientY = typeof event?.clientY === 'number'? event.clientY: Number.POSITIVE_INFINITY;
		if(this.#pointInsideKeepRects(clientX, clientY)) return false;
		if(this.#pointInsideMedia(clientX, clientY)) return false;
		return true;
	}

	#pointInsideMedia(x, y)
	{
		const bounds = this.#getMediaBounds?.();
		return bounds && x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
	}

	#pointInsideKeepRects(x, y)
	{
		const rects = this.#getKeepRects?.() ?? [];
		for(const rect of rects)
			if(x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) return true;
		return false;
	}

	#setupTitleEffects(slideClone, titleEl, mediaVisual, headerUnderlay, computeMediaBounds)
	{
		const updateTitleBackdrop = () => {
			if(!titleEl)
			{
				headerUnderlay.classList.remove('is-visible');
				return;
			}
			const mediaRect = computeMediaBounds();
			const titleRect = titleEl.getBoundingClientRect();
			const overlaps = mediaRect &&
				titleRect.bottom > mediaRect.top &&
				titleRect.top < mediaRect.bottom &&
				titleRect.right > mediaRect.left &&
				titleRect.left < mediaRect.right;
			titleEl.classList.toggle('is-over-media', overlaps);
			if(!mediaRect || !overlaps)
			{
				headerUnderlay.classList.remove('is-visible');
				return;
			}
			const slideRect = slideClone.getBoundingClientRect();
			const desired = titleRect.height? (titleRect.height * 0.55) + 12: Math.min(mediaRect.height * 0.12, 32);
			const capHeight = Math.min(Math.max(desired, 14), Math.min(mediaRect.height * 0.18, 34));
			headerUnderlay.style.left = `${mediaRect.left - slideRect.left}px`;
			headerUnderlay.style.top = `${mediaRect.top - slideRect.top}px`;
			headerUnderlay.style.width = `${mediaRect.width}px`;
			headerUnderlay.style.height = `${capHeight}px`;
			headerUnderlay.classList.add('is-visible');
		};

		const cleanupFns = [];
		const resizeHandler = () => window.requestAnimationFrame(updateTitleBackdrop);
		window.addEventListener('resize', resizeHandler);
		cleanupFns.push(() => window.removeEventListener('resize', resizeHandler));

		if('ResizeObserver' in window && (titleEl || mediaVisual))
		{
			const resizeObserver = new ResizeObserver(() => updateTitleBackdrop());
			if(titleEl) resizeObserver.observe(titleEl);
			if(mediaVisual) resizeObserver.observe(mediaVisual);
			cleanupFns.push(() => resizeObserver.disconnect());
		}

		if(mediaVisual && 'addEventListener' in mediaVisual)
		{
			const mediaLoadHandler = () => window.requestAnimationFrame(updateTitleBackdrop);
			mediaVisual.addEventListener('load', mediaLoadHandler);
			cleanupFns.push(() => mediaVisual.removeEventListener('load', mediaLoadHandler));
		}

		window.requestAnimationFrame(updateTitleBackdrop);
		return () => {for(const fn of cleanupFns) fn();};
	}

	#attachSwipe(target)
	{
		if(!target) return null;
		let pointerId = null;
		let startX = 0, startY = 0;
		let swipeActive = false;

		const resetVisual = () => {
			target.style.transition = 'transform 220ms ease, opacity 220ms ease';
			target.style.transform = 'translateX(0)';
			target.style.opacity = '1';
		};

		const onPointerDown = (e) => {
			if(e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label')) return;
			if(e.button !== undefined && e.button !== 0) return;
			pointerId = e.pointerId;
			startX = e.clientX;
			startY = e.clientY;
			swipeActive = false;
			target.style.transition = 'none';
			target.style.opacity = '1';
			target.setPointerCapture?.(e.pointerId);
		};

		const onPointerMove = (e) => {
			if(pointerId !== e.pointerId) return;
			const dx = e.clientX - startX;
			const dy = e.clientY - startY;
			if(!swipeActive)
			{
				if(Math.abs(dx) < 12 || Math.abs(dx) <= Math.abs(dy)) return;
				swipeActive = true;
			}
			e.preventDefault();
			target.style.transform = `translateX(${dx}px)`;
			target.style.opacity = String(1 - Math.min(Math.abs(dx) / 600, 0.4));
		};

		const onPointerUp = (e) => {
			if(pointerId !== e.pointerId) return;
			const dx = e.clientX - startX, dy = e.clientY - startY;
			pointerId = null;
			target.releasePointerCapture?.(e.pointerId);
			const threshold = Math.min(Math.max(target.clientWidth * 0.33, 120), 420);
			const farEnough = swipeActive && Math.abs(dx) >= threshold && Math.abs(dx) > Math.abs(dy);
			const direction = dx < 0 ? 1 : -1;
			if(farEnough)
			{
				target.style.transition = 'transform 220ms ease, opacity 220ms ease';
				target.style.transform = `translateX(${dx < 0? -220: 220}px)`;
				target.style.opacity = '0';
				window.setTimeout(() => this.#go(direction), 170);
			}
			else resetVisual();
			swipeActive = false;
		};

		const onPointerCancel = () => {
			pointerId = null;
			swipeActive = false;
			resetVisual();
		};

		target.addEventListener('pointerdown', onPointerDown);
		target.addEventListener('pointermove', onPointerMove);
		target.addEventListener('pointerup', onPointerUp);
		target.addEventListener('pointercancel', onPointerCancel);
		resetVisual();

		return () => {
			target.removeEventListener('pointerdown', onPointerDown);
			target.removeEventListener('pointermove', onPointerMove);
			target.removeEventListener('pointerup', onPointerUp);
			target.removeEventListener('pointercancel', onPointerCancel);
		};
	}

	#attachWheel(target)
	{
		if(!target) return null;
		const threshold = 56;
		const normalizeWheelDelta = (event) => {
			const deltaX = event.deltaMode === 1? event.deltaX * 16: event.deltaMode === 2? event.deltaX * window.innerWidth * 0.85: event.deltaX;
			const deltaY = event.deltaMode === 1? event.deltaY * 16: event.deltaMode === 2? event.deltaY * window.innerWidth * 0.85: event.deltaY;
			return Math.abs(deltaX) >= Math.abs(deltaY)? deltaX: (event.shiftKey? deltaY: 0);
		};

		const onWheel = (e) => {
			const primaryDelta = normalizeWheelDelta(e);
			if(!primaryDelta) return;
			e.preventDefault();
			this.#wheelAccumX += primaryDelta;
			if(Math.abs(this.#wheelAccumX) < threshold) return;
			const direction = this.#wheelAccumX > 0 ? 1 : -1;
			this.#wheelAccumX = 0;
			this.#animateGo(direction);
		};

		target.addEventListener('wheel', onWheel, {passive: false});
		return () => {
			target.removeEventListener('wheel', onWheel);
			this.#wheelAccumX = 0;
			this.#wheelNavigateLock = false;
		};
	}

	#teardownActiveSlide()
	{
		this.#titleCleanup?.();
		this.#titleCleanup = null;
		this.#swipeCleanup?.();
		this.#swipeCleanup = null;
		this.#wheelCleanup?.();
		this.#wheelCleanup = null;
		this.#contentHost?.replaceChildren();
		this.#getMediaBounds = null;
		this.#getKeepRects = null;
	}
}

if(typeof window !== 'undefined') window.LvLightbox = LvLightbox;


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
	#scrollEl = null;
	#viewport = null;
	#dots = null;
	#slides = [];
	#activeIndex = 0;
	#dragMoved = false;
	#dragStartX = 0;
	#mediaOverlay = null;
	#onScroll = null;
	#onPointerDown = null;
	#onFullscreenClick = null;
	#onKeyDown = null;
	#fullscreenPressPointerId = null;
	#fullscreenPressSlide = null;
	#resizeObserver = null;

	connectedCallback()
	{
		this.classList.add('lv-carousel');
		if(!this.hasAttribute('tabindex')) this.tabIndex = 0;

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
		this.#viewport = viewport;
		this.#slides = slides;
		this.#dots = dots;

		prev.addEventListener('click', () => this.scrollBySlides(-1));
		next.addEventListener('click', () => this.scrollBySlides(1));

		if(this.hasAttribute('fullscreen'))
		{
			this.#mediaOverlay = new LvLightbox(() => this.#slides, {
				onIndexChange: (index) => {
					if(this.#activeIndex === index) return;
					this.scrollToIndex(index);
				},
				onNavigate: (delta) => this.#moveLightbox(delta)
			});
			this.#scrollEl.addEventListener('pointerdown', (e) => {
				if(e.target && e.target.closest && e.target.closest('a,button,input,textarea,select,label'))
				{
					this.#fullscreenPressPointerId = null;
					this.#fullscreenPressSlide = null;
					return;
				}
				const target = e.target instanceof Element ? e.target : null;
				const slide = target?.closest?.('.lv-carousel__slide') || null;
				const img = target?.closest?.('img') || null;
				this.#fullscreenPressPointerId = e.pointerId ?? null;
				this.#fullscreenPressSlide = img && slide ? slide : null;
			});
			this.#onFullscreenClick = (e) => {
				if(this.#fullscreenPressPointerId !== (e.pointerId ?? null)) return;
				const startedSlide = this.#fullscreenPressSlide;
				this.#fullscreenPressPointerId = null;
				this.#fullscreenPressSlide = null;
				if(e.button !== undefined && e.button !== 0) return;
				const underPointer = document.elementFromPoint(e.clientX, e.clientY);
				const img = underPointer && underPointer.closest? underPointer.closest('img'): null;
				if(!img) return;
				if(this.#dragMoved) return;
				const slide = img.closest('.lv-carousel__slide');
				if(!startedSlide || !slide || slide !== startedSlide) return;
				this.openFullscreenFromSlide(slide);
			};
			this.#scrollEl.addEventListener('pointerup', this.#onFullscreenClick);
			this.#scrollEl.addEventListener('pointercancel', () => {
				this.#fullscreenPressPointerId = null;
				this.#fullscreenPressSlide = null;
			});
		}

		this.renderDots();
		this.#activeIndex = 0;
		this.updateActive();
		this.#updateUnderfilledState();

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
		this.#onKeyDown = (e) => {
			if(e.key === 'ArrowLeft')
			{
				e.preventDefault();
				this.scrollBySlides(-1);
			}
			else if(e.key === 'ArrowRight')
			{
				e.preventDefault();
				this.scrollBySlides(1);
			}
		};
		this.addEventListener('keydown', this.#onKeyDown);
		this.#scrollEl.addEventListener('pointermove', (e) => {
			if(!isDown) return;
			e.preventDefault();
			const dx = e.clientX - this.#dragStartX;
			if(Math.abs(dx) > 6) this.#dragMoved = true;
			this.#scrollEl.scrollLeft = startScrollLeft - dx;
		});
		window.addEventListener('pointerup', stopDrag);
		window.addEventListener('pointercancel', stopDrag);
		if('ResizeObserver' in window)
		{
			this.#resizeObserver = new ResizeObserver(() => this.#updateUnderfilledState());
			this.#resizeObserver.observe(this.#viewport);
			this.#resizeObserver.observe(this.#scrollEl);
			for(const slide of this.#slides)
				this.#resizeObserver.observe(slide);
		}
		resetScrollX();
	}

	disconnectedCallback()
	{
		if(!this.#scrollEl) return;
		if(this.#onScroll) this.#scrollEl.removeEventListener('scroll', this.#onScroll);
		if(this.#onPointerDown) this.#scrollEl.removeEventListener('pointerdown', this.#onPointerDown);
		if(this.#onFullscreenClick) this.#scrollEl.removeEventListener('pointerup', this.#onFullscreenClick);
		if(this.#onKeyDown) this.removeEventListener('keydown', this.#onKeyDown);
		this.#resizeObserver?.disconnect();
		this.#resizeObserver = null;
		this.#mediaOverlay?.destroy();
		this.#mediaOverlay = null;
	}

	#updateUnderfilledState()
	{
		if(!this.#scrollEl || !this.#viewport) return;
		const isBleedFull = this.getAttribute('bleed') === 'full';
		if(!isBleedFull)
		{
			this.classList.remove('is-underfilled');
			return;
		}
		const viewportWidth = this.#viewport.clientWidth;
		const contentWidth = this.#scrollEl.scrollWidth;
		const isUnderfilled = viewportWidth > 0 && contentWidth <= viewportWidth + 1;
		this.classList.toggle('is-underfilled', isUnderfilled);
		if(isUnderfilled) this.#scrollEl.scrollLeft = 0;
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
		const targetIndex = clamp(index, 0, this.#slides.length - 1);
		this.scrollToIndex(targetIndex);
		this.#mediaOverlay?.open(targetIndex);
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
		const nextIndex = this.#activeIndex + delta;
		if(nextIndex >= 0 && nextIndex < this.#slides.length)
		{
			this.scrollToIndex(nextIndex);
			return;
		}

		if(this.#navigateToLinkedCarousel(delta, false)) return;
		this.scrollToIndex(nextIndex);
	}

	#moveLightbox(delta)
	{
		const nextIndex = this.#indexForLightbox() + delta;
		if(nextIndex >= 0 && nextIndex < this.#slides.length)
			return this.#mediaOverlay?.open(nextIndex);
		this.#navigateToLinkedCarousel(delta, true);
	}

	#indexForLightbox()
	{
		return this.#activeIndex;
	}

	#navigateToLinkedCarousel(delta, openFullscreen)
	{
		const groupName = this.getAttribute('group');
		if(!groupName) return false;
		const siblings = Array.from(document.querySelectorAll(`lv-carousel[group="${CSS.escape(groupName)}"]`));
		const currentIndex = siblings.indexOf(this);
		if(currentIndex < 0) return false;
		const targetCarousel = siblings[currentIndex + (delta > 0? 1: -1)];
		if(!(targetCarousel instanceof LvCarousel)) return false;
		const targetIndex = delta > 0? 0: Math.max(0, targetCarousel.#slides.length - 1);
		if(openFullscreen)
		{
			this.#mediaOverlay?.close?.();
			targetCarousel.openFullscreenIndex(targetIndex);
		}
		else
		{
			targetCarousel.scrollToIndex(targetIndex);
			targetCarousel.focus();
		}
		return true;
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


class LvTr extends HTMLElement
{
	#key = '';
	#defaultText = '';

	connectedCallback()
	{
		this.#key = this.getAttribute('str') || '';
		if(!this.#defaultText) this.#defaultText = this.textContent || '';
		this.update();
	}

	update()
	{
		const lang = (window.LvTrLanguage || document.documentElement.lang || 'en').toLowerCase();
		if(!this.#key)
		{
			this.textContent = this.#defaultText;
			return;
		}
		const normalized = lang.split('-')[0];
		const dict = window.LvTrDict && (window.LvTrDict[lang] || window.LvTrDict[normalized]);
		const translated = dict && dict[this.#key];
		this.textContent = typeof translated === 'string' && translated.length? translated: this.#defaultText;
	}
}

if(!customElements.get('lv-tr'))
	customElements.define('lv-tr', LvTr);

function updateAllTr()
{
	for(const el of document.querySelectorAll('lv-tr'))
		el.update?.();
}

function detectBrowserLanguage()
{
	const langs = (typeof navigator !== 'undefined' && Array.isArray(navigator.languages) && navigator.languages.length)
		? navigator.languages
		: [typeof navigator !== 'undefined'? navigator.language: 'en'];

	for(const lang of langs)
	{
		const lc = (lang || '').toLowerCase();
		if(lc === 'ru' || lc.startsWith('ru-')) return 'ru';
	}
	return 'en';
}

window.LvSetLang = (lang) => {
	window.LvTrLanguage = lang;
	document.documentElement.lang = lang;
	updateAllTr();
};

function initParallax()
{
	const enabled = document.body?.getAttribute('data-lv-parallax');
	if(!enabled) return;

	const strength = Number(enabled) || 1;
	const apply = () => {
		const y = window.scrollY || 0;
		document.body.style.setProperty('--lv-bg-parallax-y', `${Math.round(y * 0.22 * strength)}px`);
	};
	apply();
	window.addEventListener('scroll', apply, { passive: true });
}

window.LvInit = () => {
	if(!window.LvTrLanguage)
		window.LvTrLanguage = detectBrowserLanguage() || document.documentElement.lang || 'en';

	document.documentElement.lang = window.LvTrLanguage;
	updateAllTr();
	initParallax();
};

if(typeof window !== 'undefined')
	window.LvInit?.();
