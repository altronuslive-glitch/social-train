/**
 * Тестирование API ключей нейросетей
 * GET /api/test-api — проверяет все три API
 */

import { Router } from 'express';
import { callClaude } from '../services/claude.js';
import { callGPT } from '../services/gpt.js';
import { callDeepSeek } from '../services/deepseek.js';

const router = Router();

router.get('/', async (req, res) => {
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      ANTHROPIC_API_KEY: !!process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: !!process.env.OPENAI_API_KEY,
      DS_API_KEY: !!process.env.DS_API_KEY,
      DEEPSEEK_API_KEY: !!process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_KEY: !!process.env.DEEPSEEK_KEY,
    },
    tests: {
      claude: { status: 'pending', error: null, response: null },
      gpt: { status: 'pending', error: null, response: null },
      deepseek: { status: 'pending', error: null, response: null },
    },
  };

  const testPrompt = 'Ответь одним словом: работает?';

  // Тест Claude
  try {
    const response = await callClaude({
      systemPrompt: 'Отвечай кратко.',
      content: [{ type: 'text', text: testPrompt }],
      maxTokens: 50,
    });
    results.tests.claude.status = 'success';
    results.tests.claude.response = response.trim();
  } catch (error) {
    results.tests.claude.status = 'error';
    results.tests.claude.error = error.message;
  }

  // Тест GPT
  try {
    const response = await callGPT({
      systemPrompt: 'Отвечай кратко.',
      userPrompt: testPrompt,
      maxTokens: 50,
    });
    results.tests.gpt.status = 'success';
    results.tests.gpt.response = response.trim();
  } catch (error) {
    results.tests.gpt.status = 'error';
    results.tests.gpt.error = error.message;
  }

  // Тест DeepSeek
  try {
    const response = await callDeepSeek({
      systemPrompt: 'Отвечай кратко.',
      userPrompt: testPrompt,
      maxTokens: 50,
      reasoningEffort: 'low', // это просто ping — рассуждать тут не над чем
    });
    results.tests.deepseek.status = 'success';
    results.tests.deepseek.response = response.trim();
  } catch (error) {
    results.tests.deepseek.status = 'error';
    results.tests.deepseek.error = error.message;
  }

  // Итоговый статус
  const allSuccess = Object.values(results.tests).every(t => t.status === 'success');
  results.overall = allSuccess ? 'all_working' : 'some_failed';

  res.json(results);
});

export default router;
