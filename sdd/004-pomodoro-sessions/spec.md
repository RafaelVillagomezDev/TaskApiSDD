# Feature: Sesiones pomodoro — temporizador con una lista de tareas, racha y logros propios
Rama: 004-pomodoro-sessions · Estado: Aprobada · Fecha: 2026-11-08

## Contexto y objetivo

Hoy el usuario planifica sus tareas por día (001) y ve su racha, pero no tiene forma de organizar un bloque de trabajo concentrado. Esta funcionalidad añade **sesiones pomodoro**: el usuario pone un temporizador y elige la lista de tareas que intentará hacer en ese tiempo. Al terminar, la sesión refleja qué tareas de la lista consiguió completar.

Las tareas del pomodoro son un recurso **propio e independiente** de las tareas de la 001: tienen su propia racha y sus propios logros, y no afectan a las tareas, la racha ni los avisos de la 001. Las sesiones, las tareas, la racha y los logros del pomodoro pertenecen a la cuenta del usuario de la sesión (RF-21 de la 002).

## Relación con las funcionalidades 001, 002 y 003

Esta spec **amplía** la 001 y la 002, que no se editan. Donde se contradicen, prevalece esta:

| De la 001 / 002 | Queda así |
| :--- | :--- |
| RF-21 de la 002 (operaciones limitadas a tareas, racha, avisos y cuenta del usuario de la sesión) | Ampliado: también a sus sesiones, tareas, racha y logros del pomodoro (RF-01). |
| RF-30 de la 002 (`X-Client-Time` y `X-Timezone` solo en `/tasks`, `/streak` y `/alerts`) | Ampliado: también en todas las rutas del pomodoro (RF-03), porque las tareas del pomodoro dependen del día actual del usuario. RF-31 de la 002 (recordar la zona) se aplica también en ellas. |
| RF-34 de la 002 (precedencia de errores) | Ampliado con los códigos nuevos de esta spec (RF-63). |
| Borrar la cuenta (`DELETE /me`, 002) | Ampliado: borra también sus sesiones, tareas, racha y logros del pomodoro. |
| RF-17 a RF-22 de la 001 (racha) y `GET /streak` | Sin cambios: las tareas del pomodoro no cuentan para la racha de la 001 (RF-02). |
| RF-08 a RF-10 de la 001 (`GET /tasks`) | Sin cambios: las tareas del pomodoro no aparecen en las consultas de tareas de la 001 (RF-02). |
| RF-24 a RF-30 de la 001 (avisos) | Sin cambios: el pomodoro no genera avisos y `GET /alerts` no cambia (RF-02). |

La 003 no cambia.

## Historias de usuario (con prioridad y prueba independiente)

### HU-01 — Empezar una sesión pomodoro con una lista de tareas (P1)
Como usuario, quiero poner un temporizador y elegir las tareas del pomodoro que intentaré hacer en ese tiempo, para trabajar concentrado en un bloque.
- **Por qué P1:** es el núcleo de la funcionalidad.
- **Prueba independiente:** empezar una sesión de 25 minutos con dos tareas nuevas para hoy y comprobar que la respuesta devuelve la duración, la hora de fin prevista y las dos tareas pendientes.
- **Escenarios:**
  - Dadas dos tareas nuevas para hoy, cuando el usuario empieza una sesión de 25 minutos con ellas, entonces la sesión queda en curso con esas tareas y su hora de fin prevista.
  - Dada una sesión activa, cuando el usuario intenta empezar otra, entonces se rechaza con `POMODORO_ALREADY_ACTIVE`.
  - Dada una duración de 0, 121 o 25,5 minutos, cuando el usuario empieza una sesión, entonces se rechaza con un error de validación.
  - Dada una petición sin duración, cuando el usuario empieza una sesión, entonces la sesión dura 25 minutos.
  - Dada una tarea del pomodoro de otro usuario o inexistente en la lista, cuando el usuario empieza una sesión, entonces se rechaza con `POMODORO_TASK_NOT_FOUND`.
- **RF:** RF-01, RF-03, RF-08 a RF-12, RF-49, RF-55, RF-56.

### HU-02 — Crear las tareas al empezar la sesión (P1)
Como usuario, quiero escribir las tareas del pomodoro al empezar la sesión, con fecha de hoy o de un día futuro, para no tener que prepararlas aparte.
- **Por qué P1:** sin tareas no hay lista en la sesión.
- **Prueba independiente:** empezar una sesión con una tarea para hoy y otra para dentro de un mes; la sesión se crea con ambas. Empezar una sesión con una tarea para ayer responde `DAY_CLOSED`.
- **Escenarios:**
  - Dado el día actual, cuando el usuario empieza una sesión con tareas para hoy o días futuros, entonces se crean pendientes dentro de la sesión.
  - Dado un día anterior al actual en alguna tarea, cuando el usuario empieza la sesión, entonces se rechaza con `DAY_CLOSED` y no se crea nada.
  - Dada una tarea del pomodoro, cuando el usuario consulta `GET /tasks` o `GET /streak`, entonces no aparece ni cuenta.
- **RF:** RF-02, RF-04 a RF-07, RF-52, RF-53.

### HU-03 — Completar tareas durante la sesión (P1)
Como usuario, quiero marcar como hechas las tareas de la lista mientras corre el temporizador, para saber cuánto he avanzado.
- **Por qué P1:** sin esto, la sesión es solo un temporizador.
- **Prueba independiente:** con una sesión activa, completar una de sus tareas y comprobar que la sesión la muestra completada.
- **Escenarios:**
  - Dada una tarea de una sesión en curso o pausada, cuando el usuario la completa, entonces queda completada con el instante en que se completó.
  - Dada una tarea completada de una sesión activa, cuando el usuario la desmarca, entonces vuelve a estar pendiente.
  - Dada una tarea con fecha de la semana que viene en la sesión de hoy, cuando el usuario la completa, entonces queda completada.
  - Dada una tarea en espera, cuando el usuario intenta completarla, entonces se rechaza con `POMODORO_TASK_NOT_IN_SESSION`.
  - Dada una tarea completada de una sesión terminada, cuando el usuario intenta desmarcarla, entonces se rechaza con `INVALID_POMODORO_STATE`.
- **RF:** RF-13, RF-35 a RF-37, RF-57.

### HU-04 — Listar mis sesiones pomodoro (P1)
Como usuario, quiero ver todas mis sesiones, activas y pasadas, para saber cuánto tiempo de concentración llevo.
- **Por qué P1:** cada usuario tiene varias sesiones a lo largo del tiempo y necesita consultarlas (decisión del responsable del proyecto).
- **Prueba independiente:** con tres sesiones terminadas, la consulta las devuelve paginadas de la más reciente a la más antigua.
- **Escenarios:**
  - Dadas tres sesiones del usuario, cuando las consulta, entonces recibe las tres con su estado, de la más reciente a la más antigua.
  - Dadas sesiones de otro usuario, cuando el usuario consulta las suyas, entonces no aparecen.
- **RF:** RF-17, RF-18, RF-64.

### HU-05 — Pausar, reanudar y terminar la sesión y ver el resultado (P1)
Como usuario, quiero pausar la sesión si me interrumpen, reanudarla después, terminarla antes de tiempo si acabo, y que al terminar quede cerrada con el resumen de lo que hice, para comparar lo planeado con lo conseguido.
- **Por qué P1:** el resultado es lo que da valor a la sesión, y sin pausa una interrupción obliga a perder el bloque.
- **Prueba independiente:** empezar una sesión de la duración mínima, pausarla, reanudarla, esperar a que termine y consultarla: aparece terminada por tiempo, con el tiempo de concentración sin la pausa y sus tareas completadas y pendientes.
- **Escenarios:**
  - Dada una sesión en curso, cuando el usuario la pausa, entonces queda pausada con el tiempo que le quedaba y sin hora de fin prevista.
  - Dada una sesión pausada, cuando el usuario la reanuda, entonces vuelve a estar en curso y su hora de fin prevista pasa a ser el instante de reanudar más el tiempo que quedaba.
  - Dada una sesión en curso o pausada, cuando el usuario la termina, entonces queda terminada a mano y sus tareas pendientes pasan a estar en espera.
  - Dada una sesión en curso, cuando llega su hora de fin prevista, entonces queda terminada por tiempo.
  - Dada una sesión pausada, cuando el usuario intenta empezar otra, entonces se rechaza con `POMODORO_ALREADY_ACTIVE`.
  - Dada una sesión terminada, cuando el usuario intenta pausarla, reanudarla o terminarla, entonces se rechaza con `INVALID_POMODORO_STATE`.
- **RF:** RF-14 a RF-16, RF-30 a RF-34, RF-50, RF-58, RF-60, RF-61.

