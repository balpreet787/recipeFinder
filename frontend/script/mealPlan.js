const mealPlanGrid = document.getElementById("mealPlanGrid");
const mealPlanMessage = document.getElementById("mealPlanMessage");
const mealPlanSummary = document.getElementById("mealPlanSummary");
const mealPlanSummaryText = document.getElementById("mealPlanSummaryText");
const refreshMealPlanBtn = document.getElementById("refreshMealPlanBtn");

document.addEventListener("DOMContentLoaded", () => {
  loadMealPlan();
});

refreshMealPlanBtn?.addEventListener("click", () => {
  loadMealPlan(true);
});

async function loadMealPlan(forceRefresh = false) {
  const token = localStorage.getItem("idToken");

  clearMealPlan();
  showInfo("Loading your meal plan...");

  if (!token) {
    showError("Please log in first to see your meal plan.");
    return;
  }

  try {
    const response = await fetch(
      `http://localhost:3000/api/mealplan${forceRefresh ? "?refresh=true" : ""}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`
        }
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || "Unable to load meal plan.");
    }

    if (!data.recipes || data.recipes.length === 0) {
      showError("No suggestions yet. Search some proteins first.");
      return;
    }

    showSuccess("Meal plan loaded.");
    renderMealPlan(data.recipes);

    mealPlanSummary.classList.remove("hidden");
    mealPlanSummaryText.textContent =
      data.summary ||
      `We found ${data.recipes.length} recipe suggestions based on your recent search history.`;
  } catch (error) {
    console.error("Meal plan error:", error);
    showError(error.message || "Something went wrong while loading your meal plan.");
  }
}

function renderMealPlan(recipes) {
  mealPlanGrid.innerHTML = "";

  recipes.forEach((recipe, index) => {
    const article = document.createElement("article");
    article.className = "meal-card";

    article.innerHTML = `
      <div class="meal-card__image-wrap">
        <img
          src="${recipe.strMealThumb || ""}"
          alt="${escapeHtml(recipe.strMeal || "Recipe image")}"
          class="meal-card__image"
        />
      </div>

      <div class="meal-card__body">
        <p class="meal-card__day">Suggestion ${index + 1}</p>
        <h3 class="meal-card__title">${escapeHtml(recipe.strMeal || "Untitled recipe")}</h3>
        <p class="meal-card__meta">
          ${escapeHtml(recipe.strCategory || "Category unavailable")}
          •
          ${escapeHtml(recipe.strArea || "Area unavailable")}
        </p>
        <p class="meal-card__reason">
          Suggested because you searched for
          <strong>${escapeHtml(recipe.matchedProtein || "a protein")}</strong>.
        </p>
        <a
          class="meal-card__link"
          href="${recipe.strSource || recipe.youtubeUrl || "#"}"
          target="_blank"
          rel="noopener noreferrer"
        >
          View Recipe
        </a>
      </div>
    `;

    mealPlanGrid.appendChild(article);
  });
}

function clearMealPlan() {
  mealPlanGrid.innerHTML = "";
  mealPlanSummary.classList.add("hidden");
  mealPlanSummaryText.textContent = "";
  mealPlanMessage.textContent = "";
  mealPlanMessage.className = "message";
}

function showError(message) {
  mealPlanMessage.textContent = message;
  mealPlanMessage.className = "message show error";
}

function showSuccess(message) {
  mealPlanMessage.textContent = message;
  mealPlanMessage.className = "message show success";
}

function showInfo(message) {
  mealPlanMessage.textContent = message;
  mealPlanMessage.className = "message show success";
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}