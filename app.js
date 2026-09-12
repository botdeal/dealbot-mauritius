(function () {
  "use strict";
  /* =========================================================
     SUPABASE — CONFIGURATION
  ========================================================== */

  const SUPABASE_URL = "https://rrcxlohsbxfldflqfgqx.supabase.co";
  const SUPABASE_PUBLISHABLE_KEY = "sb_publishable__EqQ0t_cPDXO-bmsHzWERA_ZLAHck9d";

  if (!window.supabase || !window.DealBotBackend) {
    document.getElementById('catalogStatus').querySelector('span').textContent='Le site n’a pas pu se charger. Rechargez la page.';
    return;
  }
  const db = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_PUBLISHABLE_KEY,
    {global:{fetch:(url,options={})=>fetch(url,{...options,signal:options.signal ? AbortSignal.any([options.signal,AbortSignal.timeout(15000)]) : AbortSignal.timeout(15000)})}}
  );
  /* =========================================================
     DEALBOT — FRONTEND CORE
     Intégration du catalogue existant
  ========================================================== */
  /* =========================================================
     SUPABASE — AUTHENTICATION
  ========================================================== */

  let currentSession = null;
  let currentUser = null;
  let currentProfile = null;

  async function loadSupabaseProfile(userId) {
    const { data, error } = await db
      .from("profiles")
      .select("*")
      .eq("id", userId)
      .single();

    if (error) {
      console.error("DealBot — Profile error:", error);
      throw error;
    }

    return data;
  }

  let authRevision = 0;
  let personalReady = false;
  let saveQueue = Promise.resolve();
  let saveGeneration = 0;
  let personalRevision = 0;
  let confirmedPersonalState = null;
  let api;
  async function restoreSession(session) {
    const nextId = session?.user?.id || null;
    // SIGNED_IN can also mean a refocused tab. Keep pending edits for this account.
    if (nextId && nextId === currentUser?.id && personalReady) {
      currentSession = session;
      currentUser = session.user;
      return;
    }
    const revision = ++authRevision;
    ++catalogRevision;
    ++personalRevision;
    personalReady = false;
    confirmedPersonalState = null;
    currentSession = session;
    currentUser = session?.user || null;
    currentProfile = null;
    ADMIN_DEALS = [];
    document.getElementById('adminDealsBody').replaceChildren();
    document.getElementById('adminMessages').replaceChildren();
    state.favorites = []; state.compare = []; state.alerts = [];
    document.getElementById('saveStatus').textContent = '';
    document.getElementById('retryAccount').hidden = true;
    updateAccountUI();
    refreshCurrentPage();
    try {
      if (nextId) {
        const profile = await apiChecked(db.from('profiles').select('*').eq('id',nextId).single());
        const personal = await api.personal(nextId);
        if (revision !== authRevision) return;
        currentProfile = profile;
        confirmedPersonalState = JSON.parse(JSON.stringify(personal));
        Object.assign(state, personal);
      }
      if (revision !== authRevision) return;
      personalReady = true;
      updateAccountUI();
      await loadCatalogFromSupabase();
    } catch (error) {
      if (revision === authRevision) {
        showToast('Connexion aux données impossible. Réessayez.');
        document.getElementById('retryAccount').hidden = !nextId;
      }
      console.error('Account restore failed', error.message);
      if (revision === authRevision) await loadCatalogFromSupabase();
    }
  }
  async function initializeSupabaseAuth() {
    const revision = authRevision;
    const {data, error} = await db.auth.getSession();
    if (revision !== authRevision) return;
    if (error) { showToast('Session indisponible. Réessayez.'); await restoreSession(null); return; }
    await restoreSession(data.session);
  }
  // Never await Supabase calls inside onAuthStateChange (auth lock).
  db.auth.onAuthStateChange((event, session) => {
    if (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED') return;
    setTimeout(() => {
      if (event === 'PASSWORD_RECOVERY') openModal(document.getElementById('recoveryModal'));
      restoreSession(session);
    }, 0);
  });
  const apiChecked = query => window.DealBotBackend.checked(query);

  const preferences = {
    getItem(key) { try { return localStorage.getItem(key); } catch { return null; } },
    setItem(key,value) { try { localStorage.setItem(key,value); } catch {} }
  };
  const STORAGE = {
  favorites: "dealbot_favorites_v2",
  compare: "dealbot_compare_v2",
  alerts: "dealbot_alerts_v2",
  language: "dealbot_language_v2",
  adminDeals: "dealbot_admin_deals_v2"
};


  const MAX_COMPARE = 4;
  const DEALS_PER_PAGE = 8;

  /* =========================================================
     CATALOGUE
     Ces données servent à tester le fonctionnement du site.
     Les vraies offres seront ensuite fournies par le backend.
  ========================================================== */

  const CATEGORIES = [
    { id: "technology", fr: "Technologie", en: "Technology" },
    { id: "gaming", fr: "Gaming", en: "Gaming" },
    { id: "fashion", fr: "Mode", en: "Fashion" },
    { id: "home", fr: "Maison", en: "Home" },
    { id: "travel", fr: "Voyage", en: "Travel" },
    { id: "software", fr: "Logiciels", en: "Software" },
    { id: "beauty", fr: "Beauté", en: "Beauty" },
    { id: "sports", fr: "Sport", en: "Sports" },
    { id: "accessories", fr: "Accessoires", en: "Accessories" }
  ];

  let DEALS = [];
  let ADMIN_DEALS = [];
  let catalogRevision = 0;
  let catalogState = 'loading';
  async function loadCatalogFromSupabase() {
    const revision = ++catalogRevision;
    catalogState = 'loading';
    showCatalogStatus();
    try {
      const result = await api.catalog();
      if (revision !== catalogRevision) return;
      ADMIN_DEALS = currentProfile?.role === 'admin' ? result.deals : [];
      DEALS = result.deals.filter(d => d.published);
      CATEGORIES.splice(0,CATEGORIES.length,...result.categories.filter(c=>c.is_active).sort((a,b)=>a.sort_order-b.sort_order).map(c=>({id:c.slug,fr:c.name_fr,en:c.name_en})));
      catalogState = 'ready';
      populateFilters();
      refreshCurrentPage();
    } catch (error) {
      if (revision !== catalogRevision) return;
      DEALS = []; ADMIN_DEALS = []; catalogState = 'error';
      refreshCurrentPage();
      console.error('Catalog failed', error.message);
    }
    showCatalogStatus();
  }
  function showCatalogStatus() {
    const el = document.getElementById('catalogStatus');
    el.hidden = catalogState === 'ready' && DEALS.length > 0;
    el.querySelector('span').textContent = catalogState === 'loading' ? 'Chargement des offres…' : catalogState === 'error'
      ? 'Le catalogue est indisponible. Réessayez dans un instant.' : 'Aucune offre publiée pour le moment.';
    el.querySelector('button').hidden = catalogState !== 'error';
  }

  /* =========================================================
     STATE
  ========================================================== */

  const state = {
    lang: preferences.getItem(STORAGE.language) || "fr",

    favorites: [],

    compare: [],

    alerts: [],

    visibleDeals: DEALS_PER_PAGE,

    filters: {
      currency: "MUR",
      search: "",
      category: "",
      minPrice: "",
      maxPrice: "",
      discount: "0",
      store: "",
      score: "0",
      sort: "score"
    },

    currentDealId: null
  };

  /* =========================================================
     HELPERS
  ========================================================== */

  function safeParse(value, fallback) {
    try {
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      const map = {
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
      };

      return map[character];
    });
  }

  function getDeal(id) {
    return DEALS.find(function (deal) {
      return deal.id === Number(id);
    });
  }

  function getCategory(id) {
    return CATEGORIES.find(function (category) {
      return category.id === id;
    });
  }

  function categoryName(id) {
    const category = getCategory(id);

    if (!category) {
      return id;
    }

    return category[state.lang] || category.fr;
  }

  function money(value, currency = "MUR") {
    return new Intl.NumberFormat(
      state.lang === "fr" ? "fr-FR" : "en-GB",
      {
        style: "currency",
        currency,
        maximumFractionDigits: 2
      }
    ).format(value);
  }

  function discount(deal) {
    if (!deal.oldPrice || deal.oldPrice <= deal.price) {
      return 0;
    }

    return Math.round(
      (1 - deal.price / deal.oldPrice) * 100
    );
  }

  function availabilityText(status) {
    if (status === "unknown") return state.lang === "en" ? "Stock unconfirmed" : "Stock non confirmé";
    if (state.lang === "en") {
      if (status === "limited") return "Limited stock";
      if (status === "outofstock") return "Out of stock";
      return "Available";
    }

    if (status === "limited") return "Stock limité";
    if (status === "outofstock") return "Épuisé";
    return "Disponible";
  }

  function scoreQuality(score) {
    if (score >= 85) {
      return {
        className: "quality-top",
        label: state.lang === "en"
          ? "Strong"
          : "Très intéressant"
      };
    }

    if (score >= 70) {
      return {
        className: "quality-good",
        label: state.lang === "en"
          ? "Good"
          : "Intéressant"
      };
    }

    return {
      className: "quality-fair",
      label: state.lang === "en"
        ? "Average"
        : "À vérifier"
    };
  }

  function estimatedTrend() {
    return {className:'trend-stable',label:state.lang === 'en' ? 'See price history' : 'Voir l’historique'};
  }

  function requireAccount() {
    if (!currentUser) { openModal(loginModal); showToast('Connectez-vous pour enregistrer votre sélection.'); return false; }
    if (!personalReady) { showToast('Chargement du compte en cours.'); return false; }
    return true;
  }
  function saveState() {
    if (!currentUser || !personalReady) return Promise.resolve(false);
    const userId = currentUser.id, revision = authRevision, generation=saveGeneration;
    ++personalRevision;
    const snapshot = JSON.parse(JSON.stringify({favorites:state.favorites,compare:state.compare,alerts:state.alerts}));
    const status = document.getElementById('saveStatus');
    status.textContent = 'Enregistrement…';
    saveQueue = saveQueue.then(async () => {
      if (revision !== authRevision || currentUser?.id !== userId || generation !== saveGeneration) return false;
      try {
        const saved = await api.savePersonal(snapshot, confirmedPersonalState);
        if (revision === authRevision) {
          confirmedPersonalState = JSON.parse(JSON.stringify(saved || snapshot));
          status.textContent = 'Enregistré dans votre compte';
        }
        return true;
      } catch (error) {
        if (revision === authRevision) {
          saveGeneration++;
          status.textContent = 'Échec de sauvegarde. Rechargez vos données avant de réessayer.';
          personalReady = false;
          showToast(error.code === '40001' ? 'Votre sélection a changé sur un autre appareil. La modification n’a pas été enregistrée.' : 'La modification n’a pas été enregistrée.');
          try { const data = await api.personal(userId); if (revision === authRevision) { confirmedPersonalState=JSON.parse(JSON.stringify(data)); Object.assign(state,data); personalReady=true; refreshCurrentPage(); } }
          catch { if (revision === authRevision) document.getElementById('retryAccount').hidden = false; }
        }
        return false;
      }
    });
    return saveQueue;
  }

  /* =========================================================
     TOAST
  ========================================================== */

  let toastTimer = null;

  function showToast(message) {
    const toast = document.getElementById("toast");

    if (!toast) return;

    toast.textContent = message;
    toast.classList.add("show");

    clearTimeout(toastTimer);

    toastTimer = setTimeout(function () {
      toast.classList.remove("show");
    }, 2600);
  }

  /* =========================================================
     ROUTING
  ========================================================== */

  const ROUTES = [
  "home",
  "explore",
  "categories",
  "deal",
  "compare",
  "intelligence",
  "favorites",
  "alerts",
  "profile",
  "how",
  "about",
  "contact",
  "privacy",
  "terms",
  "admin"
];

  function navigate(page, options) {
    options = options || {};

    if (!ROUTES.includes(page)) {
      page = "home";
    }

    document
      .querySelectorAll("[data-page-section]")
      .forEach(function (section) {
        section.classList.remove("active");
      });

    const target = document.querySelector(
      '[data-page-section="' + page + '"]'
    );

    if (!target) {
      return;
    }

    target.classList.add("active");

    document
      .querySelectorAll("[data-page]")
      .forEach(function (link) {
        link.classList.toggle(
          "active",
          link.getAttribute("data-page") === page
        );
      });

    closeMobileMenu();

    if (!options.keepScroll) {
      window.scrollTo(0, 0);
    }

    if (page === "home") {
      renderHome();
    }

    if (page === "explore") {
      renderExplore();
    }

    if (page === "categories") {
      renderCategories();
    }

    if (page === "deal") {
      renderDealDetail();
    }

    if (page === "compare") {
      renderComparePicker();
    }

    if (page === "intelligence") {
      renderIntelligence();
    }

    if (page === "favorites") {
      renderFavorites();
    }

    if (page === "alerts") {
      renderAlerts();
    }

    if (page === "profile") {
      renderProfile();
    }

if (page === "admin") {
  renderAdmin();
}
}
  function updateHash(page) {
    if (window.location.hash !== "#" + page) {
      window.location.hash = page;
    } else {
      navigate(page);
    }
  }

  document.addEventListener("click", function (event) {
    const pageLink = event.target.closest("[data-page]");

    if (!pageLink) return;

    event.preventDefault();

    const page = pageLink.getAttribute("data-page");

    updateHash(page);
  });

  window.addEventListener("hashchange", function () {
    let hash = window.location.hash
      .replace("#", "")
      .trim();

    if (!hash) {
      hash = "home";
    }

    if (hash.startsWith("deal-")) {
      const dealId = Number(
        hash.replace("deal-", "")
      );

      if (Number.isSafeInteger(dealId) && dealId > 0) {
        state.currentDealId = dealId;
        navigate("deal");
        return;
      }
    }

    if (ROUTES.includes(hash)) {
      navigate(hash);
      return;
    }

    navigate("home");
  });

  /* =========================================================
     MOBILE MENU
  ========================================================== */

  const hamburger = document.getElementById("hamburger");
  const mobileNav = document.getElementById("mobileNav");

  function closeMobileMenu() {
    mobileNav.classList.remove("open");

    hamburger.setAttribute(
      "aria-expanded",
      "false"
    );
  }

  hamburger.addEventListener("click", function () {
    const opened =
      mobileNav.classList.toggle("open");

    hamburger.setAttribute(
      "aria-expanded",
      String(opened)
    );
  });

  /* =========================================================
     PRODUCT CARD
  ========================================================== */

  function buildProductCard(deal) {
    const saved =
      state.favorites.includes(deal.id);

    const compared =
      state.compare.includes(deal.id);

    const trend =
      estimatedTrend(deal);

    const quality =
      scoreQuality(deal.score);

    const dealDiscount =
      discount(deal);

    const card =
      document.createElement("article");

    card.className = "product-card";

    card.innerHTML = `
      <div class="product-thumb">

        ${
          dealDiscount > 0
            ? `<span class="discount-tag">-${dealDiscount}%</span>`
            : ""
        }

        <button
          type="button"
          class="save-toggle ${saved ? "saved" : ""}"
          data-save="${deal.id}"
          aria-label="Enregistrer cette offre"
        >
          ${saved
            ? (state.lang === "en" ? "Saved" : "Enregistré")
            : (state.lang === "en" ? "Save" : "Enregistrer")}
        </button>

        <span class="thumb-mark">
          ${escapeHTML(
            deal.name
              .split(" ")
              .slice(0, 2)
              .map(function (word) {
                return word.charAt(0);
              })
              .join("")
              .toUpperCase()
          )}
        </span>
      </div>

      <div class="product-body">

        <span class="product-cat">
          ${escapeHTML(categoryName(deal.category))}
        </span>

        <h3 class="product-name">
          ${escapeHTML(deal.name)}
        </h3>

        <span class="product-store">
          ${escapeHTML(deal.store)}
        </span>

        <div class="price-row">

          <span class="price-now">
            ${money(deal.price, deal.currency)}
          </span>

          ${
            deal.oldPrice > deal.price
              ? `<span class="price-old">
                   ${money(deal.oldPrice, deal.currency)}
                 </span>`
              : ""
          }

        </div>

        <div class="trend-row ${trend.className}">
          ${
            state.lang === "en"
              ? "Recent indication: "
              : "Indication récente : "
          }
          ${trend.label}
        </div>

        <div class="score-row">

          <span
            class="quality-tag ${quality.className}"
          >
            ${escapeHTML(quality.label)}
          </span>

          <span class="score-pill">
            ${deal.score}/100
          </span>

          <span>
            ${availabilityText(deal.availability)}
          </span>

        </div>

        <label class="compare-check">

          <input
            type="checkbox"
            data-compare="${deal.id}"
            ${compared ? "checked" : ""}
          >

          ${
            state.lang === "en"
              ? "Compare"
              : "Comparer"
          }

        </label>

        <div class="card-actions">

          <button
            type="button"
            class="btn ghost"
            data-detail="${deal.id}"
          >
            ${
              state.lang === "en"
                ? "Details"
                : "Détails"
            }
          </button>

          <button
            type="button"
            class="btn ghost"
            data-price-alert="${deal.id}"
          >
            ${
              state.lang === "en"
                ? "Price alert"
                : "Alerte prix"
            }
          </button>

        </div>

      </div>
    `;

    if (deal.imageUrl) {
      const img=document.createElement('img'); img.src=deal.imageUrl; img.alt=deal.name; img.loading='lazy'; img.referrerPolicy='no-referrer';
      img.style.cssText='width:100%;height:160px;object-fit:contain'; img.onerror=()=>img.remove();
      card.querySelector('.product-thumb').appendChild(img);
    }
    return card;
  }

  function bindProductEvents(container) {
    if (!container) return;

    container
      .querySelectorAll("[data-save]")
      .forEach(function (button) {
        button.addEventListener(
          "click",
          function () {
            toggleFavorite(
              Number(
                button.getAttribute("data-save")
              )
            );
          }
        );
      });

    container
      .querySelectorAll("[data-compare]")
      .forEach(function (checkbox) {
        checkbox.addEventListener(
          "change",
          function () {
            const id = Number(
              checkbox.getAttribute(
                "data-compare"
              )
            );

            const success =
              toggleCompare(id);

            if (!success) {
              checkbox.checked = false;
            }
          }
        );
      });

    container
      .querySelectorAll("[data-detail]")
      .forEach(function (button) {
        button.addEventListener(
          "click",
          function () {
            openDeal(
              Number(
                button.getAttribute(
                  "data-detail"
                )
              )
            );
          }
        );
      });

    container
      .querySelectorAll("[data-price-alert]")
      .forEach(function (button) {
        button.addEventListener(
          "click",
          function () {
            openAlertForDeal(
              Number(
                button.getAttribute(
                  "data-price-alert"
                )
              )
            );
          }
        );
      });
  }

  /* =========================================================
     FAVORITES
  ========================================================== */

  function toggleFavorite(id) {
    if (!requireAccount()) return;
    const index =
      state.favorites.indexOf(id);

    if (index === -1) {
      state.favorites.push(id);

      showToast(
        state.lang === "en"
          ? "Saving favorites…"
          : "Mise à jour des favoris…"
      );
    } else {
      state.favorites.splice(index, 1);

      showToast(
        state.lang === "en"
          ? "Deal removed from favorites."
          : "Offre retirée des favoris."
      );
    }

    saveState();
    refreshCurrentPage();
  }

  function renderFavorites() {
    const grid =
      document.getElementById("favoriteDeals");

    const empty =
      document.getElementById("favoritesEmpty");

    grid.innerHTML = "";

    const favorites =
      DEALS.filter(function (deal) {
        return state.favorites.includes(
          deal.id
        );
      });

    if (!state.favorites.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    favorites.forEach(function (deal) {
      grid.appendChild(
        buildProductCard(deal)
      );
    });

    bindProductEvents(grid);
    state.favorites.filter(id => !getDeal(id)).forEach(id => {
      grid.appendChild(unavailableSelection(() => toggleFavorite(id)));
    });
  }

  function unavailableSelection(remove) {
    const item = document.createElement('article'); item.className = 'state-box';
    const label = document.createElement('p');
    label.textContent = state.lang === 'en' ? 'This offer is unavailable in the current catalog.' : 'Cette offre est indisponible dans le catalogue actuel.';
    const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost small';
    button.dataset.removeUnavailable = '';
    button.textContent = state.lang === 'en' ? 'Remove from selection' : 'Retirer de la sélection';
    button.addEventListener('click', remove); item.append(label, button); return item;
  }

  /* =========================================================
     HOME
  ========================================================== */

  function renderHome() {
    renderStats();
    renderFeatured();
    renderHomeCategories();
  }

  function renderStats() {
    document.getElementById(
      "statDeals"
    ).textContent = DEALS.length;

    document.getElementById(
      "statCategories"
    ).textContent = CATEGORIES.length;

    const stores =
      new Set(
        DEALS.map(function (deal) {
          return deal.store;
        })
      );

    document.getElementById(
      "statStores"
    ).textContent = stores.size;
  }

  function renderFeatured() {
    const grid =
      document.getElementById(
        "featuredDeals"
      );

    const empty =
      document.getElementById(
        "featuredEmpty"
      );

    grid.innerHTML = "";

    const featured =
      DEALS
        .slice()
        .sort(function (a, b) {
          return Number(b.featured) - Number(a.featured) || b.score - a.score;
        })
        .slice(0, 4);

    if (!featured.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    featured.forEach(function (deal) {
      grid.appendChild(
        buildProductCard(deal)
      );
    });

    bindProductEvents(grid);
  }

  function renderHomeCategories() {
    renderCategoryGrid(
      document.getElementById(
        "homeCategories"
      )
    );
  }

  /* =========================================================
     CATEGORY
  ========================================================== */

  function renderCategoryGrid(container) {
    container.innerHTML = "";

    CATEGORIES.forEach(function (category) {
      const total =
        DEALS.filter(function (deal) {
          return (
            deal.category ===
            category.id
          );
        }).length;

      const button =
        document.createElement("button");

      button.type = "button";
      button.className = "category-card";

      button.innerHTML = `
        <span class="category-name">
          ${escapeHTML(
            category[state.lang] ||
            category.fr
          )}
        </span>

        <span class="category-count">
          ${total}
          ${
            state.lang === "en"
              ? total === 1
                ? "deal"
                : "deals"
              : total === 1
                ? "offre"
                : "offres"
          }
        </span>
      `;

      button.addEventListener(
        "click",
        function () {
          state.filters.category =
            category.id;

          state.filters.search = "";

          document.getElementById(
            "categoryFilter"
          ).value = category.id;

          document.getElementById(
            "exploreSearch"
          ).value = "";

          state.visibleDeals =
            DEALS_PER_PAGE;

          updateHash("explore");
        }
      );

      container.appendChild(button);
    });
  }

  function renderCategories() {
    renderCategoryGrid(
      document.getElementById(
        "allCategories"
      )
    );
  }

  /* =========================================================
     FILTER OPTIONS
  ========================================================== */

  function populateFilters() {
    const categorySelect =
      document.getElementById(
        "categoryFilter"
      );

    const storeSelect =
      document.getElementById(
        "storeFilter"
      );

    const alertSelect =
      document.getElementById(
        "alertProduct"
      );

    categorySelect.innerHTML = `
      <option value="">
        ${
          state.lang === "en"
            ? "All categories"
            : "Toutes les catégories"
        }
      </option>
    `;

    CATEGORIES.forEach(function (category) {
      const option =
        document.createElement("option");

      option.value = category.id;

      option.textContent =
        category[state.lang] ||
        category.fr;

      categorySelect.appendChild(option);
    });

    const stores =
      Array.from(
        new Set(
          DEALS.map(function (deal) {
            return deal.store;
          })
        )
      ).sort();

    storeSelect.innerHTML = `
      <option value="">
        ${
          state.lang === "en"
            ? "All sellers"
            : "Tous les vendeurs"
        }
      </option>
    `;

    stores.forEach(function (store) {
      const option =
        document.createElement("option");

      option.value = store;
      option.textContent = store;

      storeSelect.appendChild(option);
    });

    alertSelect.innerHTML = `
      <option value="">
        ${
          state.lang === "en"
            ? "Select a product"
            : "Sélectionner un produit"
        }
      </option>
    `;

    DEALS.forEach(function (deal) {
      const option =
        document.createElement("option");

      option.value = deal.id;

      option.textContent =
        deal.name +
        " — " +
        money(deal.price, deal.currency);

      alertSelect.appendChild(option);
    });

    syncFilterElements();
  }

  function syncFilterElements() {
    document.getElementById("currencyFilter").value = state.filters.currency;
    document.getElementById(
      "exploreSearch"
    ).value =
      state.filters.search;

    document.getElementById(
      "categoryFilter"
    ).value =
      state.filters.category;

    document.getElementById(
      "minPriceFilter"
    ).value =
      state.filters.minPrice;

    document.getElementById(
      "maxPriceFilter"
    ).value =
      state.filters.maxPrice;

    document.getElementById(
      "discountFilter"
    ).value =
      state.filters.discount;

    document.getElementById(
      "storeFilter"
    ).value =
      state.filters.store;

    document.getElementById(
      "scoreFilter"
    ).value =
      state.filters.score;

    document.getElementById(
      "sortDeals"
    ).value =
      state.filters.sort;
  }

  /* =========================================================
     EXPLORE
  ========================================================== */

  function filteredDeals() {
    const search =
      state.filters.search
        .trim()
        .toLowerCase();

    const minimum =
      Number(
        state.filters.minPrice
      ) || 0;

    const maximum =
      state.filters.maxPrice === ""
        ? Infinity
        : Number(
            state.filters.maxPrice
          );

    const minDiscount =
      Number(
        state.filters.discount
      );

    const minScore =
      Number(
        state.filters.score
      );

    let list =
      DEALS.filter(function (deal) {
        if (deal.currency !== state.filters.currency) return false;
        if (
          state.filters.category &&
          deal.category !==
            state.filters.category
        ) {
          return false;
        }

        if (
          state.filters.store &&
          deal.store !==
            state.filters.store
        ) {
          return false;
        }

        if (
          deal.price < minimum ||
          deal.price > maximum
        ) {
          return false;
        }

        if (
          discount(deal) <
          minDiscount
        ) {
          return false;
        }

        if (
          deal.score <
          minScore
        ) {
          return false;
        }

        if (search) {
          const searchable = [
            deal.name,
            deal.store,
            categoryName(
              deal.category
            )
          ]
            .join(" ")
            .toLowerCase();

          if (
            !searchable.includes(
              search
            )
          ) {
            return false;
          }
        }

        return true;
      });

    if (
      state.filters.sort ===
      "price-asc"
    ) {
      list.sort(function (a, b) {
        return a.price - b.price;
      });
    } else if (
      state.filters.sort ===
      "price-desc"
    ) {
      list.sort(function (a, b) {
        return b.price - a.price;
      });
    } else if (
      state.filters.sort ===
      "discount"
    ) {
      list.sort(function (a, b) {
        return (
          discount(b) -
          discount(a)
        );
      });
    } else if (
      state.filters.sort ===
      "recent"
    ) {
      list.sort(function (a, b) {
        return (
          new Date(b.addedAt) -
          new Date(a.addedAt)
        );
      });
    } else {
      list.sort(function (a, b) {
        return b.score - a.score;
      });
    }

    return list;
  }

  function renderExplore() {
    const grid =
      document.getElementById(
        "exploreDeals"
      );

    const empty =
      document.getElementById(
        "exploreEmpty"
      );

    const error =
      document.getElementById(
        "exploreError"
      );

    const loadMore =
      document.getElementById(
        "loadMoreWrap"
      );

    try {
      error.hidden = true;
      grid.innerHTML = "";

      const list =
        filteredDeals();

      document.getElementById(
        "resultCount"
      ).textContent =
        list.length +
        " " +
        (
          state.lang === "en"
            ? list.length === 1
              ? "deal"
              : "deals"
            : list.length === 1
              ? "offre"
              : "offres"
        );

      if (!list.length) {
        empty.hidden = false;
        loadMore.hidden = true;
        return;
      }

      empty.hidden = true;

      list
        .slice(
          0,
          state.visibleDeals
        )
        .forEach(function (deal) {
          grid.appendChild(
            buildProductCard(deal)
          );
        });

      bindProductEvents(grid);

      loadMore.hidden =
        state.visibleDeals >=
        list.length;
    } catch (err) {
      console.error(err);

      grid.innerHTML = "";
      empty.hidden = true;
      loadMore.hidden = true;
      error.hidden = false;
    }
  }

  function resetFilters() {
    state.filters = {
      currency: "MUR",
      search: "",
      category: "",
      minPrice: "",
      maxPrice: "",
      discount: "0",
      store: "",
      score: "0",
      sort: "score"
    };

    state.visibleDeals =
      DEALS_PER_PAGE;

    syncFilterElements();
    renderExplore();
  }

  [
    "exploreSearch",
    "minPriceFilter",
    "maxPriceFilter"
  ].forEach(function (id) {
    document
      .getElementById(id)
      .addEventListener(
        "input",
        function () {
          state.filters.search =
            document.getElementById(
              "exploreSearch"
            ).value;

          state.filters.minPrice =
            document.getElementById(
              "minPriceFilter"
            ).value;

          state.filters.maxPrice =
            document.getElementById(
              "maxPriceFilter"
            ).value;

          state.visibleDeals =
            DEALS_PER_PAGE;

          renderExplore();
        }
      );
  });

  [
    "categoryFilter",
    "discountFilter",
    "storeFilter",
    "scoreFilter",
    "sortDeals"
  ].forEach(function (id) {
    document
      .getElementById(id)
      .addEventListener(
        "change",
        function () {
          state.filters.category =
            document.getElementById(
              "categoryFilter"
            ).value;

          state.filters.discount =
            document.getElementById(
              "discountFilter"
            ).value;

          state.filters.store =
            document.getElementById(
              "storeFilter"
            ).value;

          state.filters.score =
            document.getElementById(
              "scoreFilter"
            ).value;

          state.filters.sort =
            document.getElementById(
              "sortDeals"
            ).value;

          state.visibleDeals =
            DEALS_PER_PAGE;

          renderExplore();
        }
      );
  });

  document
    .getElementById(
      "resetFilters"
    )
    .addEventListener(
      "click",
      resetFilters
    );

  document
    .getElementById(
      "emptyResetFilters"
    )
    .addEventListener(
      "click",
      resetFilters
    );

  document
    .getElementById(
      "retryDeals"
    )
    .addEventListener(
      "click",
      renderExplore
    );

  document
    .getElementById(
      "loadMoreDeals"
    )
    .addEventListener(
      "click",
      function () {
        state.visibleDeals +=
          DEALS_PER_PAGE;

        renderExplore();
      }
    );

  /* =========================================================
     HERO SEARCH
  ========================================================== */

  function heroSearch() {
    const input =
      document.getElementById(
        "heroSearch"
      );

    state.filters.search =
      input.value.trim();

    state.filters.category = "";

    state.visibleDeals =
      DEALS_PER_PAGE;

    populateFilters();

    updateHash("explore");
  }

  document
    .getElementById(
      "heroSearchButton"
    )
    .addEventListener(
      "click",
      heroSearch
    );

  document
    .getElementById(
      "heroSearch"
    )
    .addEventListener(
      "keydown",
      function (event) {
        if (event.key === "Enter") {
          heroSearch();
        }
      }
    );

  document
    .querySelectorAll(
      "[data-search]"
    )
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          const value =
            button.getAttribute(
              "data-search"
            );

          document.getElementById(
            "heroSearch"
          ).value = value;

          heroSearch();
        }
      );
    });

  /* =========================================================
     DEAL DETAIL
  ========================================================== */

  function openDeal(id) {
    const deal = getDeal(id);

    if (!deal) {
      showToast(
        state.lang === "en"
          ? "This deal no longer exists."
          : "Cette offre n'existe plus."
      );

      return;
    }

    state.currentDealId = id;

    window.location.hash =
      "deal-" + id;
  }

  function renderDealDetail() {
    const deal =
      getDeal(
        state.currentDealId
      );

    const container =
      document.getElementById(
        "dealDetail"
      );

    if (!deal) {
      container.innerHTML = `
        <div class="state-box">
          <h3>
            Offre introuvable
          </h3>

          <p>
            Cette offre n'est plus disponible.
          </p>

          <button
            type="button"
            class="btn"
            id="dealMissingBack"
          >
            Explorer les offres
          </button>
        </div>
      `;

      document
        .getElementById(
          "dealMissingBack"
        )
        .addEventListener(
          "click",
          function () {
            updateHash("explore");
          }
        );

      return;
    }

    const dealDiscount =
      discount(deal);

    const quality =
      scoreQuality(
        deal.score
      );

    const saved =
      state.favorites.includes(
        deal.id
      );

    container.innerHTML = `
      <div class="deal-visual">

        ${
          dealDiscount > 0
            ? `<span class="discount-tag">
                 -${dealDiscount}%
               </span>`
            : ""
        }

        <span class="deal-visual-mark">
          ${escapeHTML(
            deal.name
              .split(" ")
              .slice(0, 2)
              .map(function (word) {
                return word[0];
              })
              .join("")
              .toUpperCase()
          )}
        </span>

      </div>

      <div class="deal-info">

        <span class="product-cat">
          ${escapeHTML(
            categoryName(
              deal.category
            )
          )}
        </span>

        <h1>
          ${escapeHTML(
            deal.name
          )}
        </h1>

        <div class="deal-store">
          ${
            state.lang === "en"
              ? "Seller: "
              : "Vendeur : "
          }
          ${escapeHTML(
            deal.store
          )}
        </div>

        <div class="deal-price">

          <span class="deal-price-current">
            ${money(deal.price, deal.currency)}
          </span>

          ${
            deal.oldPrice >
            deal.price
              ? `<span class="deal-price-old">
                   ${money(deal.oldPrice, deal.currency)}
                 </span>`
              : ""
          }

        </div>

        <div class="score-row">

          <span
            class="quality-tag ${quality.className}"
          >
            ${escapeHTML(
              quality.label
            )}
          </span>

          <span class="score-pill">
            DealBot
            ${deal.score}/100
          </span>

        </div>

        <p class="deal-description">
          ${escapeHTML(
            deal.description
          )}
        </p>

        <div class="deal-facts">

          <div class="deal-fact">
            <span>
              ${
                state.lang === "en"
                  ? "Current price"
                  : "Prix actuel"
              }
            </span>

            <strong>
              ${money(deal.price, deal.currency)}
            </strong>
          </div>

          <div class="deal-fact">
            <span>
              ${
                state.lang === "en"
                  ? "Observed reference price"
                  : "Prix de référence affiché"
              }
            </span>

            <strong>
              ${money(deal.oldPrice, deal.currency)}
            </strong>
          </div>

          <div class="deal-fact">
            <span>
              ${
                state.lang === "en"
                  ? "Discount"
                  : "Réduction"
              }
            </span>

            <strong>
              ${dealDiscount}%
            </strong>
          </div>

          <div class="deal-fact">
            <span>
              DealBot Score
            </span>

            <strong>
              ${deal.score}/100
            </strong>
          </div>

          <div class="deal-fact">
            <span>
              ${
                state.lang === "en"
                  ? "Availability"
                  : "Disponibilité"
              }
            </span>

            <strong>
              ${availabilityText(
                deal.availability
              )}
            </strong>
          </div>

        </div>

        <div class="deal-detail-actions">

          <button
            type="button"
            class="btn"
            id="dealMerchantButton"
            ${
              deal.availability ===
              "outofstock"
                ? "disabled"
                : ""
            }
          >
            ${
              state.lang === "en"
                ? "Go to seller"
                : "Voir chez le vendeur"
            }
          </button>

          <button
            type="button"
            class="btn ghost"
            id="dealSaveButton"
          >
            ${
              saved
                ? state.lang === "en"
                  ? "Saved"
                  : "Enregistré"
                : state.lang === "en"
                  ? "Save"
                  : "Enregistrer"
            }
          </button>

          <button
            type="button"
            class="btn ghost"
            id="dealAlertButton"
          >
            ${
              state.lang === "en"
                ? "Price alert"
                : "Alerte de prix"
            }
          </button>

        </div>

        <p
          style="
            margin-top:14px;
            color:var(--ink-soft);
            font-size:.75rem;
          "
        >
          ${
            state.lang === "en"
              ? "Prices and availability must be verified on the seller's website before purchase."
              : "Le prix et la disponibilité doivent être vérifiés sur le site du vendeur avant l'achat."
          }
        </p>

      </div>
    `;

    const history = document.createElement('div'); history.className='state-box'; history.textContent='Chargement de l’historique…'; container.appendChild(history);
    api.history(deal.id).then(rows=> {
      history.replaceChildren();
      const title=document.createElement('h3'); title.textContent='Historique des prix'; history.appendChild(title);
      if (!rows.length) { history.append('Aucun historique disponible.'); return; }
      const list=document.createElement('ul');
      rows.forEach(row=> { const item=document.createElement('li'); item.textContent=new Date(row.recorded_at).toLocaleDateString('fr-FR')+' — '+money(row.price,row.currency); list.appendChild(item); });
      history.appendChild(list);
    }).catch(()=>{history.textContent='Historique indisponible. Réessayez plus tard.';});
    document
      .getElementById(
        "dealSaveButton"
      )
      .addEventListener(
        "click",
        function () {
          toggleFavorite(
            deal.id
          );

          renderDealDetail();
        }
      );

    document
      .getElementById(
        "dealAlertButton"
      )
      .addEventListener(
        "click",
        function () {
          openAlertForDeal(
            deal.id
          );
        }
      );

    document
      .getElementById(
        "dealMerchantButton"
      )
      .addEventListener(
        "click",
        function () {
          goToMerchant(deal);
        }
      );
  }

  async function goToMerchant(deal) {
    if (!deal.affiliateUrl) { showToast('Lien marchand indisponible.'); return; }
    try {
      let session = sessionStorage.getItem('dealbot_click_session');
      if (!session) { session = crypto.randomUUID(); sessionStorage.setItem('dealbot_click_session',session); }
      const page = document.querySelector('[data-page-section].active')?.dataset.pageSection || 'deal';
      const source = ['home','explore','deal','compare','favorites','intelligence'].includes(page) ? page : 'deal';
      const url = window.DealBotBackend.safeUrl(await api.track(deal.id,session,source));
      if (!url) throw new Error('Invalid destination');
      window.location.assign(url);
    } catch (error) { showToast('Impossible d’ouvrir le marchand. Réessayez.'); }
  }

  document
    .getElementById(
      "backFromDeal"
    )
    .addEventListener(
      "click",
      function () {
        updateHash("explore");
      }
    );

  /* =========================================================
     COMPARE
  ========================================================== */

  function toggleCompare(id) {
    if (!requireAccount()) return false;
    const selected = DEALS.filter(d=>state.compare.includes(d.id));
    if (!state.compare.includes(id) && selected.some(d=>d.currency !== getDeal(id)?.currency)) { showToast("Comparez des offres dans la même devise."); return false; }
    const index =
      state.compare.indexOf(id);

    if (index !== -1) {
      state.compare.splice(
        index,
        1
      );

      saveState();

      refreshCurrentPage();

      return true;
    }

    if (
      state.compare.length >=
      MAX_COMPARE
    ) {
      showToast(
        state.lang === "en"
          ? "You can compare up to 4 deals."
          : "Vous pouvez comparer 4 offres au maximum."
      );

      return false;
    }

    state.compare.push(id);

    saveState();

    refreshCurrentPage();

    return true;
  }

  function renderComparePicker() {
    const container =
      document.getElementById(
        "comparePicker"
      );

    const empty =
      document.getElementById(
        "compareEmpty"
      );

    container.innerHTML = "";

    if (!DEALS.length && !state.compare.length) {
      empty.hidden = false;
      updateCompareBar();
      return;
    }

    empty.hidden = true;

    DEALS.forEach(function (deal) {
      const selected =
        state.compare.includes(
          deal.id
        );

      const card =
        document.createElement(
          "article"
        );

      card.className =
        "compare-pick-card" +
        (
          selected
            ? " selected"
            : ""
        );

      card.innerHTML = `
        <span class="product-cat">
          ${escapeHTML(
            categoryName(
              deal.category
            )
          )}
        </span>

        <strong>
          ${escapeHTML(
            deal.name
          )}
        </strong>

        <span class="product-store">
          ${escapeHTML(
            deal.store
          )}
        </span>

        <span
          style="
            font-family:var(--font-mono);
          "
        >
          ${money(deal.price, deal.currency)}
        </span>

        <label class="compare-check">

          <input
            type="checkbox"
            ${selected ? "checked" : ""}
          >

          ${
            selected
              ? state.lang === "en"
                ? "Selected"
                : "Sélectionné"
              : state.lang === "en"
                ? "Compare"
                : "Comparer"
          }

        </label>
      `;

      card
        .querySelector("input")
        .addEventListener(
          "change",
          function (event) {
            const success =
              toggleCompare(
                deal.id
              );

            if (!success) {
              event.target.checked =
                false;
            }
          }
        );

      container.appendChild(card);
    });

    state.compare.filter(id => !getDeal(id)).forEach(id => {
      container.appendChild(unavailableSelection(() => toggleCompare(id)));
    });
    updateCompareBar();
    if (!document.getElementById('compareResults').hidden) renderCompareResults();
  }

  function updateCompareBar() {
    const count =
      state.compare.length;

    document.getElementById(
      "compareCount"
    ).textContent =
      count +
      " / " +
      MAX_COMPARE +
      " " +
      (
        state.lang === "en"
          ? "selected"
          : count > 1
            ? "sélectionnées"
            : "sélectionnée"
      );

    document.getElementById(
      "runCompare"
    ).disabled =
      !validComparison();

    if (!validComparison()) {
      document.getElementById(
        "compareResults"
      ).hidden = true;
    }
  }

  function validComparison() {
    const selected = DEALS.filter(deal => state.compare.includes(deal.id));
    return selected.length >= 2 && selected.length === state.compare.length
      && selected.every(deal => deal.currency === selected[0].currency);
  }

  function renderCompareResults() {
    const selected =
      DEALS.filter(
        function (deal) {
          return state.compare.includes(
            deal.id
          );
        }
      );

    if (
      !validComparison()
    ) {
      document.getElementById('compareResults').hidden = true;
      return;
    }

    const container =
      document.getElementById(
        "compareResults"
      );

    function row(label, render) {
      return `
        <tr>

          <th>
            ${escapeHTML(label)}
          </th>

          ${selected
            .map(function (deal) {
              return `
                <td>
                  ${render(deal)}
                </td>
              `;
            })
            .join("")}

        </tr>
      `;
    }

    container.innerHTML = `
      <table class="compare-table">

        <thead>
          <tr>

            <th>
              ${
                state.lang === "en"
                  ? "Criteria"
                  : "Critère"
              }
            </th>

            ${selected
              .map(function (deal) {
                return `
                  <th>
                    ${escapeHTML(
                      deal.name
                    )}
                  </th>
                `;
              })
              .join("")}

          </tr>
        </thead>

        <tbody>

          ${row(
            state.lang === "en"
              ? "Price"
              : "Prix",
            function (deal) {
              return money(deal.price, deal.currency);
            }
          )}

          ${row(
            state.lang === "en"
              ? "Reference price"
              : "Ancien prix",
            function (deal) {
              return money(deal.oldPrice, deal.currency);
            }
          )}

          ${row(
            state.lang === "en"
              ? "Discount"
              : "Réduction",
            function (deal) {
              return (
                discount(deal) +
                "%"
              );
            }
          )}

          ${row(
            state.lang === "en"
              ? "Seller"
              : "Vendeur",
            function (deal) {
              return escapeHTML(
                deal.store
              );
            }
          )}

          ${row(
            "DealBot Score",
            function (deal) {
              return (
                deal.score +
                "/100"
              );
            }
          )}

          ${row(
            state.lang === "en"
              ? "Availability"
              : "Disponibilité",
            function (deal) {
              return availabilityText(
                deal.availability
              );
            }
          )}

        </tbody>

      </table>
    `;

    container.hidden = false;
  }

  document
    .getElementById(
      "runCompare"
    )
    .addEventListener(
      "click",
      renderCompareResults
    );

  document
    .getElementById(
      "clearCompare"
    )
    .addEventListener(
      "click",
      function () {
        state.compare = [];

        saveState();

        document.getElementById(
          "compareResults"
        ).hidden = true;

        renderComparePicker();
      }
    );

  /* =========================================================
     DEALBOT INTELLIGENCE
  ========================================================== */

  function renderIntelligence() {
    const grid =
      document.getElementById(
        "intelligenceGrid"
      );

    const empty =
      document.getElementById(
        "intelligenceEmpty"
      );

    grid.innerHTML = "";

    const list =
      DEALS
        .slice()
        .sort(function (a, b) {
          return b.score - a.score;
        })
        .slice(0, 8);

    if (!list.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    list.forEach(function (deal) {
      const card =
        document.createElement(
          "article"
        );

      card.className =
        "intel-card";

      card.innerHTML = `
        <h3>
          ${escapeHTML(
            deal.name
          )}
        </h3>

        <div class="intel-store">
          ${escapeHTML(
            deal.store
          )}
          ·
          ${escapeHTML(
            categoryName(
              deal.category
            )
          )}
        </div>

        <div class="gauge-row">

          <svg
            width="74"
            height="74"
            viewBox="0 0 74 74"
            aria-hidden="true"
          >

            <circle
              cx="37"
              cy="37"
              r="29"
              fill="none"
              stroke="var(--line)"
              stroke-width="7"
            ></circle>

            <circle
              cx="37"
              cy="37"
              r="29"
              fill="none"
              stroke="var(--accent)"
              stroke-width="7"
              stroke-linecap="round"
              transform="rotate(-90 37 37)"
              stroke-dasharray="${2 * Math.PI * 29}"
              stroke-dashoffset="${
                2 *
                Math.PI *
                29 *
                (
                  1 -
                  deal.score /
                  100
                )
              }"
            ></circle>

          </svg>

          <div class="gauge-score">
            ${deal.score}
            <span>/100</span>
          </div>

        </div>

        <p>${state.lang==='en'?'Displayed discount':'Réduction affichée'} : ${discount(deal)} %.
        ${deal.scoreMethod==='automatic-v1'
          ? (state.lang==='en'?'Automatic score v1: discount (50), stock (20), description/image (10), verified merchant (20).':'Score automatique v1 : réduction (50), stock (20), description/image (10), marchand vérifié (20).')
          : (state.lang==='en'?'Editorial score entered by an administrator.':'Score éditorial saisi par l’administrateur.')}
        ${state.lang==='en'?'No price prediction.':'Sans prédiction de prix.'}</p>
        <button
          type="button"
          class="btn ghost small"
          data-intel-detail="${deal.id}"
          style="margin-top:16px;"
        >
          ${
            state.lang === "en"
              ? "View deal"
              : "Voir l'offre"
          }
        </button>
      `;

      grid.appendChild(card);
    });

    grid
      .querySelectorAll(
        "[data-intel-detail]"
      )
      .forEach(function (button) {
        button.addEventListener(
          "click",
          function () {
            openDeal(
              Number(
                button.getAttribute(
                  "data-intel-detail"
                )
              )
            );
          }
        );
      });
  }

  function indicatorHTML(
    label,
    value
  ) {
    return `
      <div class="indicator">

        <div class="indicator-label">
          <span>
            ${escapeHTML(label)}
          </span>

          <span>
            ${value}
          </span>
        </div>

        <div class="indicator-track">

          <div
            class="indicator-fill"
            style="
              width:${Math.max(
                0,
                Math.min(
                  100,
                  value
                )
              )}%;
            "
          ></div>

        </div>

      </div>
    `;
  }

  /* =========================================================
     PRICE ALERTS
  ========================================================== */

  function openAlertForDeal(id) {
    if (!requireAccount()) return;
    updateHash("alerts");

    setTimeout(function () {
      const select =
        document.getElementById(
          "alertProduct"
        );

      select.value =
        String(id);

      const deal =
        getDeal(id);

      if (deal) {
        document.getElementById(
          "alertPrice"
        ).value =
          Math.max(
            1,
            Math.floor(
              deal.price * 0.9
            )
          );
      }

      document.getElementById(
        "alertPrice"
      ).focus();
    }, 30);
  }

  document
    .getElementById(
      "alertForm"
    )
    .addEventListener(
      "submit",
      function (event) {
        event.preventDefault();
        if (!requireAccount()) return;

        const productId =
          Number(
            document.getElementById(
              "alertProduct"
            ).value
          );

        const targetPrice =
          Number(
            document.getElementById(
              "alertPrice"
            ).value
          );

        const deal =
          getDeal(productId);

        if (
          !deal ||
          !targetPrice ||
          targetPrice <= 0
        ) {
          showToast(
            state.lang === "en"
              ? "Please enter a valid price."
              : "Indiquez un prix valide."
          );

          return;
        }

        const existing =
          state.alerts.find(
            function (alert) {
              return (
                alert.productId ===
                productId
              );
            }
          );

        if (existing) {
          existing.targetPrice =
            targetPrice;
          existing.currency = deal.currency;
          existing.status = 'active';
        } else {
          state.alerts.push({
            id: Date.now(),
            productId:
              productId,
            targetPrice:
              targetPrice,
            currency: deal.currency
          });
        }

        saveState();

        event.target.reset();

        showToast(
          state.lang === "en"
            ? "Saving price alert…"
            : "Enregistrement de l’alerte…"
        );

        renderAlerts();
      }
    );

  function renderAlerts() {
    const list =
      document.getElementById(
        "alertList"
      );

    const empty =
      document.getElementById(
        "alertsEmpty"
      );

    list.innerHTML = "";

    if (!state.alerts.length) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;

    state.alerts.forEach(
      function (alert) {
        const deal =
          getDeal(
            alert.productId
          );

        if (!deal) {
          const item = document.createElement('article'); item.className = 'alert-item';
          const label = document.createElement('span');
          label.textContent = state.lang === 'en' ? 'This offer is no longer available.' : 'Cette offre n’est plus disponible.';
          const button = document.createElement('button'); button.type = 'button'; button.className = 'btn ghost small';
          button.dataset.removeAlert = String(alert.id); button.textContent = state.lang === 'en' ? 'Remove' : 'Supprimer';
          item.append(label, button); list.appendChild(item); return;
        }
        const sameCurrency = !alert.currency || alert.currency === deal.currency;
        const reached = sameCurrency && (alert.status === "triggered" || (deal.price <= alert.targetPrice && ["available","limited"].includes(deal.availability)));

        const item =
          document.createElement(
            "article"
          );

        item.className =
          "alert-item";

        item.innerHTML = `
          <div>

            <strong>
              ${escapeHTML(
                deal.name
              )}
            </strong>

            <div
              style="
                color:var(--ink-soft);
                font-size:.8rem;
                margin-top:3px;
              "
            >
              ${
                state.lang === "en"
                  ? "Target"
                  : "Objectif"
              }:
              ${money(alert.targetPrice, alert.currency || deal.currency)}

              ·

              ${
                state.lang === "en"
                  ? "Current"
                  : "Actuel"
              }:
              ${money(deal.price, deal.currency)}

              ·

              <strong
                style="
                  color:${
                    reached
                      ? "var(--accent-dark)"
                      : "var(--ink-soft)"
                  };
                "
              >
                ${
                  !sameCurrency
                    ? state.lang === 'en' ? 'Currency changed: update this alert' : 'Devise modifiée : actualisez cette alerte'
                    : reached
                    ? state.lang === "en"
                      ? "Target reached"
                      : "Seuil atteint"
                    : state.lang === "en"
                      ? "Monitoring"
                      : "En attente"
                }
              </strong>
            </div>

          </div>

          <button
            type="button"
            class="btn ghost small"
            data-remove-alert="${alert.id}"
          >
            ${
              state.lang === "en"
                ? "Remove"
                : "Supprimer"
            }
          </button>
        `;

        list.appendChild(item);
      }
    );

    list
      .querySelectorAll(
        "[data-remove-alert]"
      )
      .forEach(function (button) {
        button.addEventListener(
          "click",
          function () {
            const id =
              Number(
                button.getAttribute(
                  "data-remove-alert"
                )
              );

            state.alerts =
              state.alerts.filter(
                function (alert) {
                  return (
                    alert.id !==
                    id
                  );
                }
              );

            saveState();
            renderAlerts();

            showToast(
              state.lang === "en"
                ? "Alert removed."
                : "Alerte supprimée."
            );
          }
        );
      });
  }

  /* =========================================================
     ACCOUNT — SUPABASE AUTH
  ========================================================== */

  const loginModal =
    document.getElementById(
      "loginModal"
    );

  const signupModal =
    document.getElementById(
      "signupModal"
    );

  const modalFocus = new WeakMap();
  function openModal(modal) {
    modalFocus.set(modal,document.activeElement);
    queueMicrotask(()=>modal.querySelector('input,button,select,textarea')?.focus());
    modal.classList.add("open");

    document.body.classList.add(
      "modal-open"
    );
  }

  function closeModal(modal) {
    modalFocus.get(modal)?.focus();
    modal.classList.remove("open");

    if (
      !document.querySelector(
        ".modal-overlay.open"
      )
    ) {
      document.body.classList.remove(
        "modal-open"
      );
    }
  }

  document
    .getElementById(
      "openLogin"
    )
    .addEventListener(
      "click",
      function () {
        openModal(loginModal);
      }
    );

  document
    .getElementById(
      "mobileLogin"
    )
    .addEventListener(
      "click",
      function () {
        closeMobileMenu();
        openModal(loginModal);
      }
    );

  document
    .getElementById(
      "openSignup"
    )
    .addEventListener(
      "click",
      function () {
        openModal(signupModal);
      }
    );

  document
    .getElementById(
      "mobileSignup"
    )
    .addEventListener(
      "click",
      function () {
        closeMobileMenu();
        openModal(signupModal);
      }
    );

  document
    .getElementById(
      "switchToSignup"
    )
    .addEventListener(
      "click",
      function () {
        closeModal(loginModal);
        openModal(signupModal);
      }
    );

  document
    .getElementById(
      "switchToLogin"
    )
    .addEventListener(
      "click",
      function () {
        closeModal(signupModal);
        openModal(loginModal);
      }
    );

  document
    .querySelectorAll(
      "[data-close-modal]"
    )
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          closeModal(
            button.closest(
              ".modal-overlay"
            )
          );
        }
      );
    });

  document
    .querySelectorAll(
      ".modal-overlay"
    )
    .forEach(function (modal) {
      modal.addEventListener(
        "click",
        function (event) {
          if (
            event.target === modal
          ) {
            closeModal(modal);
          }
        }
      );
    });

  document.addEventListener(
    "keydown",
    function (event) {
      if (event.key === "Escape") {
        document
          .querySelectorAll(
            ".modal-overlay.open"
          )
          .forEach(function (modal) {
            closeModal(modal);
          });

        closeMobileMenu();
      }
    }
  );

  for (const kind of ['signup','login']) {
    document.getElementById(kind+'Form').addEventListener('submit',async event=>{
      event.preventDefault();
      const email=document.getElementById(kind+'Email').value.trim();
      const password=document.getElementById(kind+'Password').value;
      if(!email || !password || (kind==='signup' && password.length<12)) {showToast('Vérifiez les informations saisies (12 caractères minimum à l’inscription).');return;}
      const button=event.target.querySelector('[type=submit]');if(button.disabled) return;button.disabled=true;
      try {
        const result=kind==='signup' ? await db.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname,data:{full_name:document.getElementById('signupName').value.trim()}}}) : await db.auth.signInWithPassword({email,password});
        if(result.error) throw result.error;
        event.target.reset();closeModal(kind==='signup'?signupModal:loginModal);
        if(result.data.session) {await restoreSession(result.data.session);showToast('Connexion réussie.');}
        else showToast('Vérifiez votre messagerie pour confirmer votre compte.');
      } catch(error) {showToast(kind==='login' ? 'Connexion impossible. Vérifiez vos identifiants ou réessayez.' : 'Inscription impossible : '+error.message);}
      finally {button.disabled=false;}
    });
  }

  async function logout() {
  const { error } = await db.auth.signOut().catch(error=>({error}));

  if (error) {
    console.error(
      "DealBot — Logout error:",
      error
    );

    showToast(
      state.lang === "en"
        ? "Unable to sign out."
        : "Impossible de se déconnecter."
    );

    return;
  }

  await restoreSession(null);

  showToast(
    state.lang === "en"
      ? "Logged out."
      : "Déconnexion réussie."
  );

  console.log(
    "DealBot — User disconnected"
  );
}
  document
    .getElementById(
      "logoutButton"
    )
    .addEventListener(
      "click",
      logout
    );

  function updateAccountUI() {
  const guest =
    document.getElementById("guestActions");

  const account =
    document.getElementById("accountBox");

  const accountButton =
    document.getElementById("accountButton");

  document.getElementById('adminAccountLink').hidden = currentProfile?.role !== 'admin';
  document.getElementById('saveStatus').textContent = '';
  if (currentUser) {
    guest.hidden = true;
    account.hidden = false;

    accountButton.textContent =
      currentProfile?.full_name ||
      currentUser.email ||
      "Mon compte";
  } else {
    guest.hidden = false;
    account.hidden = true;

    accountButton.textContent =
      state.lang === "en"
        ? "My account"
        : "Mon compte";
  }
}