### HU-06 — Ver mi racha y mis logros de pomodoro (P2)
Como usuario, quiero ver una racha y unos logros calculados solo con mis tareas y sesiones del pomodoro, para motivarme a mantener la constancia.
- **Por qué P2:** motiva, pero las sesiones funcionan sin ella.
- **Prueba independiente:** terminar por tiempo una sesión de 1 minuto hoy y comprobar que `GET /pomodoro-streak` devuelve racha actual 1; terminar otra a mano y comprobar que no cambia. Sin actividad, `GET /pomodoro-achievements` devuelve los 11 logros sin conseguir; tras esa sesión, `FIRST_POMODORO` aparece conseguido con su `unlockedAt`.
- **Escenarios:**
  - Dada una sesión terminada por tiempo hoy y otra ayer, cuando el usuario consulta su racha del pomodoro, entonces la racha actual es 2.
  - Dadas sesiones terminadas por tiempo ayer y anteayer y ninguna hoy, cuando el usuario consulta su racha, entonces la racha actual es 2: hoy aún no ha terminado.
  - Dadas solo sesiones terminadas a mano hoy, cuando el usuario consulta su racha, entonces hoy no cuenta como productivo.
  - Dada cualquier sesión del pomodoro, cuando el usuario consulta `GET /streak`, entonces la racha de la 001 no cambia.
  - Dada la primera sesión terminada por tiempo, cuando el usuario consulta sus logros, entonces `FIRST_POMODORO` está conseguido con el instante de fin de esa sesión.
  - Dada una racha del pomodoro de 3 días que luego se rompe, cuando el usuario consulta sus logros, entonces `STREAK_3` sigue conseguido.
  - Dadas 7 de 10 sesiones terminadas por tiempo, cuando el usuario consulta sus logros, entonces `SESSIONS_10` aparece sin conseguir con progreso 7 de 10.
- **RF:** RF-19, RF-38 a RF-42, RF-43 a RF-47, RF-65.

### HU-07 — Pasar a otra sesión o borrar las tareas no realizadas (P1)
Como usuario, quiero decidir qué hago con las tareas que no terminé en una sesión: pasarlas a otra sesión o borrarlas, para no volver a escribirlas ni acumular tareas que ya no quiero.
- **Por qué P1:** sin esto, cada tarea no terminada se perdería o habría que reescribirla.
- **Prueba independiente:** terminar una sesión con una tarea pendiente, empezar otra incluyéndola y comprobar que aparece en la nueva con el mismo id; terminar otra sesión con una tarea pendiente, borrarla y comprobar que ya no existe.
- **Escenarios:**
  - Dada una sesión que termina con tareas pendientes, cuando el usuario consulta sus tareas en espera, entonces aparecen, aunque pasen días.
  - Dada una tarea en espera con fecha de hoy o futura, cuando el usuario empieza otra sesión incluyéndola, entonces pasa a la nueva sesión con su id y su fecha.
  - Dada una tarea en espera con fecha de ayer, cuando el usuario empieza otra sesión incluyéndola, entonces pasa a la nueva sesión con la fecha de hoy.
  - Dada una tarea en espera, cuando el usuario la borra, entonces deja de aparecer en cualquier consulta.
  - Dada una tarea en espera con una errata en el título, cuando el usuario lo corrige, entonces la tarea queda con el título nuevo y la misma fecha.
- **RF:** RF-21 a RF-29, RF-48, RF-51, RF-54, RF-59, RF-62.

## Términos

- **Sesión activa:** sesión en curso (`running`) o pausada (`paused`).
- **Tarea en espera:** tarea del pomodoro pendiente que no está en ninguna sesión activa (RF-23).
- **Día productivo de pomodoro:** día con al menos una sesión terminada por tiempo (RF-38).
- **Foto de una sesión:** copia de sus tareas tal como estaban en el instante en que terminó (RF-16).

## Requisitos funcionales (EARS, con ID RF-xx)

Los RF de esta spec se numeran desde RF-01 dentro de la funcionalidad 004. Cuando se cita un requisito de otra funcionalidad se indica («RF-21 de la 002»). Los RF-52 a RF-63 salen de separar requisitos compuestos en la revisión de EARS, RF-64 de una clarificación al planificar y RF-65 de una al implementar; los números anteriores no cambian para no romper las referencias.

### Propiedad, acceso y relación con la 001
- **RF-01** — El sistema deberá limitar cada operación sobre sesiones, tareas, racha y logros del pomodoro a los del usuario de la sesión (amplía RF-21 de la 002).
- **RF-02** — El sistema deberá mantener las tareas del pomodoro separadas de las tareas de la 001: no aparecen en sus consultas, no cuentan para su racha, ni las tareas ni las sesiones del pomodoro generan avisos, y las tareas de la 001 no se pueden incluir en una sesión pomodoro.
- **RF-03** — El sistema deberá exigir las cabeceras `X-Client-Time` y `X-Timezone` (RF-23 y RF-31 a RF-33 de la 001) en todas las rutas del pomodoro, tomar de ellas el día actual del usuario y recordar su zona como indica RF-31 de la 002.

### Tareas del pomodoro
- **RF-52** — El sistema deberá crear tareas del pomodoro solo al empezar una sesión (RF-49) o al añadirlas a una sesión activa (RF-51).
- **RF-04** — Cuando un usuario empieza una sesión o añade tareas a una sesión activa con tareas nuevas, cada una con título válido y fecha igual o posterior al día actual, sin límite hacia el futuro, el sistema deberá registrarlas como pendientes, asociadas a ese usuario, a su fecha y a esa sesión.
- **RF-05** — Si la fecha de alguna tarea nueva es anterior al día actual, entonces el sistema deberá rechazar la petición entera con el error `DAY_CLOSED`, sin crear ni añadir nada.
- **RF-06** — Si el título, la descripción o la fecha de una tarea nueva o editada no cumplen las reglas de las tareas de la 001 (título de 1 a 200 caracteres tras recortar espacios, RF-04 de la 001; descripción de hasta 1000 caracteres, RF-05 de la 001; fecha `AAAA-MM-DD` válida, RF-06 de la 001), entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-53** — El sistema deberá guardar el título y la descripción de las tareas del pomodoro sin los espacios del principio y del final, y una descripción vacía o con solo espacios como `null` (como RF-38 de la 001).
- **RF-48** — Mientras una tarea del pomodoro está en espera o en una sesión activa, cuando el usuario edita su título o su descripción, el sistema deberá actualizarlos, esté completada o no.
- **RF-54** — Si una petición de edición de una tarea del pomodoro incluye un campo distinto de `title`, `description` y `completed`, incluido `date`, entonces el sistema deberá rechazarla con el error `VALIDATION_ERROR`.
- **RF-07** — Si la tarea del pomodoro indicada no existe o pertenece a otro usuario, entonces el sistema deberá responder con el error `POMODORO_TASK_NOT_FOUND`.

### Crear una sesión
- **RF-08** — Cuando un usuario empieza una sesión pomodoro con una duración válida y una lista válida de tareas (nuevas, RF-04, o en espera, RF-21), el sistema deberá registrarla en curso, con su instante de inicio y su instante de fin previsto (inicio + duración).
- **RF-09** — El sistema deberá tomar como duración de una sesión (`durationMinutes`) un número entero de minutos entre 1 y 120, ambos incluidos, y 25 cuando no se indica.
- **RF-55** — Si la duración no es un número entero o está fuera del intervalo de 1 a 120, entonces el sistema deberá rechazar la petición con el error `VALIDATION_ERROR`.
- **RF-10** — El sistema deberá permitir empezar una sesión con entre 0 y 20 tareas.
- **RF-56** — Si la petición de empezar una sesión incluye más de 20 tareas entre las nuevas y las en espera, o una petición de empezar una sesión o de añadir tareas repite una tarea en espera, entonces el sistema deberá rechazarla con el error `VALIDATION_ERROR`.
- **RF-11** — Si alguna tarea que se quiere pasar a la sesión no existe, ya se borró, es de otro usuario o no está en espera (por ejemplo, una tarea completada de una sesión terminada), entonces el sistema deberá rechazar la petición con el error `POMODORO_TASK_NOT_FOUND`.
- **RF-12** — Si el usuario ya tiene una sesión activa, entonces el sistema deberá rechazar la petición de empezar otra con el error `POMODORO_ALREADY_ACTIVE`.

