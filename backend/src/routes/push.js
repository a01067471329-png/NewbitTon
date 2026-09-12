const express = require('express');
const store = require('../lib/store');

const router = express.Router();

// POST /api/push/subscribe
router.post('/subscribe', (req, res) => {
  const { subscription, selectedRoute } = req.body || {};

  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: 'subscription 정보가 필요합니다.' });
  }
  if (!selectedRoute || !selectedRoute.departureDeadline) {
    return res.status(400).json({ error: 'selectedRoute.departureDeadline 이 필요합니다.' });
  }

  const record = store.createSubscription({ subscription, selectedRoute });
  res.status(201).json({ id: record.id });
});

// DELETE /api/push/subscribe/:id
router.delete('/subscribe/:id', (req, res) => {
  const removed = store.deleteSubscription(req.params.id);
  if (!removed) {
    return res.status(404).json({ error: '해당 구독을 찾을 수 없습니다.' });
  }
  res.status(204).end();
});

module.exports = router;
