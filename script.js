'use strict';
const KEY = 'AIzaSyBhcqZ_dZ8kFK9NtsaFzBHygQ0pt9GfCoE';
const YR = new Date().getFullYear();

const TREND_QUERIES = [
  'tangga lagu indonesia terbaru',
  'lagu pop indonesia terpopuler',
  'lagu indonesia viral',
  'lagu indonesia hits '+YR
];

const DEFAULT_QGENRES = [
  {label:'Top Indonesia', q:'tangga lagu indonesia terbaru'},
  {label:'Lo-fi Chill', q:'lofi hip hop chill beats relax'},
  {label:'Workout', q:'workout gym motivation'},
  {label:'K-Pop', q:'kpop hits'},
  {label:'Jazz Café', q:'smooth jazz cafe background music'},
  {label:'Acoustic Pop', q:'acoustic pop songs indonesia'}
];

const PLAYLISTS = [
  {name:'Top Indonesia', q:'top hits indonesia terbaru'},
  {name:'Chill Lofi Beats', q:'lofi hip hop chill beats'},
  {name:'Workout Mix', q:'workout motivation gym music'},
  {name:'Jazz Café', q:'smooth jazz cafe music'},
  {name:'K-Pop', q:'kpop hits'}
];
const ARTISTS = ['Tulus','Andmesh','Peterpan','Dewa 19','Afgan','Yura Yunita','Noah','Raisa','Fourtwnty','Hindia'];

const S = {
  queue:[],idx:-1,song:null,
  playing:false,shuffle:false,repeat:false,
  vol:75,muted:false,
  faves:new Set(),recent:[],
  timer:null,
  lyrics:[],
  fsLyricsOn:false
};
let YTP=null,YTR=false;

function loadYT(){
  const s=document.createElement('script');
  s.src='https://www.youtube.com/iframe_api';
  document.head.appendChild(s);
}
window.onYouTubeIframeAPIReady=function(){
  YTR=true;
  YTP=new YT.Player('ytPlayer',{
    height:'1',width:'1',
    playerVars:{autoplay:1,controls:0,disablekb:1,fs:0,iv_load_policy:3,modestbranding:1,rel:0,origin:location.origin,playsinline:1},
    events:{
      onReady:e=>{ e.target.setVolume(S.vol); },
      onStateChange:onYTS,
      onError:()=>nextSong()
    }
  });
};

function onYTS(e){
  const Y=YT.PlayerState;
  if(e.data===Y.PLAYING){setPS(true);startTimer();}
  else if(e.data===Y.PAUSED){setPS(false);stopTimer();}
  else if(e.data===Y.ENDED){S.repeat?(YTP.seekTo(0),YTP.playVideo()):nextSong();}
}

function setupMediaSession(){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.setActionHandler('play',()=>{YTP?.playVideo()});
  navigator.mediaSession.setActionHandler('pause',()=>{YTP?.pauseVideo()});
  navigator.mediaSession.setActionHandler('previoustrack',()=>prevSong());
  navigator.mediaSession.setActionHandler('nexttrack',()=>nextSong());
  navigator.mediaSession.setActionHandler('seekto',d=>{if(YTP?.seekTo)YTP.seekTo(d.seekTime,true)});
}

function updateMediaSession(s){
  if(!('mediaSession' in navigator))return;
  navigator.mediaSession.metadata=new MediaMetadata({
    title:s.title,
    artist:s.artist,
    album:'Deplay Music',
    artwork:[
      {src:s.realCover||s.thumb,sizes:'480x360',type:'image/jpeg'}
    ]
  });
  navigator.mediaSession.playbackState='playing';
}

let silentCtx=null,silentSrc=null;
function setupSilentAudio(){
  try{
    silentCtx=new(window.AudioContext||window.webkitAudioContext)();
    const buf=silentCtx.createBuffer(1,1,22050);
    silentSrc=silentCtx.createBufferSource();
    silentSrc.buffer=buf;silentSrc.loop=true;
    silentSrc.connect(silentCtx.destination);
    silentSrc.start(0);
  }catch(e){}
}

function startTimer(){
  stopTimer();
  S.timer=setInterval(()=>{
    if(!YTP?.getCurrentTime)return;
    const c=YTP.getCurrentTime()||0,d=YTP.getDuration()||1;
    const p=(c/d*100).toFixed(2)+'%';
    $('pFill').style.width=p;$('fsPFill').style.width=p;
    const f=t=>`${Math.floor(t/60)}:${String(Math.floor(t%60)).padStart(2,'0')}`;
    $('curT').textContent=$('fsCurT').textContent=f(c);
    $('totT').textContent=$('fsTotT').textContent=f(d);
    syncLyrics(c);
  },400);
}
function stopTimer(){clearInterval(S.timer)}