### Estados y fin de la sesión
- **RF-14** — El sistema deberá mantener cada sesión en uno de estos estados: en curso (`running`), pausada (`paused`) o terminada (`finished`).
- **RF-15** — Cuando una sesión en curso llega a su instante de fin previsto, el sistema deberá considerarla terminada por tiempo en ese instante, sin que el cliente tenga que avisar.
- **RF-16** — Cuando una sesión termina, por tiempo o a mano, el sistema deberá guardar una foto de todas sus tareas en ese instante (`id`, `title`, `description`, `date`, `completed` y `completedAt`) y devolver siempre esa foto al consultar la sesión, aunque después sus tareas pendientes pasen a otra sesión, cambien de fecha (RF-21) o se borren (RF-22), como los avisos de la 001 (RF-30 de la 001).
- **RF-58** — Mientras una sesión está activa, el sistema deberá devolver el estado actual de sus tareas al consultarla.

### Consultas
- **RF-17** — Cuando un usuario consulta una sesión por su id, el sistema deberá devolverla con su estado, sus tareas y su resultado.
- **RF-18** — Cuando un usuario consulta sus sesiones, el sistema deberá devolver todas, activas y terminadas, ordenadas de la más reciente a la más antigua y paginadas como en RF-39 y RF-42 de la 001.
- **RF-64** — El sistema deberá devolver las tareas de una sesión, activa o en su foto, en el orden en que se añadieron a ella: en una misma petición, primero las de `newTasks` y después las de `waitingTaskIds`, cada lista en el orden del cuerpo; una tarea que se quita y se vuelve a añadir pasa al final.
- **RF-19** — Cuando un usuario consulta sus logros del pomodoro, el sistema deberá devolver los 11 logros del catálogo (RF-43), en ese orden y sin paginar, cada uno con su meta, su progreso (nunca mayor que la meta), si está conseguido y el instante en que se consiguió.

### Tareas en espera
- **RF-21** — Cuando un usuario empieza una sesión o añade tareas a una sesión activa incluyendo una tarea en espera, el sistema deberá pasarla a esa sesión con su mismo id, título y descripción; conservará su fecha si es igual o posterior al día actual y, si es anterior, tomará la fecha del día actual.
- **RF-22** — Cuando un usuario borra una tarea en espera, el sistema deberá borrarla y dejar de devolverla en cualquier consulta.
- **RF-23** — Cuando una sesión termina, el sistema deberá dejar sus tareas pendientes en espera: siguen siendo del usuario, no están en ninguna sesión activa y no se borran nunca por sí solas, solo cuando el usuario las borra (RF-22).
- **RF-24** — Cuando un usuario consulta sus tareas en espera, el sistema deberá devolverlas ordenadas por fecha ascendente y, dentro de cada fecha, por orden de creación (como RF-41 de la 001), y paginadas como en RF-39 y RF-42 de la 001.

### Cambiar la lista de una sesión activa
- **RF-25** — Mientras una sesión está activa, cuando el usuario le añade tareas nuevas (RF-04) o en espera (RF-21), el sistema deberá incluirlas en la sesión.
- **RF-59** — Si al añadir tareas a una sesión activa esta pasaría de 20 tareas, entonces el sistema deberá rechazar la petición entera con el error `POMODORO_TASK_LIMIT`, sin añadir ninguna.
- **RF-26** — Mientras una sesión está activa, cuando el usuario quita de ella una tarea pendiente, el sistema deberá sacarla de la sesión y dejarla en espera, sin borrarla, aunque la sesión se quede sin tareas.
- **RF-27** — Si el usuario intenta añadir o quitar tareas de una sesión terminada, entonces el sistema deberá rechazar la petición con el error `INVALID_POMODORO_STATE`.
- **RF-28** — Si el usuario intenta quitar de una sesión una tarea que no está en ella, entonces el sistema deberá responder con el error `POMODORO_TASK_NOT_FOUND`.
- **RF-29** — Si el usuario intenta borrar una tarea que está en una sesión activa, entonces el sistema deberá rechazar la petición con el error `POMODORO_TASK_IN_SESSION`.

### Pausar, reanudar y terminar
- **RF-30** — Cuando el usuario pausa una sesión en curso, el sistema deberá detener su temporizador, guardar el tiempo que le queda y dejarla pausada sin instante de fin previsto.
- **RF-60** — Mientras una sesión está pausada, el sistema deberá mantenerla pausada, sin límite de tiempo, hasta que el usuario la reanude o la termine.
- **RF-31** — Cuando el usuario reanuda una sesión pausada, el sistema deberá dejarla en curso, con un nuevo instante de fin previsto igual al instante de reanudar más el tiempo que le quedaba.
- **RF-32** — Cuando el usuario termina una sesión en curso o pausada, el sistema deberá dejarla terminada a mano en ese instante y sus tareas pendientes en espera (RF-23).
- **RF-33** — El sistema deberá guardar en cada sesión terminada el instante en que terminó, el tiempo real de concentración (sin contar las pausas) y el motivo de fin: por tiempo (`time`, RF-15) o a mano (`manual`, RF-32).
- **RF-34** — Si el usuario intenta una acción que el estado actual de la sesión no permite (pausar una sesión que no está en curso, reanudar una que no está pausada, terminar o cambiar la lista de una sesión terminada, o completar, desmarcar, editar o borrar una tarea de una sesión terminada), entonces el sistema deberá rechazar la petición con el error `INVALID_POMODORO_STATE`.

### Completar tareas
- **RF-13** — Mientras una tarea está en una sesión activa, cuando el usuario la completa o la desmarca, el sistema deberá cambiar su estado y guardar el instante en que se completó (`completedAt`, con el reloj del sistema), o dejarlo a `null` al desmarcarla.
- **RF-57** — El sistema deberá permitir completar y desmarcar tareas del pomodoro sea cual sea su fecha, sin aplicar `DAY_NOT_STARTED` ni `DAY_CLOSED` (RF-45 y RF-14 de la 001).
- **RF-35** — Cuando una sesión termina, el sistema deberá dejar sus tareas completadas en ella como resultado, sin que se puedan desmarcar (RF-34); solo sus tareas pendientes pasan a estar en espera (RF-23).
- **RF-36** — Si el usuario intenta completar o desmarcar una tarea en espera, entonces el sistema deberá rechazar la petición con el error `POMODORO_TASK_NOT_IN_SESSION`.
- **RF-37** — Si el usuario intenta quitar de una sesión activa una tarea completada, entonces el sistema deberá rechazar la petición con el error `POMODORO_TASK_COMPLETED`.

### Racha del pomodoro
- **RF-38** — El sistema deberá considerar productivo un día de pomodoro cuando el usuario tiene al menos una sesión terminada por tiempo (`endReason: time`, RF-15) ese día; las sesiones terminadas a mano, las activas y las tareas completadas no cuentan.
- **RF-39** — El sistema deberá considerar no productivo cualquier otro día, incluidos los días sin sesiones.
- **RF-40** — El sistema deberá asignar cada sesión terminada al día local de su instante de fin (`finishedAt`), según la zona horaria recordada del usuario en ese instante (RF-34 y RF-35 de la 001).
- **RF-41** — Cuando un usuario consulta su racha del pomodoro, el sistema deberá devolver como racha actual los días productivos de pomodoro consecutivos que terminan en el día actual, o en el anterior si el día actual aún no es productivo, y como mejor racha la secuencia más larga de todo su historial, incluida la actual (mismas reglas que RF-19 a RF-21 de la 001).
- **RF-42** — El sistema deberá mantener la racha de la 001 (`GET /streak`) sin cambios por la actividad del pomodoro (RF-02).

### Logros del pomodoro
- **RF-43** — El sistema deberá ofrecer este catálogo fijo de logros:

  | Código | Nombre | Meta |
  | :--- | :--- | :--- |
  | `FIRST_POMODORO` | Primer pomodoro | 1 sesión terminada por tiempo |
  | `SESSIONS_10` | Concentrado | 10 sesiones terminadas por tiempo |
  | `SESSIONS_50` | Dedicado | 50 sesiones terminadas por tiempo |
  | `SESSIONS_100` | Maestro | 100 sesiones terminadas por tiempo |
  | `STREAK_3` | Constante | Mejor racha del pomodoro de 3 días |
  | `STREAK_7` | Imparable | Mejor racha del pomodoro de 7 días |
  | `STREAK_30` | Hábito | Mejor racha del pomodoro de 30 días |
  | `MARATHON` | Maratón | 4 sesiones terminadas por tiempo el mismo día local (RF-40) |
  | `TASKS_10` | Cumplidor | 10 tareas del pomodoro completadas |
  | `TASKS_100` | Productivo | 100 tareas del pomodoro completadas |
  | `FOCUS_10H` | Diez horas | 600 minutos (10 horas) de concentración acumulada (RF-65) |

