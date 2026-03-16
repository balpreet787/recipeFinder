function isMealPlanPage(fileName) {
  const normalized = String(fileName || "").toLowerCase();
  return normalized === "mealplan.html" || normalized === "mealplan";
}

function parseProteinTokens(input) {
  return String(input || "")
    .split(/[\s,.\|/]+/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function formatDateIsoLocal(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function startOfWeekSunday(date) {
  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const dayOfWeek = start.getDay();
  start.setDate(start.getDate() - dayOfWeek);
  return start;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function formatWeekRange(startDate) {
  const endDate = addDays(startDate, 6);
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric"
  });
  return `${formatter.format(startDate)} - ${formatter.format(endDate)}`;
}

function getWeekLabel(offset) {
  if (offset === -1) return "Last week";
  if (offset === 1) return "Next week";
  return "This week";
}

document.addEventListener("DOMContentLoaded", async () => {
  const currentFile = typeof getCurrentPageFile === "function" ? getCurrentPageFile() : "";
  if (!isMealPlanPage(currentFile)) {
    return;
  }

  const mealPlanForm = document.getElementById("mealPlanForm");
  const proteinInput = document.getElementById("proteinInput");
  const regenerateButton = document.getElementById("regenerateMealPlanButton");
  const deleteButton = document.getElementById("deleteMealPlanButton");
  const lockNotice = document.getElementById("lockNotice");
  const prevWeekButton = document.getElementById("prevWeekButton");
  const nextWeekButton = document.getElementById("nextWeekButton");
  const weekLabel = document.getElementById("weekLabel");
  const weekRange = document.getElementById("weekRange");
  const searchStatus = document.getElementById("searchStatus");
  const mealPlanSummary = document.getElementById("mealPlanSummary");
  const summaryTitle = document.getElementById("summaryTitle");
  const summaryBody = document.getElementById("summaryBody");
  const mealPlanActions = document.querySelector(".mealplan-actions");
  const recipeResults = document.getElementById("recipeResults");
  const recipeList = document.getElementById("recipeList");
  const recipeDetail = document.getElementById("recipeDetail");
  const deleteDialog = document.getElementById("deleteMealPlanDialog");
  const confirmDeleteButton = document.getElementById("confirmDeleteMealPlan");

  if (!mealPlanForm || !proteinInput || !regenerateButton || !deleteButton || !prevWeekButton || !nextWeekButton) {
    return;
  }

  if (!weekLabel || !weekRange || !searchStatus || !mealPlanSummary || !summaryTitle || !summaryBody || !lockNotice || !mealPlanActions) {
    return;
  }

  if (!recipeResults || !recipeList || !recipeDetail || !deleteDialog || !confirmDeleteButton) {
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

  let currentOffset = 0;
  const baseWeekStart = startOfWeekSunday(new Date());
  const storedProteins = localStorage.getItem("mealPlanProteins") || "";
  proteinInput.value = storedProteins;
  let currentPlanDays = [];
  let selectedDayIndex = 0;
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
      return false;
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
    renderMealPlanDetail(currentPlanDays[selectedDayIndex]);
    setSearchStatus(searchStatus, payload.message || `"${recipe.name}" saved.`, "success");
  }

  function setLoadingState(isLoading) {
    const isLockedWeek = currentOffset < 0;
    regenerateButton.disabled = isLoading || isLockedWeek;
    deleteButton.disabled = isLoading || isLockedWeek;
    lockNotice.classList.toggle("hidden", !isLockedWeek);
    mealPlanActions.classList.toggle("hidden", isLockedWeek);
    prevWeekButton.disabled = isLoading || currentOffset <= -1;
    nextWeekButton.disabled = isLoading || currentOffset >= 1;
  }

  function updateWeekHeader() {
    const currentWeekStart = addDays(baseWeekStart, currentOffset * 7);
    weekLabel.textContent = getWeekLabel(currentOffset);
    weekRange.textContent = formatWeekRange(currentWeekStart);
  }

  function renderMealPlanList(days) {
    recipeList.innerHTML = "";

    days.forEach((entry, index) => {
      const recipe = entry.recipe;
      const recipeId = String(recipe?.id ?? recipe?.recipeUrl ?? `${entry.day}-${entry.date}`);

      const item = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "recipe-list__item";
      button.dataset.id = recipeId;

      if (index === selectedDayIndex) {
        button.classList.add("is-selected");
      }

      if (recipe?.thumbnail) {
        const thumbnail = document.createElement("img");
        thumbnail.src = recipe.thumbnail;
        thumbnail.alt = recipe.name || entry.day;
        thumbnail.loading = "lazy";
        thumbnail.className = "recipe-list__thumb";
        button.appendChild(thumbnail);
      }

      const labelWrap = document.createElement("span");
      labelWrap.className = "recipe-list__text";

      const name = document.createElement("strong");
      name.className = "recipe-list__name";
      name.textContent = recipe?.name || "No meal planned yet";

      const meta = document.createElement("span");
      meta.className = "recipe-list__meta";
      meta.textContent = `${entry.day} - ${entry.date}`;

      labelWrap.append(name, meta);
      button.appendChild(labelWrap);

      button.addEventListener("click", () => {
        selectedDayIndex = index;
        renderMealPlanList(currentPlanDays);
        renderMealPlanDetail(currentPlanDays[index]);
      });

      item.appendChild(button);
      recipeList.appendChild(item);
    });
  }

  function renderMealPlanDetail(entry) {
    recipeDetail.innerHTML = "";
    if (!entry) {
      return;
    }

    const recipe = entry.recipe;

    const header = document.createElement("header");
    header.className = "mealplan-detail__header";

    const title = document.createElement("h3");
    title.textContent = recipe?.name || "No meal planned yet";

    const meta = document.createElement("p");
    meta.className = "mealplan-detail__meta";
    meta.textContent = `${entry.day} - ${entry.date}`;

    header.append(title, meta);
    recipeDetail.appendChild(header);

    if (!recipe) {
      const empty = document.createElement("p");
      empty.textContent = "No meal assigned. Generate a plan to fill this day.";
      recipeDetail.appendChild(empty);
      return;
    }

    const recipeUrl = getRecipeUrl(recipe);
    const actions = document.createElement("div");
    actions.className = "recipe-detail__actions";
    const saveButton = document.createElement("button");
    saveButton.type = "button";
    saveButton.className = "recipe-save-btn";
    const isSaved = recipeUrl && savedRecipeUrls.has(recipeUrl);
    saveButton.textContent = isSaved ? "Saved" : "Save Recipe";
    saveButton.disabled = isSaved;
    if (!isSaved) {
      saveButton.addEventListener("click", async () => {
        try {
          await saveRecipe(recipe);
        } catch (error) {
          setSearchStatus(searchStatus, error.message || "Unable to save recipe right now.", "error");
        }
      });
    } else {
      saveButton.classList.add("is-saved");
    }
    actions.appendChild(saveButton);
    recipeDetail.appendChild(actions);

    if (recipe.thumbnail) {
      const image = document.createElement("img");
      image.className = "recipe-detail__image";
      image.src = recipe.thumbnail;
      image.alt = recipe.name;
      image.loading = "lazy";
      recipeDetail.appendChild(image);
    }

    const info = document.createElement("p");
    info.className = "mealplan-detail__info";
    info.textContent = [recipe.category, recipe.cuisine].filter(Boolean).join(" - ");
    recipeDetail.appendChild(info);

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

    if (typeof createDropdownSection === "function") {
      const ingredientsSection = createDropdownSection("Ingredients", ingredientsList);
      const instructionsSection = createDropdownSection("Instructions", stepsList);
      recipeDetail.append(ingredientsSection, instructionsSection);
    } else {
      recipeDetail.append(ingredientsList, stepsList);
    }

    const primaryRecipeUrl = getRecipeUrl(recipe);
    const youtubeUrl = recipe.youtubeUrl || null;

    if (primaryRecipeUrl || youtubeUrl) {
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

      if (youtubeUrl) {
        if (primaryRecipeUrl) {
          links.append(" - ");
        }
        const videoLink = document.createElement("a");
        videoLink.href = youtubeUrl;
        videoLink.target = "_blank";
        videoLink.rel = "noopener noreferrer";
        videoLink.textContent = "Video";
        links.appendChild(videoLink);
      }

      recipeDetail.appendChild(links);
    }
  }

  function updateSummary(payload) {
    if (!payload) {
      mealPlanSummary.classList.add("hidden");
      summaryBody.textContent = "";
      return;
    }

    mealPlanSummary.classList.remove("hidden");
    summaryTitle.textContent = `${getWeekLabel(currentOffset)} - ${payload.weekStart} to ${payload.weekEnd}`;

    if (payload.message) {
      summaryBody.textContent = payload.message;
      return;
    }

    const proteins = Array.isArray(payload.proteins) ? payload.proteins : [];
    const proteinLabel = proteins.length ? `Based on: ${proteins.join(", ")}.` : "No proteins selected yet.";
    const statusLabel = payload.cached
      ? "This plan is locked for the week."
      : "Plan saved for this week.";
    summaryBody.textContent = `${proteinLabel} ${statusLabel}`.trim();
  }

  async function loadMealPlan({ offset, proteins, force = false, save = true }) {
    const weekStartDate = addDays(baseWeekStart, offset * 7);
    const weekStart = formatDateIsoLocal(weekStartDate);

    updateWeekHeader();
    setLoadingState(true);
    setSearchStatus(searchStatus, "Loading your meal plan...");

    try {
      const body = {
        weekStart,
        proteins,
        force,
        save
      };

      const { unauthorized, response, payload } = await fetchWithAuth(
        `${API_BASE_URL}/api/mealplan/week`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(body)
        }
      );

      if (unauthorized) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.message || "Unable to load a meal plan right now.");
      }

      currentPlanDays = Array.isArray(payload.days) ? payload.days : [];
      selectedDayIndex = 0;
      recipeResults.classList.toggle("hidden", !currentPlanDays.length);
      renderMealPlanList(currentPlanDays);
      renderMealPlanDetail(currentPlanDays[selectedDayIndex]);
      updateSummary(payload);
      setLoadingState(false);

      if (payload.message) {
        setSearchStatus(searchStatus, payload.message, "error");
      } else {
        setSearchStatus(
          searchStatus,
          payload.cached ? "Loaded your saved meal plan." : "Meal plan saved.",
          "success"
        );
      }
    } catch (error) {
      currentPlanDays = [];
      recipeResults.classList.add("hidden");
      recipeList.innerHTML = "";
      recipeDetail.innerHTML = "";
      updateSummary(null);
      setSearchStatus(searchStatus, error.message || "Unable to load a meal plan right now.", "error");
    } finally {
      setLoadingState(false);
    }
  }

  async function loadSavedMealPlan() {
    const weekStartDate = addDays(baseWeekStart, currentOffset * 7);
    const weekStart = formatDateIsoLocal(weekStartDate);

    updateWeekHeader();
    setLoadingState(true);
    setSearchStatus(searchStatus, "Loading your meal plan...");

    try {
      const { unauthorized, response, payload } = await fetchWithAuth(
        `${API_BASE_URL}/api/mealplan/week?weekStart=${encodeURIComponent(weekStart)}`
      );

      if (unauthorized) {
        return;
      }

      if (!response.ok) {
        if (response.status === 404) {
          setSearchStatus(
            searchStatus,
            payload.message || "No saved meal plan yet. Generating a new one now...",
            "error"
          );
          await loadMealPlan({
            offset: currentOffset,
            proteins: parseProteinTokens(proteinInput.value),
            force: true,
            save: true
          });
          return;
        }
        throw new Error(payload.message || "Unable to load a meal plan right now.");
      }

      currentPlanDays = Array.isArray(payload.days) ? payload.days : [];
      selectedDayIndex = 0;
      recipeResults.classList.toggle("hidden", !currentPlanDays.length);
      renderMealPlanList(currentPlanDays);
      renderMealPlanDetail(currentPlanDays[selectedDayIndex]);
      updateSummary(payload);

      setSearchStatus(searchStatus, "Loaded your saved meal plan.", "success");
    } catch (error) {
      currentPlanDays = [];
      recipeResults.classList.add("hidden");
      recipeList.innerHTML = "";
      recipeDetail.innerHTML = "";
      updateSummary(null);
      setSearchStatus(searchStatus, error.message || "Unable to load a meal plan right now.", "error");
    } finally {
      setLoadingState(false);
    }
  }

  async function deleteMealPlan() {
    const weekStartDate = addDays(baseWeekStart, currentOffset * 7);
    const weekStart = formatDateIsoLocal(weekStartDate);

    setLoadingState(true);
    setSearchStatus(searchStatus, "Deleting meal plan...");

    try {
      const { unauthorized, response, payload } = await fetchWithAuth(
        `${API_BASE_URL}/api/mealplan/week?weekStart=${encodeURIComponent(weekStart)}`,
        {
          method: "DELETE"
        }
      );

      if (unauthorized) {
        return;
      }

      if (!response.ok) {
        throw new Error(payload.message || "Unable to delete meal plan right now.");
      }

      currentPlanDays = [];
      recipeResults.classList.add("hidden");
      recipeList.innerHTML = "";
      recipeDetail.innerHTML = "";
      updateSummary(null);
      setSearchStatus(searchStatus, payload.message || "Meal plan deleted.", "success");
    } catch (error) {
      setSearchStatus(searchStatus, error.message || "Unable to delete meal plan right now.", "error");
    } finally {
      setLoadingState(false);
    }
  }

  mealPlanForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    regenerateButton.click();
  });

  regenerateButton.addEventListener("click", async () => {
    if (currentOffset < 0) {
      setSearchStatus(searchStatus, "Last week is locked and cannot be regenerated.", "error");
      return;
    }

    const proteins = parseProteinTokens(proteinInput.value);
    localStorage.setItem("mealPlanProteins", proteins.join(", "));
    if (!proteins.length) {
      setSearchStatus(searchStatus, "Enter at least one protein to regenerate a plan.", "error");
      return;
    }
    await loadMealPlan({ offset: currentOffset, proteins, force: true, save: true });
  });

  deleteButton.addEventListener("click", async () => {
    if (currentOffset < 0) {
      setSearchStatus(searchStatus, "Last week is locked and cannot be deleted.", "error");
      return;
    }
    deleteDialog.showModal();
  });

  confirmDeleteButton.addEventListener("click", async () => {
    deleteDialog.close();
    await deleteMealPlan();
  });

  prevWeekButton.addEventListener("click", async () => {
    if (currentOffset <= -1) return;
    currentOffset -= 1;
    await loadSavedMealPlan();
  });

  nextWeekButton.addEventListener("click", async () => {
    if (currentOffset >= 1) return;
    currentOffset += 1;
    await loadSavedMealPlan();
  });

  updateWeekHeader();
  await loadSavedRecipeUrls();
  await loadSavedMealPlan();
});