function normTitle(t){
  return String(t||'').toLowerCase()
    .replace(/\(.*?\)|\[.*?\]/g,' ')
    .replace(/official|video|music|audio|lyrics?|lirik|mv|hd|4k|live|cover|reaction|full album|original|remaster(ed)?/gi,' ')
    .replace(/[^a-z0-9]+/g,' ')
    .trim();
}
function scoreOfficial(item){
  let score=0;
  const ch=(item.artist||'').toLowerCase();
  const t=(item.title||'').toLowerCase();
  if(ch.includes('official')||ch.includes('vevo'))score+=6;
  if(t.includes('official'))score+=3;
  if(t.includes('cover'))score-=5;
  if(t.includes('reaction'))score-=8;
  if(t.includes('lirik')||t.includes('lyrics'))score-=1;
  if(t.includes('live')||t.includes('konser'))score-=2;
  if(t.includes('karaoke')||t.includes('instrumental'))score-=6;
  return score;
}
function dedupeSongs(list){
  const groups={};
  list.forEach(s=>{
    const key=normTitle(s.title)||s.id;
    if(!groups[key])groups[key]=[];
    groups[key].push(s);
  });
  return Object.keys(groups).map(k=>{
    const g=groups[k];
    g.sort((a,b)=>scoreOfficial(b)-scoreOfficial(a));
    return g[0];
  });
}

async function ytSearch(q,max=10){
  const url=`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(q)}&type=video&videoCategoryId=10&maxResults=${max}&key=${KEY}`;
  try{
    const r=await fetch(url);
    if(!r.ok){const e=await r.json().catch(()=>({}));toast('YouTube: '+(e.error?.message||'Error'));return[]}
    const d=await r.json();
    return(d.items||[]).map(mapItem);
  }catch(e){console.warn(e);return[]}
}

async function ytFull(q,max=10){
  const base=await ytSearch(q,max);
  if(!base.length)return[];
  const ids=base.map(s=>s.videoId).join(',');
  try{
    const r=await fetch(`https://www.googleapis.com/youtube/v3/videos?part=contentDetails,snippet&id=${ids}&key=${KEY}`);
    if(!r.ok)return base;
    const d=await r.json();
    const det={};(d.items||[]).forEach(v=>det[v.id]=v);
    return base.map(s=>{
      const v=det[s.videoId];
      if(!v)return s;
      const th=v.snippet?.thumbnails?.maxres?.url
        ||v.snippet?.thumbnails?.high?.url
        ||v.snippet?.thumbnails?.medium?.url
        ||s.thumb;
      return{...s,thumb:th,dur:parseDur(v.contentDetails?.duration||''),durationSec:parseDurSec(v.contentDetails?.duration||'')};
    });
  }catch{return base}
}

async function ytFullUnique(q,max=10){
  const res=await ytFull(q,max);
  return dedupeSongs(res);
}

function getBestThumb(videoId,fallback){
  return`https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
}

function parseDur(iso){
  const m=iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if(!m)return'—';
  const h=+(m[1]||0),mn=+(m[2]||0),s=+(m[3]||0);
  if(h)return`${h}:${String(mn).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  return`${mn}:${String(s).padStart(2,'0')}`;
}
function parseDurSec(iso){
  const m=iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if(!m)return 0;
  return(+(m[1]||0))*3600+(+(m[2]||0))*60+(+(m[3]||0));
}
const COMPILATION_WORDS=['full album','nonstop','non stop','kompilasi','medley','best of','sepanjang masa','lagu hits','tanpa iklan','1 jam','2 jam','3 jam','playlist','mix ','terpopuler sepanjang','spesial'];
function isLikelyCompilation(s){
  const t=(s.title||'').toLowerCase();
  if(COMPILATION_WORDS.some(w=>t.includes(w)))return true;
  if(s.durationSec&&s.durationSec>420)return true;
  return false;
}

function mapItem(i){
  const vid=i.id?.videoId||'';
  const th=i.snippet?.thumbnails?.high?.url||`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
  return{
    id:vid,videoId:vid,
    title:i.snippet?.title||'Unknown',
    artist:(i.snippet?.channelTitle||'Unknown').replace(/ - Topic$|VEVO$| Official$/,'').trim(),
    thumb:th,dur:'—',color:rndC(),realCover:null
  };
}

async function getRealCover(title,artist){
  try{
    const q=encodeURIComponent(title+' '+artist);
    const r=await fetch(`https://itunes.apple.com/search?term=${q}&entity=song&limit=1`);
    if(!r.ok)return null;
    const d=await r.json();
    if(d.results&&d.results[0]&&d.results[0].artworkUrl100){
      return d.results[0].artworkUrl100.replace('100x100bb','600x600bb');
    }
  }catch(e){}
  return null;
}

async function applyRealCover(s){
  const url=await getRealCover(s.title,s.artist);
  if(!url||S.song!==s)return;
  s.realCover=url;
  ['plCov','fsCov'].forEach(id=>{
    const el=$(id);const img=el&&el.querySelector('img');
    if(img)img.src=url;
  });
  const lc=$('lyrCover');const lcImg=lc&&lc.querySelector('img');
  if(lcImg)lcImg.src=url;
  $('heroBlur').style.backgroundImage=`url('${url}')`;
  $('fsBlur').style.backgroundImage=`url('${url}')`;
}

