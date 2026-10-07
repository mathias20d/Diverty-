import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveTheme,themeOptionsFromItem,themeOptionsForSave,themeControlsCss,validThemeGradient} from '../assets/js/diverty-theme-options.mjs';
test('legacy palettes and decorations survive missing options, including Christmas blue',()=>{
  const theme=resolveTheme({nombre:'Navidad',colorPrimary:'#ff0000',colorBg:'#00ff00'});
  assert.equal(theme.colorPrimary,'#2563EB');assert.equal(theme.colorBg,'#061426');assert.equal(theme.effect,'snow');assert.equal(theme.decorations,'auto');
  for(const [nombre,effect] of [['Halloween','bats'],['Verano','bubbles'],['Escolar','confetti']])assert.equal(resolveTheme({nombre}).effect,effect);
});
test('canonical saved options override historical aliases and respect every season',()=>{
  const form=themeOptionsFromItem({nombre:'Navidad',colorPrimary:'#ff0000',animaciones:false});
  assert.equal(form.colorPrimary,'#2563EB');assert.equal(form.animations,false);
  const saved=themeOptionsForSave({...form,colorPrimary:'#336699',colorButton:'#123456',buttonStyle:'solid',decorations:'none',animations:true});
  const theme=resolveTheme({...saved,colorPrimario:'#ff0000',animaciones:false});
  assert.equal(theme.colorPrimary,'#336699');assert.equal(theme.buttonBackground,'#123456');assert.equal(theme.animations,true);assert.equal(theme.effect,'none');
});
test('none and animations off clear the effects rather than just changing a label',()=>{
  const theme=resolveTheme({nombre:'Halloween',decorations:'none',animations:false});
  assert.equal(theme.effect,'none');assert.match(themeControlsCss(theme),/display:none!important/);assert.match(themeControlsCss(theme),/animation:none!important/);
  assert.equal(resolveTheme({nombre:'Halloween',animacionesActivas:'false'}).animations,false);
  assert.equal(resolveTheme({nombre:'Verano',decorations:'confetti'}).effect,'confetti');
});
test('invalid colors and CSS cannot be published or interpolated into previews',()=>{
  const form=themeOptionsFromItem({nombre:'Normal'});
  for(const gradient of ['url(https://example.invalid/)', 'linear-gradient(red,blue); } body { display:none', '</style><script>']){
    assert.equal(validThemeGradient(gradient),false);assert.throws(()=>themeOptionsForSave({...form,gradient}));assert.equal(resolveTheme({...form,gradient}).gradient.includes(gradient),false);
  }
  assert.throws(()=>themeOptionsForSave({...form,colorBg:'red;display:none'}));
  assert.equal(validThemeGradient('linear-gradient(135deg, #2563EB, #94A3B8)'),true);
});
