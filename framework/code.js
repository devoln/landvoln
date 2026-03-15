const escapeHtml = (s) => s
	.replaceAll('&', '&amp;')
	.replaceAll('<', '&lt;')
	.replaceAll('>', '&gt;')
	.replaceAll('"', '&quot;')
	.replaceAll("'", '&#39;');


const highlightHtml = (escaped) => {
	let out = escaped;
	const stashed = [];
	const stash = (html) => {
		const id = stashed.length;
		stashed.push(html);
		return `\u0000lv${id}x\u0000`;
	};
	const restore = (s) => s.replaceAll(/\u0000lv(\d+)x\u0000/g, (_, n) => stashed[Number(n)] ?? '');

	out = out.replaceAll(/&lt;!--[^]*?--&gt;/g, (m) => stash('<span class="lv-tok-comment">' + m + '</span>'));
	out = out.replaceAll(/(&lt;\/?)([a-zA-Z0-9-]+)/g, '$1<span class="lv-tok-tag">$2</span>');
	out = out.replaceAll(/\s([a-zA-Z-:]+)=(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;)/g, ' <span class="lv-tok-attr">$1</span>=<span class="lv-tok-string">$2</span>');
	out = out.replaceAll(/(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;)/g, (m) => stash('<span class="lv-tok-string">' + m + '</span>'));
	return restore(out);
};


