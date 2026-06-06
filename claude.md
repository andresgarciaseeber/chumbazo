# CHUMBAZO LIVE — Plan de Desarrollo
## Sala de transmisión en vivo con chat e interacción social · Mundial 2026

---

## 1. Visión general

Una sala de transmisión en vivo embebida en un entorno web propio, con chat en tiempo real, autenticación social (Meta / Google), interacción con redes y features especiales para el contexto del Mundial. El stack es Node.js + Socket.IO en backend, y puede convivir con el WordPress existente o correr de forma completamente independiente.

---

## 2. Stack tecnológico

### Backend
| Componente | Tecnología |
|---|---|
| Servidor principal | Node.js + Express |
| WebSockets (chat RT) | Socket.IO |
| Autenticación OAuth | Passport.js (Google + Facebook/Meta) |
| Sesiones / tokens | express-session + JWT |
| Base de datos | SQLite (dev) → MySQL/MariaDB (producción, reutiliza el de WP) |
| ORM | Sequelize o Knex.js |

### Frontend
| Componente | Tecnología |
|---|---|
| UI base | HTML/CSS/JS vanilla o lightweight framework (Alpine.js) |
| Chat en tiempo real | Socket.IO client |
| Embed del stream | HLS.js o iframe (YouTube Live / propio) |
| Autenticación social | OAuth flows desde Node |

### Infraestructura
- Node corre en puerto dedicado (ej: `3000` o `3030`)
- Nginx como reverse proxy: `/live` → Node, resto → WordPress
- PM2 para gestionar el proceso Node en producción

---

## 3. Arquitectura de módulos

```
chumbazo-live/
├── server/
│   ├── index.js              # Entry point Express + Socket.IO
│   ├── auth/
│   │   ├── passport.js       # Estrategias OAuth (Google, Meta)
│   │   └── routes.js         # /auth/google, /auth/facebook, /auth/logout
│   ├── chat/
│   │   ├── socket.js         # Lógica de salas y eventos WS
│   │   └── moderation.js     # Filtros, ban, slow mode
│   ├── social/
│   │   └── feed.js           # Integración redes (lectura de menciones/hashtags)
│   ├── db/
│   │   ├── models.js         # User, Message, Reaction
│   │   └── migrations/
│   └── config/
│       └── env.js            # Variables de entorno
├── public/
│   ├── index.html            # Shell de la sala de transmisión
│   ├── css/
│   │   └── main.css
│   └── js/
│       ├── chat.js           # Cliente Socket.IO
│       ├── auth.js           # Manejo de sesión en frontend
│       └── interactions.js   # Polls, reacciones, etc.
├── .env.example
├── package.json
└── README.md
```

---

## 4. Features del producto

### 4.1 Player de transmisión
- Embed HLS (para streams propios con OBS → servidor RTMP/HLS) o iframe (YouTube Live, Twitch)
- Soporte para cambiar la fuente del stream desde un panel admin mínimo
- Overlay de datos del partido en tiempo real (integración futura con API de resultados)

### 4.2 Chat en tiempo real
- Mensajes públicos vía Socket.IO
- Diferenciación visual: usuarios anónimos vs registrados (con avatar de Google/Meta)
- Emojis de fútbol predefinidos (shortcuts rápidos: ⚽ 🥅 🚩 🔥)
- **Slow mode**: limitador de mensajes por usuario (ej: 1 msg cada 5 seg)
- **Salas múltiples**: una por partido o por canal de transmisión
- Persistencia de mensajes recientes (últimos N mensajes al conectarse)

### 4.3 Autenticación social
- **Google OAuth 2.0**: login con cuenta Gmail, obtiene nombre + avatar
- **Meta (Facebook) OAuth**: login con Facebook, obtiene nombre + avatar
- Usuarios no registrados pueden ver pero no chatear (o chatear como "Anónimo")
- Datos mínimos almacenados: `provider_id`, `display_name`, `avatar_url`, `provider`

### 4.4 Interacciones especiales (Mundial)
- **Reacciones en vivo**: botones de reacción (⚽ GOL / 🚩 ROJO / 😱 / 🎉) que disparan animaciones globales en pantalla para todos los usuarios conectados
- **Poll en vivo**: "¿Quién gana?" con votos en tiempo real y barra visual actualizada
- **Predictor de resultado**: antes del partido, los usuarios registrados dejan su pronóstico; al terminar se muestra el ranking
- **Feed de Twitter/X o Instagram**: panel lateral con tweets/posts de un hashtag del programa (lectura vía API o embed oficial)
- **Contador de espectadores**: número de conexiones activas en tiempo real

