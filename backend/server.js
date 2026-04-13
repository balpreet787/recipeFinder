import { randomUUID } from "node:crypto";
import express, { json } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import axios from "axios";
import pinoHttp from "pino-http";
import { DeleteCommand, GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, MEALPLAN_TABLE_NAME, USERS_TABLE_NAME } from "./db.js";
import { buildErrorLogObject, errorSerializer, logger } from "./logger.js";

const app = express();
const PORT = 3000;
const region = "us-west-2";
const userPoolId = "us-west-2_CaC4wWgAg";
const mealDbBaseUrl = "https://www.themealdb.com/api/json/v1/1";
const defaultAllowedOrigins = [
  "http://team5-recipefinder.s3-website-us-west-2.amazonaws.com",
  "http://localhost:5500",
  "http://127.0.0.1:5500",
  "http://localhost:3000",
  "http://127.0.0.1:3000"
];

const configuredAllowedOrigins = String(process.env.CORS_ALLOWED_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const allowedOrigins = configuredAllowedOrigins.length > 0
  ? configuredAllowedOrigins
  : defaultAllowedOrigins;

const corsOptions = {
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    return callback(new Error(`Origin ${origin} is not allowed by CORS.`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Authorization", "Content-Type"],
  optionsSuccessStatus: 204
};

let pems = {};

app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
app.use(pinoHttp({
  logger,
  genReqId(req, res) {
    const incomingRequestId = req.headers["x-request-id"];

    if (typeof incomingRequestId === "string" && incomingRequestId.trim()) {
      res.setHeader("x-request-id", incomingRequestId);
      return incomingRequestId;
    }

    const requestId = randomUUID();
    res.setHeader("x-request-id", requestId);
    return requestId;
  },
  customLogLevel(req, res, error) {
    if (error || res.statusCode >= 500) {
      return "error";
    }

    if (res.statusCode >= 400) {
      return "warn";
    }

    return "info";
  },
  customSuccessMessage(req) {
    return `${req.method} ${req.originalUrl || req.url} completed`;
  },
  customErrorMessage(req, res, error) {
    if (error) {
      return `${req.method} ${req.originalUrl || req.url} failed`;
    }

    return `${req.method} ${req.originalUrl || req.url} completed with errors`;
  },
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.originalUrl || req.url,
        query: req.query
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode
      };
    },
    err: errorSerializer
  }
}));
app.use(json());

async function getPems() {
  const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;

  const response = await axios.get(url);
  const keys = response.data.keys;

  keys.forEach((key) => {
    const pem = jwkToPem(key);
    pems[key.kid] = pem;
  });
}

try {
  await getPems();
  logger.info({ region, userPoolId }, "Loaded Cognito signing keys");
} catch (error) {
  logger.fatal(buildErrorLogObject(error, { region, userPoolId }), "Failed to load Cognito signing keys");
  throw error;
}

function getRequestLogger(req) {
  return req.log ?? logger;
}

function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];
  const decodedJwt = jwt.decode(token, { complete: true });

  if (!decodedJwt) {
    return res.status(401).json({ message: "Invalid token" });
  }

  const pem = pems[decodedJwt.header.kid];

  if (!pem) {
    return res.status(401).json({ message: "Invalid token key" });
  }

  jwt.verify(token, pem, function (err, payload) {
    if (err) {
      return res.status(401).json({ message: "Token verification failed" });
    }

    req.user = payload;
    next();
  });
}

function getIngredientList(meal) {
  const ingredients = [];

  for (let i = 1; i <= 20; i += 1) {
    const ingredient = meal[`strIngredient${i}`]?.trim();
    const measure = meal[`strMeasure${i}`]?.trim();

    if (!ingredient) {
      continue;
    }

    ingredients.push(measure ? `${measure} ${ingredient}`.trim() : ingredient);
  }

  return ingredients;
}

function getInstructionSteps(instructions) {
  return String(instructions || "")
    .split(/\r?\n/)
    .map((step) => step.trim())
    .filter(Boolean);
}

