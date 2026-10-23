# CONSTITUTION.md — TaskApiSDD

- **Versión:** 1.0.0
- **Ratificada:** 2026-10-23
- **Última enmienda:** 2026-10-23

TaskApiSDD es una API REST para registrar tareas diarias y seguir la racha de productividad (días consecutivos) de cada usuario. Se desarrolla con Spec-Driven Development: primero se especifica, después se construye.

Esta constitución es la ley suprema del proyecto. Prevalece sobre `AGENTS.md`, sobre cualquier spec, plan o tarea y sobre cualquier instrucción puntual que la contradiga.

---

## Principios

### I. Stack cerrado y mínimo
Solo se usan las tecnologías del stack declarado en `AGENTS.md`. Toda dependencia nueva debe estar justificada en el `plan.md` de la funcionalidad, con la alternativa sin dependencia descartada, antes de añadirse.
- **Verificable:** cada dependencia nueva en `package.json` aparece justificada en un `plan.md`.
- **Excepción:** actualizar la versión de una dependencia existente por un parche de seguridad.
- **Por qué:** cada dependencia añade mantenimiento, superficie de ataque y conocimiento que hay que tener.

### II. La spec manda sobre el código
El flujo es siempre `spec.md` → `plan.md` → `tasks.md` → código. No se escribe un plan sin spec aprobada, ni tareas sin plan, ni código sin tarea. Si el código y la spec discrepan, la spec tiene razón y el código es un defecto. Cambiar un comportamiento observable (endpoints, formato del JSON, reglas de racha) exige actualizar antes la spec.
- **Verificable:** todo cambio de código se puede rastrear hasta una tarea de un `tasks.md`.
- **Excepción:** corrección urgente de un fallo en producción. La spec se actualiza antes de la siguiente funcionalidad.

### III. Los tests son el contrato
Cada caso de uso y cada regla de dominio (especialmente el cálculo de rachas) tiene tests. Al terminar cualquier tarea se ejecuta la suite completa dentro del contenedor de desarrollo y se informa del resultado:
- **Si pasan:** se confirma con el resumen de la ejecución.
- **Si fallan:** no se corrigen ni se vuelven a ejecutar por iniciativa propia. Se informa al usuario de qué tests fallan (fichero y nombre) y por qué, y el usuario decide cómo seguir.
- **Si no se pueden ejecutar:** se dice explícitamente. Nunca se afirma que los tests pasan sin haberlos ejecutado.
- **Verificable:** la respuesta final de cada tarea incluye el resultado real de `pnpm test`.
- **Excepción:** tareas que solo modifican documentación (`*.md`).

### IV. Los datos se cambian solo con migraciones
El esquema de la base de datos solo cambia mediante migraciones de Prisma versionadas en `prisma/`. Una migración ya aplicada no se edita: se corrige con una nueva. Toda entrada externa se valida con Zod antes de llegar a la capa de aplicación. Los secretos viven solo en `.env.dev` y `.env.prod`, nunca en el repositorio.
- **Verificable:** no hay cambios de esquema fuera de `prisma/migrations/`, ni secretos en el historial de git.
- **Excepción:** `prisma migrate reset` y los datos de prueba están permitidos solo en desarrollo.
- **Por qué:** las rachas son datos históricos de los usuarios; perderlos o corromperlos no tiene arreglo.

### V. Separación de responsabilidades (hexagonal)
- `domain/` no importa Express, Prisma, Zod ni ningún otro framework.
- `application/` depende solo de `domain/` y de los puertos que este define.
- `infrastructure/` es el único sitio donde viven los frameworks.
- Un módulo no importa el código interno de otro módulo; se comunican mediante la capa de aplicación o mediante `src/shared/`.
- **Verificable:** una búsqueda de `express`, `@prisma/client` o `zod` dentro de cualquier `domain/` no devuelve resultados.
- **Excepción:** `src/shared/` puede ser usado por todos los módulos.
- **Por qué:** el dominio (reglas de rachas) debe poder probarse y evolucionar sin base de datos ni servidor HTTP.

### VI. Clarificar antes de suponer
Ante un requisito ambiguo, incompleto o contradictorio, no se inventa la respuesta: se marca en la spec como `[NEEDS CLARIFICATION: <pregunta>]` y se pregunta al usuario. Una spec con marcas pendientes no puede pasar a plan.
- **Verificable:** ningún `plan.md` se basa en una `spec.md` con marcas `[NEEDS CLARIFICATION]` abiertas.
- **Excepción:** decisiones de implementación que ya resuelve una convención de `AGENTS.md` (nombres, estructura, comandos).
- **Por qué:** un supuesto silencioso se convierte en código que nadie pidió y que luego hay que deshacer.

---

## Gobierno

1. **Supremacía:** en caso de conflicto, esta constitución prevalece sobre `AGENTS.md`, las specs, los planes y las tareas.
2. **Cumplimiento:** cada `plan.md` incluye una sección *Comprobación constitucional* que repasa los principios I–VI y declara cualquier excepción que se use y su motivo.
3. **Enmiendas:** solo el usuario (responsable del proyecto) puede aprobar cambios en esta constitución. Un agente puede proponer enmiendas, pero nunca aplicarlas sin aprobación explícita.
4. **Versionado** (SemVer):
   - **MAJOR:** se elimina o redefine un principio de forma incompatible.
   - **MINOR:** se añade un principio o se amplía una regla de forma significativa.
   - **PATCH:** aclaraciones, redacción o erratas sin cambio de significado.
5. **Registro:** cada enmienda actualiza la versión y la fecha de *Última enmienda* de la cabecera.
