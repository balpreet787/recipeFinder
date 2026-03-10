import express, { json } from "express";
import cors from "cors";

const app = express();
const PORT = 3000;

app.use(cors());
app.use(json());

app.get("/api/message", (req, res) => {
  res.json({ message: "Hello from Node backend!" });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});