const highlightCss = (escaped) => {
	let out = escaped;
	out = out.replaceAll(/\/\*[^]*?\*\//g, (m) => `<span class="lv-tok-comment">${m}</span>`);
	out = out.replaceAll(/(^|\n)(\s*)([a-zA-Z-]+)(\s*:)/g, '$1$2<span class="lv-tok-attr">$3</span>$4');
	out = out.replaceAll(/(#(?:[0-9a-fA-F]{3}){1,2})/g, '<span class="lv-tok-number">$1</span>');
	out = out.replaceAll(/([0-9]+(?:\.[0-9]+)?)(px|rem|em|%|vh|vw)?/g, '<span class="lv-tok-number">$1$2</span>');
	out = out.replaceAll(/(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;)/g, '<span class="lv-tok-string">$1</span>');
	return out;
};

const joinKeywords = (words) => words.map((w) => w.replaceAll('+', '\\+')).join('|');


const highlightPython = (escaped) => {
	let out = escaped;
	const stashed = [];
	const stash = (html) => {
		const id = stashed.length;
		stashed.push(html);
		return `\u0000lv${id}x\u0000`;
	};
	const restore = (s) => s.replaceAll(/\u0000lv(\d+)x\u0000/g, (_, n) => stashed[Number(n)] ?? '');

	out = out.replaceAll(/(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;|`[^`\n]*`)/g, (m) => stash('<span class="lv-tok-string">' + m + '</span>'));
	out = out.replaceAll(/#[^\n]*/g, (m) => stash('<span class="lv-tok-comment">' + m + '</span>'));
	out = out.replaceAll(/(^|\n)(\s*)(@[a-zA-Z_][a-zA-Z0-9_]*)/g, (m, nl, ws, d) => `${nl}${ws}${stash('<span class="lv-tok-keyword">' + d + '</span>')}`);

	const keywords = [
		'False','None','True','and','as','assert','async','await','break','class','continue','def','del','elif','else','except','finally','for','from','global','if','import','in','is','lambda','nonlocal','not','or','pass','raise','return','try','while','with','yield'
	];

	out = out.replaceAll(new RegExp(`\\b(${joinKeywords(keywords)})\\b`, 'g'), '<span class="lv-tok-keyword">$1</span>');
	out = out.replaceAll(/\\b([0-9]+(?:\.[0-9]+)?)\\b/g, '<span class="lv-tok-number">$1</span>');

	const builtins = [
		'print','len','range','enumerate','min','max','sum','map','filter','zip',
		'int','float','str','bool','list','dict','set','tuple','object'
	];
	out = out.replaceAll(new RegExp(`\\b(${joinKeywords(builtins)})\\b`, 'g'), '<span class="lv-tok-keyword">$1</span>');

	const nonFnLike = new Set([...keywords]);
	out = out.replaceAll(/(^|[^a-zA-Z0-9_])([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, (m, prefix, name) => {
		if(nonFnLike.has(name)) return m;
		return `${prefix}<span class="lv-tok-fn">${name}</span>`;
	});

	return restore(out);
};


const highlightCLike = (escaped, keywords, options = {}) => {
	let out = escaped;
	const stashed = [];
	const stash = (html) => {
		const id = stashed.length;
		stashed.push(html);
		return `\u0000lv${id}x\u0000`;
	};
	const restore = (s) => s.replaceAll(/\u0000lv(\d+)x\u0000/g, (_, n) => stashed[Number(n)] ?? '');

	out = out.replaceAll(/\/\*[^]*?\*\//g, (m) => stash('<span class="lv-tok-comment">' + m + '</span>'));
	out = out.replaceAll(/(^|\n)(\s*)(\/\/[^\n]*)/g, (m, nl, ws, c) => `${nl}${ws}${stash('<span class="lv-tok-comment">' + c + '</span>')}`);
	out = out.replaceAll(/(&quot;[^\n]*?&quot;|&#39;[^\n]*?&#39;|`[^`\n]*`)/g, (m) => stash('<span class="lv-tok-string">' + m + '</span>'));

	if(options.preproc)
	{
		out = out.replaceAll(/(^|\n)(\s*)(#\s*)([a-zA-Z_][a-zA-Z0-9_]*)/g, '$1$2<span class="lv-tok-keyword">$3$4</span>');
	}

	out = out.replaceAll(new RegExp(`\\b(${joinKeywords(keywords)})\\b`, 'g'), '<span class="lv-tok-keyword">$1</span>');
	out = out.replaceAll(/\b([0-9]+(?:\.[0-9]+)?)\b/g, '<span class="lv-tok-number">$1</span>');

	const keywordSet = new Set(keywords);
	const nonFnLike = new Set([
		...keywordSet,
		'if','else','for','while','do','switch','case','default','break','continue','return','throw','try','catch','finally','sizeof','new','delete'
	]);
	out = out.replaceAll(/(^|[^a-zA-Z0-9_])([a-zA-Z_][a-zA-Z0-9_]*)(?=\s*\()/g, (m, prefix, name) => {
		if(nonFnLike.has(name)) return m;
		return `${prefix}<span class="lv-tok-fn">${name}</span>`;
	});

	return restore(out);
};


const cKeywords = [
	'auto','break','case','char','const','continue','default','do','double',
	'else','enum','extern','float','for','goto','if','inline','int','long',
	'register','restrict','return','short','signed','sizeof','static','struct',
	'switch','typedef','union','unsigned','void','volatile','while',
	'_Bool','_Complex','_Imaginary'
];

const cppKeywords = [
	...cKeywords,
	'bool','catch','class','constexpr','const_cast','delete','dynamic_cast',
	'explicit','false','friend','mutable','namespace','new','noexcept',
	'nullptr','operator','private','protected','public','reinterpret_cast',
	'static_assert','static_cast','template','this','throw','true','try',
	'typename','using','virtual'
];

const csharpKeywords = [
	'abstract','as','base','bool','break','byte','case','catch','char',
	'checked','class','const','continue','decimal','default','delegate','do',
	'double','else','enum','event','explicit','extern','false','finally',
	'fixed','float','for','foreach','goto','if','implicit','in','int',
	'interface','internal','is','lock','long','namespace','new','null',
	'object','operator','out','override','params','private','protected',
	'public','readonly','ref','return','sbyte','sealed','short','sizeof',
	'stackalloc','static','string','struct','switch','this','throw','true',
	'try','typeof','uint','ulong','unchecked','unsafe','ushort','using',
	'virtual','void','volatile','when','while'
];

const tsKeywords = [
	'abstract','any','as','asserts','async','await','bigint','boolean','break',
	'case','catch','class','const','continue','debugger','declare','default',
	'delete','do','else','enum','export','extends','false','finally','for',
	'from','function','get','if','implements','import','in','infer',
	'instanceof','interface','is','keyof','let','module','namespace','never',
	'new','null','number','object','of','package','private','protected',
	'public','readonly','require','return','set','static','string','super',
	'switch','symbol','this','throw','true','try','type','typeof',
	'undefined','unique','unknown','var','void','while','with','yield'
];

const glslKeywords = [
	'const','uniform','in','out','inout','attribute','varying','layout',
	'centroid','flat','smooth','noperspective','precision','highp','mediump','lowp',
	'float','double','int','uint','bool','void',
	'vec2','vec3','vec4','dvec2','dvec3','dvec4','ivec2','ivec3','ivec4','uvec2','uvec3','uvec4','bvec2','bvec3','bvec4',
	'mat2','mat3','mat4','sampler2D','samplerCube',
	'return','if','else','for','while','do','break','continue','discard','struct'
];

const hlslKeywords = [
	'cbuffer','tbuffer','Texture2D','Texture3D','TextureCube','SamplerState','SamplerComparisonState',
	'float','float2','float3','float4','float4x4','half','half2','half3','half4','int','uint','bool','void',
	'struct','return','if','else','for','while','do','break','continue',
	'SV_Position','SV_Target','SV_VertexID','SV_InstanceID','register'
];


const applyHighlighting = () => {
	const Cls = customElements.get('lv-code');
	if(!Cls) return;
	if(Cls.prototype.highlight && Cls.prototype.highlight.__lv_highlighted) return;

	Cls.prototype.highlight = function() {
		if(!this.codeEl) return;
		const lang = (this.getAttribute('lang') || '').toLowerCase();
		const escaped = escapeHtml(this.rawText || '');
		let html = escaped;
		if(lang === 'html') html = highlightHtml(escaped);
		else if(lang === 'css') html = highlightCss(escaped);
		else if(lang === 'py' || lang === 'python') html = highlightPython(escaped);
		else if(lang === 'js' || lang === 'javascript') html = highlightCLike(escaped, tsKeywords);
		else if(lang === 'c') html = highlightCLike(escaped, cKeywords, { preproc: true });
		else if(lang === 'cpp' || lang === 'c++') html = highlightCLike(escaped, cppKeywords, { preproc: true });
		else if(lang === 'cs' || lang === 'csharp' || lang === 'c#') html = highlightCLike(escaped, csharpKeywords);
		else if(lang === 'ts' || lang === 'typescript') html = highlightCLike(escaped, tsKeywords);
		else if(lang === 'glsl') html = highlightCLike(escaped, glslKeywords);
		else if(lang === 'hlsl') html = highlightCLike(escaped, hlslKeywords);
		this.codeEl.innerHTML = html;
	};
	Cls.prototype.highlight.__lv_highlighted = true;

	for(const el of document.querySelectorAll('lv-code'))
		el.highlight?.();
};


if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyHighlighting);
else applyHighlighting();
