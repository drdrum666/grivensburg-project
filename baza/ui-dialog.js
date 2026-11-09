/* Numeric game dialog: cancel never starts a money operation. */
(function(w){'use strict';
w.GrivensburgDialog={number(question){return new Promise(resolve=>{
 const previous=document.activeElement,overlay=document.createElement('div');overlay.className='gb-number-overlay';
 overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#000b;display:grid;place-items:center;padding:16px';
 const panel=document.createElement('form');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label',question);
 panel.style.cssText='width:min(360px,100%);box-sizing:border-box;padding:24px;border:1px solid #b49359;border-radius:10px;background:#211c16;color:#eee1c6;font:16px/1.5 sans-serif';
 const label=document.createElement('label');label.textContent=question;label.style.whiteSpace='pre-line';
 const input=document.createElement('input');input.type='number';input.min='1';input.step='1';input.required=true;input.inputMode='numeric';input.style.cssText='display:block;width:100%;box-sizing:border-box;font:inherit;margin:16px 0;padding:10px';label.append(input);
 const cancel=document.createElement('button');cancel.type='button';cancel.textContent='Отмена';const ok=document.createElement('button');ok.type='submit';ok.textContent='Подтвердить';for(const b of [cancel,ok]){b.style.cssText='font:inherit;padding:8px 12px;margin-right:8px;cursor:pointer';}
 const finish=value=>{overlay.remove();previous?.focus();resolve(value)};
 cancel.onclick=()=>finish(null);overlay.onclick=e=>{if(e.target===overlay)finish(null)};
 panel.onsubmit=e=>{e.preventDefault();const value=Number(input.value);if(!Number.isSafeInteger(value)||value<=0){input.setCustomValidity('Введите целое положительное количество');input.reportValidity();return;}finish(String(value))};input.oninput=()=>input.setCustomValidity('');
 overlay.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();finish(null)}if(e.key==='Tab'){if(e.shiftKey&&document.activeElement===input){e.preventDefault();ok.focus()}else if(!e.shiftKey&&document.activeElement===ok){e.preventDefault();input.focus()}}};
 panel.append(label,cancel,ok);overlay.append(panel);document.body.append(overlay);input.focus();
})}};
})(window);

// Chrome owns tab casting; this opens the dedicated game view, never the GM dashboard.
window.GrivensburgCast={open(url){
 const overlay=document.createElement('div');overlay.className='gb-number-overlay';overlay.style.cssText='position:fixed;inset:0;z-index:2147483646;background:#000b;display:grid;place-items:center;padding:16px';
 const panel=document.createElement('section');panel.setAttribute('role','dialog');panel.setAttribute('aria-modal','true');panel.setAttribute('aria-label','Chromecast');panel.style.cssText='max-width:430px;padding:24px;border:1px solid #b49359;border-radius:10px;background:#211c16;color:#eee1c6;font:16px/1.5 sans-serif';
 panel.innerHTML='<h3>Chromecast · трансляция вкладки</h3><p>Откройте отдельный стример, затем выберите «Трансляция» в меню Chrome и укажите телевизор. Источник — вкладка стримера.</p><p>Телевизор и компьютер должны быть в одной сети. На телефоне используйте трансляцию экрана устройства.</p>';
 const link=document.createElement('a');link.href=url;link.target='_blank';link.rel='noopener';link.textContent='Открыть стример';link.style.cssText='display:inline-block;padding:10px;color:#ffe0a0';const close=document.createElement('button');close.textContent='Закрыть';close.onclick=()=>overlay.remove();panel.append(link,close);overlay.append(panel);overlay.onclick=e=>{if(e.target===overlay)overlay.remove()};overlay.onkeydown=e=>{if(e.key==='Escape')overlay.remove()};document.body.append(overlay);link.focus();
}};
