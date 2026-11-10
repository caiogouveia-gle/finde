// Finde v24 (v23 com a dor dita no grupo, "Vixe, preciso filtrar aqui", e quatro faixas de idade). Vídeo 2: nova persona (Bruna, 30), festas no fim de semana e o protótipo (formulário que vira conversa).
// Mesmo teatro de papel da v21 (direção C). --preview gera só quadros; sem ele exporta MP4 silencioso.
const fs=require('fs'),path=require('path'),{spawn}=require('child_process');
const deps=process.env.VIDEO_NODE_MODULES||'/Users/caiogouveia/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules';
const {createCanvas,loadImage,GlobalFonts}=require(path.join(deps,'@napi-rs/canvas'));
GlobalFonts.registerFromPath('/System/Library/Fonts/Supplemental/Chalkboard.ttc','Papel');
const ROOT=path.resolve(__dirname,'..'),cfg=require(path.join(ROOT,'roteiro.json'));
const motion=require(path.join(ROOT,'movimento.json')).C;
const OUT=path.join(ROOT,'propostas',motion.pasta),W=1280,H=720,FPS=cfg.fpsMovimento;
const c=createCanvas(W,H),previous=createCanvas(W,H),current=createCanvas(W,H);let ctx=c.getContext('2d'),sceneTime=0;
const clamp=x=>Math.max(0,Math.min(1,x));const ease=x=>1-Math.pow(1-clamp(x),3);
const smooth=x=>{x=clamp(x);return x*x*(3-2*x)};
const blue='#173c85',paper='#fff3df',sheet='#fff9ed',sand='#f2e7d0',orange='#f3b66e',orangeText='#b55e18',muted='#66718d';let imgs={};

