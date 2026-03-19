# Instrucciones para Claude Code / OpenCode

## Entornos

- **Desarrollo**: Claude Code / OpenCode — entorno local en `http://localhost:3005`
- **Producción**: GitHub — rama principal protegida

## Reglas de trabajo

### Arranque automático
Tras cada cambio realizado en el proyecto, arrancar el servidor de desarrollo para verificar en local:
```bash
cd "C:/Users/David/Claude Code CPC Max" && npm run dev
```
La app corre en **http://localhost:3005**

### Control de versiones
- **Nunca** hacer push directo a la rama principal (`main`) de GitHub sin aprobación explícita del usuario.
- Los cambios se desarrollan y prueban en local primero.
- GitHub actúa como entorno de producción: solo recibe código aprobado y revisado por el usuario.
- Para proponer cambios al repositorio, crear una rama o un PR y esperar confirmación del usuario antes de mergear o hacer push.

## Flujo de trabajo resumido
1. Hacer cambios en local
2. Arrancar `npm run dev` y verificar en `http://localhost:3005`
3. Presentar los cambios al usuario para su revisión
4. Solo tras aprobación explícita → push / merge a GitHub
