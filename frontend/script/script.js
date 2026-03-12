const API_BASE_URL = "http://localhost:3000";

function getCurrentPageFile() {
  const cleanedPath = window.location.pathname.replace(/\/+$/, "");
  const lastSegment = cleanedPath.split("/").pop();
  return (lastSegment || "index.html").toLowerCase();
}

function isIndexPage(fileName) {
  return fileName === "index.html" || fileName === "index";
}

function getRecipeId(recipe) {
  return String(recipe?.id ?? recipe?.recipeId ?? "").trim();
}

function getRecipeUrl(recipe) {
  const directUrl = String(recipe?.recipeUrl ?? recipe?.sourceUrl ?? "").trim();
  if (directUrl) {
    return directUrl;
  }

  const recipeId = getRecipeId(recipe);
  if (recipeId) {
    return `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${encodeURIComponent(recipeId)}`;
  }

  return "";
}

function setSearchStatus(element, message, type = "info") {
  if (!element) return;

  element.textContent = message;
  element.classList.remove("is-error", "is-success");

  if (type === "error") {
    element.classList.add("is-error");
  } else if (type === "success") {
    element.classList.add("is-success");
  }
}

function createDropdownSection(title, contentElement) {
  const section = document.createElement("details");
  section.className = "recipe-dropdown";
  section.open = true;

  const summary = document.createElement("summary");
  summary.textContent = title;

  section.append(summary, contentElement);
  return section;
}

function renderRecipeDetail(recipe, container, options = {}) {
  const isSaved = Boolean(options.isSaved);
  const onSave = typeof options.onSave === "function" ? options.onSave : null;

  container.innerHTML = "";

  const card = document.createElement("section");
  card.className = "recipe-detail__card";

  const header = document.createElement("header");
  header.className = "recipe-detail__header";

  const title = document.createElement("h3");
  title.textContent = recipe.name;

  const meta = document.createElement("p");
  meta.className = "recipe-detail__meta";
  const category = recipe.category || "Uncategorized";
  const cuisine = recipe.cuisine || "Unknown cuisine";
  meta.textContent = `${category} • ${cuisine}`;

  header.append(title, meta);
  card.appendChild(header);

  const actionBar = document.createElement("div");
  actionBar.className = "recipe-detail__actions";

  const saveButton = document.createElement("button");
  saveButton.type = "button";
  saveButton.className = "recipe-save-btn";
  saveButton.textContent = isSaved ? "Saved" : "Save Recipe";
  saveButton.disabled = isSaved;

  if (!isSaved && onSave) {
    saveButton.addEventListener("click", () => onSave(recipe));
  } else if (isSaved) {
    saveButton.classList.add("is-saved");
  }

  actionBar.appendChild(saveButton);
  card.appendChild(actionBar);

  if (recipe.thumbnail) {
    const image = document.createElement("img");
    image.className = "recipe-detail__image";
    image.src = recipe.thumbnail;
    image.alt = recipe.name;
    image.loading = "lazy";
    card.appendChild(image);
  }

  const ingredientsList = document.createElement("ul");
  ingredientsList.className = "recipe-detail__list";
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  ingredients.forEach((ingredient) => {
    const item = document.createElement("li");
    item.textContent = ingredient;
    ingredientsList.appendChild(item);
  });
  if (!ingredients.length) {
    const item = document.createElement("li");
    item.textContent = "Ingredients not available.";
    ingredientsList.appendChild(item);
  }

  const stepsList = document.createElement("ol");
  stepsList.className = "recipe-detail__list";
  const instructions = Array.isArray(recipe.instructions) ? recipe.instructions : [];
  instructions.forEach((step) => {
    const item = document.createElement("li");
    item.textContent = step;
    stepsList.appendChild(item);
  });
  if (!instructions.length) {
    const item = document.createElement("li");
    item.textContent = "Instructions not available.";
    stepsList.appendChild(item);
  }

  const ingredientsSection = createDropdownSection("Ingredients", ingredientsList);
  const instructionsSection = createDropdownSection("Instructions", stepsList);
  card.append(ingredientsSection, instructionsSection);

  const primaryRecipeUrl = String(recipe.recipeUrl ?? recipe.sourceUrl ?? "").trim();

  if (primaryRecipeUrl || recipe.youtubeUrl) {
    const links = document.createElement("p");
    links.className = "recipe-detail__links";

    if (primaryRecipeUrl) {
      const sourceLink = document.createElement("a");
      sourceLink.href = primaryRecipeUrl;
      sourceLink.target = "_blank";
      sourceLink.rel = "noopener noreferrer";
      sourceLink.textContent = "Recipe Link";
      links.appendChild(sourceLink);
    }

    if (recipe.youtubeUrl) {
      if (primaryRecipeUrl) {
        links.append(" • ");
      }
      const videoLink = document.createElement("a");
      videoLink.href = recipe.youtubeUrl;
      videoLink.target = "_blank";
      videoLink.rel = "noopener noreferrer";
      videoLink.textContent = "Video";
      links.appendChild(videoLink);
    }

    card.appendChild(links);
  }

  container.appendChild(card);
}