- **RF-44** — Cuando un usuario cumple por primera vez la meta de un logro, el sistema deberá considerarlo conseguido con el instante en que se cumplió (el fin de la sesión o el momento de completar la tarea que la cumplió), y mantenerlo conseguido para siempre, aunque después el progreso baje.
- **RF-45** — El sistema deberá calcular el progreso de los logros de racha con la mejor racha del pomodoro (RF-41).
- **RF-46** — El sistema deberá calcular el progreso de los logros de tareas con las tareas del pomodoro completadas en ese momento, contando cada tarea una sola vez, aunque se complete y se desmarque varias veces.
- **RF-47** — El sistema deberá calcular la concentración acumulada como la suma del tiempo de concentración (RF-33) de todas las sesiones terminadas, por tiempo o a mano.
- **RF-65** — El sistema deberá expresar la meta y el progreso de `FOCUS_10H` en minutos enteros de concentración acumulada, redondeados hacia abajo: meta 600 y, por ejemplo, 7 h 30 min → progreso 450.

### Peticiones
- **RF-49** — Cuando un usuario empieza una sesión, el sistema deberá aceptar en `POST /pomodoros` un cuerpo con `durationMinutes`, `newTasks` y `waitingTaskIds`, todos opcionales, y responder `201` con la sesión creada.
- **RF-50** — Cuando un usuario pausa, reanuda o termina una sesión, el sistema deberá aceptarlo en `PATCH /pomodoros/{id}` con un cuerpo cuyo único campo, obligatorio, es `status` (`paused`, `running` o `finished`), y responder `200` con la sesión actualizada.
- **RF-61** — Si el `status` pedido en `PATCH /pomodoros/{id}` es el que la sesión ya tiene, entonces el sistema deberá rechazar la petición con el error `INVALID_POMODORO_STATE`.
- **RF-51** — Cuando un usuario añade tareas a una sesión activa, el sistema deberá aceptarlo en `POST /pomodoros/{id}/tasks` con `newTasks` y `waitingTaskIds`, con al menos una tarea entre las dos listas, y responder `200` con la sesión actualizada.
- **RF-62** — Cuando un usuario quita una tarea de una sesión activa, el sistema deberá aceptarlo en `DELETE /pomodoros/{id}/tasks/{taskId}` y responder `200` con la sesión actualizada.

### Errores
- **RF-20** — Si la sesión pomodoro indicada no existe o pertenece a otro usuario, entonces el sistema deberá responder con el error `POMODORO_NOT_FOUND`.
- **RF-63** — Si una petición incumple varias reglas a la vez, entonces el sistema deberá responder con el primer error según la precedencia de RF-34 de la 002, en la que los errores de esta spec entran en el grupo de errores de negocio en este orden: `POMODORO_NOT_FOUND` y `POMODORO_TASK_NOT_FOUND`; `INVALID_POMODORO_STATE`; `POMODORO_TASK_LIMIT`; `POMODORO_ALREADY_ACTIVE`, `POMODORO_TASK_IN_SESSION`, `POMODORO_TASK_NOT_IN_SESSION` y `POMODORO_TASK_COMPLETED`; y al final `DAY_CLOSED`.
  - *Ejemplo:* añadir 5 tareas a una sesión terminada que tenía 18 → `INVALID_POMODORO_STATE`. Añadir a una sesión activa con 19 tareas otras 2, una de ellas para ayer → `POMODORO_TASK_LIMIT`.

## Contrato de la API

Todas las rutas usan la cookie de sesión, `X-CSRF-Token` en `POST`/`PATCH`/`DELETE` como el resto de rutas protegidas de la 002, y `X-Client-Time` y `X-Timezone` (RF-03). Responden con los sobres de CONSTITUTION.md (principio VII): en cada endpoint solo se describe el contenido de `data` o el código de error, como en la 001. Convenciones de nombres, días, instantes e identificadores: las de la 001.

**Errores comunes a todas las rutas** (no se repiten en cada endpoint): `INVALID_CSRF_TOKEN` en `POST`/`PATCH`/`DELETE`; `MISSING_TOKEN`, `INVALID_TOKEN` y `TOKEN_EXPIRED` (002); `INVALID_CLIENT_TIME` e `INVALID_TIMEZONE` (RF-03); `VALIDATION_ERROR` con un cuerpo, parámetro o query no válido, incluido un campo desconocido en el cuerpo; e `INTERNAL_ERROR`. Si hay varios, se aplica la precedencia de RF-63.

### Resumen de endpoints

| Método | Ruta | Descripción | RF |
| :--- | :--- | :--- | :--- |
| POST | `/pomodoros` | Empezar una sesión con su duración, sus tareas nuevas y, si se quiere, tareas en espera | RF-04 a RF-12, RF-21, RF-49, RF-52, RF-53, RF-55, RF-56 |
| GET | `/pomodoros` | Listar las sesiones, activas y terminadas, paginadas | RF-18 |
| GET | `/pomodoros/{id}` | Consultar una sesión | RF-16, RF-17, RF-20, RF-58, RF-64 |
| PATCH | `/pomodoros/{id}` | Pausar, reanudar o terminar la sesión | RF-30 a RF-34, RF-50, RF-60, RF-61 |
| POST | `/pomodoros/{id}/tasks` | Añadir tareas nuevas o en espera a la sesión activa | RF-04 a RF-06, RF-21, RF-25, RF-27, RF-51, RF-56, RF-59 |
| DELETE | `/pomodoros/{id}/tasks/{taskId}` | Quitar una tarea pendiente de la sesión activa; pasa a estar en espera | RF-26 a RF-28, RF-37, RF-62 |
| GET | `/pomodoro-tasks` | Listar las tareas en espera, paginadas | RF-24 |
| PATCH | `/pomodoro-tasks/{id}` | Editar el título y la descripción de una tarea; completarla o desmarcarla en la sesión activa | RF-06, RF-07, RF-13, RF-34, RF-36, RF-48, RF-53, RF-54, RF-57 |
| DELETE | `/pomodoro-tasks/{id}` | Borrar una tarea en espera | RF-07, RF-22, RF-29 |
| GET | `/pomodoro-streak` | Racha actual y mejor racha del pomodoro | RF-38 a RF-41 |
| GET | `/pomodoro-achievements` | Los 11 logros del catálogo, con su progreso | RF-19, RF-43 a RF-47, RF-65 |

### Recurso `Pomodoro`

```json
{
  "id": "…",
  "durationMinutes": 25,
  "status": "running",
  "startedAt": "2026-11-08T09:00:00Z",
  "endsAt": "2026-11-08T09:25:00Z",
  "remainingSeconds": 1500,
  "finishedAt": null,
  "focusedSeconds": null,
  "endReason": null,
  "tasks": [ { "…": "recurso PomodoroTask" } ],
  "completedTasks": 0,
  "totalTasks": 1,
  "createdAt": "2026-11-08T09:00:00Z"
}
```

- `tasks`: estado actual mientras la sesión está activa; foto del instante de fin cuando está terminada (RF-16). En el orden en que se añadieron a la sesión (RF-64).
- `completedTasks` y `totalTasks`: resumen del resultado («3 de 5»), calculado sobre `tasks`.
- `status`: `running`, `paused` o `finished` (RF-14).
- `endsAt`: fin previsto; `null` mientras está pausada (RF-30). Se recalcula al reanudar (RF-31).
- `remainingSeconds`: tiempo que queda; fijo mientras está pausada, `0` cuando está terminada.
- `finishedAt`, `focusedSeconds` y `endReason` (`time` | `manual`): `null` hasta que termina (RF-33).

### Recurso `PomodoroTask`

```json
{
  "id": "…",
  "title": "Repasar el tema 3",
  "description": null,
  "date": "2026-11-08",
  "completed": false,
  "completedAt": null
}
```

### Recurso `Achievement`

```json
{
  "code": "SESSIONS_10",
  "name": "Concentrado",
  "description": "Termina por tiempo 10 sesiones pomodoro.",
  "target": 10,
  "progress": 7,
  "unlocked": false,
  "unlockedAt": null
}
```

- `target` y `progress`: en sesiones, días o tareas según el logro; en `FOCUS_10H`, minutos de concentración acumulada (`target: 600`, RF-65). `progress` nunca supera `target` (RF-19).

### POST `/pomodoros`

**Cuerpo** (todos los campos son opcionales; RF-49):

```json
{
  "durationMinutes": 25,
  "newTasks": [ { "title": "Repasar el tema 3", "description": null, "date": "2026-11-08" } ],
  "waitingTaskIds": ["…"]
}
```

- `durationMinutes`: entero de 1 a 120; 25 si falta (RF-09).
- `newTasks`: tareas nuevas, con las reglas de RF-04 a RF-06.
- `waitingTaskIds`: ids de tareas en espera, sin repetir (RF-10, RF-21).
- Entre las dos listas, como máximo 20 tareas (RF-10).

**Respuestas:**
- `201 Created` → `data`: el recurso `Pomodoro` en curso. Ejemplo completo con el sobre:

