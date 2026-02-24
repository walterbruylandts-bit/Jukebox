// ==========================================
// CONFIGURATIE - VUL HIER JE GEGEVENS IN
// ==========================================
const navidromeServer = "http://141.144.192.216:4533";
const user = "walterbruylandts";
const pass = "Jukebox_2023";
const DISCOGS_TOKEN = "BMwPAgEDqQEyruCDxrfOKPNpAtkaaIDPMxrqtNYc";
const CSV_BESTAND = "collectie.csv"; // De naam van je CSV-bestand

// ==========================================
// VARIABELEN & STATUS
// ==========================================
let alleElpees = [];
let discogsCache = {};
let isPaused = false;
let laadIndex = 0;
let favorieten = JSON.parse(localStorage.getItem('vinyl_favs')) || [];
let filterFavs = false;

// ==========================================
// 1. COLLECTIE LADEN & PAGINA OPBOUW
// ==========================================
function laadMijnCollectie() {
    Papa.parse(CSV_BESTAND, {
        download: true, header: true, delimiter: ";", skipEmptyLines: true,
        complete: function(results) {
            alleElpees = results.data;
            alleElpees.sort((a, b) => (a.Artist || "").toUpperCase().localeCompare((b.Artist || "").toUpperCase()));
            maakDePaginaAan(alleElpees);
            activeerControls();
            startFotoWachtrij();
            updateStatus("Systeem gereed. Verbonden met Navidrome.");
        }
    });
}

function updateStatus(bericht) {
    const status = document.getElementById('status-bar');
    if (status) status.innerText = bericht;
}

function activeerControls() {
    document.getElementById('search-input')?.addEventListener('input', (e) => {
        const term = e.target.value.toLowerCase();
        const gefilterd = alleElpees.filter(lp => (lp.Artist + lp.Title).toLowerCase().includes(term));
        maakDePaginaAan(gefilterd);
    });

    document.getElementById('pause-btn')?.addEventListener('click', (e) => {
        isPaused = !isPaused;
        e.target.innerText = isPaused ? "Hervat laden" : "Pauzeer laden";
        e.target.style.background = isPaused ? "#444" : "#ecc94b";
    });

    const favBtn = document.getElementById('fav-filter-btn');
    favBtn?.addEventListener('click', () => {
        filterFavs = !filterFavs;
        favBtn.style.background = filterFavs ? "#ecc94b" : "#222";
        favBtn.style.color = filterFavs ? "black" : "#ecc94b";
        maakDePaginaAan(filterFavs ? alleElpees.filter(lp => favorieten.some(f => f.startsWith(lp.release_id))) : alleElpees);
    });
}

function maakDePaginaAan(elpees) {
    const container = document.getElementById('vinyl-container');
    container.innerHTML = ''; 
    elpees.forEach((elpee) => {
        const id = elpee.release_id;
        const kaartje = document.createElement('div');
        kaartje.className = 'album-card';
        kaartje.innerHTML = `
            <div class="image-container" style="background:#222; aspect-ratio:1/1; display:flex; align-items:center; justify-content:center; border-radius:8px; overflow:hidden;">
                <img src="${discogsCache[id] ? discogsCache[id].images[0].resource_url : ''}" class="album-cover" id="img-${id}" style="${discogsCache[id] ? 'display:block' : 'display:none'}; width:100%;">
                <span id="placeholder-${id}" style="${discogsCache[id] ? 'display:none' : 'display:block'}; font-size:40px;">💿</span>
            </div>
            <div class="album-info">
                <h2 style="font-size:1rem; margin:10px 0 5px 0; color:white;">${elpee.Artist}</h2>
                <p style="color:#888; margin:0; font-size:0.9rem;">${elpee.Title}</p>
            </div>`;
        kaartje.onclick = () => openMuziekPopup(elpee);
        container.appendChild(kaartje);
    });
}

// ==========================================
// 2. FOTO'S & HULPFUNCTIES
// ==========================================
async function startFotoWachtrij() {
    if (laadIndex >= alleElpees.length) { updateStatus("Klaar met laden."); return; }
    if (isPaused) { setTimeout(startFotoWachtrij, 1000); return; }

    const elpee = alleElpees[laadIndex];
    if (elpee.release_id) await haalDiscogsFoto(elpee.release_id);
    laadIndex++;
    setTimeout(startFotoWachtrij, 2500);
}

async function haalDiscogsFoto(id) {
    if (discogsCache[id]) return;
    try {
        const response = await fetch(`https://api.discogs.com/releases/${id}?token=${DISCOGS_TOKEN}`);
        if (response.status === 429) { isPaused = true; return; }
        if (response.ok) {
            const data = await response.json();
            discogsCache[id] = data;
            const img = document.getElementById(`img-${id}`);
            if (img) { 
                img.src = data.images ? data.images[0].resource_url : ''; 
                img.style.display = "block"; 
                document.getElementById(`placeholder-${id}`).style.display = "none"; 
            }
        }
    } catch (e) {}
}