function renderRecipeList(recipes, selectedId, container, onSelect) {
  container.innerHTML = "";

  recipes.forEach((recipe) => {
    const recipeId = getRecipeId(recipe);
    const item = document.createElement("li");

    const button = document.createElement("button");
    button.type = "button";
    button.className = "recipe-list__item";
    button.dataset.id = recipeId;

    if (recipeId === selectedId) {
      button.classList.add("is-selected");
    }

    if (recipe.thumbnail) {
      const thumbnail = document.createElement("img");
      thumbnail.src = recipe.thumbnail;
      thumbnail.alt = recipe.name;
      thumbnail.loading = "lazy";
      thumbnail.className = "recipe-list__thumb";
      button.appendChild(thumbnail);
    }

    const labelWrap = document.createElement("span");
    labelWrap.className = "recipe-list__text";

    const name = document.createElement("strong");
    name.className = "recipe-list__name";
    name.textContent = recipe.name;

    const meta = document.createElement("span");
    meta.className = "recipe-list__meta";
    meta.textContent = [recipe.category, recipe.cuisine].filter(Boolean).join(" • ");

    labelWrap.append(name, meta);
    button.appendChild(labelWrap);

    button.addEventListener("click", () => onSelect(recipeId));
    item.appendChild(button);
    container.appendChild(item);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentFile = getCurrentPageFile();
  if (!isIndexPage(currentFile)) {
    return;
  }

  const searchForm = document.getElementById("recipeSearchForm");
  const searchInput = document.getElementById("recipeSearchInput");
  const searchButton = document.getElementById("recipeSearchButton");
  const searchStatus = document.getElementById("searchStatus");
  const recipeResults = document.getElementById("recipeResults");
  const recipeList = document.getElementById("recipeList");
  const recipeDetail = document.getElementById("recipeDetail");

  if (!searchForm || !searchInput || !searchButton || !recipeResults || !recipeList || !recipeDetail) {
    return;
  }

  const token = localStorage.getItem("idToken");
  if (!token) {
    if (typeof redirectToLogin === "function") {
      redirectToLogin(currentFile);
    } else {
      window.location.replace("login.html");
    }
    return;
  }

  let currentRecipes = [];
  let selectedRecipeId = null;
  let savedRecipeUrls = new Set();

  function handleUnauthorized() {
    if (typeof clearAuthStorage === "function") {
      clearAuthStorage();
    }
    if (typeof redirectToLogin === "function") {
      redirectToLogin(currentFile);
    } else {
      window.location.replace("login.html");
    }
  }

  async function fetchWithAuth(url, options = {}) {
    const response = await fetch(url, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(options.headers || {})
      }
    });

    if (response.status === 401) {
      handleUnauthorized();
      return { unauthorized: true, response, payload: {} };
    }

    const payload = await response.json().catch(() => ({}));
    return { unauthorized: false, response, payload };
  }

  async function loadSavedRecipeUrls() {
    const { unauthorized, response, payload } = await fetchWithAuth(`${API_BASE_URL}/api/bookmarks`);
    if (unauthorized) {
      return false;
    }

    if (!response.ok) {
      console.error("Unable to load bookmarks:", payload.message || response.statusText);
      return true;
    }

    const bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    savedRecipeUrls = new Set(
      bookmarks
        .map((bookmark) => String(bookmark?.recipeUrl ?? bookmark?.sourceUrl ?? "").trim())
        .filter(Boolean)
    );

    return true;
  }

  async function saveRecipe(recipe) {
    const recipeUrl = getRecipeUrl(recipe);
    if (!recipeUrl) {
      setSearchStatus(searchStatus, "This recipe cannot be saved because it has no URL.", "error");
      return;
    }

    const body = {
      recipeUrl
    };

    const { unauthorized, response, payload } = await fetchWithAuth(`${API_BASE_URL}/api/bookmarks`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });

    if (unauthorized) {
      return;
    }

    if (!response.ok) {
      throw new Error(payload.message || "Unable to save recipe right now.");
    }

    savedRecipeUrls.add(recipeUrl);
    showSelectedRecipe(getRecipeId(recipe));
    setSearchStatus(searchStatus, payload.message || `"${recipe.name}" saved.`, "success");
  }

  function showSelectedRecipe(recipeId) {
    selectedRecipeId = String(recipeId);
    const recipe = currentRecipes.find((entry) => getRecipeId(entry) === selectedRecipeId);
    if (!recipe) return;

    const currentRecipeUrl = getRecipeUrl(recipe);
    renderRecipeList(currentRecipes, selectedRecipeId, recipeList, showSelectedRecipe);
    renderRecipeDetail(recipe, recipeDetail, {
      isSaved: Boolean(currentRecipeUrl) && savedRecipeUrls.has(currentRecipeUrl),
      onSave: async (selectedRecipe) => {
        try {
          await saveRecipe(selectedRecipe);
        } catch (error) {
          setSearchStatus(searchStatus, error.message || "Unable to save recipe right now.", "error");
        }
      }
    });
  }

  const bookmarksReady = await loadSavedRecipeUrls();
  if (!bookmarksReady) {
    return;
  }

  searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const query = searchInput.value.trim();
    if (!query) {
      setSearchStatus(searchStatus, "Enter a recipe name before searching.", "error");
      return;
    }

    searchButton.disabled = true;
    searchButton.textContent = "Searching...";
    setSearchStatus(searchStatus, `Searching for "${query}"...`);

    try {
      const { unauthorized, response, payload } = await fetchWithAuth(`${API_BASE_URL}/api/search?q=${encodeURIComponent(query)}`);
      if (unauthorized) {
        return;
      }
      if (!response.ok) {
        throw new Error(payload.message || "Search failed.");
      }

      currentRecipes = Array.isArray(payload.recipes) ? payload.recipes : [];

      if (!currentRecipes.length) {
        recipeResults.classList.add("hidden");
        recipeList.innerHTML = "";
        recipeDetail.innerHTML = "";
        setSearchStatus(searchStatus, `No recipes found for "${query}".`, "error");
        return;
      }

      selectedRecipeId = getRecipeId(currentRecipes[0]);
      recipeResults.classList.remove("hidden");
      renderRecipeList(currentRecipes, selectedRecipeId, recipeList, showSelectedRecipe);
      showSelectedRecipe(selectedRecipeId);

      const recipeLabel = currentRecipes.length === 1 ? "recipe" : "recipes";
      setSearchStatus(searchStatus, `Found ${currentRecipes.length} ${recipeLabel} for "${query}".`, "success");
    } catch (error) {
      setSearchStatus(searchStatus, error.message || "Unable to search recipes right now.", "error");
      recipeResults.classList.add("hidden");
    } finally {
      searchButton.disabled = false;
      searchButton.textContent = "Search";
    }
  });
});