```json
{
  "success": true,
  "status": 201,
  "message": "Sesión pomodoro iniciada",
  "data": {
    "id": "…",
    "durationMinutes": 25,
    "status": "running",
    "startedAt": "2026-11-08T09:00:00Z",
    "endsAt": "2026-11-08T09:25:00Z",
    "remainingSeconds": 1500,
    "finishedAt": null,
    "focusedSeconds": null,
    "endReason": null,
    "tasks": [
      { "id": "…", "title": "Repasar el tema 3", "description": null, "date": "2026-11-08", "completed": false, "completedAt": null }
    ],
    "completedTasks": 0,
    "totalTasks": 1,
    "createdAt": "2026-11-08T09:00:00Z"
  }
}
```

- `404` → `POMODORO_TASK_NOT_FOUND`: algún id de `waitingTaskIds` no existe, no está en espera o es de otro usuario (RF-11).
- `409` → `POMODORO_ALREADY_ACTIVE` (RF-12) o `DAY_CLOSED` (RF-05).

### GET `/pomodoros`

**Query:** `page` y `pageSize`, como en RF-39 y RF-42 de la 001.

**Respuestas:**
- `200 OK` → `data`: objeto paginado con `items` (recursos `Pomodoro`, del más reciente al más antiguo), `page`, `pageSize`, `totalItems` y `totalPages` (RF-18).

### GET `/pomodoros/{id}`

**Respuestas:**
- `200 OK` → `data`: el recurso `Pomodoro` (RF-17).
- `404` → `POMODORO_NOT_FOUND` (RF-20).

### PATCH `/pomodoros/{id}`

**Cuerpo** (RF-50):

```json
{ "status": "paused" }
```

- `status`: `paused` pausa (RF-30), `running` reanuda (RF-31) y `finished` termina (RF-32). Es obligatorio y es el único campo permitido.

**Respuestas:**
- `200 OK` → `data`: el recurso `Pomodoro` actualizado.
- `404` → `POMODORO_NOT_FOUND` (RF-20).
- `409` → `INVALID_POMODORO_STATE`: el cambio no está permitido en el estado actual, incluido pedir el estado que ya tiene (RF-34).

### POST `/pomodoros/{id}/tasks`

**Cuerpo** (RF-51):

```json
{
  "newTasks": [ { "title": "Llamar a Marta", "description": null, "date": "2026-11-08" } ],
  "waitingTaskIds": ["…"]
}
```

- Mismas reglas que en `POST /pomodoros`; entre las dos listas, al menos una tarea (RF-51), y la sesión no puede pasar de 20 (RF-59).

**Respuestas:**
- `200 OK` → `data`: el recurso `Pomodoro` con las tareas añadidas.
- `404` → `POMODORO_NOT_FOUND` (RF-20) o `POMODORO_TASK_NOT_FOUND` (RF-11).
- `409` → `INVALID_POMODORO_STATE` si la sesión está terminada (RF-27), `POMODORO_TASK_LIMIT` si pasaría de 20 tareas (RF-59), o `DAY_CLOSED` (RF-05).

### DELETE `/pomodoros/{id}/tasks/{taskId}`

**Respuestas:**
- `200 OK` → `data`: el recurso `Pomodoro` sin esa tarea, que pasa a estar en espera (RF-26).
- `404` → `POMODORO_NOT_FOUND` (RF-20) o `POMODORO_TASK_NOT_FOUND` si la tarea no está en esa sesión (RF-28).
- `409` → `INVALID_POMODORO_STATE` si la sesión está terminada (RF-27), o `POMODORO_TASK_COMPLETED` (RF-37).

### GET `/pomodoro-tasks`

**Query:** `page` y `pageSize`, como en RF-39 y RF-42 de la 001.

**Respuestas:**
- `200 OK` → `data`: objeto paginado con `items` (recursos `PomodoroTask` en espera, por fecha ascendente y orden de creación), `page`, `pageSize`, `totalItems` y `totalPages` (RF-24).

### PATCH `/pomodoro-tasks/{id}`

**Cuerpo:**

```json
{ "title": "Repasar los temas 3 y 4", "description": null, "completed": true }
```

- `title` y `description`: editan la tarea con las reglas de RF-06 (RF-48).
- `completed`: completa o desmarca la tarea (RF-13).
- Los tres son opcionales, pero hace falta al menos uno; cualquier otro campo, incluido `date`, responde `VALIDATION_ERROR` (RF-48). Si va `completed` y la tarea está en espera, se rechaza la petición entera con `POMODORO_TASK_NOT_IN_SESSION` y no se edita nada (RF-36).

**Respuestas:**
- `200 OK` → `data`: el recurso `PomodoroTask` actualizado.
- `404` → `POMODORO_TASK_NOT_FOUND` (RF-07).
- `409` → `POMODORO_TASK_NOT_IN_SESSION` (RF-36) o `INVALID_POMODORO_STATE` si su sesión está terminada (RF-34).

### DELETE `/pomodoro-tasks/{id}`

**Respuestas:**
- `200 OK` → `data: null` (RF-22).
- `404` → `POMODORO_TASK_NOT_FOUND` (RF-07).
- `409` → `POMODORO_TASK_IN_SESSION` (RF-29) o `INVALID_POMODORO_STATE` si es una tarea completada de una sesión terminada (RF-34).

### GET `/pomodoro-streak`

**Respuestas:**
- `200 OK` → `data`: `{ "current": 3, "best": 7 }`, la misma forma que `GET /streak` de la 001 (RF-41).

### GET `/pomodoro-achievements`

**Respuestas:**
- `200 OK` → `data`: array con los 11 recursos `Achievement`, en el orden del catálogo y sin paginar (RF-19, RF-43).

### Códigos de error nuevos

| Código | HTTP | Cuándo |
| :--- | :--- | :--- |
| `POMODORO_NOT_FOUND` | 404 | La sesión no existe o es de otro usuario (RF-20) |
| `POMODORO_TASK_NOT_FOUND` | 404 | La tarea del pomodoro no existe, es de otro usuario, no está en espera al incluirla o no está en la sesión al quitarla (RF-07, RF-11, RF-28) |
| `POMODORO_ALREADY_ACTIVE` | 409 | El usuario ya tiene una sesión activa (RF-12) |
| `POMODORO_TASK_LIMIT` | 409 | Al añadir tareas, la sesión activa pasaría de 20 (RF-59) |
| `INVALID_POMODORO_STATE` | 409 | La acción no está permitida en el estado actual de la sesión: pausar si no está en curso, reanudar si no está pausada, terminar, cambiar la lista, o completar, desmarcar, editar o borrar sus tareas si ya está terminada (RF-22, RF-27, RF-34, RF-48, RF-61) |
| `POMODORO_TASK_IN_SESSION` | 409 | Se intenta borrar una tarea que está en la sesión activa (RF-29) |
| `POMODORO_TASK_NOT_IN_SESSION` | 409 | Se intenta completar o desmarcar una tarea en espera (RF-36) |
| `POMODORO_TASK_COMPLETED` | 409 | Se intenta quitar de la sesión activa una tarea completada (RF-37) |

`DAY_CLOSED` (RF-05) se reutiliza de la 001, solo al crear tareas con fecha pasada. `DAY_NOT_STARTED` no se usa en el pomodoro (RF-13).

## Requisitos no funcionales (RNF-xx, sin tecnología)

- **RNF-01** — RNF-01 de la 001 (p95 < 300 ms con un usuario de hasta 10 000 tareas) se aplica también a las rutas del pomodoro, con un usuario de hasta 10 000 tareas del pomodoro.
- **RNF-02** — El estado de una sesión (en curso, pausada o terminada), su tiempo restante y su tiempo de concentración se calculan con el reloj del sistema, no con el del dispositivo: un cliente que adelanta su reloj no puede dar una sesión por terminada antes de tiempo ni alargar sus pausas.
- **RNF-03** — RNF-03 de la 001 (mensajes en español) se mantiene.

## Casos límite

