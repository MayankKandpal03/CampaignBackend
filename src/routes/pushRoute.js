// src/routes/pushRoute.js
//
// CHANGES:
//  - saveSubscription() now receives req.user.role so the push service
//    can target notifications by role (IT vs PM).

import { Router } from "express";
import verifyJWT from "../middlewares/authMiddleware.js";
import { asyncWrap } from "../utils/errorHandler.js";
import {
  saveSubscription,
  removeSubscription,
  getVapidPublicKey,
} from "../services/pushService.js";

const router = Router();

/**
 * GET /api/v1/push/vapid-public-key
 * Returns the VAPID public key so the frontend can call pushManager.subscribe().
 * Public — no auth needed.
 */
router.get("/vapid-public-key", (req, res) => {
  const key = getVapidPublicKey();
  if (!key) {
    return res.status(503).json({ message: "Push notifications not configured" });
  }
  res.json({ key });
});

/**
 * POST /api/v1/push/subscribe
 * Frontend calls this after pushManager.subscribe() succeeds.
 * Stores the PushSubscription linked to the authenticated user + their role.
 */
router.post(
  "/subscribe",
  verifyJWT,
  asyncWrap(async (req, res) => {
    const { subscription } = req.body;
    if (!subscription) {
      return res.status(400).json({ message: "No subscription provided" });
    }
    // Pass role so sendPushToRole() can filter by it
    saveSubscription(req.user._id, subscription, req.user.role);
    res.status(200).json({ success: true, message: "Subscribed to push notifications" });
  })
);

/**
 * POST /api/v1/push/unsubscribe
 * Frontend calls this on logout to clean up.
 */
router.post(
  "/unsubscribe",
  verifyJWT,
  asyncWrap(async (req, res) => {
    removeSubscription(req.user._id);
    res.status(200).json({ success: true });
  })
);

export default router;