// ---------- primitivas (as mesmas da v21) ----------
function text(s,x,y,size=30,align='center',color=blue){ctx.fillStyle=color;ctx.font=`${size}px Papel`;ctx.textAlign=align;ctx.textBaseline='middle';s.split('\n').forEach((l,i)=>ctx.fillText(l,x,y+i*size*1.28));}
function box(x,y,w,h,r=12,fill=paper,stroke=blue){ctx.save();ctx.translate(x+w/2,y+h/2);ctx.beginPath();ctx.roundRect(-w/2,-h/2,w,h,r);ctx.fillStyle=fill;ctx.fill();ctx.strokeStyle=stroke;ctx.lineWidth=2.5;ctx.stroke();ctx.restore();}
function placed(age,fn,dir=[0,1]){
 if(age<0)return;const p=ease(age/motion.entrada),d=motion.distancia*(1-p);
 ctx.save();ctx.translate(dir[0]*d,dir[1]*d);ctx.globalAlpha*=0.20+0.80*p;
 ctx.shadowColor='#705a3b25';ctx.shadowBlur=2;ctx.shadowOffsetY=3;fn();ctx.restore();
}
function bubble(s,age,x=580,y=173,w=640){ctx.font='32px Papel';const measured=Math.max(...s.split('\n').map(l=>ctx.measureText(l).width));w=Math.min(w,Math.max(252,measured+70));placed(age,()=>{let h=s.split('\n').length*42+35;box(x,y,w,h,29);ctx.beginPath();ctx.moveTo(x+13,y+h-3);ctx.lineTo(x-21,y+h+11);ctx.lineTo(x+39,y+h-2);ctx.fillStyle=paper;ctx.fill();ctx.stroke();text(s,x+w/2,y+39,32);});}
function strip(s,age,x,y,w,size=32){placed(age,()=>{ctx.translate(x+w/2,y+31);box(-w/2,-31,w,63,3);text(s,0,0,size);});}
function blank(){ctx.fillStyle=paper;ctx.fillRect(0,0,W,H);}
function clock(hour,label,labelSize=27){const x=117,y=99;ctx.fillStyle=paper;ctx.strokeStyle=blue;ctx.lineWidth=3;ctx.beginPath();ctx.arc(x,y,51,0,7);ctx.fill();ctx.stroke();for(let i=0;i<12;i++){let a=i*Math.PI/6;ctx.beginPath();ctx.moveTo(x+Math.sin(a)*43,y-Math.cos(a)*43);ctx.lineTo(x+Math.sin(a)*47,y-Math.cos(a)*47);ctx.stroke();}let ha=hour*Math.PI/6,ma=(hour%1)*Math.PI*2;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(ha)*28,y-Math.cos(ha)*28);ctx.moveTo(x,y);ctx.lineTo(x+Math.sin(ma)*39,y-Math.cos(ma)*39);ctx.stroke();text(label,187,100,labelSize,'left');}
function sprite(name){
const base=name==='pensativa'?imgs.neutra:imgs[name],b=base.bounds,k=493/b.h;
ctx.save();ctx.shadowColor='#705a3b25';ctx.shadowBlur=2;ctx.shadowOffsetY=3;
ctx.drawImage(base,b.x,b.y,b.w,b.h,202,184,493*b.w/b.h,493);ctx.restore();
if(name==='pensativa'){ctx.save();ctx.translate(202-b.x*k,184-b.y*k);ctx.scale(k,k);ctx.beginPath();ctx.roundRect(521,199,76,100,10);ctx.roundRect(635,198,62,106,10);ctx.clip();ctx.drawImage(imgs.pensativa,0,0);ctx.restore();}}
const T={PERS:9,ABR:13.5,BUSCA:17,SUM:28.1,LEMB:32.5,FONE:35.5,FORM:36,CHAT:50,DEC:62,EV:67,END:71.5};
const ZOOMS=[[T.ABR,T.BUSCA],[T.LEMB,T.FONE]];
function room(name,hour,label,labelSize=27){
 blank();let p=0;for(const [start,end] of ZOOMS){if(sceneTime>=start&&sceneTime<end+.45){p=sceneTime<end?smooth((sceneTime-start)/.70):1-smooth((sceneTime-end)/.45);break;}}
 ctx.save();if(p>0){const z=1+.5*p;ctx.translate(400*(1-z)+10*p,260*(1-z)+20*p);ctx.scale(z,z);}
 ctx.drawImage(imgs.sofa,48,302,690,355);sprite(name);ctx.restore();clock(hour,label,labelSize);
}
function icon(source,x,y){ctx.save();ctx.strokeStyle=blue;ctx.fillStyle=blue;ctx.lineWidth=3;
 if(source==='Instagram'){ctx.strokeRect(x-12,y-12,24,24);ctx.beginPath();ctx.arc(x,y,6,0,7);ctx.stroke();ctx.fillRect(x+6,y-8,3,3);}
 else if(source==='TikTok'){ctx.beginPath();ctx.moveTo(x+3,y+7);ctx.lineTo(x+3,y-15);ctx.lineTo(x+14,y-9);ctx.lineTo(x+14,y-2);ctx.stroke();ctx.beginPath();ctx.ellipse(x-3,y+9,7,5,-.3,0,7);ctx.fill();}
 else if(source==='Google Maps'){ctx.beginPath();ctx.arc(x,y-4,10,0,7);ctx.stroke();ctx.beginPath();ctx.moveTo(x-8,y+3);ctx.lineTo(x,y+17);ctx.lineTo(x+8,y+3);ctx.stroke();}
 else{ctx.beginPath();ctx.roundRect(x-14,y-12,28,20,6);ctx.stroke();ctx.beginPath();ctx.moveTo(x-6,y+8);ctx.lineTo(x-9,y+15);ctx.lineTo(x+1,y+8);ctx.stroke();for(const d of [-6,0,6]){ctx.beginPath();ctx.arc(x+d,y-2,1.6,0,7);ctx.fill();}}
 ctx.restore();}
function tapRing(age,x,y){if(age<0||age>.30)return;const u=age/.30;ctx.save();ctx.globalAlpha*=.65*(1-u);ctx.strokeStyle='#c77222';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(x,y,8+14*u,0,Math.PI*2);ctx.stroke();ctx.restore();}
function introCard(s,age,x,y,w,h,z){placed(age,()=>{ctx.save();ctx.translate(x+w/2,y+h/2);ctx.rotate((x>900?.028:-.028)*(1-ease(age/.40)));ctx.translate(-x-w/2,-y-h/2);box(x,y,w,h,3);text(s,x+w/2,y+h/2-(s.split('\n').length-1)*z*.64,z);ctx.restore();});}