function getRecipeUrl(meal) {
  const sourceUrl = String(meal?.strSource || "").trim();
  if (sourceUrl) {
    return sourceUrl;
  }

  const mealId = String(meal?.idMeal || "").trim();
  if (mealId) {
    return `${mealDbBaseUrl}/lookup.php?i=${encodeURIComponent(mealId)}`;
  }

  return null;
}

function normalizeRecipePayload(recipe) {
  if (!recipe || typeof recipe !== "object") {
    return null;
  }

  const recipeUrl = String(recipe.recipeUrl ?? recipe.sourceUrl ?? "").trim();
  if (!recipeUrl) {
    return null;
  }

  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((item) => String(item).trim()).filter(Boolean)
    : [];

  const instructions = Array.isArray(recipe.instructions)
    ? recipe.instructions.map((item) => String(item).trim()).filter(Boolean)
    : [];

  return {
    id: String(recipe.id ?? recipe.recipeId ?? "").trim() || null,
    name: String(recipe.name ?? "").trim() || "Saved Recipe",
    category: String(recipe.category ?? "").trim() || null,
    cuisine: String(recipe.cuisine ?? "").trim() || null,
    thumbnail: String(recipe.thumbnail ?? "").trim() || null,
    ingredients,
    instructions,
    recipeUrl,
    sourceUrl: String(recipe.sourceUrl ?? "").trim() || null,
    youtubeUrl: String(recipe.youtubeUrl ?? "").trim() || null,
    savedAt: new Date().toISOString()
  };
}

function formatRecipe(meal) {
  return {
    id: meal.idMeal,
    name: meal.strMeal,
    category: meal.strCategory || null,
    cuisine: meal.strArea || null,
    thumbnail: meal.strMealThumb || null,
    tags: meal.strTags
      ? meal.strTags.split(",").map((tag) => tag.trim()).filter(Boolean)
      : [],
    ingredients: getIngredientList(meal),
    instructions: getInstructionSteps(meal.strInstructions),
    recipeUrl: getRecipeUrl(meal),
    sourceUrl: meal.strSource || null,
    youtubeUrl: meal.strYoutube || null
  };
}

async function ensureUserExists(userId, email) {
  const existingUser = await dynamoDb.send(new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId }
  }));

  if (existingUser.Item) {
    return;
  }

  const createdAt = new Date().toISOString();

  try {
    await dynamoDb.send(new PutCommand({
      TableName: USERS_TABLE_NAME,
      Item: {
        userId,
        email,
        bookmarks: [],
        createdAt
      },
      ConditionExpression: "attribute_not_exists(userId)"
    }));
  } catch (error) {
    if (error.name !== "ConditionalCheckFailedException") {
      throw error;
    }
  }
}

async function saveSearchTerm(userId, query) {
  const normalizedQuery = query.toLowerCase();

  await dynamoDb.send(new UpdateCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    UpdateExpression: "ADD searchedProteins :searchedProteins SET updatedAt = :updatedAt",
    ExpressionAttributeValues: {
      ":searchedProteins": new Set([normalizedQuery]),
      ":updatedAt": new Date().toISOString()
    }
  }));
}

function buildBookmarkFromPayload(payload) {
  return normalizeRecipePayload(payload?.recipe) ?? normalizeRecipePayload(payload);
}

async function getUserBookmarks(userId) {
  const response = await dynamoDb.send(new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    ProjectionExpression: "bookmarks"
  }));

  return Array.isArray(response.Item?.bookmarks) ? response.Item.bookmarks : [];
}

function getBookmarkUrl(bookmark) {
  return String(bookmark?.recipeUrl ?? bookmark?.sourceUrl ?? "").trim();
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

function normalizeStringList(value) {
  if (value instanceof Set) {
    return Array.from(value).map((item) => String(item).trim()).filter(Boolean);
  }

  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  return [];
}

async function getUserSearchedProteins(userId) {
  const response = await dynamoDb.send(new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    ProjectionExpression: "searchedProteins"
  }));

  return normalizeStringList(response.Item?.searchedProteins);
}

function parseProteinInput(value) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/[\s,.\|/]+/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function parseIsoDateToLocal(dateString) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateString || "").trim());
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10) - 1;
  const day = Number.parseInt(match[3], 10);

  const date = new Date(year, month, day);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  return date;
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

