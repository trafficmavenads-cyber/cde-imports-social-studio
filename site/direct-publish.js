(() => {
 'use strict';
 const $=id=>document.getElementById(id),editor=$('studio').querySelector('.panel');
 const controls=document.createElement('section');controls.className='direct-controls';
 controls.innerHTML=`
 <label>Preparação do vídeo<select id="direct-mode"><option value="fast">Rápido · manter vídeo original quando compatível</option><option value="edited">Editar · aplicar marca CDE e enquadramento</option></select></label><p class="hint">O modo rápido mantém o vídeo como está. Corte ou ajuste de formato só são processados quando necessários.</p><div id="direct-batch-list"></div><div class="two"><label>Cortar: início (segundos)<input id="video-trim-start" type="number" min="0" step="0.1" value="0"></label><label>Cortar: final (segundos)<input id="video-trim-end" type="number" min="0" step="0.1" placeholder="Duração completa"></label></div>
 <label>Enquadramento<select id="video-fit"><option value="contain">Mostrar o vídeo inteiro (sem cortar)</option><option value="cover">Preencher o quadro (recortar bordas)</option></select></label>
 <h3>Onde publicar</h3>
 <fieldset class="direct-destinations"><legend>Instagram</legend>
 <label><input type="checkbox" value="ig-story"> Stories</label>
 <label><input type="checkbox" value="ig-reels" checked> Reels</label>
 <label><input type="checkbox" value="ig-feed"> Também no Feed</label>
 </fieldset>
 <p class="hint">O Instagram publica vídeos como Reels. Marcar Feed compartilha o mesmo Reel no Feed, sem duplicar o post. Stories são publicados separadamente, sem stickers ou músicas da biblioteca.</p>
 <fieldset class="direct-destinations"><legend>YouTube</legend>
 <label><input type="checkbox" value="yt-shorts" checked> Shorts · vertical, até 3 min</label>
 <label><input type="checkbox" value="yt-video"> Vídeo tradicional · horizontal</label>
 </fieldset>
 <p class="hint">O site prepara uma versão vertical para Stories, Reels e Shorts e uma horizontal para o YouTube tradicional. A classificação final é feita pelo YouTube.</p>
 <button id="direct-captions" type="button" class="secondary">Gerar legendas do produto</button>
 <label>Legenda do Instagram<textarea id="direct-instagram-caption" rows="3" maxlength="2200"></textarea></label>
 <label>Descrição do YouTube<textarea id="direct-youtube-caption" rows="3" maxlength="4900"></textarea></label>
 <label class="ig-bulk-check"><input type="checkbox" id="direct-rights"> Tenho autorização de uso deste vídeo, das imagens e do áudio.</label>
 <button id="direct-publish" type="button" class="primary">Publicar fila</button><button id="direct-pause" type="button" class="secondary" hidden>Pausar após o vídeo atual</button>
 <p class="hint">Até 20 vídeos por lote. MP4 pronto: até 300 MB por vídeo; edição: até 180 MB. Mantenha esta aba aberta durante o envio.</p>
 <div id="direct-status" role="status" aria-live="polite"></div>`;
 editor.append(controls);
 // Keep the old image editor available without making it part of video publishing.
 const imageTools=document.createElement('details');imageTools.className='image-tools';
 const imageSummary=document.createElement('summary');imageSummary.textContent='Usar editor de imagens';imageTools.append(imageSummary);
 const imageSource=$('image-file').closest('label');imageTools.append(imageSource,$('image-url').closest('label'));
 $('media-info').before(imageTools);
 $('video-fit').addEventListener('change',()=>{$('video-preview').style.objectFit=$('video-fit').value;});
 $('video-preview').style.objectFit='contain';
 function syncMode(){
  const fast=$('direct-mode').value==='fast',frame=$('video-frame'),source=window.CDEVideo.sourceInfo();
  frame.classList.toggle('original-video',fast);frame.style.aspectRatio=fast&&source?source.width+'/'+source.height:'';
  $('preview-hint').textContent=fast?'Modo rápido: mantém o vídeo original. Corte e adaptação de formato são processados apenas quando necessários.':'Edição com marca CDE. A versão final será enviada diretamente aos destinos selecionados.';
 }
 $('direct-mode').addEventListener('change',syncMode);window.addEventListener('cde:video-loaded',syncMode);syncMode();

 const destinations=()=>[...controls.querySelectorAll('input[type=checkbox][value]:checked')].map(n=>n.value);
 const status=(text,error=false)=>{const box=$('direct-status');box.textContent=text;box.classList.toggle('error',error);};
 let busy=false,sequence=0,captionTitle='',timer,posted=false;
 async function generate(){
  const title=$('title').value.trim(),request=++sequence;
  if(!title){status('Informe o nome do produto.');return false;}
  $('direct-captions').disabled=true;status('Gerando legendas para '+title+'…');
  try{
   const result=await window.CDESocialAI.generateForProduct(title);
   if(request!==sequence||$('title').value.trim()!==title)return false;
   $('direct-instagram-caption').value=result.captions['instagram-reels'];
   $('direct-youtube-caption').value=result.captions['youtube-shorts'];captionTitle=title;
   status(result.mode==='online'?'Legendas geradas por IA. Revise e publique.':'Legendas locais prontas. Entre em Conexões para usar a IA online.');return true;
  }catch(e){if(request===sequence)status(String(e?.message||e||'Falha na geração.'),true);return false;}
  finally{if(request===sequence)$('direct-captions').disabled=false;}
 }
 $('direct-captions').addEventListener('click',()=>{if(files.length<=1&&!busy)generate();});
 $('title').addEventListener('input',()=>{
  captionTitle='';sequence++;clearTimeout(timer);$('direct-captions').disabled=false;
  timer=setTimeout(()=>{if(!busy&&files.length<=1)generate();},900);
 });
 window.addEventListener('cde:video-loaded',()=>{posted=false;$('direct-publish').disabled=false;if(files.length<=1&&$('title').value.trim()&&captionTitle!==$('title').value.trim())generate();});
 function plans(selected){
  const list=[];
  if(selected.includes('ig-story'))list.push({kind:'STORY_VIDEO',format:'story',label:'Instagram Stories'});
  if(selected.includes('ig-reels')||selected.includes('ig-feed'))list.push({kind:'REELS',format:'story',shareToFeed:selected.includes('ig-feed'),label:selected.includes('ig-feed')?'Instagram Reels + Feed':'Instagram Reels'});
  if(selected.includes('yt-shorts'))list.push({kind:'REELS',youtube:true,youtubeChannel:'youtube-shorts',format:'story',label:'YouTube Shorts'});
  if(selected.includes('yt-video'))list.push({kind:'REELS',youtube:true,youtubeChannel:'youtube-video',format:'landscape',label:'YouTube · vídeo tradicional'});
  return list;
 }
 const fileInput=$('video-file');fileInput.multiple=true;
 fileInput.closest('label').querySelector('span').textContent='Selecionar até 20 vídeos';
 let files=[],batchRows=[],batchSequence=0,pauseRequested=false;
 $('direct-pause').addEventListener('click',()=>{pauseRequested=true;$('direct-pause').disabled=true;status('Pausa solicitada. Aguardando os envios do vídeo atual.');});
 const guessedName=file=>{const name=file.name.replace(/\.[^.]+$/,'').replace(/[_-]+/g,' ').trim();return /^[a-f0-9 ]{20,}$/i.test(name)?'':name.slice(0,110);};
 function rowInput(label,value,type='text'){
  const wrap=document.createElement('label');wrap.append(document.createTextNode(label));const input=document.createElement('input');input.type=type;input.value=value;if(type==='text')input.maxLength=110;else{input.min=0;input.step=.1;}wrap.append(input);return {wrap,input};
 }
 fileInput.addEventListener('change',()=>{
  files=[...fileInput.files];batchSequence++;batchRows=[];$('direct-batch-list').replaceChildren();
  posted=false;$('direct-publish').disabled=false;
  if(files.length>20){status('Selecione no máximo 20 vídeos. Nenhum envio iniciado.',true);return;}
  if(files.length<=1)return;
  files.forEach((file,index)=>{
   const card=document.createElement('details');card.className='batch-video';
   const header=document.createElement('summary');header.textContent=(index+1)+'. '+file.name;card.append(header);
   const product=rowInput('Nome do produto',index===0?$('title').value.trim()||guessedName(file):guessedName(file));
   const start=rowInput('Início (segundos)',0,'number'),end=rowInput('Final (vazio = vídeo inteiro)','','number');
   const ig=document.createElement('textarea'),yt=document.createElement('textarea');ig.placeholder='Legenda do Instagram';yt.placeholder='Descrição do YouTube';ig.maxLength=2200;yt.maxLength=4900;
   card.append(product.wrap,start.wrap,end.wrap,ig,yt);$('direct-batch-list').append(card);
   const row={file,product:product.input,start:start.input,end:end.input,ig,yt,captionProduct:''};
   product.input.addEventListener('input',()=>{row.captionProduct='';});batchRows.push(row);
  });
  status(files.length+' vídeos selecionados. Confira o nome do produto de cada vídeo e gere as legendas do lote.');
 });
 // Inspect metadata without playback or capture. All files are validated before sending.
 async function inspectFile(file){
  return new Promise((resolve,reject)=>{
   const media=document.createElement('video'),url=URL.createObjectURL(file);media.preload='metadata';
   const finish=(error)=>{clearTimeout(timer);media.onloadedmetadata=media.onerror=null;media.removeAttribute('src');media.load();URL.revokeObjectURL(url);if(error)reject(error);};
   const timer=setTimeout(()=>finish(Error('Não foi possível ler '+file.name)),15000);
   media.onloadedmetadata=()=>{const info={duration:media.duration,width:media.videoWidth,height:media.videoHeight};if(!Number.isFinite(info.duration)||info.duration<=0||!info.width)return finish(Error('Vídeo inválido: '+file.name));resolve(info);finish();};
   media.onerror=()=>finish(Error('Formato de vídeo não reconhecido: '+file.name));media.src=url;
  });
 }
 const cache=new Map();
 async function productCaptions(title){
  if(cache.has(title))return cache.get(title);
  let result;
  try{result=await window.CDESocialAI.generateForProduct(title);}
  catch(error){result=await window.CDESocialAI.generateForProduct(title,{localOnly:true});result.note='IA indisponível; legenda local pelo produto.';}
  cache.set(title,result);return result;
 }
 // This replaces the single-caption handler when more than one file is selected.
 $('direct-captions').addEventListener('click',async event=>{
  if(files.length<=1||busy)return;
  const revision=batchSequence;$('direct-captions').disabled=true;
  try{
   for(const [i,row] of batchRows.entries()){
    const title=row.product.value.trim();if(!title)throw Error('Informe o produto do vídeo '+(i+1)+'.');
    status('Gerando legendas: '+(i+1)+'/'+batchRows.length+' · '+title);
    const result=await productCaptions(title);if(revision!==batchSequence)return;
    row.ig.value=result.captions['instagram-reels'];row.yt.value=result.captions['youtube-shorts'];row.captionProduct=title;
   }
   status('Legendas do lote prontas. Abra cada vídeo para revisar antes de publicar.');
  }catch(error){status(error.message,true);}finally{$('direct-captions').disabled=false;}
 });
 $('direct-publish').addEventListener('click',async()=>{
  if(busy||posted)return;
  const selected=destinations(),mode=$('direct-mode').value;
  if(!files.length||files.length>20)return status('Selecione entre 1 e 20 vídeos.',true);
  if(!selected.length)return status('Escolha onde os vídeos vão aparecer.',true);
  if(!$('direct-rights').checked)return status('Confirme os direitos de uso dos vídeos.',true);
  const targets=plans(selected);
  if(targets.some(x=>!x.youtube)&&!window.CDEInstagramPublisher?.status().ready)return status('Conecte o Instagram antes de publicar.',true);
  if(targets.some(x=>x.youtube)&&!window.CDEYouTubePublisher?.status().ready)return status('Conecte o YouTube antes de publicar.',true);
  busy=true;sequence++;clearTimeout(timer);let queued=false;
  const locked=[...document.querySelectorAll('#studio input,#studio textarea,#studio select,#direct-captions')],previous=locked.map(n=>n.disabled);locked.forEach(n=>n.disabled=true);$('direct-publish').disabled=true;
  try{
   const rows=files.length>1?batchRows:files.map(file=>({file,product:$('title'),start:$('video-trim-start'),end:$('video-trim-end'),ig:$('direct-instagram-caption'),yt:$('direct-youtube-caption'),captionProduct:captionTitle}));
   const work=[];
   // Preflight every video before any publication. Never silently ignore invalid files.
   for(const [i,row] of rows.entries()){
    if(row.enqueued)continue;row.error='';
    const title=row.product.value.trim();if(!title)throw Error('Informe o nome do produto do vídeo '+(i+1)+'.');
    if(row.file.size>300*1024*1024)throw Error(row.file.name+': limite de 300 MB por vídeo.');
    const info=await inspectFile(row.file),start=Number(row.start.value||0),end=Number(row.end.value||info.duration),duration=end-start;
    if(!Number.isFinite(duration)||start<0||end>info.duration+.06||duration<=0)throw Error(title+': corte inválido.');
    if(selected.includes('ig-story')&&(duration<3||duration>60))throw Error(title+': Stories precisam ter de 3 a 60 segundos.');
    if(selected.some(x=>x.startsWith('ig-'))&&duration<3)throw Error(title+': Instagram exige pelo menos 3 segundos.');
    if(selected.includes('yt-shorts')&&duration>180)throw Error(title+': Shorts aceitam até 3 minutos. Ajuste o corte ou escolha vídeo tradicional.');
    const needsEdit=mode==='edited'||start!==0||Math.abs(end-info.duration)>.06||targets.some(t=>t.format==='landscape'?info.width<=info.height:info.width>info.height);
    if(needsEdit&&row.file.size>180*1024*1024)throw Error(title+': para editar ou ajustar o formato, use arquivo de até 180 MB.');
    if(row.captionProduct!==title){
     const result=await productCaptions(title);row.ig.value=result.captions['instagram-reels'];row.yt.value=result.captions['youtube-shorts'];row.captionProduct=title;
    }
    if(targets.some(t=>t.kind!=='STORY_VIDEO'&&!(t.youtube?row.yt.value.trim():row.ig.value.trim())))throw Error(title+': preencha as legendas.');
    work.push({row,title,info,start,end});
   }
   if(!window.confirm('Publicar '+work.length+' vídeo(s) em '+targets.map(x=>x.label).join(', ')+'? Os vídeos serão processados em fila, sem download.'))return;
   let successes=0,failures=0;pauseRequested=false;$('direct-pause').hidden=false;$('direct-pause').disabled=false;
   for(const [i,item] of work.entries()){
    if(pauseRequested)break;
    try{
     const rendered=new Map(),entries=[];
     for(const target of targets){
      const progress=text=>status('Vídeo '+(i+1)+'/'+work.length+' · '+item.title+' · '+text);
      if(!rendered.has(target.format))rendered.set(target.format,await window.CDEVideo.prepareFile(item.row.file,item.info,target.format,{mode,start:item.start,end:item.end,onProgress:progress}));
      entries.push({...target,blob:rendered.get(target.format).blob,caption:target.youtube?item.row.yt.value.trim():item.row.ig.value.trim()});
     }
     const ids=await window.CDEDirectQueue.enqueue({title:item.title,entries});queued=true;item.row.enqueued=true;
     const result=await window.CDEDirectQueue.publish(ids,{onProgress:done=>status('Vídeo '+(i+1)+'/'+work.length+' · '+done+'/'+ids.length+' destinos concluídos')});
     successes+=result.filter(x=>x.status==='published').length;failures+=result.filter(x=>x.status!=='published').length;
    }catch(error){failures++;item.row.error=String(error.message||error);status(item.title+': '+item.row.error+'. Continuando a fila…',true);}
   }
   posted=work.every(item=>item.row.enqueued);
   status((pauseRequested?'Fila pausada: ':'Fila concluída: ')+successes+' publicação(ões) confirmada(s)'+(failures?', '+failures+' pendência(s). Confira os detalhes em Fila e lotes.':'. Comprovantes em Insights e histórico.'),Boolean(failures));
   const errors=work.filter(x=>x.row.error);if(errors.length){const list=document.createElement('ul');for(const item of errors){const line=document.createElement('li');line.textContent=item.title+': '+item.row.error;list.append(line);}$('direct-status').append(list);}
  }catch(error){status(String(error.message||error),true);}
  finally{$('direct-pause').hidden=true;await window.CDEMP4.releaseEditor?.();busy=false;locked.forEach((n,i)=>n.disabled=previous[i]);$('direct-publish').disabled=posted;}
 });
})();
