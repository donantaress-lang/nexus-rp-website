
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
let data = null;

async function api(path, options={}) {
  const res = await fetch(path, {headers:{"Content-Type":"application/json",...(options.headers||{})},...options});
  const json = await res.json().catch(()=>({}));
  if (res.status === 401) throw Object.assign(new Error("UNAUTHORIZED"), {code:401});
  if (!res.ok || json.ok === false) throw new Error(json.error || `HTTP ${res.status}`);
  return json;
}

function toast(msg) {
  $("#adminToast").textContent = msg;
  $("#adminToast").classList.remove("hidden");
  clearTimeout(toast.t);
  toast.t = setTimeout(()=>$("#adminToast").classList.add("hidden"),2600);
}

function uid(prefix) { return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,7)}`; }

async function loadAdmin() {
  try {
    const json = await api("/api/admin/data");
    data = json.data;
    $("#loginView").classList.add("hidden");
    $("#adminView").classList.remove("hidden");
    renderAll();
  } catch (e) {
    if (e.code !== 401) $("#loginMessage").textContent = `❌ ${e.message}`;
  }
}

$("#loginForm").addEventListener("submit", async e => {
  e.preventDefault();
  $("#loginMessage").textContent = "";
  try {
    await api("/api/admin/login", {method:"POST",body:JSON.stringify({password:$("#adminPassword").value})});
    $("#adminPassword").value = "";
    await loadAdmin();
  } catch (e) { $("#loginMessage").textContent = `❌ ${e.message}`; }
});

$("#logout").addEventListener("click", async () => {
  await api("/api/admin/logout",{method:"POST",body:"{}"}).catch(()=>null);
  location.reload();
});

$$(".tab").forEach(btn => btn.addEventListener("click", () => {
  $$(".tab").forEach(x=>x.classList.toggle("active",x===btn));
  $$(".admin-panel").forEach(panel=>panel.classList.toggle("active",panel.dataset.panel===btn.dataset.tab));
}));

function settingField(key, label, value, wide=false) {
  return `<label class="${wide?"wide":""}">${label}<input data-setting="${key}" value="${esc(value||"")}"></label>`;
}

function renderSettings() {
  const s = data.settings || {};
  $("#settingsEditor").innerHTML = [
    settingField("serverName","Nazwa serwera",s.serverName),
    settingField("tagline","Hasło / tagline",s.tagline),
    settingField("discordUrl","Link do Discorda",s.discordUrl,true),
    settingField("tipplyUrl","Link Tipply",s.tipplyUrl,true),
    settingField("serverCode","Kod serwera ER:LC",s.serverCode),
    settingField("membersLabel","Podpis społeczności",s.membersLabel),
    settingField("heroNotice","Komunikat na stronie głównej",s.heroNotice,true),
    settingField("description","Opis strony",s.description,true)
  ].join("");
}

function factionCard(f, i) {
  return `<div class="editor-card" data-faction-index="${i}">
    <div class="editor-card-grid">
      <label>Nazwa<input data-k="name" value="${esc(f.name)}"></label>
      <label>Ikona<input data-k="icon" value="${esc(f.icon||"🛡️")}"></label>
      <label>Status<select data-k="status"><option value="open" ${f.status==="open"?"selected":""}>Otwarta</option><option value="closed" ${f.status==="closed"?"selected":""}>Zamknięta</option></select></label>
      <label class="wide">Opis<textarea data-k="description">${esc(f.description||"")}</textarea></label>
      <label>Tryb podań<select data-k="applicationMode"><option value="form" ${f.applicationMode!=="external"?"selected":""}>Formularz na stronie</option><option value="external" ${f.applicationMode==="external"?"selected":""}>Zewnętrzny link</option></select></label>
      <label>Link do podania<input data-k="applicationUrl" value="${esc(f.applicationUrl||"")}"></label>
      <label>Discord frakcji<input data-k="discordUrl" value="${esc(f.discordUrl||"")}"></label>
    </div>
    <div class="editor-actions"><button class="btn btn-danger" data-remove-faction="${i}">Usuń</button></div>
  </div>`;
}

function renderFactions(){ $("#factionsEditor").innerHTML=(data.factions||[]).map(factionCard).join(""); }

function serverCard(s,i){ return `<div class="editor-card" data-server-index="${i}">
  <div class="editor-card-grid">
    <label>Nazwa<input data-k="name" value="${esc(s.name)}"></label>
    <label>Ikona<input data-k="icon" value="${esc(s.icon||"💬")}"></label>
    <label>Link Discord<input data-k="url" value="${esc(s.url||"")}"></label>
    <label class="wide">Opis<textarea data-k="description">${esc(s.description||"")}</textarea></label>
  </div>
  <div class="editor-actions"><button class="btn btn-danger" data-remove-server="${i}">Usuń</button></div>
