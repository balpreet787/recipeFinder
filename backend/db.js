import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, ".env") });

const region = process.env.AWS_REGION || "us-west-2";
const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
const sessionToken = process.env.AWS_SESSION_TOKEN;

if ((accessKeyId && !secretAccessKey) || (!accessKeyId && secretAccessKey)) {
  throw new Error(
    "Invalid AWS credentials config. Set both AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY, or neither."
  );
}

const clientConfig = { region };

if (accessKeyId && secretAccessKey) {
  clientConfig.credentials = {
    accessKeyId,
    secretAccessKey,
    ...(sessionToken ? { sessionToken } : {})
  };
}

const ddbClient = new DynamoDBClient(clientConfig);

export const dynamoDb = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true
  }
});

export const USERS_TABLE_NAME = process.env.DDB_USERS_TABLE || "Users";
export const MEALPLAN_TABLE_NAME = process.env.DDB_MEALPLAN_TABLE || "MealPlanCache";