const accountButton =
    document.getElementById(
      "accountButton"
    );

  const accountMenu =
    document.getElementById(
      "accountMenu"
    );

  accountButton.addEventListener(
    "click",
    function () {
      const opened =
        accountMenu.classList.toggle(
          "open"
        );

      accountButton.setAttribute(
        "aria-expanded",
        String(opened)
      );
    }
  );

  document.addEventListener(
    "click",
    function (event) {
      const accountBox =
        document.getElementById(
          "accountBox"
        );

      if (
        accountBox &&
        !accountBox.contains(
          event.target
        )
      ) {
        accountMenu.classList.remove(
          "open"
        );

        accountButton.setAttribute(
          "aria-expanded",
          "false"
        );
      }
    }
  );

  function renderProfile() {
  document.getElementById("profileForm").hidden=!currentUser;
  document.getElementById("editProfileName").value=currentProfile?.full_name || "";
  document.getElementById(
    "profileName"
  ).textContent =
    currentProfile?.full_name ||
    currentUser?.email ||
    "—";

  document.getElementById(
    "profileEmail"
  ).textContent =
    currentUser?.email ||
    "—";

  document.getElementById(
    "profileFavorites"
  ).textContent =
    state.favorites.length;

  document.getElementById(
    "profileAlerts"
  ).textContent =
    state.alerts.length;
}

  /* =========================================================
     CONTACT
  ========================================================== */

  document.getElementById('contactForm').addEventListener('submit', async event => {
    event.preventDefault(); if (!requireAccount()) return;
    const button=event.target.querySelector('[type=submit]'); button.disabled=true;
    try {
      await apiChecked(db.from('contact_messages').insert({user_id:currentUser.id,
        name:document.getElementById('contactName').value.trim(),email:document.getElementById('contactEmail').value.trim(),
        message:document.getElementById('contactMessage').value.trim()}));
      event.target.reset(); showToast('Message reçu. Il est disponible pour l’administrateur.');
    } catch(error) { showToast('Message non envoyé : '+error.message); } finally { button.disabled=false; }
  });
  document.getElementById('forgotPassword').addEventListener('click',async()=>{
    const input=document.getElementById('loginEmail');
    if (!input.value || !input.checkValidity()) { input.focus(); showToast('Indiquez votre adresse email.'); return; }
    const button=document.getElementById('forgotPassword'); button.disabled=true;
    try {
      const {error}=await db.auth.resetPasswordForEmail(input.value.trim(),{redirectTo:location.origin+location.pathname});
      if(error) throw error;
      showToast('Si un compte existe, un lien de réinitialisation sera envoyé.');
    } catch { showToast('Demande impossible. Réessayez plus tard.'); } finally { button.disabled=false; }
  });
  document.getElementById('recoveryForm').addEventListener('submit',async event=>{
    event.preventDefault(); const password=document.getElementById('recoveryPassword').value;
    if(password.length<12) return;
    const button=event.target.querySelector('[type=submit]');button.disabled=true;
    try { const {error}=await db.auth.updateUser({password}); if(error) throw error;
      event.target.reset();closeModal(document.getElementById('recoveryModal'));showToast('Mot de passe modifié.');
    } catch { showToast('Lien expiré ou modification impossible. Demandez un nouveau lien.'); } finally { button.disabled=false; }
  });
  document.getElementById('profileForm').addEventListener('submit',async event=>{
    event.preventDefault(); if(!requireAccount()) return;
    const revision=authRevision, userId=currentUser.id;
    const button=event.target.querySelector('button');button.disabled=true;
    try { const profile=await apiChecked(db.from('profiles').update({full_name:document.getElementById('editProfileName').value.trim()}).eq('id',userId).select('*').single());
      if(revision!==authRevision) return;
      currentProfile=profile;
      updateAccountUI();renderProfile();showToast('Profil enregistré.');
    } catch { if(revision===authRevision) showToast('Profil non enregistré.'); } finally { button.disabled=false; }
  });
  async function renderAdminMessages() {
    const revision=authRevision;
    const target=document.getElementById('adminMessages');
    try {
      const messages=await apiChecked(db.from('contact_messages').select('name,email,message,created_at').order('created_at',{ascending:false}).limit(50));
      if(revision!==authRevision || currentProfile?.role!=='admin') return;
      target.replaceChildren();const title=document.createElement('h3');title.textContent='Messages reçus';target.appendChild(title);
      if(!messages.length) target.append('Aucun message.');
      messages.forEach(m=>{const item=document.createElement('p');item.textContent=m.name+' — '+m.email+' : '+m.message;target.appendChild(item);});
    } catch { if(revision===authRevision && currentProfile?.role==='admin') target.textContent='Messages indisponibles.'; }
  }
  async function loadAds() {
    try {
      const [ads,slots]=await Promise.all(['ads','ad_slots'].map(t=>apiChecked(db.from(t).select('*'))));
      document.querySelectorAll('[data-ad-location]').forEach(el=>{
        const slot=slots.find(s=>s.location===el.dataset.adLocation && s.is_active);
        const ad=ads.find(a=>a.slot_id===slot?.id && a.status==='active' && (!a.starts_at || Date.parse(a.starts_at)<=Date.now()) && (!a.ends_at || Date.parse(a.ends_at)>Date.now()));
        el.replaceChildren();const url=window.DealBotBackend.safeUrl(ad?.destination_url);
        if(!ad || !url) {el.textContent='Espace partenaire disponible';return;}
        const label=document.createElement('span');label.textContent='Publicité · '+ad.advertiser_name;
        const link=document.createElement('a');link.href=url;link.rel='sponsored noopener noreferrer';link.textContent=ad.title || ad.advertiser_name;
        const image=window.DealBotBackend.safeUrl(ad.image_url);
        if(image) {const img=document.createElement('img');img.src=image;img.alt=ad.title||ad.advertiser_name;img.loading='lazy';img.referrerPolicy='no-referrer';img.style.maxHeight='160px';img.onerror=()=>img.remove();link.appendChild(img);}
        el.append(label,link);
      });
    } catch { /* Empty slots remain visible without claiming an active advertiser. */ }
  }
  /* =========================================================
     LANGUAGE
     Le contenu dynamique bascule immédiatement.
     Les textes statiques FR resteront traduits progressivement
     lorsque le backend / système i18n complet sera branché.
  ========================================================== */

  function setLanguage(lang) {
    if (
      lang !== "fr" &&
      lang !== "en"
    ) {
      return;
    }

    state.lang = lang;

    preferences.setItem(
      STORAGE.language,
      lang
    );

    document.documentElement.lang =
      lang;

    document
      .querySelectorAll(
        "[data-lang-switch]"
      )
      .forEach(function (button) {
        button.classList.toggle(
          "active",
          button.getAttribute(
            "data-lang-switch"
          ) === lang
        );
      });

    populateFilters();
    refreshCurrentPage();

    showToast(
      lang === "en"
        ? "English selected."
        : "Français sélectionné."
    );
  }

  document
    .querySelectorAll(
      "[data-lang-switch]"
    )
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          setLanguage(
            button.getAttribute(
              "data-lang-switch"
            )
          );
        }
      );
    });

  /* =========================================================
   ADMIN SHORTCUT — D + D
========================================================== */