- Empezar una sesión con una tarea para ayer → `DAY_CLOSED`, y no se crea ni la sesión ni ninguna tarea (RF-05).
- Empezar una sesión con una tarea para dentro de un año → se crea (RF-04).
- Pasar a una sesión nueva una tarea pendiente ya borrada → `POMODORO_TASK_NOT_FOUND` (RF-11).
- Tarea en espera con fecha de la semana que viene → sigue en espera sin borrarse hasta que el usuario la incluya o la borre (RF-23).
- Tarea en espera con fecha de ayer incluida hoy en una sesión → pasa a la sesión con la fecha de hoy (RF-21).
- Borrar dos veces la misma tarea en espera → la segunda vez, `POMODORO_TASK_NOT_FOUND` (RF-07, RF-22).
- Añadir a la sesión activa una tarea nueva para ayer → `DAY_CLOSED` (RF-25, RF-05).
- Sesión de 1 minuto terminada por tiempo → el día es productivo de pomodoro (RF-38).
- Todas las sesiones del día terminadas a mano → el día no es productivo (RF-38).
- Sesión pausada a las 23:00 y terminada por tiempo al día siguiente → cuenta para el día siguiente (RF-40).
- Día con una sesión aún en curso → no es productivo hasta que termina por tiempo (RF-38).
- Tareas del pomodoro pendientes de hoy a las 22:00 → no se registra ningún aviso (RF-02).
- Sesión terminada con una tarea pendiente que después se borra → la sesión la sigue mostrando como pendiente (RF-16).
- Tarea pendiente en la sesión 1 y completada en la sesión 2 → aparece pendiente en la 1 y completada en la 2 (RF-16).
- Tarea de ayer que pasa a la sesión de hoy y toma la fecha de hoy → la sesión de ayer la sigue mostrando con la fecha de ayer (RF-16, RF-21).
- Borrar una tarea completada de una sesión terminada → `INVALID_POMODORO_STATE`; la sesión y el progreso de los logros no cambian (RF-22, RF-34).
- Corregir el título de una tarea en espera → `200` con el título nuevo (RF-48).
- Editar el título de una tarea completada de la sesión activa → `200`; sigue completada (RF-48).
- `PATCH /pomodoro-tasks/{id}` con `date` → `VALIDATION_ERROR` (RF-54).
- Editar una tarea completada de una sesión terminada → `INVALID_POMODORO_STATE`; la foto de la sesión no cambia (RF-16, RF-48).
- `PATCH` de una tarea en espera con `title` y `completed` → `POMODORO_TASK_NOT_IN_SESSION`, y el título no cambia (RF-36).
- Tarea en espera con fecha de hace un mes añadida a una sesión con 3 tareas → aparece la cuarta, al final (RF-64).
- Quitar una tarea de la sesión activa y volver a añadirla → pasa al final (RF-64).
- `POST /pomodoros` con 2 tareas nuevas y 1 en espera → orden: las 2 nuevas en el orden del cuerpo y después la de espera (RF-64).
- Usuario sin actividad → los 11 logros con `unlocked: false` y `progress: 0` (RF-19).
- Racha del pomodoro de 3 días que luego se rompe → `STREAK_3` sigue conseguido (RF-44, RF-45).
- 4 sesiones terminadas por tiempo a las 23:00, 23:30, 00:05 y 00:40 → no hay `MARATHON`: caen en dos días distintos (RF-40, RF-43).
- 10 tareas completadas y después una desmarcada → `TASKS_10` sigue conseguido (RF-44).
- Completar y desmarcar 10 veces la misma tarea → cuenta como 1 tarea para `TASKS_10` (RF-46).
- Empezar una sesión sin `durationMinutes` → dura 25 minutos (RF-09).
- `durationMinutes` igual a `0`, `121` o `25.5` → `VALIDATION_ERROR` (RF-09).
- `durationMinutes` igual a `1` → sesión de 1 minuto (RF-09).
- Empezar una sesión sin tareas → se crea (RF-10).
- Empezar una sesión con 21 tareas → `VALIDATION_ERROR` (RF-10).
- Con 19 tareas en la sesión, añadir 2 → `POMODORO_TASK_LIMIT`, y no se añade ninguna (RF-59).
- Añadir 5 tareas a una sesión terminada que tenía 18 → `INVALID_POMODORO_STATE` (RF-27, RF-63).
- Quitar la última tarea de la sesión → la sesión sigue activa, sin tareas (RF-26).
- Quitar una tarea de la sesión activa → aparece en `GET /pomodoro-tasks` (RF-26).
- Borrar una tarea que está en la sesión activa → `POMODORO_TASK_IN_SESSION`; tras quitarla de la sesión, se puede borrar (RF-29).
- Añadir o quitar tareas de una sesión terminada → `INVALID_POMODORO_STATE` (RF-27).
- Quitar de la sesión una tarea que no está en ella → `POMODORO_TASK_NOT_FOUND` (RF-28).
- Tarea en espera de otro usuario → no aparece en `GET /pomodoro-tasks`; borrarla o incluirla responde `POMODORO_TASK_NOT_FOUND` (RF-01, RF-07).
- Empezar una sesión con otra en curso o pausada → `POMODORO_ALREADY_ACTIVE` (RF-12).
- Sesión pausada durante días → sigue pausada; no termina sola (RF-15, RF-30).
- Pausar una sesión ya pausada o reanudar una en curso → `INVALID_POMODORO_STATE` (RF-34).
- Terminar una sesión ya terminada → `INVALID_POMODORO_STATE` (RF-34).
- Sesión de 25 minutos pausada 10 minutos a los 5 → termina por tiempo 35 minutos después de empezar, con 25 minutos de concentración (RF-31, RF-33).
- Terminar a mano a los 10 minutos una sesión de 25 → terminada `manual` con 10 minutos de concentración y sus tareas pendientes en espera (RF-32, RF-33).
- Añadir o quitar tareas de una sesión pausada → se permite (RF-25, RF-26).
- Empezar una sesión justo después del fin previsto de la anterior → se crea, porque la anterior ya está terminada (RF-15).
- Incluir una tarea de la 001 en una sesión → `POMODORO_TASK_NOT_FOUND`, porque no es una tarea del pomodoro (RF-02, RF-11).
- Completar una tarea del pomodoro → `GET /streak` y `GET /tasks` no cambian (RF-02).
- Sesión que empieza a las 23:50 y termina pasada la medianoche local → a las 00:10 se pueden seguir completando sus tareas de ayer (RF-13).
- Completar en la sesión de hoy una tarea con fecha de la semana que viene → queda completada (RF-13).
- Completar una tarea en espera → `POMODORO_TASK_NOT_IN_SESSION` (RF-36).
- Desmarcar una tarea completada de una sesión terminada → `INVALID_POMODORO_STATE` (RF-34).
- Quitar de la sesión activa una tarea completada → `POMODORO_TASK_COMPLETED`; tras desmarcarla, se puede quitar (RF-37).
- Sesión que termina con 3 tareas completadas y 2 pendientes → las 3 siguen en la sesión y las 2 aparecen en `GET /pomodoro-tasks` (RF-35).
- Borrar la cuenta con una sesión activa → la sesión, sus tareas, la racha y los logros del pomodoro se borran con la cuenta.
- Consultar una sesión cuyo fin previsto ya pasó → aparece terminada, aunque nadie la haya cerrado (RF-15).
- Sesión de otro usuario → `POMODORO_NOT_FOUND`, sin revelar que existe (RF-20).

## Fuera de alcance

- Sonido, notificaciones push o cuenta atrás en tiempo real: son cosa del frontend, que conoce `endsAt`.
- Incluir tareas de la 001 en una sesión pomodoro, o que el pomodoro cuente para la racha de la 001 (RF-02).
- Varias sesiones activas a la vez (RF-12).
- Avisos del pomodoro en `GET /alerts`, de tareas pendientes o de fin de sesión: el fin de sesión lo avisa el frontend con `endsAt` (RF-02).
- Notificaciones de logro conseguido: el frontend puede comparar los logros antes y después de una acción.
- Logros o metas definidos por el usuario (RF-43).
- Cancelar una sesión como algo distinto de terminarla: una sesión se termina a mano (RF-32), no cuenta para la racha ni para los logros de sesiones (RF-38, RF-43) y sí para la concentración acumulada (RF-47).
- Límite de duración de las pausas o fin automático de una sesión pausada (RF-30).
- Descansos (cortos o largos) y ciclos de varios pomodoros: cada sesión es un bloque independiente; el descanso es el tiempo entre una sesión y la siguiente, y si se quiere lo gestiona el frontend (RF-09).

## Criterios de éxito (CE-xx)

- **CE-01** — Un usuario puede empezar una sesión, con o sin tareas, con una sola petición.
- **CE-02** — 0 sesiones o tareas del pomodoro de un usuario visibles para otro.
- **CE-03** — 0 cambios en las respuestas de `GET /tasks`, `GET /streak` y `GET /alerts` por la actividad del pomodoro.

## Supuestos

- **S-01** — El temporizador visible (cuenta atrás, sonido) lo gestiona el frontend con `startedAt` y `endsAt`; la API solo guarda el estado y decide cuándo termina la sesión (RNF-02).

## Preguntas abiertas

Ninguna. Todas están resueltas en *Clarificaciones*.

## Clarificaciones