</div>`; }
function renderServers(){ $("#serversEditor").innerHTML=(data.factionServers||[]).map(serverCard).join(""); }

function staffCard(p,i){ return `<div class="editor-card" data-staff-index="${i}">
  <div class="editor-card-grid">
    <label>Ranga<input data-k="rank" value="${esc(p.rank||"")}"></label>
    <label>Nick<input data-k="nick" value="${esc(p.nick||"")}"></label>
    <label>Discord<input data-k="discord" value="${esc(p.discord||"")}"></label>
    <label>Status<select data-k="status"><option value="active" ${p.status==="active"?"selected":""}>Aktywny</option><option value="leave" ${p.status==="leave"?"selected":""}>Urlop</option><option value="inactive" ${p.status==="inactive"?"selected":""}>Nieaktywny</option></select></label>
    <label class="wide">Notatka / funkcja<input data-k="note" value="${esc(p.note||"")}"></label>
  </div>
  <div class="editor-actions">
    <button class="btn btn-secondary" data-up-staff="${i}">↑</button>
    <button class="btn btn-secondary" data-down-staff="${i}">↓</button>
    <button class="btn btn-danger" data-remove-staff="${i}">Usuń</button>
  </div>
</div>`; }
function renderStaff(){ $("#staffEditor").innerHTML=(data.administration||[]).map(staffCard).join(""); }

function renderApplications(){
  const items=[...(data.applications||[])].reverse();
  $("#applicationsEditor").innerHTML=items.map(app=>`
    <div class="application-card">
      <header><h3>${esc(app.factionName||app.factionId)}</h3><span class="status ${app.status==="accepted"?"open":app.status==="rejected"?"closed":""}">${esc(app.status||"new").toUpperCase()}</span></header>
      <div class="application-meta"><span>Discord: ${esc(app.discord)}</span><span>Roblox: ${esc(app.roblox)}</span><span>Wiek: ${esc(app.age||"—")}</span><span>${esc(new Date(app.createdAt).toLocaleString("pl-PL"))}</span></div>
      <p><b>Doświadczenie:</b>\n${esc(app.experience||"Brak")}</p>
      <p><b>Motywacja:</b>\n${esc(app.motivation||"")}</p>
      <div class="editor-actions">
        <button class="btn btn-secondary" data-app-status="${esc(app.id)}" data-status="new">Nowe</button>
        <button class="btn btn-primary" data-app-status="${esc(app.id)}" data-status="accepted">Akceptuj</button>
        <button class="btn btn-danger" data-app-status="${esc(app.id)}" data-status="rejected">Odrzuć</button>
      </div>
    </div>`).join("") || `<p class="muted">Brak podań.</p>`;
}

function renderAll(){ renderSettings();renderFactions();renderServers();renderStaff();renderApplications(); bindDynamic(); }

function captureEditors(){
  data.settings ||= {};
  $$("[data-setting]").forEach(el=>data.settings[el.dataset.setting]=el.value);

  $$("[data-faction-index]").forEach(card=>{
    const obj=data.factions[Number(card.dataset.factionIndex)];
    card.querySelectorAll("[data-k]").forEach(el=>obj[el.dataset.k]=el.value);
  });
  $$("[data-server-index]").forEach(card=>{
    const obj=data.factionServers[Number(card.dataset.serverIndex)];
    card.querySelectorAll("[data-k]").forEach(el=>obj[el.dataset.k]=el.value);
  });
  $$("[data-staff-index]").forEach(card=>{
    const obj=data.administration[Number(card.dataset.staffIndex)];
    card.querySelectorAll("[data-k]").forEach(el=>obj[el.dataset.k]=el.value);
  });
}

function bindDynamic(){
  $$("[data-remove-faction]").forEach(btn=>btn.onclick=()=>{captureEditors();data.factions.splice(Number(btn.dataset.removeFaction),1);renderAll();});
  $$("[data-remove-server]").forEach(btn=>btn.onclick=()=>{captureEditors();data.factionServers.splice(Number(btn.dataset.removeServer),1);renderAll();});
  $$("[data-remove-staff]").forEach(btn=>btn.onclick=()=>{captureEditors();data.administration.splice(Number(btn.dataset.removeStaff),1);renderAll();});
  $$("[data-up-staff]").forEach(btn=>btn.onclick=()=>{captureEditors();const i=Number(btn.dataset.upStaff);if(i>0){[data.administration[i-1],data.administration[i]]=[data.administration[i],data.administration[i-1]];renderAll();}});
  $$("[data-down-staff]").forEach(btn=>btn.onclick=()=>{captureEditors();const i=Number(btn.dataset.downStaff);if(i<data.administration.length-1){[data.administration[i+1],data.administration[i]]=[data.administration[i],data.administration[i+1]];renderAll();}});
  $$("[data-app-status]").forEach(btn=>btn.onclick=()=>{const app=data.applications.find(x=>x.id===btn.dataset.appStatus);if(app){app.status=btn.dataset.status;renderApplications();bindDynamic();}});
}

$("#addFaction").onclick=()=>{captureEditors();data.factions.push({id:uid("faction"),name:"Nowa frakcja",icon:"🛡️",description:"",status:"open",applicationMode:"form",applicationUrl:"",discordUrl:""});renderAll();};
$("#addServer").onclick=()=>{captureEditors();data.factionServers.push({id:uid("server"),name:"Nowy serwer frakcyjny",icon:"💬",description:"",url:""});renderAll();};
$("#addStaff").onclick=()=>{captureEditors();data.administration.push({id:uid("staff"),rank:"Nowa ranga",nick:"Nick",discord:"@nick",status:"active",note:""});renderAll();};

$("#saveAll").onclick=async()=>{
  captureEditors();
  try{await api("/api/admin/data",{method:"PUT",body:JSON.stringify({data})});toast("✅ Zapisano zmiany.");}
  catch(e){toast(`❌ ${e.message}`);}
};

loadAdmin();
