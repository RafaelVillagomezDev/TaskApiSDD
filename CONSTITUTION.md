# CONSTITUTION.md — TaskApiSDD

- **Versión:** 1.6.0
- **Ratificada:** 2026-10-23
- **Última enmienda:** 2026-10-25

TaskApiSDD es una API REST para registrar tareas diarias y seguir la racha de productividad (días consecutivos) de cada usuario. Se desarrolla con Spec-Driven Development: primero se especifica, después se construye.

Esta constitución es la ley suprema del proyecto. Prevalece sobre `AGENTS.md`, sobre cualquier spec, plan o tarea y sobre cualquier instrucción puntual que la contradiga.

---

## Principios

### I. Stack cerrado
Prohibido añadir a `package.json` una dependencia de producción o desarrollo que no esté justificada en el `plan.md` de su funcionalidad, con la alternativa sin dependencia descartada por escrito. Prohibido introducir una herramienta que solape con el stack de `AGENTS.md` (otro ORM o query builder además de Prisma, otro validador además de Zod, otro framework HTTP además de Express, otro runner de tests además de Jest).
- **Verificable:** cada dependencia de `package.json` aparece justificada en algún `plan.md`.
- **Excepción:** subir la versión de una dependencia existente (parche de seguridad o corrección de bugs) no requiere plan.
- **Por qué:** dos herramientas para lo mismo obligan a mantener dos patrones en paralelo; el agente acabaría mezclándolos según el fichero que tenga delante.

### II. Sin spec no hay cambio de comportamiento
Prohibido cambiar un comportamiento observable (endpoints, códigos de estado, formato del JSON, reglas de racha) sin haber actualizado antes la `spec.md`. El orden es `spec.md` → clarificación → `plan.md` → `tasks.md` → código. Si el código y la spec discrepan, la spec tiene razón y el código es un defecto.
- **Verificable:** todo commit que cambie comportamiento observable referencia una tarea de un `tasks.md`.
- **Excepción:** no requieren spec ni tarea los cambios sin efecto observable (erratas, renombrados internos, refactors con los tests en verde, comentarios, documentación) ni la corrección urgente de un fallo en producción; en este último caso la spec se actualiza antes de empezar la siguiente funcionalidad.
- **Por qué:** la spec es la única fuente que comparten humano y agente; si el código cambia sin ella, la siguiente sesión del agente partirá de una spec falsa.

### III. Los tests no se negocian
Mínimo: cada fichero `*.use-case.ts` y cada fichero de `domain/` con lógica (en particular el cálculo de rachas) tiene su fichero de test. Al terminar una tarea se ejecuta `pnpm test` dentro del contenedor de desarrollo y se informa del resultado real. Si fallan, prohibido corregirlos o volver a ejecutarlos por iniciativa propia: se informa de qué tests fallan (fichero y nombre) y por qué, y decide el usuario. Prohibido afirmar que pasan sin haberlos ejecutado; si no se pueden ejecutar, se dice.
- **Verificable:** la respuesta final de cada tarea incluye la salida resumida de `pnpm test`, y ningún `*.use-case.ts` carece de test.
- **Excepción:** las tareas que solo modifican ficheros `*.md` no ejecutan tests.
- **Por qué:** un agente que arregla tests por su cuenta tiende a adaptar el test al código en lugar del código al contrato, y el fallo desaparece sin que nadie lo vea.

### IV. El esquema solo cambia con migraciones
Prohibido cambiar el esquema de la base de datos fuera de una migración de Prisma versionada en `prisma/migrations/`. Prohibido editar una migración ya aplicada: se corrige con una nueva. Prohibido versionar secretos; viven solo en `.env.dev` y `.env.prod`.
- **Verificable:** no hay cambios de esquema fuera de `prisma/migrations/`, ni ficheros `.env*` con valores en el historial de git.
- **Excepción:** `prisma migrate reset` y los datos de prueba están permitidos solo en desarrollo.
- **Por qué:** las rachas son datos históricos de los usuarios; perderlos o corromperlos no tiene arreglo.

### V. Separación hexagonal
- `domain/` no importa Express, Prisma, Zod ni ningún otro framework.
- `application/` importa solo de `domain/` y de `src/shared/`.
- Toda entrada externa (body, params, query) se valida con un schema Zod en `infrastructure/` antes de llegar a `application/`.
- Un módulo no importa ficheros internos de otro módulo: solo su fachada pública `[entidad].facade.ts` (en singular según `AGENTS.md`; ej. `task.facade.ts` en `modules/tasks/`), que expone los casos de uso que otros módulos pueden usar.
- **Verificable:** buscar `express`, `@prisma/client` o `zod` dentro de cualquier `domain/` o `application/` no devuelve resultados, ninguna ruta llega a un controlador sin pasar por un schema, y ningún módulo importa `domain/`, `application/` ni `infrastructure/` de otro módulo.
- **Excepción:** `src/shared/` puede ser importado desde cualquier capa de cualquier módulo.
- **Por qué:** las reglas de rachas deben poder probarse con Jest sin levantar base de datos ni servidor HTTP.

