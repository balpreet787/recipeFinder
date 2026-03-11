import express, { json } from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import jwkToPem from "jwk-to-pem";
import axios from "axios";

const app = express();
const PORT = 3000;
const region = "us-west-2";
const userPoolId = "us-west-2_CaC4wWgAg";

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


app.get("/api/message", verifyToken, (req, res) => {
  res.json({
    message: "Verified token successfully",
    sub: req.user.sub,
    email: req.user.email
  });
});

app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});