let adminKeyTime = 0;

function openAdminPanel() {
  window.location.hash = "admin";
}

document.addEventListener("keydown", function (event) {
  const active = document.activeElement;

  const tag =
    active && active.tagName
      ? active.tagName.toLowerCase()
      : "";

  const typing =
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    (
      active &&
      active.isContentEditable
    );

  if (typing) {
    return;
  }

  if (
    event.key.toLowerCase() !== "d"
  ) {
    adminKeyTime = 0;
    return;
  }

  const now = Date.now();

  if (
    adminKeyTime &&
    now - adminKeyTime <= 700
  ) {
    adminKeyTime = 0;

    event.preventDefault();

    openAdminPanel();

    return;
  }

  adminKeyTime = now;
});
/* =========================================================
   ADMIN PANEL
========================================================== */

const adminDealModal =
  document.getElementById("adminDealModal");

const adminDealForm =
  document.getElementById("adminDealForm");

function populateAdminCategories() {
  const select =
    document.getElementById(
      "adminDealCategory"
    );

  select.innerHTML = "";

  CATEGORIES.forEach(function (category) {
    const option =
      document.createElement("option");

    option.value =
      category.id;

    option.textContent =
      category.fr;

    select.appendChild(option);
  });
}

async function renderAdmin() {
  const revision=authRevision;
  try {
    const {
      data: { user },
      error
    } = await db.auth.getUser();

    if(revision!==authRevision) return;
    if (error || !user) {
      currentProfile = null;
      updateAccountUI();

      showToast(
        state.lang === "en"
          ? "Administrator access required."
          : "Accès administrateur requis."
      );

      updateHash("home");
      return;
    }

    if(revision!==authRevision) return;
    currentUser = user;

    const profile = await loadSupabaseProfile(user.id);
    if(revision!==authRevision) return;
    currentProfile = profile;
    updateAccountUI();

    if (
      !currentProfile ||
      currentProfile.role !== "admin"
    ) {
      showToast(
        state.lang === "en"
          ? "Administrator access required."
          : "Accès administrateur requis."
      );

      updateHash("home");
      return;
    }



  } catch (error) {
    if(revision!==authRevision) return;
    currentProfile = null;
    updateAccountUI();
    console.error(
      "DealBot — Admin verification error:",
      error
    );

    updateHash("home");
    return;
  }
  renderAdminMessages();
  document.getElementById(
    "adminStatDeals"
  ).textContent =
    ADMIN_DEALS.length;

  document.getElementById(
    "adminStatCategories"
  ).textContent =
    CATEGORIES.length;

  document.getElementById(
    "adminStatFavorites"
  ).textContent =
    state.favorites.length;

  document.getElementById(
    "adminStatAlerts"
  ).textContent =
    state.alerts.length;

  const tbody =
    document.getElementById(
      "adminDealsBody"
    );

  tbody.innerHTML = "";

  ADMIN_DEALS.forEach(function (deal) {
    const row =
      document.createElement("tr");

    row.innerHTML = `
      <td>
        <strong>
          ${escapeHTML(deal.name)}
        </strong>
      </td>

      <td>
        ${escapeHTML(
          categoryName(deal.category)
        )}
      </td>

      <td>
        ${escapeHTML(deal.store)}
      </td>

      <td>
        ${money(deal.price, deal.currency)}
      </td>

      <td>
        ${discount(deal)}%
      </td>

      <td>
        ${deal.score}/100
      </td>

      <td>
        <span class="admin-badge">
          ${escapeHTML(
            availabilityText(
              deal.availability
            )
          )}
        </span>
      </td>

      <td>
        <div class="admin-actions">

          <button
            type="button"
            class="btn ghost small"
            data-admin-edit="${deal.id}"
          >
            Modifier
          </button>

          <button
            type="button"
            class="btn ghost small"
            data-admin-delete="${deal.id}"
          >
            Supprimer
          </button>

        </div>
      </td>
    `;

    tbody.appendChild(row);
  });

  tbody
    .querySelectorAll(
      "[data-admin-edit]"
    )
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          openAdminDealEditor(
            Number(
              button.getAttribute(
                "data-admin-edit"
              )
            )
          );
        }
      );
    });

  tbody
    .querySelectorAll(
      "[data-admin-delete]"
    )
    .forEach(function (button) {
      button.addEventListener(
        "click",
        function () {
          deleteAdminDeal(
            Number(
              button.getAttribute(
                "data-admin-delete"
              )
            )
          );
        }
      );
    });
}