// ---------- busca: três cartões de 3 s ----------
const CARD=3.7;
function drawCard(item){box(780,345,400,239,6);text(item.cabecalho,807,379,24,'left');ctx.beginPath();ctx.moveTo(803,408);ctx.lineTo(1157,408);ctx.stroke();
 const n=item.titulo.split('\n').length,size=n>1?28:31;text(item.titulo,980,(item.detalhe?453:478)-(n-1)*size*.64,size);if(item.detalhe)text(item.detalhe,980,515,24);}
function card(item,age){
 const enter=ease(age/.34),leave=smooth((age-(CARD-.25))/.25);ctx.save();ctx.globalAlpha*=(.3+.7*enter)*(1-leave);ctx.translate(62*(1-enter)-58*leave,0);
 ctx.translate(980,465);ctx.rotate(-.022*(1-enter)-.03*leave);ctx.translate(-980,-465);
 ctx.shadowColor='#705a3b26';ctx.shadowBlur=4;ctx.shadowOffsetY=4;
 for(const [dx,dy,angle] of [[13,13,.026],[-9,8,-.025]]){ctx.save();ctx.translate(980+dx,465+dy);ctx.rotate(angle);ctx.translate(-980,-465);box(780,345,400,239,6,'#f6ead3','#687ca5');ctx.restore();}
 drawCard(item);ctx.restore();
}
// Carimbo da recusa: risco desenhado sobre o cartão.
function refusal(age){if(age<0)return;const q=clamp(age/.25);ctx.save();ctx.globalAlpha*=1-smooth((age-(CARD-1.8))/.25);ctx.strokeStyle='#c77222';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(812,560);ctx.lineTo(812+336*q,560-170*q);ctx.stroke();ctx.restore();}
function summary(t){const t0=T.SUM;room('cansada',22,'Sexta · 22h');bubble(cfg.busca,t-t0,580,173,640);
 placed(t-t0-.2,()=>box(780,384,400,176,8));
 cfg.fontes.forEach((name,i)=>placed(t-T.SUM-.35-i*.075,()=>{const x=803+(i%2)*197,y=426+Math.floor(i/2)*82;icon(name,x+12,y);text(name,x+35,y,22,'left');},[0,.35]));
}

// ---------- o app ----------
function shell(t,t0){
 const u=1-ease((t-t0)/.75);ctx.translate(401,360);ctx.rotate(-.043*u);ctx.translate(-401,-360);
 placed(t-t0+.15,()=>{box(172,48,459,624,29);box(190,84,423,552,15,sheet);ctx.fillStyle=blue;ctx.fillRect(341,64,120,5);});
}
function caption(s,age){placed(age,()=>{box(690,250,500,124,8);text(s,940,288,30);},[1,0]);}
const FORM0=T.FORM,QDUR=2.8;
function form(t){blank();ctx.save();shell(t,T.FONE);
 const i=Math.min(4,Math.floor((t-FORM0)/QDUR));
 if(t>=FORM0){const q=cfg.formulario[i],a=t-FORM0-i*QDUR,slide=i>0?1-ease(a/.3):0;
  ctx.save();ctx.translate(40*slide,0);ctx.globalAlpha*=1-.7*slide;
  text(cfg.marca,214,111,22,'left');text(`${i+1} de 5`,589,111,22,'right');
  box(214,132,375,9,4,sand);box(214,132,375*((i+(a>1.2?1:0))/5)||0.01,9,4,orange);
  text(q.pergunta,214,190,34,'left');
  const top=q.pergunta.includes('\n')?285:250,gap=q.opcoes.length>3?68:76;
  q.opcoes.forEach((o,j)=>{const y=top+j*gap,chosen=q.escolhas.includes(j),k=q.escolhas.indexOf(j),tapAt=.75+k*.35,on=chosen&&a>=tapAt+.08;
   box(214,y,375,gap-14,12,on?orange:paper);text(o,401,y+(gap-14)/2,27);if(chosen)tapRing(a-tapAt,520,y+(gap-14)/2);});
  ctx.restore();}
 ctx.restore();
 if(t>=FORM0)caption(cfg.legendas[0],t-FORM0-.1);
}
const CHAT0=T.CHAT;
function partyCard(f,y,age,dim=0,badge=null){placed(age,()=>{ctx.save();ctx.globalAlpha*=1-.6*dim;box(208,y,387,96,10);
 text(f.nome,224,y+24,25,'left');text(f.linha,224,y+54,20,'left');text('Por quê: '+f.porque,224,y+79,19,'left',orangeText);
 if(badge)text(badge,580,y+24,18,'right',orangeText);ctx.restore();});}