- **2026-11-08** — ¿Las tareas de la sesión son las tareas de la 001? → No: las tareas del pomodoro son un recurso propio, independiente de las de la 001, con su propia racha y sus propios logros; no afectan a las tareas, la racha ni los avisos de la 001 (RF-02, HU-06). Se pueden crear para hoy o cualquier día futuro; un día anterior se rechaza con `DAY_CLOSED` (RF-04, RF-05). Por eso las rutas del pomodoro exigen `X-Client-Time` y `X-Timezone` (RF-03).
- **2026-11-08** — ¿Varias sesiones por usuario? → Sí, a lo largo del tiempo, y se listan todas (HU-04 pasa a P1, RF-18); pero solo una en curso a la vez: empezar otra responde `POMODORO_ALREADY_RUNNING` (RF-12).
- **2026-11-08** — ¿Las tareas del pomodoro se crean sueltas o dentro de la sesión? (P-08) → Dentro de la sesión, al empezarla, cada una con fecha de hoy o futura; un día anterior rechaza la petición entera con `DAY_CLOSED` (RF-04, RF-05). Mismas reglas de texto que las tareas de la 001 (RF-06). Las tareas no realizadas pasan a otra sesión si el usuario lo quiere, con su mismo id y fecha; si no, se borran (RF-21, RF-22). Se descartan las tareas sueltas con su propio CRUD y la combinación de ambas.
- **2026-11-08** — Tareas no realizadas: ¿cuándo decide el usuario y qué pasa si no decide? (P-09) → Al terminar la sesión quedan en espera y nunca se borran solas (RF-23); el usuario las consulta (RF-24), las incluye en otra sesión cuando quiera (RF-21) o las borra (RF-22). Si su fecha ya pasó al incluirlas, toman la fecha del día actual (RF-21). Se descartan borrarlas al empezar la siguiente sesión (borraría las de fecha futura) y borrarlas tras un plazo (necesita un proceso en segundo plano).
- **2026-11-08** — ¿Se puede cambiar la lista de una sesión en curso? (P-10) → Sí: añadir tareas nuevas o en espera (RF-25) y quitar tareas pendientes, que pasan a estar en espera sin borrarse (RF-26); en una sesión terminada, `POMODORO_NOT_RUNNING` (RF-27). Una tarea de la sesión en curso no se borra directamente (`POMODORO_TASK_IN_SESSION`, RF-29): primero se quita y luego se borra. Se descartan «solo añadir» y la lista fija.
- **2026-11-08** — ¿Pausar, cancelar o terminar antes de tiempo? (P-04) → Pausar, reanudar y terminar a mano (RF-30 a RF-32); sin cancelar. La pausa no tiene límite y una sesión pausada cuenta como activa (RF-12, RF-14, RF-15). Cada sesión terminada guarda `finishedAt`, el tiempo de concentración sin pausas y el motivo de fin `time` o `manual` (RF-33). Los errores se renombran: `POMODORO_ALREADY_RUNNING` → `POMODORO_ALREADY_ACTIVE`, y `POMODORO_NOT_RUNNING` se sustituye por un único `INVALID_POMODORO_STATE` para cualquier acción que el estado de la sesión no permite (RF-27, RF-34). En una sesión pausada se puede cambiar la lista.
- **2026-11-08** — ¿La lista puede estar vacía? ¿Máximo de tareas? (P-01) → De 0 a 20 tareas: se puede empezar sin tareas y añadirlas después; el máximo también se aplica al añadir, y superarlo rechaza la petición entera (RF-10, RF-25). Quitar tareas puede dejar la sesión vacía (RF-26). Se descartan exigir al menos una tarea y otros máximos.
- **2026-11-08** — ¿Cuándo se completa o desmarca una tarea del pomodoro? ¿Y una con fecha futura en la sesión de hoy? (P-02, P-11) → Solo mientras está en una sesión activa (en curso o pausada), sea cual sea su fecha; se guarda `completedAt` (RF-13). `DAY_NOT_STARTED` y `DAY_CLOSED` no se aplican al completar, así que una sesión que pasa de medianoche sigue funcionando. Al terminar la sesión, las completadas se quedan en ella sin poder desmarcarse y las pendientes pasan a espera (RF-35). Completar una tarea en espera → `POMODORO_TASK_NOT_IN_SESSION` (RF-36); quitar de la sesión una completada → `POMODORO_TASK_COMPLETED` (RF-37). Ruta `PATCH /pomodoro-tasks/{id}` con `completed`. Se descartan las reglas por fecha de la 001 y completar fuera de una sesión.
- **2026-11-08** — Duración, descansos y ciclos (P-03) → Minutos enteros de 1 a 120, 25 por defecto (RF-09); sin descansos ni ciclos: cada sesión es un bloque independiente. Se descartan los descansos registrados en la API y otros límites.
- **2026-11-08** — ¿Qué hace productivo un día de pomodoro? (P-05a) → Al menos una sesión terminada por tiempo ese día (RF-38); se descartan contar tareas completadas y exigir ambas cosas. Racha actual y mejor racha con las mismas reglas que la 001 (RF-41); cada sesión cuenta para el día local de su fin en la zona recordada del usuario (RF-40); ruta `GET /pomodoro-streak`. La racha de la 001 no cambia (RF-42). Los logros quedan como P-05b.
- **2026-11-08** — ¿Cómo funcionan los logros? (P-05b) → Catálogo fijo de 11 logros (RF-43), consultables en `GET /pomodoro-achievements` con progreso (RF-19); se consiguen una vez y no se pierden (RF-44). Los de racha usan la mejor racha (RF-45); los de tareas cuentan cada tarea completada una sola vez (RF-46); la concentración suma todas las sesiones terminadas, también a mano (RF-47). Se descartan las estadísticas sin logros y las metas del usuario.
- **2026-11-08** — ¿El pomodoro genera avisos en `GET /alerts`? (P-06) → No: ni de tareas pendientes ni de fin de sesión; `GET /alerts` y el módulo de avisos no cambian (RF-02). Se descartan el aviso diario de tareas del pomodoro (cambiaría el contrato de `GET /alerts`) y el aviso de fin de sesión (el frontend ya conoce `endsAt`).
- **2026-11-08** — ¿Qué muestra una sesión terminada de sus tareas? (P-07) → Una foto del instante de fin que no cambia aunque después sus tareas pendientes se muevan, cambien de fecha o se borren (RF-16); el recurso `Pomodoro` añade `completedTasks` y `totalTasks`. Se descarta mostrar el estado actual (reescribiría el historial).
- **2026-11-08** — Cuerpo de las peticiones (QA-01) → `POST /pomodoros` con `durationMinutes`, `newTasks` y `waitingTaskIds`, todos opcionales (RF-49); el estado se cambia con `PATCH /pomodoros/{id}` y un único campo `status` (RF-50); las tareas de la sesión son un subrecurso: `POST /pomodoros/{id}/tasks` para añadir y `DELETE /pomodoros/{id}/tasks/{taskId}` para quitar (RF-51). Se descartan un `PATCH` con un campo `action` y un `PATCH` con varios cambios a la vez.
- **2026-11-08** — ¿Qué responde borrar una tarea completada de una sesión terminada? (QA-02) → No se puede: `INVALID_POMODORO_STATE` (RF-22, RF-34), porque forma parte del historial de la sesión (RF-16) y del progreso de los logros (RF-46). Solo se borran tareas en espera. Se descarta permitir borrarla.
- **2026-11-08** — ¿Se puede editar una tarea del pomodoro? (QA-03) → Título y descripción, nunca la fecha, mientras la tarea está en espera o en la sesión activa, también si está completada (RF-48); en una sesión terminada, `INVALID_POMODORO_STATE`. `PATCH /pomodoro-tasks/{id}` acepta `title`, `description` y `completed`. Se descartan editar también la fecha y no permitir ninguna edición.
- **2026-11-09** — ¿En qué unidad van `target` y `progress` de `FOCUS_10H`? (detectada al implementar la H6) → En minutos enteros de concentración, redondeados hacia abajo: `target: 600` (RF-65). Es lo bastante fino para una barra de progreso y la misma unidad que `durationMinutes`. Se descartan las horas (la barra avanzaría a saltos) y los segundos (cifras poco legibles).
- **2026-11-08** — ¿Qué forma tiene `data` en `GET /pomodoro-streak`? (detectada al implementar la H1: el contrato decía `{ currentStreak, bestStreak }` y a la vez «la misma forma que `GET /streak`», que en la 001 es `{ current, best }`) → `{ current, best }`, la misma que `GET /streak`, para que el frontend reutilice su componente de racha. Se descarta mantener `{ currentStreak, bestStreak }`.
- **2026-11-08** — ¿En qué orden van las tareas dentro de una sesión? (R-1 del plan, detectada al planificar) → En el orden en que se añadieron a la sesión; en una misma petición, primero `newTasks` y después `waitingTaskIds`, cada lista en el orden del cuerpo (RF-64). Se descarta ordenarlas por fecha y creación como las tareas en espera (una tarea traída de espera aparecería arriba aunque se añadiera la última).
- **2026-11-08** — ¿Qué responde añadir tareas a una sesión si pasaría de 20? (QA-04, detectada en la revisión de EARS y constitución) → `POMODORO_TASK_LIMIT` (`409`, RF-59), comprobado después de que la sesión exista y esté activa (RF-63): una sesión terminada responde siempre `INVALID_POMODORO_STATE`. Al empezar una sesión, más de 20 tareas en el cuerpo sigue siendo `VALIDATION_ERROR` (RF-56). Se descarta mantener `VALIDATION_ERROR` como excepción en la precedencia.

