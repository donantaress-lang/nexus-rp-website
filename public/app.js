
const $ = s => document.querySelector(s);
const esc = v => String(v ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
let site = null;

async function load() {
  const res = await fetch("/api/public");
  const json = await res.json();
  site = json.data;
  render();
}

function safeUrl(value) {
  const text = String(value || "").trim();
  return /^https?:\/\//i.test(text) ? text : "#";
}

function render() {
  const s = site.settings || {};
  document.title = `${s.serverName || "Nexus RP"} • RolePlay`;
  $("#heroDescription").textContent = s.description || "";
  $("#serverCode").textContent = s.serverCode || "—";
  $("#membersLabel").textContent = s.membersLabel || s.serverName || "Nexus RP";
  $("#heroNotice").textContent = s.heroNotice || "Witamy w Nexus RP";
  ["#discordTop","#discordHero"].forEach(sel => { $(sel).href = safeUrl(s.discordUrl); });
  $("#tipplyButton").href = safeUrl(s.tipplyUrl);
  $("#year").textContent = new Date().getFullYear();

  $("#factionsGrid").innerHTML = (site.factions || []).map(f => `
    <article class="faction-card">
      <div class="card-icon">${esc(f.icon || "🛡️")}</div>
      <h3>${esc(f.name)}</h3>
      <p>${esc(f.description || "")}</p>
      <span class="status ${f.status === "open" ? "open" : "closed"}">${f.status === "open" ? "● REKRUTACJA OTWARTA" : "● REKRUTACJA ZAMKNIĘTA"}</span>
      <div class="card-actions">
        ${
          f.status !== "open" ? "" :
          f.applicationMode === "external" && safeUrl(f.applicationUrl) !== "#"
          ? `<a class="btn btn-primary" target="_blank" rel="noreferrer" href="${esc(safeUrl(f.applicationUrl))}">Złóż podanie</a>`
          : `<button class="btn btn-primary" data-apply="${esc(f.id)}">Złóż podanie</button>`
        }
        ${safeUrl(f.discordUrl) !== "#" ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${esc(safeUrl(f.discordUrl))}">Discord frakcji</a>` : ""}
      </div>
    </article>
  `).join("") || `<p class="muted">Brak skonfigurowanych frakcji.</p>`;

  $("#factionServers").innerHTML = (site.factionServers || []).map(item => `
    <div class="server-card">
      <div class="icon">${esc(item.icon || "💬")}</div>
      <div><strong>${esc(item.name)}</strong><p>${esc(item.description || "")}</p></div>
      ${safeUrl(item.url) !== "#" ? `<a class="btn btn-secondary" target="_blank" rel="noreferrer" href="${esc(safeUrl(item.url))}">Dołącz</a>` : `<span class="status closed">BRAK LINKU</span>`}
    </div>
  `).join("") || `<p class="muted">Brak serwerów frakcyjnych.</p>`;

  $("#adminList").innerHTML = (site.administration || []).map(person => `
    <div class="admin-row">
      <div class="admin-rank">${esc(person.rank || "Administracja")}</div>
      <strong>${esc(person.nick || "—")}</strong>
      <span>${esc(person.discord || "")}${person.note ? ` • ${esc(person.note)}` : ""}</span>
      <span class="status admin-status ${person.status === "active" ? "open" : "closed"}">${person.status === "active" ? "● AKTYWNY" : person.status === "leave" ? "● URLOP" : "● NIEAKTYWNY"}</span>
    </div>
  `).join("") || `<p class="muted">Lista administracji jest pusta.</p>`;

  document.querySelectorAll("[data-apply]").forEach(btn => btn.addEventListener("click", () => openApplication(btn.dataset.apply)));
}

function openApplication(id) {
  const faction = (site.factions || []).find(x => String(x.id) === String(id));
  if (!faction) return;
  $("#applicationFactionId").value = faction.id;
  $("#applicationTitle").textContent = `Podanie • ${faction.name}`;
  $("#applicationMessage").textContent = "";
  $("#applicationModal").classList.remove("hidden");
}

$("#closeModal").addEventListener("click", () => $("#applicationModal").classList.add("hidden"));
$("#applicationModal").addEventListener("click", e => { if (e.target === $("#applicationModal")) $("#applicationModal").classList.add("hidden"); });

$("#applicationForm").addEventListener("submit", async e => {
  e.preventDefault();
  const button = e.currentTarget.querySelector("button[type=submit]");
  button.disabled = true; button.textContent = "Wysyłanie...";
  $("#applicationMessage").textContent = "";
  try {
    const res = await fetch("/api/applications", {
      method:"POST",
      headers:{"Content-Type":"application/json"},
      body:JSON.stringify({
        factionId:$("#applicationFactionId").value,
        discord:$("#appDiscord").value,
        roblox:$("#appRoblox").value,
        age:$("#appAge").value,
        experience:$("#appExperience").value,
        motivation:$("#appMotivation").value
      })
    });
    const json = await res.json();
    if (!res.ok || !json.ok) throw new Error(json.error || "Błąd wysyłania.");
    $("#applicationMessage").textContent = "✅ Podanie zostało wysłane.";
    e.currentTarget.reset();
    setTimeout(() => $("#applicationModal").classList.add("hidden"), 1200);
  } catch (err) {
    $("#applicationMessage").textContent = `❌ ${err.message}`;
  } finally {
    button.disabled = false; button.textContent = "Wyślij podanie";
  }
});

load().catch(() => { $("#heroDescription").textContent = "Nie udało się wczytać danych strony."; });