function chat(t){blank();ctx.save();shell(t,CHAT0-1000);
 placed(t-CHAT0,()=>{text(cfg.marca,214,111,22,'left');text('Sábado · 22h às 3h',589,111,20,'right');ctx.beginPath();ctx.moveTo(208,132);ctx.lineTo(595,132);ctx.stroke();});
 placed(t-CHAT0-.3,()=>{box(208,146,300,46,16,sand);text(cfg.chatResposta,224,169,22,'left');});
 const near=t>=CHAT0+8.6;
 cfg.festas.forEach((f,i)=>partyCard(f,204+i*106,t-CHAT0-.8-i*.6,near&&i===2?1:0,near&&i<2?'10 min':null));
 if(t>=CHAT0+6){const age=t-CHAT0-6;placed(age,()=>{box(345,526,250,58,16,orange);text(cfg.chatPergunta,361,543,19,'left');},[0,.5]);}
 if(t>=CHAT0+7.8){placed(t-CHAT0-7.8,()=>{box(208,590,352,42,14,sand);text(cfg.chatAjuste.replace('\n',' '),222,611,19,'left');},[0,.5]);}
 ctx.restore();
 caption(cfg.legendas[1],t-CHAT0-.2);
 placed(t-CHAT0-3.4,()=>{box(690,420,500,128,29);const l=cfg.reacaoApp.split('\n');text('“'+l[0],940,462,30);text(l[1]+'”',940,500,30);},[1,0]);
}
const DEC0=T.DEC;
function decide(t){blank();ctx.save();shell(t,DEC0-1000);const f=cfg.festas[0];
 placed(t-DEC0,()=>{text(cfg.marca,214,111,22,'left');text('Sua escolha',589,111,22,'right');
  box(208,140,387,150,12);text(f.nome,228,178,32,'left');text(f.linha,228,222,23,'left');text(f.porque,228,256,21,'left',orangeText);});
 placed(t-DEC0-.3,()=>{const sent=t>=DEC0+1.65;box(208,306,387,58,14,sent?sand:orange);text(sent?'Enviado ao grupo':'Mandar pro grupo',401,335,26);});
 tapRing(t-DEC0-1.4,401,335);
 if(t>=DEC0+1.8)placed(t-DEC0-1.8,()=>{box(208,380,387,240,12,sand);text('Grupo · Sábado',228,408,21,'left',muted);});
 cfg.grupo.forEach((m,i)=>{const at=DEC0+2.1+i*.8;if(t>=at)placed(t-at,()=>{const mine=i===0;box(mine?300:226,432+i*60,mine?280:260,46,14,mine?orange:paper);text(m,(mine?314:240),455+i*60,19,'left');},[0,.5]);});
 ctx.restore();
 caption(cfg.legendas[2],t-DEC0-.2);
}

