# LandVoln

LandVoln is an experimental, minimalistic framework for building static landing pages using custom HTML tags and light content blocks. It aims to keep pages readable and hackable as plain HTML + CSS, without relying on heavy JavaScript frameworks or a build step.

Most elements are fully usable without JS. Interactive components (currently: carousel) enhance the UX with a small amount of JavaScript, while still degrading gracefully.

## Key Features

- **Custom HTML DSL**: each content block has its own tag (e.g. `<lv-header>`, `<lv-section>`, `<lv-carousel>`), so the markup stays declarative.
- **No build step**: open `index.html` in a browser and iterate.
- **Minimal JS**: only components that require interactivity use tiny scripts (currently: carousel).
- **Theme support**: visual style is controlled via CSS variables in separate theme files.
- **Static deployment**: copy files to any static host (or GitHub Pages).
- **Fork-friendly defaults**: the demo page includes a commented-out social links template users can uncomment and fill in.

## Principles

- Keep HTML readable.
- Prefer progressive enhancement.
- Avoid external dependencies.
- Prefer small reusable blocks over complex abstractions.

## Getting Started

See a working example at [`lv-demo/index.html`](lv-demo/index.html).

Theme examples:

- [`framework/themes/theme1/theme.css`](framework/themes/theme1/theme.css)
- [`framework/themes/theme2/theme.css`](framework/themes/theme2/theme.css)

Create a new landing by copying the demo:

1. Copy `lv-demo/` into your own folder, e.g. `my-landing/`.
2. Edit `my-landing/index.html`:
	- replace the content
	- update social links
	- update CTA buttons
3. Pick a theme file or create your own.

### Minimal page skeleton

```html
<link rel="stylesheet" href="../assets/fonts/icons/icons.css" />

<link rel="stylesheet" href="../framework/themes/theme2/theme.css" />
<link rel="stylesheet" href="../framework/styles/core.css" />
<link rel="stylesheet" href="../framework/styles/components.css" />

<script type="module" src="../framework/components.js"></script>

<lv-page>
	<lv-header>...</lv-header>
	<lv-section>...</lv-section>
	<lv-section>
		<lv-carousel>
			<lv-slide><lv-card>...</lv-card></lv-slide>
		</lv-carousel>
	</lv-section>
</lv-page>
```

## Components (current)

- `<lv-page>`
- `<lv-header>`
- `<lv-banner>`
- `<lv-section>`
- `<lv-divider>`
- `<lv-avatar>`
- `<lv-socials>`
- `<lv-buttons>`
- `<lv-feature-list>`
- `<lv-feature>`
- `<lv-grid>`
- `<lv-card>`
- `<lv-carousel>` + `<lv-slide>`

## Icons

LandVoln supports two icon approaches:

- **Font icons** (existing): `assets/fonts/icons/icons.woff2` + CSS classes like `.fai.fa-tg`.
- **CSS mask icons** (good for adding new icons without rebuilding a font): SVG data-URI variables like `--lv-icon-github` + utility classes like `.i-github`.

## Contributing

PRs adding new components are welcome!  
Guidelines:

- Keep new elements minimalistic.  
- Avoid external dependencies.  
- Prefer zero or minimal JavaScript so components remain readable without JS.

## Disclaimer

LandVoln is **experimental**. It requires manual work beyond the base functionality provided. The framework is intended for developers comfortable editing HTML and CSS directly.
