function isMealPlanPage(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  return normalized === "mealplan.html" || normalized === "mealplan";
}

function parsePositiveInt(value) {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function clampInt(value, min, max) {
  const numeric = Number.parseInt(String(value), 10);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function shuffledCopy(items) {
  const copy = Array.isArray(items) ? [...items] : [];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
  }
  return copy;
}

function normalizeMealPlanSource(value) {
  const normalized = String(value || "").toLowerCase();
  if (normalized === "history") return "history";
  return "saved";
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentFile = typeof getCurrentPageFile === "function" ? getCurrentPageFile() : "";
  if (!isMealPlanPage(currentFile)) {
    return;
  }

  const mealPlanForm = document.getElementById("mealPlanForm");
  const mealPlanCountInput = document.getElementById("mealPlanCount");
  const generateButton = document.getElementById("generateMealPlanButton");
  const sourceInputs = Array.from(document.querySelectorAll('input[name="mealPlanSource"]'));

  const searchStatus = document.getElementById("searchStatus");
  const recipeResults = document.getElementById("recipeResults");
  const recipeList = document.getElementById("recipeList");
  const recipeDetail = document.getElementById("recipeDetail");

  if (!mealPlanForm || !mealPlanCountInput || !generateButton) {
    return;
  }

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

  const params = new URLSearchParams(window.location.search);
  const countFromUrl = parsePositiveInt(params.get("count"));
  const sourceFromUrl = normalizeMealPlanSource(params.get("source"));
  const countFromStorage = parsePositiveInt(localStorage.getItem("mealPlanCount"));
  const sourceFromStorage = normalizeMealPlanSource(localStorage.getItem("mealPlanSource"));
  const initialCount = countFromUrl ?? countFromStorage ?? 7;
  const initialSource = (params.has("source") ? sourceFromUrl : sourceFromStorage) || "saved";
  mealPlanCountInput.value = String(initialCount);
  localStorage.setItem("mealPlanSource", initialSource);
  sourceInputs.forEach((input) => {
    input.checked = normalizeMealPlanSource(input.value) === initialSource;
  });

  let savedRecipes = [];
  let savedRecipeUrls = new Set();
  let currentPlanRecipes = [];
  let selectedRecipeId = null;

  function getSelectedSource() {
    const selected = sourceInputs.find((input) => input.checked);
    return normalizeMealPlanSource(selected?.value);
  }

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

  async function loadSavedRecipes() {
    const baseUrl = typeof API_BASE_URL === "string" ? API_BASE_URL : "http://localhost:3000";
    const { unauthorized, response, payload } = await fetchWithAuth(`${baseUrl}/api/bookmarks`);
    if (unauthorized) {
      return false;
    }

    if (!response.ok) {
      throw new Error(payload.message || "Unable to load saved recipes right now.");
    }

    const bookmarks = Array.isArray(payload.bookmarks) ? payload.bookmarks : [];
    savedRecipes = bookmarks
      .map((bookmark) => ({
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
      }))
      .filter((recipe) => (typeof getRecipeUrl === "function" ? getRecipeUrl(recipe) : recipe.recipeUrl));

    savedRecipeUrls = new Set(savedRecipes.map((recipe) => getRecipeUrl(recipe)).filter(Boolean));
    return true;
  }

  async function loadMealPlanFromHistory(count) {
    const baseUrl = typeof API_BASE_URL === "string" ? API_BASE_URL : "http://localhost:3000";
    const { unauthorized, response, payload } = await fetchWithAuth(
      `${baseUrl}/api/mealplan?count=${encodeURIComponent(count)}`
    );

    if (unauthorized) {
      return [];
    }

    if (!response.ok) {
      throw new Error(payload.message || "Unable to generate a meal plan right now.");
    }

    return Array.isArray(payload.recipes) ? payload.recipes : [];
  }

  async function saveRecipe(recipe) {
    const recipeUrl = getRecipeUrl(recipe);
    if (!recipeUrl) {
      setSearchStatus(searchStatus, "This recipe cannot be saved because it has no URL.", "error");
      return;
    }

    const baseUrl = typeof API_BASE_URL === "string" ? API_BASE_URL : "http://localhost:3000";
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

    const { unauthorized, response, payload } = await fetchWithAuth(`${baseUrl}/api/bookmarks`, {
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
    selectedRecipeId = String(recipeId || "");
    const recipe = currentPlanRecipes.find((entry) => getRecipeId(entry) === selectedRecipeId);
    if (!recipe) return;

    renderRecipeList(currentPlanRecipes, selectedRecipeId, recipeList, showSelectedRecipe);
    const recipeUrl = getRecipeUrl(recipe);
    renderRecipeDetail(recipe, recipeDetail, {
      isSaved: Boolean(recipeUrl) && savedRecipeUrls.has(recipeUrl),
      onSave: async (selectedRecipe) => {
        try {
          await saveRecipe(selectedRecipe);
        } catch (error) {
          setSearchStatus(searchStatus, error.message || "Unable to save recipe right now.", "error");
        }
      }
    });
  }

  function renderCurrentPlan() {
    if (!currentPlanRecipes.length) {
      recipeResults.classList.add("hidden");
      recipeList.innerHTML = "";
      recipeDetail.innerHTML = "";
      return;
    }

    selectedRecipeId = getRecipeId(currentPlanRecipes[0]);
    recipeResults.classList.remove("hidden");
    renderRecipeList(currentPlanRecipes, selectedRecipeId, recipeList, showSelectedRecipe);
    showSelectedRecipe(selectedRecipeId);
  }

  async function generateMealPlan() {
    const requestedCount = clampInt(mealPlanCountInput.value, 1, 50);
    mealPlanCountInput.value = String(requestedCount);
    localStorage.setItem("mealPlanCount", String(requestedCount));
    localStorage.setItem("mealPlanSource", getSelectedSource());

    const source = getSelectedSource();
    setSearchStatus(
      searchStatus,
      source === "history" ? "Generating meals from your search history..." : "Loading saved recipes..."
    );
    generateButton.disabled = true;
    generateButton.textContent = "Generating...";

    try {
      if (source === "history") {
        const historyRecipes = await loadMealPlanFromHistory(requestedCount);
        if (!historyRecipes.length) {
          currentPlanRecipes = [];
          renderCurrentPlan();
          setSearchStatus(
            searchStatus,
            "No meal suggestions available yet. Try searching for a few recipes on the Home page first.",
            "error"
          );
          return;
        }

        currentPlanRecipes = historyRecipes;
        renderCurrentPlan();
        setSearchStatus(
          searchStatus,
          `Generated ${historyRecipes.length} meal${historyRecipes.length === 1 ? "" : "s"} from your search history.`,
          "success"
        );
        return;
      }

      await loadSavedRecipes();

      if (!savedRecipes.length) {
        currentPlanRecipes = [];
        renderCurrentPlan();
        setSearchStatus(
          searchStatus,
          'You have no saved recipes yet. Save a few recipes, or switch the source to "Search history".',
          "error"
        );
        return;
      }

      const clampedCount = Math.min(requestedCount, savedRecipes.length);
      currentPlanRecipes = shuffledCopy(savedRecipes).slice(0, clampedCount);
      renderCurrentPlan();

      setSearchStatus(
        searchStatus,
        `Generated ${clampedCount} meal${clampedCount === 1 ? "" : "s"} from ${savedRecipes.length} saved recipe${savedRecipes.length === 1 ? "" : "s"}.`,
        "success"
      );
    } catch (error) {
      currentPlanRecipes = [];
      renderCurrentPlan();
      setSearchStatus(searchStatus, error.message || "Unable to generate a meal plan right now.", "error");
    } finally {
      generateButton.disabled = false;
      generateButton.textContent = "Generate";
    }
  }

  mealPlanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await generateMealPlan();
  });

  sourceInputs.forEach((input) => {
    input.addEventListener("change", async () => {
      localStorage.setItem("mealPlanSource", getSelectedSource());
      await generateMealPlan();
    });
  });

  await generateMealPlan();
});