function cleanTitleForLyrics(t){
  return String(t||'')
    .replace(/\(.*?\)|\[.*?\]/g,' ')
    .replace(/official|video|music|audio|lyrics?|lirik|mv|hd|4k|full album|remaster(ed)?/gi,' ')
    .replace(/\s+/g,' ')
    .trim();
}

async function fetchLyrics(title,artist){
  S.lyrics=[];
  renderLyricsPage();
  const cleanTitle=cleanTitleForLyrics(title);
  let found=false;
  try{
    const r=await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(artist)}`);
    if(r.ok){
      const data=await r.json();
      if(data.length){
        const best=data.find(x=>x.syncedLyrics)||data.find(x=>x.plainLyrics)||data[0];
        if(best?.syncedLyrics){S.lyrics=parseLRC(best.syncedLyrics);found=true}
        else if(best?.plainLyrics){S.lyrics=best.plainLyrics.split('\n').map(line=>({time:-1,text:line}));found=true}
      }
    }
  }catch(e){}
  if(!found){
    try{
      const r2=await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(cleanTitle)}`);
      if(r2.ok){
        const data2=await r2.json();
        if(data2.length){
          const best2=data2.find(x=>x.syncedLyrics)||data2.find(x=>x.plainLyrics)||data2[0];
          if(best2?.syncedLyrics)S.lyrics=parseLRC(best2.syncedLyrics);
          else if(best2?.plainLyrics)S.lyrics=best2.plainLyrics.split('\n').map(line=>({time:-1,text:line}));
        }
      }
    }catch(e2){}
  }
  renderLyricsPage();
  renderFSLyrics();
}

function parseLRC(lrc){
  const lines=lrc.split('\n');
  const result=[];
  for(const line of lines){
    const m=line.match(/\[(\d+):(\d+\.\d+)\](.*)/);
    if(m){
      const time=parseInt(m[1])*60+parseFloat(m[2]);
      const text=m[3].trim();
      if(text)result.push({time,text});
    }
  }
  return result.sort((a,b)=>a.time-b.time);
}

function syncLyrics(currentTime){
  if(!S.lyrics.length||S.lyrics[0].time===-1)return;
  let active=-1;
  for(let i=0;i<S.lyrics.length;i++){
    if(S.lyrics[i].time<=currentTime+0.3)active=i;
    else break;
  }
  highlightLyricLine(active,'lyrBody','lyr-line');
  highlightLyricLine(active,'fsLyrScroll','fs-lyr-line');
}

function highlightLyricLine(activeIdx,containerId,cls){
  const container=$(containerId);
  if(!container)return;
  const lines=container.querySelectorAll('.'+cls);
  lines.forEach((el,i)=>{
    el.classList.remove('active','past');
    if(i<activeIdx)el.classList.add('past');
    else if(i===activeIdx){
      el.classList.add('active');
      el.scrollIntoView({behavior:'smooth',block:'center'});
    }
  });
}

function renderLyricsPage(){
  const body=$('lyrBody');
  if(!S.song){body.innerHTML=`<div class="lyr-empty"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p>Putar lagu untuk melihat lirik</p></div>`;return}
  if(!S.lyrics.length){body.innerHTML=`<div class="lyr-empty"><svg viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg><p>Lirik tidak tersedia untuk lagu ini</p></div>`;return}
  const isSynced=S.lyrics[0].time!==-1;
  body.innerHTML=S.lyrics.map((l,i)=>`<div class="lyr-line" onclick="${isSynced?`seekToLyric(${l.time})`:''}">${h(l.text)||'&nbsp;'}</div>`).join('');
  $('lyrTitle').textContent=S.song.title;
  $('lyrArtist').textContent=S.song.artist;
  const lyrCov=$('lyrCover');
  const cover=S.song.realCover||S.song.thumb;
  lyrCov.innerHTML=`<img src="${cover}" alt="" onerror="this.src='https://i.ytimg.com/vi/${S.song.videoId}/hqdefault.jpg'" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r)"/>`;
}

function renderFSLyrics(){
  const sc=$('fsLyrScroll');
  if(!sc||!S.lyrics.length){if(sc)sc.innerHTML='';return}
  sc.innerHTML=S.lyrics.map((l,i)=>`<div class="fs-lyr-line">${h(l.text)||'&nbsp;'}</div>`).join('');
}

function seekToLyric(time){
  if(YTP?.seekTo)YTP.seekTo(time,true);
}

function toggleFSLyrics(){
  S.fsLyricsOn=!S.fsLyricsOn;
  $('fsLyrOverlay').classList.toggle('on',S.fsLyricsOn);
  $('fsBody').style.opacity=S.fsLyricsOn?'0.12':'1';
  $('fsLyrBtn').classList.toggle('on',S.fsLyricsOn);
}

function loadStorage(){
  try{
    S.recent=JSON.parse(localStorage.getItem('deplay_recent')||'[]');
    S.faves=new Set(JSON.parse(localStorage.getItem('deplay_faves')||'[]'));
  }catch(e){}
}
function saveStorage(){
  try{
    localStorage.setItem('deplay_recent',JSON.stringify(S.recent.slice(0,50)));
    localStorage.setItem('deplay_faves',JSON.stringify([...S.faves]));
  }catch(e){}
}