function schoonmaken(tekst) {
    if (!tekst) return "";
    return tekst.replace(/['’‘´`]/g, "").replace(/[¿?¡!]/g, "").replace(/[()]/g, "").replace(/[&]/g, "and").replace(/[/\\%*:|"<>]/g, "").replace(/\./g, "").replace(/\s+/g, " ").trim();
}

function toggleFav(trackId) {
    const index = favorieten.indexOf(trackId);
    if (index === -1) favorieten.push(trackId);
    else favorieten.splice(index, 1);
    localStorage.setItem('vinyl_favs', JSON.stringify(favorieten));
    document.getElementById('fav-'+trackId).innerText = index === -1 ? '⭐' : '☆';
}

function speelAlles(index = 0) {
    const spelers = document.querySelectorAll('audio');
    if (spelers.length > index) {
        spelers.forEach(s => { s.pause(); s.parentElement.style.background = "transparent"; });
        const huidige = spelers[index];
        huidige.parentElement.style.background = "#222";
        huidige.play();
        huidige.onended = () => speelAlles(index + 1);
    }
}

// ==========================================
// 3. DE POPUP MET NAVIDROME INTEGRATIE
// ==========================================
async function openMuziekPopup(elpee) {
    const modal = document.getElementById('album-modal');
    const details = document.getElementById('modal-details');
    const id = elpee.release_id;
    modal.style.display = "block";
    details.innerHTML = `<h2 style="color:white; padding:40px;">Server scannen...</h2>`;

    let data = discogsCache[id];
    if (!data) {
        const res = await fetch(`https://api.discogs.com/releases/${id}?token=${DISCOGS_TOKEN}`);
        data = await res.json();
        discogsCache[id] = data;
    }

    const credits = (data.extraartists || []).slice(0, 15).map(a => `<b>${a.name}</b> (${a.role})`).join(", ");
    let tracklistHtml = `<button onclick="speelAlles()" style="width:100%; padding:15px; margin-bottom:20px; background:#ecc94b; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">▶ SPEEL HELE ELPEE AF</button>`;
    let missendePaden = [];

    for (const track of data.tracklist) {
        const trackId = `${id}-${track.position}`;
        const isFav = favorieten.includes(trackId);
        const schoneTitel = schoonmaken(track.title);
        const schoneArtiest = schoonmaken(elpee.Artist);
        
        // Pad voor actielijst
        const pos = (track.position || "").toUpperCase();
        let subMap = pos.startsWith("B") ? "SideB" : (pos.startsWith("C") ? "SideC" : (pos.startsWith("D") ? "SideD" : "SideA"));
        const volledigPad = `1mp3 Archief/${schoneArtiest}/${schoonmaken(elpee.Title)}/${subMap}/${schoneTitel}.mp3`;

        let mp3Url = "";
        let bestaat = false;

        // Navidrome Check
        try {
            const searchUrl = `${navidromeServer}/rest/search3.view?u=${user}&p=${pass}&v=1.12.0&c=website&query=${encodeURIComponent(schoneTitel)}&artistCount=1&titleCount=20&f=json`;
            const response = await fetch(searchUrl);
            const sData = await response.json();
            const songs = sData["subsonic-response"]?.searchResult3?.song;
            const gevonden = songs?.find(s => s.title.toLowerCase().includes(schoneTitel.toLowerCase()) && s.artist.toLowerCase().includes(schoneArtiest.toLowerCase()));

            if (gevonden) {
                mp3Url = `${navidromeServer}/rest/stream?u=${user}&p=${pass}&v=1.12.0&c=website&id=${gevonden.id}`;
                bestaat = true;
            } else {
                missendePaden.push(volledigPad);
            }
        } catch (e) { console.error("Navidrome error", e); }

        tracklistHtml += `
            <div style="margin-bottom:15px; border-bottom:1px solid #333; padding:10px; text-align:left;">
                <div style="display:flex; justify-content:space-between; color:white;">
                    <span><b style="color:#ecc94b;">${track.position}</b> ${track.title} ${bestaat ? '✅' : '❌'}</span>
                    <span id="fav-${trackId}" onclick="event.stopPropagation(); toggleFav('${trackId}')" style="cursor:pointer; font-size:1.2rem;">${isFav ? '⭐' : '☆'}</span>
                </div>
                ${bestaat ? `<audio controls style="width:100%; height:30px; margin-top:5px;"><source src="${mp3Url}" type="audio/mpeg"></audio>` : '<p style="color:#ff4444; font-size:0.8rem; margin:5px 0;">Niet op server</p>'}
                <div style="background:#001100; padding:4px; font-size:0.7rem; color:${bestaat ? '#00ff00' : '#ff4444'}; font-family:monospace; margin-top:5px; border:1px solid ${bestaat ? '#004400' : '#440000'};">
                    PAD: ${volledigPad}
                </div>
            </div>`;
    }

    details.innerHTML = `
        <div style="text-align:center;">
            <img src="${data.images ? data.images[0].resource_url : ''}" style="width:200px; border-radius:8px;">
            <h1 style="color:white; margin:10px 0 5px 0;">${elpee.Artist}</h1>
            <h2 style="color:#ecc94b; margin:0;">${elpee.Title}</h2>
            <div style="text-align:left; background:#1a1a1a; padding:10px; border-radius:8px; margin:15px 0; font-size:0.8rem; color:#aaa;"><b>Credits:</b> ${credits || 'Geen details'}</div>
            ${missendePaden.length > 0 ? `<div style="background:#441111; color:white; padding:15px; margin:20px 0; border-radius:8px; text-align:left; border: 2px solid #ff4444;"><h4 style="margin:0;">🔴 Actielijst:</h4><textarea style="width:100%; height:80px; background:#222; color:#00ff00; font-family:monospace; font-size:0.7rem;">${missendePaden.join('\n')}</textarea></div>` : ''}
        </div>
        ${tracklistHtml}`;
}

// Sluit popup
document.querySelector('.close-button').onclick = () => { document.getElementById('album-modal').style.display = "none"; };

// START HET SYSTEEM
laadMijnCollectie();
