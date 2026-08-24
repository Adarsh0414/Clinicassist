import { Router } from "express";
import jwt from "jsonwebtoken";
import { authenticate } from "../middleware/auth";
import { env } from "../config/env";
import { exchangeCodeForTokens, getAuthUrl } from "../services/calendarService";
import { prisma } from "../config/db";
import { AppError } from "../utils/errors";

export const calendarRouter = Router();

/** Kicks off the OAuth flow. The frontend redirects the browser to this URL's response.authUrl. */
calendarRouter.get("/connect", authenticate, async (req, res) => {
  if (!env.googleClientId || !env.googleClientSecret) {
    throw new AppError(
      "Google Calendar isn't configured on this server yet. Set GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env.",
      501
    );
  }
  // Short-lived state token carries the user id through the redirect so the callback knows who to attach it to.
  const state = jwt.sign({ userId: req.auth!.userId }, env.jwtSecret, { expiresIn: "10m" });
  res.json({ authUrl: getAuthUrl(state) });
});

/** Google redirects here after the user grants consent. */
calendarRouter.get("/oauth/callback", async (req, res) => {
  const { code, state } = req.query;
  if (typeof code !== "string" || typeof state !== "string") {
    return res.status(400).send("Missing code/state from Google's redirect.");
  }

  let userId: string;
  try {
    const payload = jwt.verify(state, env.jwtSecret) as { userId: string };
    userId = payload.userId;
  } catch {
    return res.status(400).send("This connection link expired. Please try connecting Google Calendar again.");
  }

  const tokens = await exchangeCodeForTokens(code);
  if (!tokens.refresh_token) {
    return res
      .status(400)
      .send("Google did not return a refresh token. Revoke prior access at myaccount.google.com/permissions and try again.");
  }

  await prisma.googleCredential.upsert({
    where: { userId },
    update: { refreshToken: tokens.refresh_token },
    create: { userId, refreshToken: tokens.refresh_token },
  });

  res.redirect(`${env.clientUrl}/calendar-connected`);
});

calendarRouter.get("/status", authenticate, async (req, res) => {
  const cred = await prisma.googleCredential.findUnique({ where: { userId: req.auth!.userId } });
  res.json({ connected: !!cred });
});

calendarRouter.delete("/disconnect", authenticate, async (req, res) => {
  await prisma.googleCredential.deleteMany({ where: { userId: req.auth!.userId } });
  res.status(204).send();
});