function getPersonalizedQuickPicks(){
  if(S.recent.length<3){
    $('qTitle').textContent='Pilihan Cepat';
    return DEFAULT_QGENRES;
  }
  const counts={};
  S.recent.forEach(s=>{counts[s.artist]=(counts[s.artist]||0)+1});
  const top=Object.entries(counts).sort((a,b)=>b[1]-a[1]).map(e=>e[0]);
  const picks=top.slice(0,6).map(artist=>({label:artist,q:artist+' official music'}));
  let f=0;
  while(picks.length<6&&f<DEFAULT_QGENRES.length){picks.push(DEFAULT_QGENRES[f]);f++}
  $('qTitle').textContent='Sering Kamu Dengarkan';
  return picks;
}

async function boot(){
  setupMediaSession();
  setupSilentAudio();
  loadYT();
  loadStorage();

  renderQGrid();
  renderSBList();
  renderRecent();
  loadHome();
  bindAll();
  bindAutoplayUnlock();
  toast('Deplay Music siap');
}

function bindAutoplayUnlock(){
  const tryUnlock=()=>{
    if(YTP&&YTP.playVideo&&S.song&&!S.playing){
      if(silentCtx?.state==='suspended')silentCtx.resume();
      YTP.playVideo();
    }
  };
  document.addEventListener('pointerdown',tryUnlock);
  document.addEventListener('touchstart',tryUnlock);
  document.addEventListener('keydown',tryUnlock);
}

const QCOLORS=['#141414','#101010','#181818','#0e0e0e','#161616','#0c0c0c'];

function renderQGrid(){
  const genres=getPersonalizedQuickPicks();
  $('qgrid').innerHTML=genres.map((g,i)=>{
    return`<div class="qcard" style="background:${QCOLORS[i%QCOLORS.length]}" onclick="qPlay('${esc(g.q)}')">
      <div class="qc-th no-img"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
      <span class="qc-lb">${h(g.label)}</span>
      <div class="qpp"><svg viewBox="0 0 24 24" stroke="#000" fill="none" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
    </div>`;
  }).join('');
  loadQCardThumbs(genres);
}

async function loadQCardThumbs(genres){
  const cards=document.querySelectorAll('.qc-th');
  for(let i=0;i<Math.min(cards.length,genres.length);i++){
    (async(card,q)=>{
      const res=await ytSearch(q,1);
      if(res[0]?.thumb){
        card.innerHTML=`<img src="${res[0].thumb}" alt="" loading="lazy" onerror="this.parentElement.classList.add('no-img')"/>`;
        card.classList.remove('no-img');
      }
    })(cards[i],genres[i].q);
  }
}

function renderSBList(){
  $('sbList').innerHTML=PLAYLISTS.map(p=>`
    <div class="pl-row" onclick="qPlay('${esc(p.q)}')">
      <div class="pl-th"><svg viewBox="0 0 24 24"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div>
      <div class="pl-if"><div class="pl-nm">${p.name}</div><div class="pl-sb">Playlist</div></div>
    </div>`).join('');
}

async function loadTrendingIndonesia(){
  const batches=await Promise.all(TREND_QUERIES.map(q=>ytFull(q,10)));
  const merged=[].concat(...batches).filter(s=>!isLikelyCompilation(s));
  return dedupeSongs(merged).slice(0,16);
}

async function loadHome(){
  $('trendRow').innerHTML=skCards(8);
  $('recRow').innerHTML=skCards(8);
  const[tr,rc]=await Promise.all([
    loadTrendingIndonesia(),
    ytFullUnique('hits pop indonesia terbaru',12)
  ]);
  $('trendRow').innerHTML=tr.map(s=>buildCard(s)).join('')||'<div class="empty-note">Tidak ada hasil.</div>';
  $('recRow').innerHTML=rc.map(s=>buildCard(s)).join('');
  if(!S.song&&tr.length){
    const ri=Math.floor(Math.random()*tr.length);
    S.queue=tr;S.idx=ri;
    startPlay(tr[ri]);
  }
  if(tr[0]){
    document.querySelectorAll('.pl-th').forEach((el,i)=>{
      const src=tr[i%tr.length]?.thumb||tr[0].thumb;
      el.innerHTML=`<img src="${src}" loading="lazy" alt="" onerror="this.parentElement.innerHTML='<svg viewBox=\\'0 0 24 24\\'><path d=\\'M9 18V5l12-2v13\\'/></svg>'"/>`;
    });
  }
}