function groupChat(t){blank();ctx.save();shell(t,-.15);
 placed(t,()=>{text('Grupo · Sábado',214,111,22,'left');text('4 pessoas',589,111,20,'right',muted);ctx.beginPath();ctx.moveTo(208,132);ctx.lineTo(595,132);ctx.stroke();});
 cfg.grupoInicio.forEach((m,i)=>{const at=.7+i*1.2;if(t>=at)placed(t-at,()=>{const mine=m.startsWith('Bruna');ctx.font='22px Papel';const w=Math.min(387,ctx.measureText(m).width+34);const x=mine?595-w:208;box(x,152+i*76,w,54,16,mine?orange:paper);text(m,x+16,179+i*76,22,'left');},[0,.5]);});
 ctx.restore();const dor=.7+5*1.2+.2;if(t<dor)caption(cfg.legendaInicio,t-.3);else caption(cfg.legendaDor,t-dor);
}
// ---------- festa e fecho ----------
function showBubble(age,s){placed(age,()=>{
const x=68,y=100,w=420,h=78,r=26,b=y+h;
ctx.beginPath();ctx.moveTo(x+r,y);ctx.lineTo(x+w-r,y);ctx.quadraticCurveTo(x+w,y,x+w,y+r);
ctx.lineTo(x+w,b-r);ctx.quadraticCurveTo(x+w,b,x+w-r,b);
ctx.lineTo(190,b);ctx.lineTo(174,203);ctx.lineTo(151,b);
ctx.lineTo(x+r,b);ctx.quadraticCurveTo(x,b,x,b-r);ctx.lineTo(x,y+r);ctx.quadraticCurveTo(x,y,x+r,y);ctx.closePath();
ctx.fillStyle=paper;ctx.fill();ctx.strokeStyle=blue;ctx.lineWidth=2.5;ctx.stroke();text(s,x+w/2,y+h/2,30);
},[0,-1]);}
const EV0=T.EV,END0=T.END;
function party(t){blank();
placed(t-EV0,()=>{
ctx.strokeStyle=blue;ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(841,651);ctx.lineTo(1190,651);ctx.lineTo(1201,678);ctx.lineTo(830,678);ctx.closePath();ctx.fillStyle=paper;ctx.fill();ctx.stroke();
// Cabine de DJ simples e duas luzes de pista.
box(900,520,230,131,6);ctx.lineWidth=3;for(const x of [960,1070]){ctx.beginPath();ctx.arc(x,560,26,0,7);ctx.stroke();ctx.beginPath();ctx.arc(x,560,4,0,7);ctx.fillStyle=blue;ctx.fill();}
ctx.strokeStyle=blue;ctx.lineWidth=3;for(const x of [875,1156]){box(x-17,296,34,24,5);ctx.beginPath();ctx.moveTo(x-14,326);ctx.lineTo(x-36,367);ctx.moveTo(x+14,326);ctx.lineTo(x+36,367);ctx.stroke();}
ctx.save();ctx.fillStyle=orange;ctx.globalAlpha*=.15;for(const x of [875,1156]){const swing=Math.sin((t-EV0)*1.8+(x===875?0:1.1))*22;ctx.beginPath();ctx.moveTo(x-10,320);ctx.lineTo(x-80+swing,640);ctx.lineTo(x+80+swing,640);ctx.lineTo(x+10,320);ctx.closePath();ctx.fill();}ctx.restore();
ctx.drawImage(imgs.grupo,60,179,515*imgs.grupo.width/imgs.grupo.height,515);
strip('Sábado · 23h',1,876,166,272,27);
},[0,.5]);
showBubble(t-EV0-.5,t<EV0+2.8?cfg.falasEvento[0]:cfg.falasEvento[1]);
}
function ending(t){blank();placed(t-END0,()=>{text(cfg.marca,640,270,78);ctx.beginPath();ctx.moveTo(520,322);ctx.lineTo(760,322);ctx.strokeStyle=orange;ctx.lineWidth=4;ctx.stroke();text(cfg.final,640,380,38);text(cfg.rodape,640,560,22,'center',muted);});}

