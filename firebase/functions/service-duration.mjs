const positive=value=>{
  const number=Number(String(value??'').replace(',','.'));
  return Number.isFinite(number)&&number>0?number:0;
};
const text=value=>Array.isArray(value)?value.map(text).join('\n'):value&&typeof value==='object'?Object.values(value).map(text).join('\n'):String(value??'');
const normalize=value=>text(value).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const hourPattern='(\\d+(?:[.,]\\d+)?)\\s*(?:horas?|hrs?|h)\\b(?:\\s+y\\s+media)?';
function hoursFromText(value,explicit=false){
  const normalized=normalize(value);
  const match=normalized.match(new RegExp((explicit?'(?:duracion(?:\\s+total)?|tiempo\\s+total)\\s*[:=–—-]?\\s*':'')+hourPattern));
  return match?positive(match[1])+(/y\s+media/.test(match[0])?.5:0):0;
}
function explicitDuration(service){
  // A duration field or a labelled total describes the whole package;
  // individual activities such as "Pintacaritas 1 hora" do not.
  const fields=[service.duracion,service.duracionTexto];
  const direct=fields.map(value=>hoursFromText(value)||positive(value)).find(Boolean);
  return direct||hoursFromText(details(service),true);
}
const details=service=>[
  service.duracion,service.duracionTexto,service.descripcionCompleta,service.descripcion,
  service.description,service.incluye,service.services,service.serviciosLista,
  service.todoIncluido,service.todoLoIncluido,service.actividades,service.detalles,service.itemsIncluidos
].map(text).join('\n');

export function serviceDurationHours(service={},catalog={}){
  const mode=normalize(service.tipoCobro||catalog.tipoCobro);
  if(['unidad','unidades','cantidad','por unidad'].includes(mode))return 0;
  if(['hora','horas'].includes(mode)||(!mode&&(service.isHourly??catalog.isHourly)===true)){
    return positive(service.cantidad??service.quantity)||positive(service.duracionHoras)||positive(catalog.duracionHoras);
  }
  // Repair legacy lines that saved the first activity's hour as the total.
  // Prefer the booked package's labelled duration; catalog fills missing totals.
  const total=explicitDuration(service)||explicitDuration(catalog);
  if(total)return total;
  const saved=positive(service.duracionHoras)||positive(catalog.duracionHoras);
  if(saved)return saved;
  const description=hoursFromText(details(service))||hoursFromText(details(catalog));
  if(description)return description;
  const name=normalize(service.nombre||service.name||catalog.nombre||catalog.name);
  if(name.includes('plan recreativo')||name.includes('diverty amigo'))return 2;
  return name.includes('plan diverty')?3:0;
}