### VI. Clarificar antes de suponer
Prohibido rellenar con una suposición un requisito ambiguo, incompleto o contradictorio: se marca en la spec como `[NEEDS CLARIFICATION: <pregunta>]` y se pregunta al usuario. La clarificación es una fase propia entre la spec y el plan: se repite hasta que no queda ninguna marca y la spec pasa la revisión de QA; solo entonces su estado pasa a *Clarificada*. Prohibido escribir un `plan.md` sobre una spec que no esté en estado *Clarificada* o *Aprobada*.
- **Verificable:** todo `plan.md` se basa en una `spec.md` con estado *Clarificada* o *Aprobada* y sin marcas `[NEEDS CLARIFICATION]`.
- **Excepción:** decisiones que ya resuelve una convención de `AGENTS.md` (nombres, estructura, comandos) no se preguntan.
- **Por qué:** un supuesto silencioso se convierte en código que nadie pidió y que luego hay que deshacer.

### VII. Formato de respuesta único
Prohibido que un endpoint responda con un cuerpo distinto de estos dos sobres:
- Éxito: `{ "success": true, "status": <código HTTP>, "message": <texto>, "data": <objeto | array | null> }`
- Error: `{ "success": false, "status": <código HTTP>, "error": { "code": <CÓDIGO>, "message": <texto>, "details"?: [ { "field": <campo>, "message": <texto> } ] } }`

`status` siempre coincide con el código HTTP de la respuesta. `error.details` solo aparece en los errores de validación. Lo que cambia entre endpoints es solo el contenido de `data`. Las rutas inexistentes, los cuerpos mal formados y los errores inesperados también responden con el sobre de error.
- **Verificable:** todo ejemplo de respuesta en una `spec.md` y toda respuesta comprobada en los tests de los controladores usa uno de los dos sobres.
- **Excepción:** las respuestas a `HEAD` no llevan cuerpo, por norma de HTTP. Fuera de eso, ninguna: por eso ningún endpoint responde `204 No Content`, que no admite cuerpo.
- **Por qué:** el cliente procesa todas las respuestas con el mismo código, sin casos especiales por endpoint.

---

## Gobierno

1. **Supremacía:** en caso de conflicto, esta constitución prevalece sobre `AGENTS.md`, las specs, los planes y las tareas.
2. **Cumplimiento:** cada `plan.md` incluye una sección *Comprobación constitucional* que repasa los principios I–VII y declara cualquier excepción que se use y su motivo.
3. **Forma de los principios:** cada principio es una prohibición o un mínimo comprobable (nunca una aspiración), con su excepción explícita y su porqué cuando no es obvio. Máximo 7 principios: si hace falta uno nuevo, se fusiona o se elimina otro informando siempre al usuario de la decision. Es necesario confirmación por parte del usuario
4. **Enmiendas:** solo el usuario (responsable del proyecto) puede aprobar cambios en esta constitución. Un agente puede proponer enmiendas, pero nunca aplicarlas sin aprobación explícita.
5. **Versionado** (SemVer):
   - **MAJOR:** se elimina o redefine un principio de forma incompatible.
   - **MINOR:** se añade un principio o se amplía una regla o excepción de forma significativa.
   - **PATCH:** aclaraciones, redacción o erratas sin cambio de significado.
6. **Registro:** cada enmienda actualiza la versión y la fecha de *Última enmienda* de la cabecera.
7. **README vivo:** todo cambio en `CONSTITUTION.md`, en la estructura, los comandos o las convenciones de `AGENTS.md`, o en un `spec.md`, `plan.md` o `tasks.md` de `sdd/` (funcionalidad nueva, tarea nueva o tarea completada) obliga a actualizar `README.md` **en el mismo cambio**, sin excepciones. Quien hace el cambio identifica qué ha cambiado desde la última actualización del README (procedimiento en `AGENTS.md` §6) y actualiza las secciones afectadas.
   - **Verificable:** todo commit que modifica alguno de esos ficheros modifica también `README.md`. El hook `.githooks/pre-commit` lo comprueba en cada commit, y el hook de Claude Code en `.claude/settings.json` se lo recuerda al agente en cada edición.