function buildWeekDays(weekStart) {
  const startDate = parseIsoDateToLocal(weekStart);
  if (!startDate) {
    return [];
  }

  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  return dayNames.map((day, index) => ({
    day,
    date: formatDateIsoLocal(addDays(startDate, index))
  }));
}

async function getMealPlanCache(userId, weekStart) {
  const response = await dynamoDb.send(new GetCommand({
    TableName: MEALPLAN_TABLE_NAME,
    Key: { userId, weekStart }
  }));

  return response.Item || null;
}

async function putMealPlanCache(item) {
  await dynamoDb.send(new PutCommand({
    TableName: MEALPLAN_TABLE_NAME,
    Item: item
  }));
}

async function fetchMealCandidates(proteins) {
  const recipePool = new Map();

  for (const protein of proteins) {
    try {
      const response = await axios.get(`${mealDbBaseUrl}/search.php`, {
        params: { s: protein },
        timeout: 10000
      });

      const meals = Array.isArray(response.data?.meals) ? response.data.meals : [];
      meals.forEach((meal) => {
        const formatted = formatRecipe(meal);
        if (!formatted?.recipeUrl) {
          return;
        }

        recipePool.set(formatted.recipeUrl, {
          ...formatted,
          matchedProtein: protein
        });
      });
    } catch (error) {
      logger.warn(buildErrorLogObject(error, { protein }), "Meal plan search failed");
    }
  }

  return Array.from(recipePool.values());
}

function assignMealsToWeek(recipes, weekStart) {
  const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const startDate = parseIsoDateToLocal(weekStart);
  const shuffled = shuffledCopy(recipes);
  const plan = {};

  dayNames.forEach((day, dayIndex) => {
    if (!shuffled.length) {
      plan[day] = null;
      return;
    }

    const recipe = shuffled[dayIndex % shuffled.length];
    plan[day] = {
      ...recipe,
      plannedDate: startDate ? formatDateIsoLocal(addDays(startDate, dayIndex)) : null
    };
  });

  return plan;
}

function buildWeekResponse(weekStart, plan) {
  const days = buildWeekDays(weekStart).map((entry) => ({
    ...entry,
    recipe: Array.isArray(plan?.[entry.day])
      ? plan[entry.day][0] ?? null
      : plan?.[entry.day] ?? null
  }));

  return days;
}


app.get("/api/message", verifyToken, (req, res) => {
  res.json({
    message: "Verified token successfully",
    sub: req.user.sub,
    email: req.user.email
  });
});

app.get("/api/search", verifyToken, async (req, res) => {
  const query = String(req.query.q || "").trim();
  const userId = req.user?.sub;
  const email = req.user?.email;

  if (!query) {
    return res.status(400).json({
      message: "Please provide a search term with ?q=..."
    });
  }

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  try {
    await ensureUserExists(userId, email);

    const response = await axios.get(`${mealDbBaseUrl}/search.php`, {
      params: { s: query },
      timeout: 10000
    });

    const meals = Array.isArray(response.data?.meals) ? response.data.meals : [];
    const recipes = meals.map(formatRecipe);

    if (recipes.length > 0) {
      await saveSearchTerm(userId, query);
    }

    return res.json({
      query,
      count: recipes.length,
      recipes
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      getRequestLogger(req).error(
        buildErrorLogObject(error, { query, upstream: "ThemealDB" }),
        "ThemealDB request failed"
      );
      return res.status(502).json({
        message: "Unable to fetch recipes from ThemealDB right now."
      });
    }

    getRequestLogger(req).error(buildErrorLogObject(error, { query }), "Search route failed");
    return res.status(500).json({
      message: "Unable to process search request right now."
    });
  }
});

app.get("/api/mealplan/week", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const weekStart = String(req.query?.weekStart ?? "").trim();

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  const parsedWeekStart = parseIsoDateToLocal(weekStart);
  if (!parsedWeekStart) {
    return res.status(400).json({
      message: "weekStart must be provided in YYYY-MM-DD format."
    });
  }

  try {
    const cachedPlan = await getMealPlanCache(userId, weekStart);
    if (!cachedPlan?.plan) {
      return res.status(404).json({
        message: "No saved meal plan for this week yet."
      });
    }

    return res.json({
      cached: true,
      weekStart,
      weekEnd: formatDateIsoLocal(addDays(parsedWeekStart, 6)),
      generatedAt: cachedPlan.generatedAt || null,
      proteins: normalizeStringList(cachedPlan.proteins),
      days: buildWeekResponse(weekStart, cachedPlan.plan)
    });
  } catch (error) {
    getRequestLogger(req).error(buildErrorLogObject(error, { weekStart }), "Load meal plan failed");
    return res.status(500).json({
      message: "Unable to load meal plan right now."
    });
  }
});