function setupSearch(){
  const inp=$('spInp');
  let t;
  inp.oninput=()=>{
    clearTimeout(t);
    const q=inp.value.trim();
    if(!q){$('spRes').innerHTML=`<div class="sp-empty"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg><p>Ketik untuk mencari lagu<br/><span>Satu hasil terbaik per lagu</span></p></div>`;return}
    $('spRes').innerHTML=`<div style="padding:0 0 4px"><div class="sp-lbl">Mencari…</div>${skTracks(6)}</div>`;
    t=setTimeout(async()=>{
      const res=await ytFullUnique(q,15);
      if(!res.length){$('spRes').innerHTML=`<p style="color:var(--t3);padding:10px 11px">Tidak ada hasil untuk "${h(q)}"</p>`;return}
      $('spRes').innerHTML=`<div class="sp-lbl" style="margin-bottom:6px">Hasil Pencarian</div><div class="sp-res">${res.map((s,i)=>buildTrack(s,i,res)).join('')}</div>`;
    },380);
  };
  setTimeout(()=>inp.focus(),60);
}

function setupTbSearch(){
  const inp=$('tbInp'),drop=$('tbDrop'),clr=$('tbClr');
  let t;
  inp.addEventListener('input',async()=>{
    const q=inp.value.trim();
    clr.classList.toggle('on',q.length>0);
    if(!q){drop.classList.remove('on');return}
    drop.innerHTML=skDrop(4);drop.classList.add('on');
    clearTimeout(t);
    t=setTimeout(async()=>{
      const res=await ytFullUnique(q,7);
      if(!res.length){drop.classList.remove('on');return}
      drop.innerHTML=res.map(s=>`
        <div class="dd-row" onclick="playSong(${e2(s)});clearTb()">
          <div class="dd-th"><img src="${s.thumb}" loading="lazy" alt="" onerror="this.style.opacity=0"/></div>
          <div class="dd-tx"><div class="dd-tt">${h(s.title)}</div><div class="dd-ar">${h(s.artist)}</div></div>
          <span class="dd-du">${s.dur}</span>
        </div>`).join('');
    },340);
  });
  inp.addEventListener('focus',()=>{if(inp.value.trim())drop.classList.add('on')});
  document.addEventListener('click',e=>{if(!e.target.closest('.tb-srch'))drop.classList.remove('on')});
}
function clearTb(){$('tbInp').value='';$('tbClr').classList.remove('on');$('tbDrop').classList.remove('on')}

function renderLib(tab){
  const c=$('libC');
  if(tab==='pl'){
    c.innerHTML=PLAYLISTS.map((p,i)=>`
      <div class="tri" onclick="qPlay('${esc(p.q)}')">
        <div class="tr-n">${i+1}</div>
        <div class="tr-if"><div class="tr-th" style="display:flex;align-items:center;justify-content:center;background:var(--b3)"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18V5l12-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="18" cy="16" r="3"/></svg></div><div class="tr-tx"><div class="tr-nm">${p.name}</div><div class="tr-ar">Playlist</div></div></div>
        <div class="tr-al">Koleksi</div>
        <div class="tr-du"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
        <div></div>
      </div>`).join('');
  }else if(tab==='ar'){
    c.innerHTML=ARTISTS.map((a,i)=>`
      <div class="tri" onclick="qPlay('${esc(a+' official music video')}')">
        <div class="tr-n">${i+1}</div>
        <div class="tr-if"><div class="tr-th" style="display:flex;align-items:center;justify-content:center;background:var(--b3);border-radius:50%"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div><div class="tr-tx"><div class="tr-nm">${a}</div><div class="tr-ar">Artis</div></div></div>
        <div class="tr-al">—</div>
        <div class="tr-du"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--t3)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg></div>
        <div></div>
      </div>`).join('');
  }else{
    if(!S.recent.length){c.innerHTML=`<div class="empty-note">Belum ada riwayat putar.</div>`;return}
    c.innerHTML=tHd()+S.recent.slice(0,20).map((s,i)=>buildTrack(s,i,S.recent.slice(0,20))).join('');
  }
}
function libTab(el,tab){document.querySelectorAll('.lt').forEach(t=>t.classList.remove('on'));el.classList.add('on');renderLib(tab)}

function renderFav(){
  const favs=[...S.faves].map(id=>S.recent.find(s=>s.id===id)).filter(Boolean);
  $('favMeta').textContent=`${favs.length} lagu`;
  const el=$('favList');
  if(!favs.length){el.innerHTML=`<div class="empty-note">Belum ada favorit. Klik ikon hati pada lagu.</div>`;return}
  el.innerHTML=tHd()+favs.map((s,i)=>buildTrack(s,i,favs)).join('');
}
function playFav(){
  const favs=[...S.faves].map(id=>S.recent.find(s=>s.id===id)).filter(Boolean);
  if(!favs.length){toast('Belum ada lagu favorit');return}
  S.queue=favs;S.idx=0;startPlay(favs[0]);
}

function buildCard(s){
  return`<div class="mc" onclick="playSong(${e2(s)})">
    <div class="mc-cov">
      <img src="${getBestThumb(s.videoId,s.thumb)}" alt="${h(s.title)}" loading="lazy"
        onerror="this.src='${s.thumb}';this.onerror=null"/>
      <div class="mc-pp" onclick="event.stopPropagation();playSong(${e2(s)})"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
    </div>
    <div class="mc-t">${h(s.title)}</div>
    <div class="mc-s">${h(s.artist)}</div>
  </div>`;
}

