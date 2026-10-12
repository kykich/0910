# Развёртывание на VPS (приватный AI-сервис)

Пошаговая инструкция для запуска публичного веб-чата с **локальной** LLM на
VPS (Ubuntu 25.10, 2 vCPU / 4 ГБ, без GPU). Полное ТЗ — в
[`docs/vps-llm-service.md`](../docs/vps-llm-service.md).

## Архитектура

```
Интернет ──▶ nginx :80 (публичный порт)         ← единственный внешний порт
                 │  proxy_pass + X-Forwarded-For
                 ▼
            rtk-web :127.0.0.1:8000  (app-сервис, Python)
                 │  HTTP (OpenAI-совместимый API, Bearer)
                 ▼
            llama-server :127.0.0.1:8080  (движок, .gguf, CPU-only)
```

- Наружу открыты **только 22 (SSH) и 80 (nginx)**.
- Порт движка (`8080`) и app (`8000`) — только loopback (см. §9 ТЗ).

## Что уже реализовано в коде

| Возможность | Где | Пункт ТЗ |
|---|---|---|
| Лимит активных сессий = 2 + заглушка 503 | `web/session_manager.py`, `web/server.py` | §5.1, §5.3 |
| Сессия на клиента (cookie `sid`, изоляция) | `web/session_manager.py` | §5.2 |
| Автомат `ACTIVE→CHECK→OFFLINE`, фоновая очистка | `web/session_manager.py` | §5.1, §5.3 |
| `/api/heartbeat`, `/api/health` | `web/server.py` | §5.4, §8.2 |
| Клиентский сторож (диалог «Вы здесь?», read-only) | `js/features/sessionGuard.js` | §5.4, §5.5 |
| Rate limit по IP (token bucket, 429) | `web/rate_limit.py`, `web/server.py` | §7.4 |
| ENV-конфиг, loopback, флаг «без ключей» | `rtk_app/config.py`, `rtk_web.py` | §6.2 |

## Установка (кратко)

```bash
# 1. Подготовка кода и модели
sudo mkdir -p /opt/rtk && cd /opt/rtk
sudo git clone <РЕПОЗИТОРИЙ> .
sudo mkdir -p /opt/models
# положите модель .gguf (напр. Qwen2.5-3B-Instruct Q4_K_M) в /opt/models/

# 2. Движок llama.cpp (prebuilt или из исходников) — бинарник в /usr/local/bin
#    https://github.com/ggml-org/llama.cpp (сборка CPU-only, AVX2)

# 3. Установка
sudo bash deploy/install.sh

# 4. Включение сервисов
sudo systemctl enable --now llama-server.service
sudo systemctl enable --now rtk-web.service
sudo systemctl restart nginx
```

## Проверка

```bash
# Сервисы живы?
systemctl status llama-server rtk-web nginx

# Здоровье app + счётчик сессий
curl -s http://127.0.0.1:8000/api/health

# Внешний доступ (с другой машины) — страница чата должна открыться
curl -s http://<IP>/ | head
```

## Конфигурация (ENV)

| Переменная | По умолчанию | Смысл |
|---|---|---|
| `RTK_HOST` | `127.0.0.1` | адрес app (loopback за nginx) |
| `RTK_PORT` | `8000` | порт app |
| `RTK_BEHIND_PROXY` | `0` | доверять `X-Forwarded-For` (за nginx = 1) |
| `RTK_MAX_SESSIONS` | `2` | лимит активных сессий (0 = выключить) |
| `RTK_IDLE_TIMEOUT` | `300` | секунд тишины → `CHECK` |
| `RTK_CHECK_TIMEOUT` | `60` | секунд без ответа → `OFFLINE` |
| `RTK_RATE_LIMIT_PER_MIN` | `10` | запросов/мин на IP (0 = выключить) |
| `RTK_SKIP_KEY_CHECK` | `0` | не проверять ключи облачных моделей |
| `RTK_CHECK_NETWORK` | `1` | сетевые проверки при самодиагностике |

## Эксплуатация

```bash
# Обновление кода
cd /opt/rtk && sudo git pull
sudo systemctl restart rtk-web

# Логи
journalctl -u rtk-web -f
journalctl -u llama-server -f

# Память под нагрузкой (должно быть < 4 ГБ)
free -h
```

## Чек-лист приёмки

Полный список — §11 ТЗ. Ключевое:

1. С внешней машины открывается страница чата.
2. Две сессии работают независимо; третья получает заглушку «нет свободной
   сессии».
3. После 5 мин тишины — диалог «Вы здесь?»; после 1 мин без ответа сессия
   завершается, слот освобождается.
4. При завершении история видна, ввод заблокирован.
5. `8080` и `8000` недоступны извне.