app.post("/api/mealplan/week", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const email = req.user?.email;
  const weekStart = String(req.body?.weekStart ?? "").trim();
  const proteinInput = parseProteinInput(req.body?.proteins);
  const force = Boolean(req.body?.force);
  const save = req.body?.save !== false;
  const incomingPlan = req.body?.plan && typeof req.body.plan === "object" ? req.body.plan : null;

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  const parsedWeekStart = parseIsoDateToLocal(weekStart);
  if (!parsedWeekStart) {
    return res.status(400).json({
      message: "weekStart must be provided in YYYY-MM-DD format."
    });
  }

  const currentWeekStart = startOfWeekSunday(new Date());
  const diffDays = Math.round((parsedWeekStart.getTime() - currentWeekStart.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < -7 || diffDays > 7) {
    return res.status(400).json({
      message: "Meal plans are only available for last week, this week, and next week."
    });
  }

  try {
    await ensureUserExists(userId, email);

    if (diffDays < 0 && (force || save || incomingPlan)) {
      return res.status(403).json({
        message: "Last week is locked and cannot be edited."
      });
    }

    if (incomingPlan) {
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
      const plan = {};
      dayNames.forEach((day) => {
        const entry = incomingPlan[day];
        plan[day] = entry ?? null;
      });

      const generatedAt = new Date().toISOString();
      const ttl = Math.floor(Date.now() / 1000) + 21 * 24 * 60 * 60;

      await putMealPlanCache({
        userId,
        weekStart,
        plan,
        proteins: proteinInput,
        generatedAt,
        ttl
      });

      return res.json({
        cached: false,
        weekStart,
        weekEnd: formatDateIsoLocal(addDays(parsedWeekStart, 6)),
        generatedAt,
        proteins: proteinInput,
        days: buildWeekResponse(weekStart, plan)
      });
    }

    const cachedPlan = await getMealPlanCache(userId, weekStart);
    if (cachedPlan?.plan && !force) {
      return res.json({
        cached: true,
        weekStart,
        weekEnd: formatDateIsoLocal(addDays(parsedWeekStart, 6)),
        generatedAt: cachedPlan.generatedAt || null,
        proteins: normalizeStringList(cachedPlan.proteins),
        days: buildWeekResponse(weekStart, cachedPlan.plan)
      });
    }

    if (diffDays < 0) {
      return res.status(403).json({
        message: "Last week is locked and cannot be generated."
      });
    }

    let proteinsToUse = proteinInput;
    if (!proteinsToUse.length) {
      proteinsToUse = await getUserSearchedProteins(userId);
    } else {
      for (const protein of proteinsToUse) {
        await saveSearchTerm(userId, protein);
      }
    }

    if (!proteinsToUse.length) {
      return res.status(400).json({
        message: "Add at least one protein to generate a meal plan."
      });
    }

    const candidates = await fetchMealCandidates(proteinsToUse);
    if (!candidates.length) {
      return res.status(200).json({
        cached: false,
        weekStart,
        weekEnd: formatDateIsoLocal(addDays(parsedWeekStart, 6)),
        proteins: proteinsToUse,
        days: buildWeekResponse(weekStart, {}),
        message: "No recipes were found for the selected proteins."
      });
    }

    const plan = assignMealsToWeek(candidates, weekStart);
    const generatedAt = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + 21 * 24 * 60 * 60;

    if (save) {
      await putMealPlanCache({
        userId,
        weekStart,
        plan,
        proteins: proteinsToUse,
        generatedAt,
        ttl
      });
    }

    return res.json({
      cached: false,
      weekStart,
      weekEnd: formatDateIsoLocal(addDays(parsedWeekStart, 6)),
      generatedAt,
      proteins: proteinsToUse,
      days: buildWeekResponse(weekStart, plan),
      preview: !save
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      getRequestLogger(req).error(
        buildErrorLogObject(error, { weekStart, proteins: proteinInput }),
        "Meal plan week request failed"
      );
      return res.status(502).json({
        message: "Unable to fetch meal plan recipes right now."
      });
    }

    getRequestLogger(req).error(
      buildErrorLogObject(error, { weekStart, proteins: proteinInput }),
      "Meal plan week route failed"
    );
    return res.status(500).json({
      message: "Unable to generate a meal plan right now."
    });
  }
});

app.delete("/api/mealplan/week", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const weekStart = String(req.query?.weekStart ?? req.body?.weekStart ?? "").trim();

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  if (!parseIsoDateToLocal(weekStart)) {
    return res.status(400).json({
      message: "weekStart must be provided in YYYY-MM-DD format."
    });
  }

  const parsedWeekStart = parseIsoDateToLocal(weekStart);
  const currentWeekStart = startOfWeekSunday(new Date());
  const diffDays = Math.round((parsedWeekStart.getTime() - currentWeekStart.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays < 0) {
    return res.status(403).json({
      message: "Last week is locked and cannot be deleted."
    });
  }

  try {
    await dynamoDb.send(new DeleteCommand({
      TableName: MEALPLAN_TABLE_NAME,
      Key: { userId, weekStart }
    }));

    return res.json({
      message: "Meal plan deleted.",
      weekStart
    });
  } catch (error) {
    getRequestLogger(req).error(buildErrorLogObject(error, { weekStart }), "Delete meal plan failed");
    return res.status(500).json({
      message: "Unable to delete meal plan right now."
    });
  }
});

app.get("/api/mealplan", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const email = req.user?.email;
  const requestedCount = clampInt(req.query.count, 1, 50);

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  try {
    await ensureUserExists(userId, email);
    const searchedProteins = await getUserSearchedProteins(userId);

    if (!searchedProteins.length) {
      return res.json({
        count: 0,
        basedOnProteins: [],
        recipes: [],
        message: "No search history yet. Search for a few recipes first."
      });
    }

    const proteinsToUse = shuffledCopy(searchedProteins).slice(0, 5);
    const recipePool = new Map();

    for (const protein of proteinsToUse) {
      try {
        const response = await axios.get(`${mealDbBaseUrl}/search.php`, {
          params: { s: protein },
          timeout: 10000
        });

        const meals = Array.isArray(response.data?.meals) ? response.data.meals : [];
        meals.forEach((meal) => {
          const formatted = formatRecipe(meal);
          if (!formatted?.recipeUrl) {
            return;
          }

          recipePool.set(formatted.recipeUrl, {
            ...formatted,
            matchedProtein: protein
          });
        });
      } catch (error) {
        getRequestLogger(req).warn(buildErrorLogObject(error, { protein }), "Meal plan search failed");
      }
    }

    const allCandidates = Array.from(recipePool.values());
    if (!allCandidates.length) {
      return res.json({
        count: 0,
        basedOnProteins: proteinsToUse,
        recipes: [],
        message: "We could not find recipes based on your recent searches. Try searching a different protein."
      });
    }

    const selected = shuffledCopy(allCandidates).slice(0, Math.min(requestedCount, allCandidates.length));

    return res.json({
      count: selected.length,
      basedOnProteins: proteinsToUse,
      recipes: selected,
      summary: `Generated ${selected.length} meal${selected.length === 1 ? "" : "s"} based on ${proteinsToUse.length} recent search term${proteinsToUse.length === 1 ? "" : "s"}.`
    });
  } catch (error) {
    if (axios.isAxiosError(error)) {
      getRequestLogger(req).error(buildErrorLogObject(error), "Meal plan route external request failed");
      return res.status(502).json({
        message: "Unable to fetch meal plan recipes right now."
      });
    }

    getRequestLogger(req).error(buildErrorLogObject(error), "Meal plan route failed");
    return res.status(500).json({
      message: "Unable to generate a meal plan right now."
    });
  }
});

