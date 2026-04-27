// src/routes/pushRoute.js
import { Router } from 'express';
import verifyJWT  from '../middlewares/authMiddleware.js';
import { asyncWrap } from '../utils/errorHandler.js';
import { saveSubscription, removeSubscription, getVapidPublicKey } from '../services/pushService.js';

const router = Router();

// Frontend calls this to get the public VAPID key needed for subscribing
router.get('/vapid-public-key', (req, res) => {
  res.json({ key: getVapidPublicKey() });
});

// Frontend sends the PushSubscription object here after subscribing
router.post('/subscribe', verifyJWT, asyncWrap(async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ message: 'No subscription provided' });
  saveSubscription(req.user._id, subscription);
  res.status(200).json({ success: true, message: 'Subscribed to push notifications' });
}));

// Unsubscribe (call on logout)
router.post('/unsubscribe', verifyJWT, asyncWrap(async (req, res) => {
  removeSubscription(req.user._id);
  res.status(200).json({ success: true });
}));

export default router;