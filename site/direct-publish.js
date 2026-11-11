(() => {
 'use strict';
 const $=id=>document.getElementById(id),editor=$('studio').querySelector('.panel');
 const controls=document.createElement('section');controls.className='direct-controls';
 controls.innerHTML=`
 <div class="two"><label>Cortar: início (segundos)<input id="video-trim-start" type="number" min="0" step="0.1" value="0"></label><label>Cortar: final (segundos)<input id="video-trim-end" type="number" min="0" step="0.1" placeholder="Duração completa"></label></div>
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
 <button id="direct-publish" type="button" class="primary">Publicar vídeo editado</button>
 <p class="hint">Edição com marca: vídeos de até 4 minutos e arquivos de até 300 MB. Mantenha esta aba aberta e ativa durante a preparação e o envio.</p>
 <div id="direct-status" role="status" aria-live="polite"></div>`;
 editor.append(controls);
 // Keep the old image editor available without making it part of video publishing.
 const imageTools=document.createElement('details');imageTools.className='image-tools';
 const imageSummary=document.createElement('summary');imageSummary.textContent='Usar editor de imagens';imageTools.append(imageSummary);
 const imageSource=$('image-file').closest('label');imageTools.append(imageSource,$('image-url').closest('label'));
 $('media-info').before(imageTools);
 $('video-fit').addEventListener('change',()=>{$('video-preview').style.objectFit=$('video-fit').value;});
 $('video-preview').style.objectFit='contain';
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
 $('direct-captions').addEventListener('click',generate);
 $('title').addEventListener('input',()=>{
  captionTitle='';sequence++;clearTimeout(timer);$('direct-captions').disabled=false;
  timer=setTimeout(()=>{if(!busy)generate();},900);
 });
 window.addEventListener('cde:video-loaded',()=>{posted=false;$('direct-publish').disabled=false;if($('title').value.trim()&&captionTitle!==$('title').value.trim())generate();});
 function plans(selected){
  const list=[];
  if(selected.includes('ig-story'))list.push({kind:'STORY_VIDEO',format:'story',label:'Instagram Stories'});
  if(selected.includes('ig-reels')||selected.includes('ig-feed'))list.push({kind:'REELS',format:'story',shareToFeed:selected.includes('ig-feed'),label:selected.includes('ig-feed')?'Instagram Reels + Feed':'Instagram Reels'});
  if(selected.includes('yt-shorts'))list.push({kind:'REELS',youtube:true,youtubeChannel:'youtube-shorts',format:'story',label:'YouTube Shorts'});
  if(selected.includes('yt-video'))list.push({kind:'REELS',youtube:true,youtubeChannel:'youtube-video',format:'landscape',label:'YouTube · vídeo tradicional'});
  return list;
 }
 $('direct-publish').addEventListener('click',async()=>{
  if(busy||posted)return;
  const source=window.CDEVideo.sourceInfo(),selected=destinations(),title=$('title').value.trim();
  if(!source)return status('Selecione um vídeo válido no editor.',true);
  if(!title)return status('Informe o nome do produto.',true);
  if(!selected.length)return status('Escolha onde o vídeo vai aparecer.',true);
  if(!$('direct-rights').checked)return status('Confirme os direitos de uso do vídeo e áudio.',true);
  const start=Number($('video-trim-start').value||0),end=Number($('video-trim-end').value||source.duration),duration=end-start;
  if(start<0||end>source.duration+.05||!Number.isFinite(duration)||duration<=0)return status('Informe início e final válidos para o corte.',true);
  if(source.duration>240)return status('O editor com marca aceita vídeos originais de até 4 minutos.',true);
  if(selected.includes('ig-story')&&(duration>60||duration<3))return status('Para Stories, recorte um trecho entre 3 e 60 segundos.',true);
  if(selected.some(x=>x.startsWith('ig-'))&&duration<3)return status('O vídeo do Instagram precisa ter pelo menos 3 segundos.',true);
  if(selected.includes('yt-shorts')&&duration>180)return status('Recorte até 3 minutos para Shorts ou selecione vídeo tradicional.',true);
  const targets=plans(selected);
  if(targets.some(x=>!x.youtube)&&!window.CDEInstagramPublisher?.status().ready)return status('Conecte o Instagram antes de publicar.',true);
  if(targets.some(x=>x.youtube)&&!window.CDEYouTubePublisher?.status().ready)return status('Conecte o YouTube antes de publicar.',true);
  busy=true;$('direct-publish').disabled=true;let queued=false;
  try{
   if(captionTitle!==title&&!await generate())return;
   const captions={instagram:$('direct-instagram-caption').value.trim(),youtube:$('direct-youtube-caption').value.trim()};
   if(targets.some(x=>x.kind!=='STORY_VIDEO'&&!(x.youtube?captions.youtube:captions.instagram)))throw Error('Revise as legendas dos destinos selecionados.');
   if(!window.confirm('Publicar agora '+title+' em '+targets.map(x=>x.label).join(', ')+'? O vídeo editado será enviado diretamente.'))return;
   const locked=[...document.querySelectorAll('#studio input,#studio textarea,#studio select,#direct-captions')];
   const previous=locked.map(n=>n.disabled);locked.forEach(n=>n.disabled=true);
   try{
    const rendered=new Map(),entries=[];
    for(const target of targets){
     status('Preparando '+target.label+'… Não é necessário baixar o vídeo.');
     if(!rendered.has(target.format))rendered.set(target.format,await window.CDEVideo.renderForPublish(target.format));
     const output=rendered.get(target.format);
     entries.push({...target,blob:output.blob,caption:target.youtube?captions.youtube:captions.instagram});
    }
    const ids=await window.CDEDirectQueue.enqueue({title,entries});queued=true;
    status('Enviando o vídeo editado para os destinos selecionados…');
    const results=await window.CDEDirectQueue.publish(ids);
    const failed=results.filter(x=>x.status!=='published');posted=true;
    if(failed.length)status('Envio concluído com pendências: '+failed.map(x=>x.label+': '+x.error).join(' · ')+'. Confira Fila e lotes antes de tentar novamente.',true);
    else status('Publicado em '+results.map(x=>x.label).join(', ')+'. Comprovantes em Insights e histórico.');
   }finally{locked.forEach((n,i)=>n.disabled=previous[i]);}
  }catch(e){posted=queued;status(String(e?.message||e||'Falha na preparação do vídeo.')+(queued?' Confira Fila e lotes para acompanhar os envios.':''),true);}
  finally{busy=false;$('direct-publish').disabled=posted;}
 });
})();