function tHd(){
  return`<div class="tr-hd"><span>#</span><span>Judul</span><span class="th-al">Artis</span><span style="text-align:right">Durasi</span><span></span></div>`;
}

function buildTrack(s,i,list){
  const liked=S.faves.has(s.id),isP=S.song?.id===s.id;
  const lenc=JSON.stringify(list.map(x=>({id:x.id,videoId:x.videoId,title:x.title,artist:x.artist,thumb:x.thumb,dur:x.dur,color:x.color}))).replace(/"/g,'&quot;');
  return`<div class="tri${isP?' playing':''}" onclick="playFromList(${i},'${lenc}')">
    <div class="tr-n">
      ${isP&&S.playing?'<div class="eq-a"><span></span><span></span><span></span></div>':`<span>${i+1}</span>`}
      <div class="tr-pi"><svg viewBox="0 0 24 24"><polygon points="5 3 19 12 5 21 5 3"/></svg></div>
    </div>
    <div class="tr-if">
      <div class="tr-th"><img src="${getBestThumb(s.videoId,s.thumb)}" loading="lazy" alt="" onerror="this.src='${s.thumb}';this.onerror=null"/></div>
      <div class="tr-tx"><div class="tr-nm">${h(s.title)}</div><div class="tr-ar">${h(s.artist)}</div></div>
    </div>
    <div class="tr-al">${h(s.artist)}</div>
    <div class="tr-du">${s.dur||'—'}</div>
    <button class="tr-lk${liked?' on':''}" data-lid="${h(s.id)}" onclick="event.stopPropagation();likeSong('${h(s.id)}')">
      <svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
    </button>
  </div>`;
}

function playSong(s){
  if(typeof s==='string')s=JSON.parse(s);
  if(!S.queue.find(x=>x.id===s.id))S.queue.unshift(s);
  S.idx=S.queue.findIndex(x=>x.id===s.id);
  startPlay(s);
}
function playFromList(idx,lj){
  const list=typeof lj==='string'?JSON.parse(lj):lj;
  S.queue=list;S.idx=idx;startPlay(list[idx]);
}
async function qPlay(q){
  goPage('home',document.querySelector('[data-p="home"]'));
  toast('Memuat…');
  const res=await ytFullUnique(q,12);
  if(!res.length){toast('Tidak ada hasil');return}
  S.queue=res;S.idx=0;startPlay(res[0]);
}
function playTrending(){
  if(S.queue.length&&$('trendRow').querySelector('.mc')){
    const first=S.queue[0];
    startPlay(first);
  }else{
    qPlay(TREND_QUERIES[0]);
  }
}

function startPlay(s){
  S.song=s;S.playing=true;
  S.recent=[s,...S.recent.filter(x=>x.id!==s.id)].slice(0,50);
  saveStorage();
  renderQGrid();
  updateUI(s);setPS(true);updateColors(s);
  renderRecent();renderQueue();
  updateMediaSession(s);
  if(silentCtx?.state==='suspended')silentCtx.resume();
  fetchLyrics(s.title,s.artist);
  applyRealCover(s);
  if(YTR&&YTP?.loadVideoById){
    YTP.loadVideoById({videoId:s.videoId,suggestedQuality:'default'});
    YTP.setVolume(S.muted?0:S.vol);
  }else{
    let n=0,iv=setInterval(()=>{
      if(YTR&&YTP?.loadVideoById){YTP.loadVideoById({videoId:s.videoId});YTP.setVolume(S.muted?0:S.vol);clearInterval(iv)}
      if(++n>30)clearInterval(iv);
    },200);
  }
}

function togglePlay(){
  if(!S.song){toast('Pilih lagu terlebih dahulu');return}
  if(!YTR||!YTP)return;
  const st=YTP.getPlayerState();
  if(st===1){YTP.pauseVideo();navigator.mediaSession&&(navigator.mediaSession.playbackState='paused');}
  else{
    if(silentCtx?.state==='suspended')silentCtx.resume();
    YTP.playVideo();
    navigator.mediaSession&&(navigator.mediaSession.playbackState='playing');
  }
}
function nextSong(){if(!S.queue.length)return;S.idx=S.shuffle?Math.floor(Math.random()*S.queue.length):(S.idx+1)%S.queue.length;startPlay(S.queue[S.idx])}
function prevSong(){if(!S.queue.length)return;if(YTP?.getCurrentTime()>3){YTP.seekTo(0);return}S.idx=S.shuffle?Math.floor(Math.random()*S.queue.length):(S.idx-1+S.queue.length)%S.queue.length;startPlay(S.queue[S.idx])}
function seekTo(e){if(!YTP?.getDuration)return;const r=e.currentTarget.getBoundingClientRect();YTP.seekTo(Math.max(0,Math.min(1,(e.clientX-r.left)/r.width))*YTP.getDuration(),true)}
function setVol(e){const r=e.currentTarget.getBoundingClientRect();S.vol=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100));S.muted=S.vol===0;if(YTP?.setVolume)YTP.setVolume(S.vol);updVol(S.vol)}
function muteToggle(){S.muted=!S.muted;if(YTP)S.muted?YTP.mute():YTP.unMute();updVol(S.muted?0:S.vol);const ico=$('volIco');if(ico)ico.innerHTML=S.muted?`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>`:`<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>`;toast(S.muted?'Suara dimatikan':'Suara dinyalakan')}
function updVol(p){const w=p+'%';['volFill','fsVFill'].forEach(id=>{const el=$(id);if(el)el.style.width=w})}
function toggleShuffle(){S.shuffle=!S.shuffle;['sfBtn','fsSf','favSf'].forEach(id=>$(id)?.classList.toggle('on',S.shuffle));toast(S.shuffle?'Acak aktif':'Acak nonaktif')}
function toggleRepeat(){S.repeat=!S.repeat;['rpBtn','fsRp'].forEach(id=>$(id)?.classList.toggle('on',S.repeat));toast(S.repeat?'Ulangi aktif':'Ulangi nonaktif')}
function toggleLike(){if(!S.song)return;const id=S.song.id;S.faves.has(id)?S.faves.delete(id):S.faves.add(id);const liked=S.faves.has(id);updLike(liked);saveStorage();toast(liked?'Ditambahkan ke favorit':'Dihapus dari favorit');renderFav()}
function likeSong(id){S.faves.has(id)?S.faves.delete(id):S.faves.add(id);const liked=S.faves.has(id);document.querySelectorAll(`[data-lid="${id}"]`).forEach(b=>b.classList.toggle('on',liked));if(S.song?.id===id)updLike(liked);saveStorage();toast(liked?'Ditambahkan ke favorit':'Dihapus dari favorit');renderFav()}

