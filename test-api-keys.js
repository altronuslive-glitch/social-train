/**
 * Тестирование API ключей нейросетей
 * Проверяет работоспособность Claude, GPT и DeepSeek
 */

import 'dotenv/config';
import { callClaude } from './src/services/claude.js';
import { callGPT } from './src/services/gpt.js';
import { callDeepSeek } from './src/services/deepseek.js';

console.log('🔍 Проверка API ключей нейросетей...\n');

// Проверка наличия ключей в окружении
console.log('📋 Проверка переменных окружения:');
console.log('ANTHROPIC_API_KEY:', process.env.ANTHROPIC_API_KEY ? '✅ установлен' : '❌ не найден');
console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? '✅ установлен' : '❌ не найден');
console.log('DS_API_KEY:', process.env.DS_API_KEY ? '✅ установлен' : '❌ не найден');
console.log('');

// Тестовый промпт
const testPrompt = 'Ответь одним словом: какой сейчас год?';

// Тест Claude
async function testClaude() {
  try {
    console.log('🤖 Тестирование Claude API...');
    const response = await callClaude({
      systemPrompt: 'Ты помощник. Отвечай кратко.',
      content: [{ type: 'text', text: testPrompt }],
      maxTokens: 100,
    });
    console.log('✅ Claude работает! Ответ:', response.trim());
    return true;
  } catch (error) {
    console.error('❌ Claude ошибка:', error.message);
    return false;
  }
}

// Тест GPT
async function testGPT() {
  try {
    console.log('\n🤖 Тестирование GPT API...');
    const response = await callGPT({
      systemPrompt: 'Ты помощник. Отвечай кратко.',
      userPrompt: testPrompt,
      maxTokens: 100,
    });
    console.log('✅ GPT работает! Ответ:', response.trim());
    return true;
  } catch (error) {
    console.error('❌ GPT ошибка:', error.message);
    return false;
  }
}

// Тест DeepSeek
async function testDeepSeek() {
  try {
    console.log('\n🤖 Тестирование DeepSeek API...');
    const response = await callDeepSeek({
      systemPrompt: 'Ты помощник. Отвечай кратко.',
      userPrompt: testPrompt,
      maxTokens: 100,
    });
    console.log('✅ DeepSeek работает! Ответ:', response.trim());
    return true;
  } catch (error) {
    console.error('❌ DeepSeek ошибка:', error.message);
    return false;
  }
}

// Запуск всех тестов
async function runTests() {
  const results = {
    claude: await testClaude(),
    gpt: await testGPT(),
    deepseek: await testDeepSeek(),
  };

  console.log('\n' + '='.repeat(50));
  console.log('📊 Итоги проверки:');
  console.log('Claude:', results.claude ? '✅ работает' : '❌ не работает');
  console.log('GPT:', results.gpt ? '✅ работает' : '❌ не работает');
  console.log('DeepSeek:', results.deepseek ? '✅ работает' : '❌ не работает');

  const allWorking = results.claude && results.gpt && results.deepseek;
  console.log('\n' + (allWorking ? '🎉 Все API ключи работают!' : '⚠️ Некоторые API ключи не работают'));
  console.log('='.repeat(50));
}

runTests().catch(console.error);