## Registro de cambios

- **2026-11-08** — Creación del borrador con 7 preguntas abiertas marcadas `[NEEDS CLARIFICATION]`. Estado → *Borrador*.
- **2026-11-08** — Clarificaciones 1 y 2: tareas del pomodoro propias con racha y logros propios, y una sola sesión en curso. Se añaden HU-02 (planificar tareas del pomodoro) y HU-06 (racha y logros), RF-02 a RF-07, RF-12, `POMODORO_TASK_NOT_FOUND` y `POMODORO_ALREADY_RUNNING`; HU-04 pasa a P1; se elimina el supuesto de que las tareas eran las de la 001; nueva pregunta P-08. Quedan 8 preguntas abiertas. Estado → *Borrador*.
- **2026-11-08** — Clarificación P-08: tareas creadas dentro de la sesión y tareas no realizadas que pasan a otra sesión o se borran. HU-02 pasa a «Crear las tareas al empezar la sesión»; se añaden HU-07, RF-21 a RF-23 y las preguntas P-09 a P-11; se concretan RF-04 a RF-06, RF-08 y RF-11. Quedan 10 preguntas abiertas (P-01 a P-07, P-09 a P-11). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-09: tareas en espera que no se borran solas y toman la fecha de hoy si la suya ya pasó. Se concretan RF-21 a RF-23 y HU-07; se añaden RF-24, `GET /pomodoro-tasks`, `DELETE /pomodoro-tasks/{id}` y cuatro casos límite. Quedan 9 preguntas abiertas (P-01 a P-07, P-10 y P-11). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-10: añadir y quitar tareas de la sesión en curso. Se añaden RF-25 a RF-29, `POMODORO_NOT_RUNNING`, `POMODORO_TASK_IN_SESSION` y seis casos límite; se actualizan RF-08, RF-20, RF-22 y el contrato. Quedan 8 preguntas abiertas (P-01 a P-07 y P-11). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-04: estados `running`, `paused` y `finished`, pausa sin límite y fin a mano. HU-05 se reescribe; se concretan RF-14 y RF-15; se añaden RF-30 a RF-34, los campos `remainingSeconds`, `finishedAt`, `focusedSeconds` y `endReason` del recurso `Pomodoro` y siete casos límite; «sesión en curso» pasa a «sesión activa» donde incluye la pausada; `POMODORO_ALREADY_RUNNING` pasa a `POMODORO_ALREADY_ACTIVE` y `POMODORO_NOT_RUNNING` a `INVALID_POMODORO_STATE`; se actualizan RNF-02, RF-20 y Fuera de alcance. Quedan 7 preguntas abiertas (P-01 a P-03, P-05 a P-07 y P-11). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-01: de 0 a 20 tareas por sesión. Se concretan RF-10, RF-25, RF-26 y CE-01; se añaden cuatro casos límite y se sustituye uno. Quedan 6 preguntas abiertas (P-02, P-03, P-05 a P-07 y P-11). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-02 y P-11: completar solo dentro de una sesión activa, sin reglas de fecha. Se concretan RF-13, RF-34 y HU-03; se añaden RF-35 a RF-37, `PATCH /pomodoro-tasks/{id}`, `completedAt`, `POMODORO_TASK_NOT_IN_SESSION`, `POMODORO_TASK_COMPLETED` y seis casos límite. Quedan 4 preguntas abiertas (P-03, P-05 a P-07). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-03: duración de 1 a 120 minutos, 25 por defecto, sin descansos. Se concretan RF-09, HU-01 y Fuera de alcance; se añaden tres casos límite. Quedan 3 preguntas abiertas (P-05 a P-07). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-05a: racha del pomodoro por sesiones terminadas por tiempo. Se añaden RF-38 a RF-42, `GET /pomodoro-streak`, escenarios de HU-06 y cuatro casos límite; RF-19 queda solo para los logros (P-05b). Quedan 3 preguntas abiertas (P-05b, P-06 y P-07). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-05b: catálogo fijo de 11 logros. Se concretan RF-19 y HU-06; se añaden RF-43 a RF-47, `GET /pomodoro-achievements`, el recurso `Achievement`, cinco casos límite y dos puntos fuera de alcance. Quedan 2 preguntas abiertas (P-06 y P-07). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-06: el pomodoro no genera avisos. Se concretan RF-02, CE-03 y la relación con la 001; se añaden un caso límite y un punto fuera de alcance. Queda 1 pregunta abierta (P-07). Estado → *Borrador*.
- **2026-11-08** — Clarificación P-07: foto de las tareas al terminar la sesión. Se concreta RF-16; se añaden `completedTasks`, `totalTasks` y tres casos límite. Sin preguntas abiertas ni marcas `[NEEDS CLARIFICATION]`; pendiente de la revisión de QA. Estado → *Borrador*.
- **2026-11-08** — Revisión de QA contra CONSTITUTION.md y AGENTS.md. Correcciones de redacción sin cambio de comportamiento: paréntesis duplicado en RF-20, punto de *Fuera de alcance* que aún remitía a P-05, fila de `INVALID_POMODORO_STATE` incompleta y HU-07 movida tras HU-06. Tres preguntas nuevas marcadas `[NEEDS CLARIFICATION]`: QA-01 (cuerpo de las peticiones, que exige el principio II para fijar el formato del JSON), QA-02 (borrar tareas completadas de sesiones terminadas) y QA-03 (editar tareas del pomodoro). Estado → *Borrador*.
- **2026-11-08** — Clarificación QA-01: cuerpo de las peticiones. Se reescribe el contrato con una sección por endpoint, errores comunes y el recurso `PomodoroTask`; se quitan las etiquetas «provisional»; se añaden RF-49 a RF-51 y las rutas `POST /pomodoros/{id}/tasks` y `DELETE /pomodoros/{id}/tasks/{taskId}`. Quedan 2 preguntas abiertas (QA-02 y QA-03). Estado → *Borrador*.
- **2026-11-08** — Clarificación QA-02: solo se borran tareas en espera. Se concretan RF-22, RF-34, `DELETE /pomodoro-tasks/{id}` y la tabla de errores; se añade un caso límite. Queda 1 pregunta abierta (QA-03). Estado → *Borrador*.
- **2026-11-08** — Clarificación QA-03: edición de título y descripción. Se concretan RF-34, RF-48, `PATCH /pomodoro-tasks/{id}` y la tabla de errores; se añaden cinco casos límite. Sin marcas `[NEEDS CLARIFICATION]` y revisión de QA superada. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-11-08** — Revisión de EARS y de cumplimiento de CONSTITUTION.md y AGENTS.md. Clarificación QA-04: `POMODORO_TASK_LIMIT` (RF-59). Correcciones sin cambio de comportamiento: 17 RF compuestos separados en RF-52 a RF-63 (sin renumerar los existentes), frases explicativas quitadas de los RF, contradicción de RF-04 con RF-25 corregida (RF-52), nueva sección *Términos*, frase del principio VII y ejemplo completo con el sobre en `POST /pomodoros`, escenario de edición en HU-07 y referencias de las historias y del resumen de endpoints actualizadas. Sin marcas `[NEEDS CLARIFICATION]`. Estado → *Clarificada*, pendiente de la aprobación del responsable del proyecto.
- **2026-11-08** — Aprobada por el responsable del proyecto. Estado → *Aprobada*.
- **2026-11-08** — Ampliación aprobada por el responsable del proyecto: RF-64 (orden de las tareas dentro de una sesión), detectado al planificar (R-1 del plan). Se añaden tres casos límite y la nota del recurso `Pomodoro`. Estado → *Aprobada*.
- **2026-11-08** — Corrección aprobada por el responsable del proyecto: el contrato de `GET /pomodoro-streak` devuelve `{ current, best }`, la forma de `GET /streak` de la 001; el ejemplo anterior (`{ currentStreak, bestStreak }`) contradecía la frase «la misma forma que `GET /streak`». Estado → *Aprobada*.
- **2026-11-09** — Ampliación aprobada por el responsable del proyecto: RF-65 (`FOCUS_10H` en minutos, meta 600), detectada al implementar la H6. Se actualizan la meta de RF-43, la nota del recurso `Achievement`, HU-06 y el resumen de endpoints. Estado → *Aprobada*.