function openAdminDealEditor(id) {
  populateAdminCategories();

  const deal =
    id ? ADMIN_DEALS.find(d=>d.id===id) : null;

  document.getElementById(
    "adminDealTitle"
  ).textContent =
    deal
      ? "Modifier l'offre"
      : "Ajouter une offre";

  document.getElementById(
    "adminDealId"
  ).value =
    deal ? deal.id : "";

  document.getElementById(
    "adminDealName"
  ).value =
    deal ? deal.name : "";

  document.getElementById(
    "adminDealCategory"
  ).value =
    deal
      ? deal.category
      : CATEGORIES[0]?.id || "";

  document.getElementById(
    "adminDealStore"
  ).value =
    deal ? deal.store : "";

  document.getElementById(
    "adminDealPrice"
  ).value =
    deal ? deal.price : "";

  document.getElementById(
    "adminDealOldPrice"
  ).value =
    deal ? deal.oldPrice : "";

  document.getElementById(
    "adminDealScore"
  ).value =
    deal ? deal.score : 70;

  document.getElementById('adminDealScore').disabled = deal?.scoreMethod === 'automatic-v1';

  document.getElementById(
    "adminDealAvailability"
  ).value =
    deal
      ? deal.availability
      : "available";

  document.getElementById(
    "adminDealUrl"
  ).value =
    deal
      ? deal.originalUrl || ""
      : "";

  document.getElementById(
    "adminDealDescription"
  ).value =
    deal
      ? deal.description
      : "";

  document.getElementById('adminDealStatus').value = deal?.status || 'draft';
  document.getElementById('adminDealCurrency').value = deal?.currency || 'MUR';
  document.getElementById('adminDealImage').value = deal?.imageUrl || '';
  document.getElementById('adminDealAffiliate').value = deal?.affiliateOverride || '';
  document.getElementById('adminDealStart').value = deal?.startsAt ? new Date(deal.startsAt).toISOString().slice(0,16) : '';
  document.getElementById('adminDealFeatured').checked = !!deal?.featured;
  document.getElementById('adminDealExpiry').value = deal?.expiresAt ? new Date(deal.expiresAt).toISOString().slice(0,16) : '';
  openModal(
    adminDealModal
  );
}