app.get("/api/bookmarks", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const email = req.user?.email;

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  try {
    await ensureUserExists(userId, email);
    const bookmarks = await getUserBookmarks(userId);

    return res.json({
      count: bookmarks.length,
      bookmarks
    });
  } catch (error) {
    getRequestLogger(req).error(buildErrorLogObject(error), "Get bookmarks failed");
    return res.status(500).json({
      message: "Unable to load bookmarks right now."
    });
  }
});

app.post("/api/bookmarks", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const email = req.user?.email;
  const bookmark = buildBookmarkFromPayload(req.body);

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  if (!bookmark) {
    return res.status(400).json({
      message: "recipeUrl is required to save a bookmark."
    });
  }

  try {
    await ensureUserExists(userId, email);

    const bookmarks = await getUserBookmarks(userId);
    const existingBookmark = bookmarks.find((item) => {
      const candidateUrl = String(item?.recipeUrl ?? item?.sourceUrl ?? "").trim();
      return candidateUrl === bookmark.recipeUrl;
    });

    if (existingBookmark) {
      return res.status(200).json({
        message: "Recipe is already bookmarked.",
        bookmark: existingBookmark,
        alreadySaved: true
      });
    }

    await dynamoDb.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId },
      UpdateExpression: "SET bookmarks = list_append(if_not_exists(bookmarks, :empty), :newBookmark), updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":empty": [],
        ":newBookmark": [bookmark],
        ":updatedAt": new Date().toISOString()
      }
    }));

    return res.status(201).json({
      message: "Recipe bookmarked successfully.",
      bookmark,
      alreadySaved: false
    });
  } catch (error) {
    getRequestLogger(req).error(
      buildErrorLogObject(error, { recipeUrl: bookmark.recipeUrl }),
      "Save bookmark failed"
    );
    return res.status(500).json({
      message: "Unable to save bookmark right now."
    });
  }
});

