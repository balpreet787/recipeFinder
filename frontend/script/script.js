const API_BASE_URL = "http://35.91.131.169";

function getCurrentPageFile() {
  const cleanedPath = window.location.pathname.replace(/\/+$/, "");
  const lastSegment = cleanedPath.split("/").pop();
  return (lastSegment || "index.html").toLowerCase();
}

function isIndexPage(fileName) {
  return fileName === "index.html" || fileName === "index";
}

function isSavedRecipesPage(fileName) {
  return fileName === "savedrecipes.html" || fileName === "savedrecipes";
}

function getRecipeId(recipe) {
  return String(recipe?.id ?? recipe?.recipeId ?? recipe?.recipeUrl ?? "").trim();
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
  const onDelete = typeof options.onDelete === "function" ? options.onDelete : null;
  const deleteInProgress = Boolean(options.deleteInProgress);

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
  meta.textContent = `${category} - ${cuisine}`;

  header.append(title, meta);
  card.appendChild(header);

  const actionBar = document.createElement("div");
  actionBar.className = "recipe-detail__actions";

  if (onDelete) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "recipe-save-btn recipe-delete-btn";
    deleteButton.textContent = deleteInProgress ? "Removing..." : "Remove Recipe";
    deleteButton.disabled = deleteInProgress;
    deleteButton.addEventListener("click", () => onDelete(recipe));
    actionBar.appendChild(deleteButton);
  } else {
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
  }

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
        links.append(" - ");
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
    meta.textContent = [recipe.category, recipe.cuisine].filter(Boolean).join(" - ");

    labelWrap.append(name, meta);
    button.appendChild(labelWrap);

    button.addEventListener("click", () => onSelect(recipeId));
    item.appendChild(button);
    container.appendChild(item);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentFile = getCurrentPageFile();
  const onIndexPage = isIndexPage(currentFile);
  const onSavedPage = isSavedRecipesPage(currentFile);

  if (!onIndexPage && !onSavedPage) {
    return;
  }

  const searchStatus = document.getElementById("searchStatus");
  const recipeResults = document.getElementById("recipeResults");
  const recipeList = document.getElementById("recipeList");
  const recipeDetail = document.getElementById("recipeDetail");
  const searchForm = document.getElementById("recipeSearchForm");
  const searchInput = document.getElementById("recipeSearchInput");
  const searchButton = document.getElementById("recipeSearchButton");

  if (!searchStatus || !recipeResults || !recipeList || !recipeDetail) {
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
  let deleteInProgressId = null;

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

  async function loadSavedRecipes() {
    const { unauthorized, response, payload } = await fetchWithAuth(`${API_BASE_URL}/api/bookmarks`);
    if (unauthorized) {
      return false;
    }

    if (!response.ok) {
      throw new Error(payload.message || "Unable to load saved recipes right now.");
    }

    const bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    currentRecipes = bookmarks.map((bookmark) => ({
      id: bookmark.id ?? bookmark.recipeId ?? bookmark.recipeUrl,
      name: bookmark.name || "Saved Recipe",
      category: bookmark.category || null,
      cuisine: bookmark.cuisine || null,
      thumbnail: bookmark.thumbnail || null,
      ingredients: Array.isArray(bookmark.ingredients) ? bookmark.ingredients : [],
      instructions: Array.isArray(bookmark.instructions) ? bookmark.instructions : [],
      recipeUrl: bookmark.recipeUrl || bookmark.sourceUrl || "",
      sourceUrl: bookmark.sourceUrl || null,
      youtubeUrl: bookmark.youtubeUrl || null
    })).filter((recipe) => getRecipeUrl(recipe));

    savedRecipeUrls = new Set(currentRecipes.map((recipe) => getRecipeUrl(recipe)).filter(Boolean));
    return true;
  }

  async function saveRecipe(recipe) {
    const recipeUrl = getRecipeUrl(recipe);
    if (!recipeUrl) {
      setSearchStatus(searchStatus, "This recipe cannot be saved because it has no URL.", "error");
      return;
    }

    const body = {
      recipeUrl,
      recipe: {
        id: getRecipeId(recipe),
        name: recipe.name,
        category: recipe.category,
        cuisine: recipe.cuisine,
        thumbnail: recipe.thumbnail,
        ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients : [],
        instructions: Array.isArray(recipe.instructions) ? recipe.instructions : [],
        recipeUrl,
        sourceUrl: recipe.sourceUrl || null,
        youtubeUrl: recipe.youtubeUrl || null
      }
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

  async function deleteRecipe(recipe) {
    const recipeUrl = getRecipeUrl(recipe);
    if (!recipeUrl) {
      setSearchStatus(searchStatus, "This saved recipe cannot be removed because it has no URL.", "error");
      return;
    }

    deleteInProgressId = getRecipeId(recipe);
    showSelectedRecipe(deleteInProgressId);

    try {
      const { unauthorized, response, payload } = await fetchWithAuth(`${API_BASE_URL}/api/bookmarks`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ recipeUrl })
      });

      if (unauthorized) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.message || "Unable to remove recipe right now.");
      }

      currentRecipes = currentRecipes.filter((entry) => getRecipeUrl(entry) !== recipeUrl);
      savedRecipeUrls.delete(recipeUrl);

      if (!currentRecipes.length) {
        selectedRecipeId = null;
        recipeList.innerHTML = "";
        recipeDetail.innerHTML = "";
        recipeResults.classList.add("hidden");
        setSearchStatus(searchStatus, payload.message || "Saved recipe removed.", "success");
        return;
      }

      const nextRecipe = currentRecipes.find((entry) => getRecipeId(entry) !== getRecipeId(recipe)) || currentRecipes[0];
      selectedRecipeId = getRecipeId(nextRecipe);
      renderRecipeList(currentRecipes, selectedRecipeId, recipeList, showSelectedRecipe);
      showSelectedRecipe(selectedRecipeId);
      setSearchStatus(searchStatus, payload.message || "Saved recipe removed.", "success");
    } finally {
      deleteInProgressId = null;
    }
  }

  function showSelectedRecipe(recipeId) {
    selectedRecipeId = String(recipeId);
    const recipe = currentRecipes.find((entry) => getRecipeId(entry) === selectedRecipeId);
    if (!recipe) return;

    renderRecipeList(currentRecipes, selectedRecipeId, recipeList, showSelectedRecipe);

    if (onSavedPage) {
      renderRecipeDetail(recipe, recipeDetail, {
        onDelete: async (selectedRecipe) => {
          try {
            await deleteRecipe(selectedRecipe);
          } catch (error) {
            deleteInProgressId = null;
            showSelectedRecipe(getRecipeId(selectedRecipe));
            setSearchStatus(searchStatus, error.message || "Unable to remove recipe right now.", "error");
          }
        },
        deleteInProgress: deleteInProgressId === selectedRecipeId
      });
      return;
    }

    const currentRecipeUrl = getRecipeUrl(recipe);
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

  if (onSavedPage) {
    try {
      await loadSavedRecipes();

      if (!currentRecipes.length) {
        recipeResults.classList.add("hidden");
        setSearchStatus(searchStatus, "You have no saved recipes yet.");
        return;
      }

      selectedRecipeId = getRecipeId(currentRecipes[0]);
      recipeResults.classList.remove("hidden");
      renderRecipeList(currentRecipes, selectedRecipeId, recipeList, showSelectedRecipe);
      showSelectedRecipe(selectedRecipeId);
      setSearchStatus(searchStatus, `Loaded ${currentRecipes.length} saved recipe${currentRecipes.length === 1 ? "" : "s"}.`, "success");
    } catch (error) {
      recipeResults.classList.add("hidden");
      setSearchStatus(searchStatus, error.message || "Unable to load saved recipes right now.", "error");
    }

    return;
  }

  if (!searchForm || !searchInput || !searchButton) {
    return;
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