function updateUI(s){
  $('plTitle').textContent=s.title;$('plArt').textContent=s.artist;
  $('fsTt').textContent=s.title;$('fsAr').textContent=s.artist;
  $('heroTitle').textContent=s.title;$('heroSub').textContent=s.artist;
  $('lyrTitle').textContent=s.title;$('lyrArtist').textContent=s.artist;

  const bestThumb=s.realCover||getBestThumb(s.videoId,s.thumb);

  const plC=$('plCov'),plPh=$('plCovPh');
  plC.querySelectorAll('img').forEach(i=>i.remove());
  plC.appendChild(mkImg(bestThumb,s.thumb,s.videoId,s.title));
  plPh?.classList.add('hide');

  const fsC=$('fsCov'),fsPh=$('fsCovPh');
  fsC.querySelectorAll('img').forEach(i=>i.remove());
  fsC.appendChild(mkImg(bestThumb,s.thumb,s.videoId,s.title));
  fsPh?.classList.add('hide');

  $('lyrCover').innerHTML=`<img src="${bestThumb}" alt="" style="width:100%;height:100%;object-fit:cover;border-radius:var(--r)" onerror="this.src='${s.thumb}'"/>`;

  updLike(S.faves.has(s.id));
}

function mkImg(src,fallback,vid,alt){
  const img=document.createElement('img');
  img.src=src;img.alt=alt||'';img.loading='eager';
  img.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:cover;z-index:1';
  img.onerror=function(){
    if(this._try===undefined){this._try=0}
    this._try++;
    if(this._try===1)this.src=`https://i.ytimg.com/vi/${vid}/hqdefault.jpg`;
    else if(this._try===2)this.src=fallback;
    else this.onerror=null;
  };
  return img;
}

function updateColors(s){
  const cover=s.realCover||getBestThumb(s.videoId,s.thumb);
  $('heroBg').style.background=`linear-gradient(155deg,#141414 0%,var(--b0) 72%)`;
  $('heroBlur').style.backgroundImage=`url('${cover}')`;
  $('fsBg').style.background=`radial-gradient(ellipse at 50% 20%,#161616 0%,#020202 62%)`;
  $('fsBlur').style.backgroundImage=`url('${cover}')`;
}

function setPS(on){
  S.playing=on;
  const pp=`<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>`;
  const pl=`<polygon points="5 3 19 12 5 21 5 3"/>`;
  [$('ppIco'),$('fsIco')].forEach(el=>{if(el)el.innerHTML=on?pp:pl});
  const eq=$('eqBars');if(eq){eq.classList.toggle('on',on);eq.classList.toggle('paused',!on)}
}
function updLike(liked){[$('plHrt'),$('fsHrt')].forEach(b=>{if(!b)return;b.classList.toggle('on',liked)})}
function renderRecent(){
  const w=$('recentWrap');
  if(!S.recent.length){w.innerHTML=`<div class="empty-note">Belum ada riwayat.</div>`;return}
  w.innerHTML=tHd()+S.recent.slice(0,8).map((s,i)=>buildTrack(s,i,S.recent.slice(0,8))).join('');
}
function renderQueue(){
  $('qList').innerHTML=S.queue.map((s,i)=>`
    <div class="q-item${i===S.idx?' on':''}" onclick="S.idx=${i};startPlay(S.queue[${i}])">
      <div class="q-th"><img src="${s.thumb}" loading="lazy" alt="" onerror="this.style.opacity=0"/></div>
      <div class="q-if"><div class="q-tt">${h(s.title)}</div><div class="q-ar">${h(s.artist)}</div></div>
      ${i===S.idx?`<div class="q-now"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg></div>`:''}
    </div>`).join('');
}