app.delete("/api/bookmarks", verifyToken, async (req, res) => {
  const userId = req.user?.sub;
  const email = req.user?.email;
  const recipeUrl = String(req.body?.recipeUrl ?? req.query?.recipeUrl ?? "").trim();

  if (!userId) {
    return res.status(401).json({
      message: "Invalid token payload: missing user identifier."
    });
  }

  if (!recipeUrl) {
    return res.status(400).json({
      message: "recipeUrl is required to remove a bookmark."
    });
  }

  try {
    await ensureUserExists(userId, email);

    const bookmarks = await getUserBookmarks(userId);
    const filteredBookmarks = bookmarks.filter((bookmark) => getBookmarkUrl(bookmark) !== recipeUrl);

    if (filteredBookmarks.length === bookmarks.length) {
      return res.status(404).json({
        message: "Bookmark not found."
      });
    }

    await dynamoDb.send(new UpdateCommand({
      TableName: USERS_TABLE_NAME,
      Key: { userId },
      UpdateExpression: "SET bookmarks = :bookmarks, updatedAt = :updatedAt",
      ExpressionAttributeValues: {
        ":bookmarks": filteredBookmarks,
        ":updatedAt": new Date().toISOString()
      }
    }));

    return res.json({
      message: "Recipe removed from bookmarks.",
      count: filteredBookmarks.length
    });
  } catch (error) {
    getRequestLogger(req).error(buildErrorLogObject(error, { recipeUrl }), "Delete bookmark failed");
    return res.status(500).json({
      message: "Unable to remove bookmark right now."
    });
  }
});

const server = app.listen(PORT, () => {
  logger.info({ port: PORT, allowedOrigins }, "Backend running");
});

server.on("error", (error) => {
  logger.fatal(buildErrorLogObject(error, { port: PORT }), "Backend failed to start");
});