function rawFrame(t){sceneTime=t;ctx.clearRect(0,0,W,H);
if(t<T.PERS)groupChat(t);
else if(t<T.ABR){const a=t-T.PERS;room('neutra',19,'Sexta · 19h');introCard(cfg.persona[0],a-.5,780,205,190,64,34);introCard(cfg.persona[1],a-5/6,990,205,190,64,30);introCard(cfg.persona[2],a-7/6,780,293,400,64,29);introCard(cfg.persona[3],a-1.5,780,381,400,104,28);}
else if(t<T.BUSCA){room('neutra',19,'Sexta · 19h');bubble(cfg.abertura,t-T.ABR,580,173,640);}
else if(t<T.SUM){const k=Math.min(2,Math.floor((t-T.BUSCA)/CARD)),a=t-T.BUSCA-k*CARD,transition=k>0&&a<.4,hour=transition?19+k+smooth(a/.4):20+k;
 room(k<1?'neutra':'cansada',hour,transition?'Sexta':`Sexta · ${20+k}h`);card(cfg.cards[k],a);refusal(a-1.4);bubble(cfg.cards[k].reacao,a-.6,552,185,602);}
else if(t<T.LEMB)summary(t);
else if(t<T.FONE){room('pensativa',22,'Sexta · 22h');bubble(cfg.lembranca,t-T.LEMB,580,173,640);}
else if(t<CHAT0)form(t);
else if(t<DEC0)chat(t);
else if(t<EV0)decide(t);
else if(t<END0)party(t);
else ending(t);}
function cameraAt(t){
 if(t>=T.FONE&&t<EV0)return {z:1.015+.02*smooth((t-T.FONE)/1.5),cx:640,cy:360};
 if(t>=EV0&&t<END0)return {z:1.005+.047*smooth((t-EV0)/1.6),cx:640,cy:360};
 return {z:1,cx:640,cy:360};
}
function paint(canvas,t){
 ctx=canvas.getContext('2d');ctx.resetTransform();ctx.globalAlpha=1;ctx.shadowColor='transparent';ctx.lineCap='round';ctx.lineJoin='round';ctx.strokeStyle=blue;ctx.lineWidth=2.5;ctx.clearRect(0,0,W,H);
 ctx.save();const camera=cameraAt(t);ctx.translate(camera.cx,camera.cy);ctx.scale(camera.z,camera.z);ctx.translate(-camera.cx,-camera.cy);rawFrame(t);ctx.restore();
}
const CUTS=[T.PERS,T.FONE,CHAT0,DEC0,EV0,END0];
function frame(t){
 const boundary=CUTS.find(b=>t>=b&&t<b+motion.transicao);
 if(boundary===undefined){paint(c,t);return;}
 paint(previous,boundary-1/FPS);paint(current,t);ctx=c.getContext('2d');ctx.resetTransform();ctx.globalAlpha=1;ctx.shadowColor='transparent';blank();
 const p=smooth((t-boundary)/motion.transicao),slide=16;
 ctx.save();ctx.drawImage(previous,-slide*p,0);ctx.restore();ctx.save();ctx.globalAlpha=p;ctx.drawImage(current,slide*(1-p),0);ctx.restore();
}
async function main(){for(const name of ['sala','sofa','grupo'])imgs[name]=await loadImage(path.join(ROOT,'assets',name+'.png'));for(const name of ['neutra','cansada','contente','pensativa']){const im=await loadImage(path.join(ROOT,'assets','maria-'+name+'.png')),tmp=createCanvas(im.width,im.height),tc=tmp.getContext('2d');tc.drawImage(im,0,0);const d=tc.getImageData(0,0,im.width,im.height).data;let x0=im.width,y0=im.height,x1=0,y1=0;for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++)if(d[(y*im.width+x)*4+3]>30){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}im.bounds={x:x0,y:y0,w:x1-x0+1,h:y1-y0+1};imgs[name]=im;}
fs.mkdirSync(path.join(OUT,'quadros'),{recursive:true});
const times=process.argv.find(x=>x.startsWith('--times='))?.slice(8).split(',').map(Number)||[3,7.5,8.9,11,15,19,26,30,42.3,43.7,52,58,65,69,74];
if(!process.argv.includes('--render-only')){for(const t of times){frame(t);fs.writeFileSync(path.join(OUT,'quadros',t.toFixed(3).padStart(6,'0')+'s.png'),c.toBuffer('image/png'));}}
if(process.argv.includes('--preview'))return;
const ff=process.env.FFMPEG||'/Users/caiogouveia/Documents/Codex/2026-10-26/ev/work/video-v6/deps/imageio_ffmpeg/binaries/ffmpeg-macos-aarch64-v7.1';const dest=path.join(OUT,'Finde - Video 2 - v24.mp4');const proc=spawn(ff,['-y','-f','rawvideo','-pix_fmt','rgba','-s',`${W}x${H}`,'-r',String(FPS),'-i','pipe:0','-an','-c:v','libx264','-preset','fast','-crf','18','-r','24','-pix_fmt','yuv420p','-movflags','+faststart',dest],{stdio:['pipe','ignore','pipe']});let errors='';proc.stderr.on('data',x=>errors+=x);const done=new Promise((res,rej)=>proc.on('exit',code=>code?rej(new Error(errors)):res()));for(let i=0;i<cfg.duracao*FPS;i++){frame(i/FPS);if(!proc.stdin.write(Buffer.from(ctx.getImageData(0,0,W,H).data)))await new Promise(r=>proc.stdin.once('drain',r));}proc.stdin.end();await done;console.log(`v24: ${cfg.duracao}s, 1280×720, 24fps, sem áudio → ${dest}`);}
main().catch(e=>{console.error(e);process.exit(1);});