function goPage(pg,el){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('on'));
  $('pg-'+pg)?.classList.add('on');
  document.querySelectorAll('.sn,.mni').forEach(n=>n.classList.remove('on'));
  document.querySelectorAll(`[data-p="${pg}"]`).forEach(n=>n.classList.add('on'));
  if(pg==='search')setupSearch();
  if(pg==='library')renderLib('pl');
  if(pg==='fav')renderFav();
  if(pg==='lyrics')renderLyricsPage();
  if(window.innerWidth<=768)closeSB();
}
function toggleSB(){$('sb').classList.toggle('open');$('sbOv').classList.toggle('open')}
function closeSB(){$('sb').classList.remove('open');$('sbOv').classList.remove('open')}
function openFS(){$('fs').classList.add('on')}
function closeFS(){$('fs').classList.remove('on')}
function showQ(){renderQueue();$('qPanel').classList.add('on');$('qBk').classList.add('on')}
function closeQ(){$('qPanel').classList.remove('on');$('qBk').classList.remove('on')}

function skCards(n){return Array(n).fill(0).map(()=>`<div class="mc"><div class="mc-cov sk" style="border-radius:var(--r);margin-bottom:10px"></div><div class="skt" style="width:78%;margin-bottom:5px"></div><div class="skt" style="width:52%"></div></div>`).join('')}
function skTracks(n){return Array(n).fill(0).map((_,i)=>`<div class="tri" style="opacity:${1-i*.12}"><div class="tr-n"><div class="skt" style="width:13px;height:13px;border-radius:50%"></div></div><div class="tr-if"><div class="tr-th sk"></div><div class="tr-tx"><div class="skt" style="width:130px;margin-bottom:5px"></div><div class="skt" style="width:85px"></div></div></div><div class="tr-al"><div class="skt" style="width:65px"></div></div><div class="tr-du"><div class="skt" style="width:26px"></div></div><div></div></div>`).join('')}
function skDrop(n){return Array(n).fill(0).map(()=>`<div class="dd-row"><div class="dd-th sk"></div><div class="dd-tx"><div class="skt" style="width:115px;margin-bottom:4px"></div><div class="skt" style="width:75px"></div></div></div>`).join('')}

let _tt;
function toast(msg,dur=2500){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(_tt);_tt=setTimeout(()=>t.classList.remove('on'),dur)}

function bindKB(){
  document.addEventListener('keydown',e=>{
    if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;
    switch(e.code){
      case'Space':e.preventDefault();togglePlay();break;
      case'ArrowRight':e.preventDefault();e.shiftKey?nextSong():YTP?.seekTo(Math.min(YTP.getDuration(),YTP.getCurrentTime()+10),true);break;
      case'ArrowLeft':e.preventDefault();e.shiftKey?prevSong():YTP?.seekTo(Math.max(0,YTP.getCurrentTime()-10),true);break;
      case'ArrowUp':e.preventDefault();S.vol=Math.min(100,S.vol+10);YTP?.setVolume(S.vol);updVol(S.vol);break;
      case'ArrowDown':e.preventDefault();S.vol=Math.max(0,S.vol-10);YTP?.setVolume(S.vol);updVol(S.vol);break;
      case'KeyS':toggleShuffle();break;
      case'KeyR':toggleRepeat();break;
      case'KeyM':muteToggle();break;
      case'KeyF':$('fs').classList.toggle('on');break;
      case'KeyL':toggleLike();break;
      case'KeyY':toggleFSLyrics();break;
      case'Escape':closeFS();closeQ();closeSB();break;
    }
  });
}

function bindAll(){setupTbSearch();bindKB()}

const $=id=>document.getElementById(id);
function h(s){return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')}
function esc(s){return String(s||'').replace(/'/g,"\\'")}
function e2(s){const m={id:s.id,videoId:s.videoId,title:s.title,artist:s.artist,thumb:s.thumb,dur:s.dur,color:s.color};return JSON.stringify(m).replace(/"/g,'&quot;')}
function rndC(){return QCOLORS[Math.floor(Math.random()*QCOLORS.length)]}

function setupPWA(){
  const manifest={
    name:'Deplay Music',short_name:'Deplay',
    description:'Music Player',
    start_url:location.href,
    display:'standalone',
    background_color:'#000000',
    theme_color:'#000000',
    icons:[{src:'https://i.ytimg.com/favicon_144.png',sizes:'144x144',type:'image/png'}]
  };
  const blob=new Blob([JSON.stringify(manifest)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const link=document.createElement('link');
  link.rel='manifest';link.href=url;
  document.head.appendChild(link);
  document.getElementById('manifestLink')?.remove();
}

document.addEventListener('DOMContentLoaded',()=>{
  setupPWA();
  setTimeout(()=>{
    document.getElementById('ld').style.display='none';
    document.getElementById('app').classList.remove('hidden');
    boot();
  },2300);
});
