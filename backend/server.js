import express, { json } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import axios from "axios";
import { GetCommand, PutCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { dynamoDb, USERS_TABLE_NAME } from "./db.js";

const app = express();
const PORT = 3000;
const region = "us-west-2";
const userPoolId = "us-west-2_CaC4wWgAg";
const mealDbBaseUrl = "https://www.themealdb.com/api/json/v1/1";

let pems = {};

app.use(cors());
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

await getPems();

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
  const recipeUrl = String(payload?.recipeUrl ?? payload?.sourceUrl ?? "").trim();

  if (!recipeUrl) {
    return null;
  }

  return {
    recipeUrl,
    savedAt: new Date().toISOString()
  };
}

async function getUserBookmarks(userId) {
  const response = await dynamoDb.send(new GetCommand({
    TableName: USERS_TABLE_NAME,
    Key: { userId },
    ProjectionExpression: "bookmarks"
  }));

  return Array.isArray(response.Item?.bookmarks) ? response.Item.bookmarks : [];
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
      console.error("ThemealDB request failed:", error.message);
      return res.status(502).json({
        message: "Unable to fetch recipes from ThemealDB right now."
      });
    }

    console.error("Search route failed:", error.message);
    return res.status(500).json({
      message: "Unable to process search request right now."
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
    console.error("Get bookmarks failed:", error.message);
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
    console.error("Save bookmark failed:", error.message);
    return res.status(500).json({
      message: "Unable to save bookmark right now."
    });
  }
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});
