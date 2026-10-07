// Keep in sync with Diverty-/assets/js/diverty-theme-options.mjs.
export const THEME_PRESETS = {
  normal:{colorPrimary:'#7C3AED',colorSecondary:'#E11D48',colorButton:'#7C3AED',colorText:'#0F172A',colorBg:'#F8FAFC',colorCard:'#FFFFFF',gradient:'linear-gradient(135deg, #7C3AED, #E11D48)',decorations:'none'},
  christmas:{colorPrimary:'#2563EB',colorSecondary:'#94A3B8',colorButton:'#2563EB',colorText:'#F8FAFC',colorBg:'#061426',colorCard:'#091E3A',gradient:'linear-gradient(135deg, #2563EB, #94A3B8)',decorations:'snow'},
  halloween:{colorPrimary:'#F97316',colorSecondary:'#7E22CE',colorButton:'#EA580C',colorText:'#F8FAFC',colorBg:'#09070D',colorCard:'#17111F',gradient:'linear-gradient(135deg, #EA580C, #7E22CE)',decorations:'bats'},
  summer:{colorPrimary:'#0284C7',colorSecondary:'#EA580C',colorButton:'#0284C7',colorText:'#082F49',colorBg:'#F0F9FF',colorCard:'#FFFFFF',gradient:'linear-gradient(135deg, #0284C7, #EA580C)',decorations:'bubbles'},
  school:{colorPrimary:'#2563EB',colorSecondary:'#EA580C',colorButton:'#2563EB',colorText:'#1E3A8A',colorBg:'#F8FAFC',colorCard:'#FFFFFF',gradient:'linear-gradient(135deg, #2563EB, #EA580C)',decorations:'confetti'},
};
export function inferThemePreset(name='',description='') {
  const text=`${name} ${description}`.toLowerCase();
  if(/navidad|christmas|santa/.test(text))return 'christmas';
  if(/halloween|miedo/.test(text))return 'halloween';
  if(/verano|summer/.test(text))return 'summer';
  if(/escolar|escuela|school/.test(text))return 'school';
  return 'normal';
}
const hex=value=>/^#[a-f\d]{6}$/i.test(String(value||''))?String(value):/^#[a-f\d]{3}$/i.test(String(value||''))?'#'+String(value).slice(1).split('').map(c=>c+c).join(''):null;
export function validThemeGradient(value) {
  const s=String(value||'').trim();
  return !s || /^(?:linear|radial)-gradient\([#\w\s.,%()+-]+\)$/i.test(s)&&!/(?:url|var|expression|image|@|[{};<>])/i.test(s);
}
export function resolveTheme(data={}) {
  const key=inferThemePreset(data.tipo||data.nombre||data.id,data.descripcion),preset=THEME_PRESETS[key];
  const modern=Number(data.themeVersion)>=2;
  const lockedChristmas=key==='christmas'&&!modern;
  const read=(canonical,legacy)=>modern?(data[canonical]??data[legacy]):(data[legacy]??data[canonical]);
  const colors={};
  for(const [key,alias] of Object.entries({colorPrimary:'colorPrimario',colorSecondary:'colorSecundario',colorButton:'colorBoton',colorText:'colorTexto',colorBg:'colorFondo',colorCard:'colorTarjeta'}))colors[key]=!lockedChristmas&&hex(read(key,alias))||preset[key];
  const animationValue=read('animations','animaciones')??data.animacionesActivas;
  const animations=animationValue!==false&&String(animationValue).toLowerCase()!=='false';
  const requested=read('decorations','decoracion')??'auto';
  const decorations=['auto','none','snow','confetti','bats','bubbles','leaves'].includes(requested)?requested:'auto';
  const gradient=!lockedChristmas&&validThemeGradient(data.gradient)&&String(data.gradient||'').trim()||`linear-gradient(135deg, ${colors.colorButton}, ${colors.colorSecondary})`;
  const buttonStyle=data.buttonStyle==='solid'?'solid':'gradient';
  const contrast=value=>{const rgb=value.slice(1).match(/../g).map(c=>parseInt(c,16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;};
  return {...colors,key,kind:key==='normal'?'default':key,animations,decorations,effect:decorations==='auto'?preset.decorations:decorations,gradient,buttonStyle,buttonBackground:buttonStyle==='solid'?colors.colorButton:gradient,buttonText:contrast(colors.colorButton)>.179?'#0F172A':'#FFFFFF',modern};
}
export function themeOptionsFromItem(data={}) {
  const t=resolveTheme(data);
  return {tipo:data.tipo||t.key,nombre:data.nombre||'',descripcion:data.descripcion||'',fechaInicio:data.fechaInicio||'',fechaFin:data.fechaFin||'',...Object.fromEntries(Object.keys(THEME_PRESETS.normal).filter(k=>k.startsWith('color')).map(k=>[k,t[k]])),gradient:t.gradient,decorations:t.decorations,animations:t.animations,buttonStyle:t.buttonStyle};
}
export function themeOptionsForSave(form) {
  for(const key of Object.keys(THEME_PRESETS.normal).filter(k=>k.startsWith('color')))if(!hex(form[key]))throw new Error('Revisa los colores: usa un valor como #7C3AED.');
  if(!validThemeGradient(form.gradient))throw new Error('Revisa el degradado o déjalo vacío para usar los colores elegidos.');
  if(!['auto','none','snow','confetti','bats','bubbles','leaves'].includes(form.decorations))throw new Error('Selecciona una decoración válida.');
  return {...form,themeVersion:2};
}
export function themeControlsCss(t) {
  let css='';
  if(t.modern)css+=`
body[data-theme][data-theme] { background-color:var(--s-bg-color)!important; }
body[data-theme][data-theme] .season-overlay { background:color-mix(in srgb,var(--s-bg-color) 92%,transparent)!important; }
body[data-theme][data-theme] .season-btn,
body[data-theme][data-theme] #mainContent .season-btn { background:var(--s-btn-grad)!important; color:var(--s-button-text)!important; }
body[data-theme][data-theme] #topAnnouncementBanner { background:var(--s-btn-grad)!important; color:var(--s-button-text)!important; }
body[data-theme][data-theme] :is(.glass-panel,.card-alive,.catalog-character-card,.catalog-tile,.catalog-detail-panel),
body[data-theme][data-theme] #mainContent :is(.glass-panel,.card-alive,.catalog-character-card,.catalog-tile,.catalog-detail-panel) { background:var(--s-glass-bg)!important; }
body[data-theme][data-theme] :is(.season-text-title,.catalog-character-body h3,.catalog-tile-title,.catalog-detail-title),
body[data-theme][data-theme] #mainContent :is(.season-text-title,.catalog-character-body h3,.catalog-tile-title,.catalog-detail-title) { color:var(--s-text-title)!important; }
`;
  if(t.decorations!=='auto')css+=`
body[data-theme][data-theme] :is(#diverty-xmas-stage,#diverty-halloween-stage,#diverty-summer-stage,#diverty-school-stage) { display:none!important; }
body[data-theme][data-theme] :is(#mainContent,#decor-layer,.card-safe-wrapper)::before,
body[data-theme][data-theme] :is(#mainContent,#decor-layer)::after { content:none!important; }
`;
  if(!t.animations)css+='body[data-theme][data-theme],body[data-theme][data-theme] *,body[data-theme][data-theme] *::before,body[data-theme][data-theme] *::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } @layer divertyThemeMotion { *,::before,::after { animation:none!important; transition:none!important; scroll-behavior:auto!important; } }';
  return css;
}
