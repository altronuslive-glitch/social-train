import { Router } from 'express';
import { generateContentPlan } from '../services/contentPlanner.js';

const router = Router();

// POST /api/content/plan
// Принимает описание бизнеса/темы, возвращает план постов на месяц
router.post('/plan', async (req, res) => {
  const { topic, audience, tone, month } = req.body;

  if (!topic) {
    return res.status(400).json({ error: 'Поле topic обязательно' });
  }

  try {
    const plan = await generateContentPlan({ topic, audience, tone, month });
    res.json({ success: true, plan });
  } catch (err) {
    console.error('Content plan error:', err.message);
    res.status(500).json({ error: 'Не удалось сгенерировать план контента' });
  }
});

export default router;
