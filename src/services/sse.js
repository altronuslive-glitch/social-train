/**
 * Server-Sent Events — потоковая отправка прогресса в браузер.
 *
 * Зачем это нужно: анализ канала занимает около шести минут, генерация
 * постов — ещё дольше. Обычный HTTP-запрос такой длины шлюз Railway обрывает
 * с ошибкой 502, хотя сервер продолжает работать и доводит дело до конца —
 * пользователь просто не получает ответа.
 *
 * Поток данных держит соединение живым. Между редкими этапами работы
 * отправляется «сердцебиение» — иначе соединение всё равно сочтут простаивающим.
 */

/** Как часто слать сердцебиение, мс. */
const HEARTBEAT_MS = 15000;

/**
 * Переводит ответ в режим SSE.
 * @param {import('express').Response} res
 * @returns {{send: (data: object) => void, close: () => void}}
 */
export function openStream(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  // Отключаем буферизацию у промежуточных прокси — иначе они копят ответ
  res.setHeader('X-Accel-Buffering', 'no');

  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    // Строка-комментарий: браузер её игнорирует, но байты идут по проводу
    res.write(': ping\n\n');
  }, HEARTBEAT_MS);

  let closed = false;

  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat);
    res.end();
  };

  // Если пользователь закрыл вкладку, таймер надо погасить
  res.on('close', () => {
    closed = true;
    clearInterval(heartbeat);
  });

  return {
    send(data) {
      if (closed) return;
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    close,
  };
}
