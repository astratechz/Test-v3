// ---------------- YOUR API SETTINGS ---------------- //
const API_URL = "https://app.swaxnet.xyz/api/mpd-url";
const API_KEY = "Bearer 51b969b5ddee963de6c75686eb75adfd5709f31fd04335ee0a2654498868";

// ---------------- CHANNELS ---------------- //
const channels = [
    {
        id: "AzamSport1",
        name: "Azam Sport 1",
        category: "Sports",
        logo: "https://i.imgur.com/7K6l1UY.png"
    },
    {
        id: "AzamSport2",
        name: "Azam Sport 2",
        category: "Sports",
        logo: "https://i.imgur.com/TDPnNRE.png"
    },
    {
        id: "WasafiTV",
        name: "Wasafi TV",
        category: "Entertainment",
        logo: "https://i.imgur.com/ZmWm3Cw.png"
    }
];

// --------------- Player Init --------------- //
let player;
document.addEventListener("DOMContentLoaded", () => {
    player = new shaka.Player(document.getElementById("videoPlayer"));
    loadUI();
});

// --------------- Render UI --------------- //
function loadUI() {
    renderCategories();
    renderChannels(channels);
    renderFavorites();
}

// --------------- Categories --------------- //
function renderCategories() {
    const cats = [...new Set(channels.map(c => c.category))];
    const container = document.getElementById("categories");
    container.innerHTML = `<div class="category-btn active" onclick="filterByCategory('All')">All</div>`;
    cats.forEach(cat => {
        container.innerHTML += `<div class="category-btn" onclick="filterByCategory('${cat}')">${cat}</div>`;
    });
}

function filterByCategory(category) {
    document.querySelectorAll(".category-btn").forEach(btn => btn.classList.remove("active"));
    event.target.classList.add("active");

    if (category === "All") renderChannels(channels);
    else renderChannels(channels.filter(c => c.category === category));
}

// --------------- Search --------------- //
document.getElementById("searchInput").addEventListener("input", function () {
    const q = this.value.toLowerCase();
    renderChannels(channels.filter(c => c.name.toLowerCase().includes(q)));
});

// --------------- Channel Grid --------------- //
function renderChannels(list) {
    const grid = document.getElementById("channelGrid");
    grid.innerHTML = "";
    list.forEach(ch => {
        grid.innerHTML += `
        <div class="channel-card" onclick="playChannel('${ch.id}')">
            <img src="${ch.logo}" class="channel-logo">
            <p>${ch.name}</p>
        </div>`;
    });
}

// --------------- Favorites System --------------- //
function getFavorites() {
    return JSON.parse(localStorage.getItem("favorites") || "[]");
}

function saveFavorite(id) {
    const favs = getFavorites();
    if (!favs.includes(id)) favs.push(id);
    localStorage.setItem("favorites", JSON.stringify(favs));
    renderFavorites();
}

function renderFavorites() {
    const favs = getFavorites();
    const favChannels = channels.filter(c => favs.includes(c.id));
    const grid = document.getElementById("favoritesGrid");
    grid.innerHTML = "";
    favChannels.forEach(ch => {
        grid.innerHTML += `
        <div class="channel-card" onclick="playChannel('${ch.id}')">
            <img src="${ch.logo}" class="channel-logo">
            <p>${ch.name}</p>
        </div>`;
    });
}

// --------------- PLAY CHANNEL --------------- //
async function playChannel(channelId) {
    try {
        // Fetch MPD securely (hidden from user)
        const response = await fetch(`${API_URL}?channel=${channelId}`, {
            headers: { "Authorization": API_KEY }
        });
        const data = await response.json();

        const mpdUrl = data.mpd; // secure MPD provided by your backend

        document.getElementById("playerContainer").style.display = "flex";
        await player.load(mpdUrl);

        saveFavorite(channelId);

    } catch (error) {
        alert("Failed to load stream.");
        console.log(error);
    }
}

// --------------- Close Player --------------- //
document.getElementById("closePlayer").addEventListener("click", () => {
    document.getElementById("playerContainer").style.display = "none";
    document.getElementById("videoPlayer").pause();
});
