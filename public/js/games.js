console.log(
  `YingHub(pls wwwwork daddy)  v7 - games.js Loaded`,
  "font-size: 16px; background-color: #9282fb; border-top-left-radius: 5px; border-bottom-left-radius: 5px; padding: 4px; font-weight: bold;",
  "font-size: 16px; background-color: #090810; font-weight: bold; padding: 4px; border-top-right-radius: 5px; border-bottom-right-radius: 5px;"
);

let allGames = [];

function applyFilters() {
  let filtered = allGames;

  const showProxy = document
    .getElementById("proxy-btn")
    .classList.contains("active");
  const showHtml5 = document
    .getElementById("html5-btn")
    .classList.contains("active");

  if (!showProxy && !showHtml5) {
    renderGames([]);
    return;
  }

  if (showProxy && showHtml5) {
    filtered = allGames;
  } else {
    filtered = allGames.filter((game) => {
      if (showProxy && game.proxy) return true;
      if (showHtml5 && !game.proxy) return true;
      return false;
    });
  }

  const searchValue = document
    .getElementById("search-input")
    .value.toLowerCase();

  if (searchValue) {
    filtered = filtered.filter((game) =>
      game.name.toLowerCase().includes(searchValue)
    );
  }

  const searchInput = document.getElementById("search-input");
  if (searchInput) {
    searchInput.placeholder = `Search for ${filtered.length} game${
      filtered.length !== 1 ? "s" : ""
    }`;
  }

  renderGames(filtered);
}

function renderGames(games) {
  const gamesList = document.getElementById("games-list");

  if (!gamesList) {
    console.error('Element with id "games-list" not found.');
    return;
  }

  gamesList.innerHTML = "";

  if (games.length === 0) {
    gamesList.innerHTML =
      '<p style="color:var(--text-color);opacity:0.7;"><i class="fa-solid fa-circle-exclamation"></i> No games found.</p>';
    return;
  }

  const sortedGames = [...games].sort((a, b) => {
    if (a.name === "Request a game") return -1;
    if (b.name === "Request a game") return 1;

    if (a.new && !b.new) return -1;
    if (!a.new && b.new) return 1;

    if (a.top && !b.top) return -1;
    if (!a.top && b.top) return 1;

    return 0;
  });

  sortedGames.forEach((game, idx) => {
    const gameItem = document.createElement("div");
    gameItem.className = "game-item";
    gameItem.style.setProperty("--item-delay", `${idx * 0.03}s`);

    const img = document.createElement("img");
    img.alt = game.name;
    img.loading = "lazy";

    // IMAGE SOURCE (fixed)
if (game.image.startsWith("http://") || game.image.startsWith("https://")) {
  img.src = game.image; // external image
} else {
  img.src = game.image; // local image like /media/icons/Terraria.jpg
}


    gameItem.appendChild(img);

    const badgeContainer = document.createElement("div");
    badgeContainer.className = "badge-container";
    gameItem.appendChild(badgeContainer);

    if (game.top) {
      const badge = document.createElement("span");
      badge.innerHTML = `<i class="fa-solid fa-fire"></i> HOT`;
      badge.className = "badge";
      badgeContainer.appendChild(badge);
    }

    if (game.new) {
      const badge = document.createElement("span");
      badge.innerHTML = `<i class="fa-solid fa-sparkles"></i> NEW`;
      badge.className = "badge";
      badgeContainer.appendChild(badge);
    }

    if (game.exp) {
      const badge = document.createElement("span");
      badge.innerHTML = `<i class="fa-solid fa-vial"></i> EXP`;
      badge.className = "badge";
      badgeContainer.appendChild(badge);
    }

    if (game.updated) {
      const badge = document.createElement("span");
      badge.innerHTML = `<i class="fa-solid fa-sparkles"></i> UPDATED`;
      badge.className = "badge";
      badgeContainer.appendChild(badge);
    }

    const name = document.createElement("p");
    name.className = "game-link";
    name.textContent = game.name;
    gameItem.appendChild(name);

    // ✅ CLICK LOGIC
    img.onclick = (e) => {
      e.preventDefault();

      const url = game.url;

      // External links open in new tab
      if (url.startsWith("http://") || url.startsWith("https://")) {
        window.open(url, "_blank");
        return;
      }

      // Local games go to player.html
      const playerUrl = `/player?dir=game/${encodeURIComponent(url)}`;
      window.location.href = playerUrl;
    };

    gamesList.appendChild(gameItem);
  });
}

// Load games
Promise.allSettled([
  fetch("json/games.json").then((response) => response.json()),
  fetch("json/games-local.json").then((response) => response.json()),
])
  .then((results) => {
    let gamesData1 = [];
    let gamesData2 = [];

    if (results[0].status === "fulfilled") {
      gamesData1 = results[0].value;
    } else {
      console.error("Error loading games.json:", results[0].reason);
    }

    if (results[1].status === "fulfilled") {
      gamesData2 = results[1].value;
    } else {
      console.error("Error loading games-local.json:", results[1].reason);
    }

    allGames = [...gamesData1, ...gamesData2];

    const searchInput = document.getElementById("search-input");
    searchInput.placeholder = `Search for ${allGames.length} games`;
    applyFilters();

    fetch("/json/games-local.json")
      .then((response) => response.json())
      .then((cdnGames) => {
        allGames = [...allGames, ...cdnGames];
        searchInput.placeholder = `Search for ${allGames.length} games`;
        applyFilters();
      })
      .catch((error) => {
        console.error("Error loading CDN games:", error);
        alert("Failed to load additional games from CDN.");
      });
  })
  .catch((error) => {
    console.error("Unexpected error loading local games:", error);

    fetch("json/games.json")
      .then((response) => response.json())
      .then((data) => {
        allGames = data;
        const searchInput = document.getElementById("search-input");
        searchInput.placeholder = `Search for ${allGames.length} games`;
        applyFilters();
      });
  });

const searchInput = document.getElementById("search-input");
if (searchInput) {
  searchInput.addEventListener("input", applyFilters);
}

const proxyBtn = document.getElementById("proxy-btn");
if (proxyBtn) {
  proxyBtn.addEventListener("click", () => {
    proxyBtn.classList.toggle("active");
    applyFilters();
  });
}

const html5Btn = document.getElementById("html5-btn");
if (html5Btn) {
  html5Btn.addEventListener("click", () => {
    html5Btn.classList.toggle("active");
    applyFilters();
  });
}