### 4.5 Moderación
- Lista de palabras bloqueadas configurable
- Comando `/ban [usuario]` para el operador
- Timeout automático por spam
- Panel admin minimalista en ruta protegida (`/admin`)

---

## 5. Integración con WordPress existente

Dos opciones:

**Opción A — Coexistencia (recomendada)**
- Node corre en `:3000`, WordPress en `:80`/`:443` via Nginx
- Nginx redirige `/live` al servidor Node
- El chat se puede embeber en una página de WP con un `<iframe>` apuntando al Node
- Comparten la base MySQL si se desea (Sequelize conecta al mismo server)

**Opción B — Standalone**
- Node sirve todo el frontend de la sala de transmisión de forma independiente
- WordPress queda para el sitio editorial, noticias, etc.
- El link al live se publica desde WP y apunta al dominio/subdominio del Node

---

## 6. Variables de entorno (.env)

```env
PORT=3000
SESSION_SECRET=...
DB_HOST=localhost
DB_NAME=chumbazo_live
DB_USER=...
DB_PASS=...

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_CALLBACK_URL=https://tudominio.com/auth/google/callback

# Meta (Facebook) OAuth
FACEBOOK_APP_ID=...
FACEBOOK_APP_SECRET=...
FACEBOOK_CALLBACK_URL=https://tudominio.com/auth/facebook/callback

# Stream
STREAM_URL=https://...   # URL del HLS o embed
```

---

## 7. Roadmap de desarrollo

### Fase 1 — Fundación (1-2 días)
- [ ] Setup del proyecto Node + Express
- [ ] Socket.IO: sala básica de chat, mensajes en tiempo real
- [ ] Frontend HTML/CSS: layout de sala (player + chat lateral)
- [ ] Persistencia básica de mensajes (SQLite o JSON en dev)

### Fase 2 — Autenticación (1-2 días)
- [ ] Passport.js con estrategia Google
- [ ] Passport.js con estrategia Facebook/Meta
- [ ] Flujo de login/logout
- [ ] Perfil básico de usuario en el chat (avatar + nombre)

### Fase 3 — Interacciones (2-3 días)
- [ ] Reacciones en vivo (broadcast a todos los sockets)
- [ ] Polls en tiempo real
- [ ] Contador de espectadores
- [ ] Slow mode y moderación básica

### Fase 4 — Features Mundial (2-3 días)
- [ ] Predictor de resultado
- [ ] Feed de hashtag (Twitter embed o API)
- [ ] Overlay de marcador (manual o via API de resultados)
- [ ] Panel admin mínimo

### Fase 5 — Producción (1-2 días)
- [ ] Configuración Nginx reverse proxy
- [ ] PM2 + scripts de deploy
- [ ] HTTPS / SSL
- [ ] Testing de carga básico

---

## 8. APIs externas relevantes

| Servicio | Uso | Notas |
|---|---|---|
| Google Identity | OAuth login | Requiere proyecto en Google Cloud Console |
| Meta for Developers | OAuth login | Requiere app aprobada (puede tardar) |
| Twitter/X API v2 | Feed de hashtag | Tier gratuito muy limitado; considerar embed oficial |
| API-Football / football-data.org | Resultados en vivo | Plan gratuito disponible |
| Cloudflare Stream / Mux | Streaming propio | Alternativa a OBS → YouTube |

---

## 9. Consideraciones de seguridad

- Rate limiting en endpoints de auth y en el socket (socket.io-rate-limiter)
- Sanitización de mensajes (no HTML raw en el chat)
- CSRF protection en rutas de autenticación
- No exponer credenciales OAuth en el frontend
- Revisar políticas de uso de Meta OAuth (puede requerir revisión de app para ir a producción)

---

## 10. Próximos pasos concretos

1. **Confirmar infraestructura**: ¿el servidor de producción es el mismo donde corre WP? ¿Linux/Ubuntu? ¿Acceso root o con sudo?
2. **Definir fuente del stream**: ¿YouTube Live, propio con OBS, Twitch?
3. **Crear apps OAuth**: Google Cloud Console + Meta for Developers (esto puede tomar tiempo de aprobación)
4. **Iniciar con Claude Code**: `npm init` → estructura base → Fase 1

---

*Documento generado para el proyecto Chumbazo Live — Mundial 2026*