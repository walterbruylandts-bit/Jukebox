const DISCOGS_TOKEN = "bRVfNphNvpIQFGMHjnOmbnvthDTzUbUddawubXLi"; 
const CSV_BESTAND = "collectie.csv"; 

let alleElpees = [];
let discogsCache = {};
let isPaused = false;
let laadIndex = 0;
let favorieten = JSON.parse(localStorage.getItem('vinyl_favs')) || [];
let filterFavs = false;

// 1. COLLECTIE LADEN
function laadMijnCollectie() {
    Papa.parse(CSV_BESTAND, {
        download: true, header: true, delimiter: ";", skipEmptyLines: true,
        complete: function(results) {
            alleElpees = results.data;
            // Sorteer op artiest
            alleElpees.sort((a, b) => (a.Artist || "").toUpperCase().localeCompare((b.Artist || "").toUpperCase()));
            maakDePaginaAan(alleElpees);
            activeerControls();
            startFotoWachtrij();
            updateStatus("Systeem gereed. Klaar om te scannen.");
        }
    });
}

function updateStatus(bericht) {
    const status = document.getElementById('status-bar');
    if (status) status.innerText = bericht;
}

// 2. ZOEKBALK EN KNOPPEN
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

// 3. FOTO'S OPHALEN
async function startFotoWachtrij() {
    if (laadIndex >= alleElpees.length) { updateStatus("Klaar met laden."); return; }
    if (isPaused) { updateStatus("Laden gepauzeerd..."); setTimeout(startFotoWachtrij, 1000); return; }

    const elpee = alleElpees[laadIndex];
    if (elpee.release_id) {
        updateStatus(`Laden: ${elpee.Artist} - ${elpee.Title}`);
        await haalDiscogsFoto(elpee.release_id);
    }
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

// 4. DE "SCHOONMAAK" FUNCTIE (Verwijdert lastige tekens)
function schoonmaken(tekst) {
    if (!tekst) return "";
    return tekst
        .replace(/['’‘´`]/g, "")      // Apostrofs weg
        .replace(/[¿?¡!]/g, "")       // Vraagtekens weg
        .replace(/[()]/g, "")         // Haakjes weg
        .replace(/[&]/g, "and")       // & wordt 'and'
        .replace(/[/\\%*:|"<>]/g, "")  // Illegale tekens weg
        .replace(/\./g, "")           // Punten weg
        .replace(/\s+/g, " ")         // Dubbele spaties voorkomen
        .trim();
}

async function checkBestand(url) {
    try {
        const response = await fetch(url, { method: 'HEAD' });
        return response.ok;
    } catch (e) { return false; }
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

// 5. DE PAGINA OPBOUWEN
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

// 6. DE POPUP (Met de zaklamp en Discogs Link)
async function openMuziekPopup(elpee) {
    const modal = document.getElementById('album-modal');
    const details = document.getElementById('modal-details');
    const id = elpee.release_id;
    modal.style.display = "block";
    details.innerHTML = `<h2 style="color:white; padding:40px;">Bestanden scannen...</h2>`;

    let data = discogsCache[id];
    if (!data) {
        try {
            const res = await fetch(`https://api.discogs.com/releases/${id}?token=${DISCOGS_TOKEN}`);
            data = await res.json();
            discogsCache[id] = data;
        } catch (e) { details.innerHTML = "Fout bij ophalen."; return; }
    }

    const credits = data.extraartists || [];
    const muzikanten = credits.slice(0, 15).map(a => `<b>${a.name}</b> (${a.role})`).join(", ");
    
    // De info-bar met ID en link
    const infoBar = `
        <div style="background:#222; padding:10px; border-radius:8px; margin-bottom:15px; font-size:0.8rem; border-left:4px solid #ecc94b; text-align:left;">
            <span style="color:#aaa;">Discogs ID:</span> <b style="color:white;">${id}</b> | 
            <a href="https://www.discogs.com/release/${id}" target="_blank" style="color:#ecc94b; text-decoration:none; font-weight:bold;">↗ Open op Discogs om persing te checken</a>
        </div>`;

    let tracklistHtml = infoBar + `<button onclick="speelAlles()" style="width:100%; padding:15px; margin-bottom:20px; background:#ecc94b; border:none; border-radius:8px; font-weight:bold; cursor:pointer;">▶ SPEEL HELE ELPEE AF</button>`;
    let missendePaden = [];

    for (const track of data.tracklist) {
        const trackId = `${id}-${track.position}`;
        const isFav = favorieten.includes(trackId);
        const pos = (track.position || "").toUpperCase();
        let subMap = pos.startsWith("B") ? "SideB" : (pos.startsWith("C") ? "SideC" : (pos.startsWith("D") ? "SideD" : "SideA"));
        
        const schoneTitel = schoonmaken(track.title);
        const schoneArtiest = schoonmaken(elpee.Artist);
        const schoneAlbum = schoonmaken(elpee.Title);

        const volledigPad = `1mp3 Archief/${schoneArtiest}/${schoneAlbum}/${subMap}/${schoneTitel}.mp3`;
        const mp3Url = encodeURI(volledigPad);

        const bestaat = await checkBestand(mp3Url);
        if (!bestaat) missendePaden.push(volledigPad);

        tracklistHtml += `
            <div style="margin-bottom:15px; border-bottom:1px solid #333; padding:10px; text-align:left;">
                <div style="display:flex; justify-content:space-between; color:white;">
                    <span><b style="color:#ecc94b;">${track.position}</b> ${track.title} ${bestaat ? '✅' : '❌'}</span>
                    <span id="fav-${trackId}" onclick="event.stopPropagation(); toggleFav('${trackId}')" style="cursor:pointer; font-size:1.2rem;">${isFav ? '⭐' : '☆'}</span>
                </div>
                <audio controls style="width:100%; height:30px; margin-top:5px;"><source src="${mp3Url}" type="audio/mpeg"></audio>
                <div style="background:#001100; padding:4px; font-size:0.7rem; color:${bestaat ? '#00ff00' : '#ff4444'}; font-family:monospace; margin-top:5px; border:1px solid ${bestaat ? '#004400' : '#440000'};">
                    ZOEKPAD: ${volledigPad}
                </div>
            </div>`;
    }

    let rapportHtml = missendePaden.length > 0 ? `
        <div style="background:#441111; color:white; padding:15px; margin:20px 0; border-radius:8px; text-align:left; border: 2px solid #ff4444;">
            <h4 style="margin:0 0 5px 0;">🔴 Actielijst voor hernoemen:</h4>
            <textarea style="width:100%; height:120px; background:#222; color:#00ff00; border:1px solid #666; font-family:monospace; font-size:0.75rem; padding:5px; box-sizing:border-box; width:100%;">${missendePaden.join('\n')}</textarea>
        </div>` : `<div style="color:#00ff00; margin:20px 0;">✨ Alles gevonden!</div>`;

    details.innerHTML = `
        <div style="text-align:center;">
            <img src="${data.images ? data.images[0].resource_url : ''}" style="width:200px; border-radius:8px;">
            <h1 style="color:white; margin:10px 0 5px 0;">${elpee.Artist}</h1>
            <h2 style="color:#ecc94b; margin:0;">${elpee.Title}</h2>
            <div style="text-align:left; background:#1a1a1a; padding:10px; border-radius:8px; margin:15px 0; font-size:0.8rem; color:#aaa;">
                <b>Credits:</b> ${muzikanten || 'Geen details'}
            </div>
            ${rapportHtml}
        </div>
        ${tracklistHtml}`;
}

document.querySelector('.close-button').onclick = () => { document.getElementById('album-modal').style.display = "none"; };
laadMijnCollectie();