async function deleteAdminDeal(id) {
  if (currentProfile?.role !== 'admin') return;
  if (!window.confirm('Archiver cette offre ? Son historique sera conservé.')) return;
  try { await api.archiveDeal(id); await loadCatalogFromSupabase(); showToast('Offre archivée.'); }
  catch { showToast('Échec de l’archivage. Réessayez.'); }
}

document.getElementById(
  "adminAddDeal"
).addEventListener(
  "click",
  function () {
    openAdminDealEditor(null);
  }
);

document.getElementById(
  "closeAdminDealModal"
).addEventListener(
  "click",
  function () {
    closeModal(
      adminDealModal
    );
  }
);

document.getElementById(
  "cancelAdminDeal"
).addEventListener(
  "click",
  function () {
    closeModal(
      adminDealModal
    );
  }
);

adminDealForm.addEventListener('submit', async function(event) {
  event.preventDefault();
  if (currentProfile?.role !== 'admin') { showToast('Accès administrateur requis.'); return; }
  const value = id => document.getElementById(id).value.trim();
  const url = value('adminDealUrl'), image = value('adminDealImage');
  const affiliateUrl = value('adminDealAffiliate');
  if ([url,image,affiliateUrl].some(link => link && !window.DealBotBackend.safeUrl(link))) { showToast('Utilisez une URL HTTPS valide.'); return; }
  const startsAt = value('adminDealStart') ? new Date(value('adminDealStart')+'Z').toISOString() : null;
  const expiresAt = value('adminDealExpiry') ? new Date(value('adminDealExpiry')+'Z').toISOString() : null;
  if (startsAt && expiresAt && startsAt >= expiresAt) { showToast('L’expiration doit être après le début de publication.'); return; }
  const button = adminDealForm.querySelector('[type=submit]'); button.disabled = true;
  try {
    await api.saveDeal({id:value('adminDealId') || null,name:value('adminDealName'),store:value('adminDealStore'),
      category:value('adminDealCategory'),price:Number(value('adminDealPrice')),oldPrice:Number(value('adminDealOldPrice')),
      score:Number(value('adminDealScore')),availability:({available:'in_stock',outofstock:'out_of_stock',limited:'limited',unknown:'unknown'})[value('adminDealAvailability')],
      description:value('adminDealDescription'),url,currency:value('adminDealCurrency'),status:value('adminDealStatus'),imageUrl:image,
      affiliateUrl,startsAt,expiresAt,featured:document.getElementById('adminDealFeatured').checked});
    closeModal(adminDealModal);
    await loadCatalogFromSupabase();
    showToast('Offre enregistrée dans Supabase.');
  } catch(error) { showToast('Enregistrement impossible : '+error.message); }
  finally { button.disabled=false; }
});
  /* =========================================================
     REFRESH
  ========================================================== */

  function refreshCurrentPage() {
    renderStats();
    renderFeatured();

    const active =
      document.querySelector(
        "[data-page-section].active"
      );

    if (!active) {
      return;
    }

    const page =
      active.getAttribute(
        "data-page-section"
      );

    if (page === "home") {
      renderHome();
    } else if (
      page === "explore"
    ) {
      renderExplore();
    } else if (
      page === "categories"
    ) {
      renderCategories();
    } else if (
      page === "deal"
    ) {
      renderDealDetail();
    } else if (
      page === "compare"
    ) {
      renderComparePicker();
    } else if (
      page === "intelligence"
    ) {
      renderIntelligence();
    } else if (
      page === "favorites"
    ) {
      renderFavorites();
    } else if (
      page === "alerts"
    ) {
      renderAlerts();
    } else if (
  page === "profile"
) {
  renderProfile();
} else if (
  page === "admin"
) {
  renderAdmin();
}
  }

  /* =========================================================
     INIT
  ========================================================== */

  function init() {
    document.documentElement.lang =
      state.lang;

    document
      .querySelectorAll(
        "[data-lang-switch]"
      )
      .forEach(function (button) {
        button.classList.toggle(
          "active",
          button.getAttribute(
            "data-lang-switch"
          ) === state.lang
        );
      });

    document.getElementById(
      "footerYear"
    ).textContent =
      new Date().getFullYear();

    populateFilters();
    updateAccountUI();
    renderStats();
    renderHome();

    const hash =
      window.location.hash
        .replace("#", "")
        .trim();

    if (
      hash.startsWith(
        "deal-"
      )
    ) {
      const id =
        Number(
          hash.replace(
            "deal-",
            ""
          )
        );

      if (Number.isSafeInteger(id) && id > 0) {
        state.currentDealId =
          id;

        navigate("deal");

        return;
      }
    }

    if (
      ROUTES.includes(
        hash
      )
    ) {
      navigate(hash);
    } else {
      navigate("home");
    }
  }

  document.addEventListener('keydown',event=>{
    if(event.key!=='Tab') return;
    const modal=document.querySelector('.modal-overlay.open');if(!modal) return;
    const items=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),a[href]')];
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey && document.activeElement===first) {event.preventDefault();last?.focus();}
    else if(!event.shiftKey && document.activeElement===last) {event.preventDefault();first?.focus();}
  });
  api = window.DealBotBackend.create(db);
  document.getElementById('retryAccount').addEventListener('click',async event=>{
    const button=event.currentTarget;button.disabled=true;
    try { await restoreSession(currentSession); } finally { button.disabled=false; }
  });
  document.getElementById('catalogStatus').querySelector('button').addEventListener('click',()=>{if(!personalReady) initializeSupabaseAuth();else loadCatalogFromSupabase();});
  document.getElementById('currencyFilter').addEventListener('change',event=>{state.filters.currency=event.target.value;state.visibleDeals=DEALS_PER_PAGE;renderExplore();});
  init();
  loadAds();
  initializeSupabaseAuth().catch(()=> { catalogState='error'; showCatalogStatus(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && personalReady) { loadCatalogFromSupabase(); if (currentUser) saveQueue.then(async()=>{
      const id=currentUser?.id, revision=authRevision, readRevision=++personalRevision; if (!id) return;
      try { const data=await api.personal(id); if(revision===authRevision && readRevision===personalRevision) { confirmedPersonalState=JSON.parse(JSON.stringify(data)); Object.assign(state,data); refreshCurrentPage(); } } catch {}
    }); }
  });

})();
