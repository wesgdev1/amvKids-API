---
name: amv-api-feature
description: Convenciones para crear o modificar features (recursos/endpoints) en la API AMV KIDS (Node + Express + Prisma + PostgreSQL). Usar SIEMPRE que se pida crear un nuevo módulo, controlador, rutas, endpoint, CRUD, modelo Prisma, o extender uno existente (orders, models, stocks, users, coupons, influencers, prestamos, etc.) en este repo.
---

# AMV API — cómo programamos features

Stack: Node (ESM, `"type": "module"`), Express 4, Prisma 5 + PostgreSQL, JWT (`jsonwebtoken`), bcrypt, multer + cloudinary (fotos), nodemailer (correos), node-cron. Lint: ESLint `google` + `prettier`. Comentarios y mensajes al usuario en **español**.

## Reglas de alcance

- Tocar **solo** la carpeta del feature pedido, salvo que el usuario diga otra cosa.
- No modificar órdenes, stock ni precios de modelos como efecto secundario si no se pidió explícitamente. Si un feature podría afectar inventario, preguntar o dejarlo anotado.
- No hacer commit salvo que se pida.

## Estructura de un módulo

```
app/api/v1/<recurso>/
  routes.js       # Router de Express
  controller.js   # handlers (algunos módulos usan controllers.js; respetar el que ya exista)
  model.js        # opcional: lista `fields` u helpers (ej. users: encryptPassword)
  services.js     # opcional: lógica Prisma reutilizable (ej. users)
```

Registrar el router en [app/api/v1/index.js](../../../app/api/v1/index.js):

```js
import { router as recurso } from "./recurso/routes.js";
router.use("/recurso", recurso);
```

Prefijo URL: `/api/v1/<recurso>` (también responde en `/api/<recurso>`).

## routes.js (plantilla)

```js
import { Router } from "express";

// eslint-disable-next-line new-cap
export const router = Router();

import * as controller from "./controller.js";
import { auth } from "../auth.js";

router.route("/").get(controller.getAll).post(auth, controller.create);

// Rutas estáticas ANTES de router.param / "/:id"
// router.route("/algo-especial").get(auth, controller.algoEspecial);

router.param("id", controller.id);

router
  .route("/:id")
  .get(controller.read)
  .put(auth, controller.update)
  .patch(auth, controller.update)
  .delete(auth, controller.remove);

// Sub-recursos: /:id/items, /:id/items/:itemId/accion
```

- `auth` (de `../auth.js`) valida `Authorization: Bearer <token>` y deja el payload en `req.decoded` (`id`, `tipoUsuario`, ...).
- Para subir archivos: `import { uploads } from "../../../uploadPhotos/uploads.js";` y `uploads.array("images")` en la ruta; luego `uploadFiles(file)` en el controller (cloudinary).

## controller.js (plantilla)

```js
import { prisma } from "../../../database.js";

export const create = async (req, res, next) => {
  const { body = {} } = req;
  try {
    const result = await prisma.recurso.create({
      data: { ...body, createdAt: new Date().toISOString() },
    });
    res.status(201);
    res.json({ data: result, message: "Recurso creado correctamente" });
  } catch (error) {
    next(error);
  }
};

export const getAll = async (req, res, next) => {
  try {
    const result = await prisma.recurso.findMany({
      orderBy: { createdAt: "desc" },
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

// Middleware de router.param: carga el registro en req.data o 404
export const id = async (req, res, next) => {
  const { params = {} } = req;
  try {
    const result = await prisma.recurso.findUnique({ where: { id: params.id } });
    if (result === null) {
      next({ message: "Recurso no encontrado", status: 404 });
    } else {
      req.data = result;
      next();
    }
  } catch (error) {
    next(error);
  }
};

export const read = async (req, res, next) => {
  res.json({ data: req.data });
};

export const update = async (req, res, next) => {
  const { params = {}, body = {} } = req;
  try {
    const result = await prisma.recurso.update({
      where: { id: params.id },
      data: { ...body, updatedAt: new Date().toISOString() },
    });
    res.json({ data: result });
  } catch (error) {
    next(error);
  }
};

export const remove = async (req, res, next) => {
  const { params = {} } = req;
  try {
    await prisma.recurso.delete({ where: { id: params.id } });
    res.status(204);
    res.end();
  } catch (error) {
    next(error);
  }
};
```

### Convenciones de controller

- Handlers `async (req, res, next)` con `try/catch` y `next(error)`.
- Respuesta OK: `{ data, message? }`. Crear → `201`. Borrar → `204` + `res.end()`.
- Errores: el handler global de [app/index.js](../../../app/index.js) responde `{ error: { message, status } }`.
  - Dentro del handler: `return next({ message: "...", status: 400 })`.
  - Dentro de helpers que lanzan: usar un `Error` con `status` (ESLint prohíbe `throw` de literales):
    ```js
    const httpError = (message, status) => {
      const error = new Error(message);
      error.status = status;
      return error;
    };
    throw httpError("Modelo no encontrado", 404);
    ```
- Fechas: `new Date().toISOString()` para `createdAt`/`updatedAt` y fechas de negocio.
- Filtros por query string (`req.query`) construyendo un `where` condicional.
- Nunca devolver `password` del usuario: usar `select` explícito (`id, name, email, celular, tipoUsuario, codigo`).
- En updates, preferir whitelist de campos en lugar de `...body` cuando hay campos sensibles o derivados (estado, totales).
- Operaciones que tocan varias tablas → `prisma.$transaction(async (tx) => { ... })` y usar `tx` dentro.
- Estados derivados (ej. préstamo Activo/Cerrado) se recalculan en el backend tras cada cambio, no se confían al cliente.
- Validar existencia de relaciones (findUnique/findMany con `in`) antes de crear.

## Dominio (valores que se usan en el código)

- `User.tipoUsuario`: `"Reventa"`, `"Tienda Aliada"`, `"Cliente"` (y admin). Precio según tipo: `price` (Reventa), `alliancePrice` (Tienda Aliada), `normalPrice` (Cliente); `basePrice`, `pricePromoted` + `isPromoted`.
- `Order.state`: `Creada`, `Pago Enviado`, `Pago Confirmado`, `Alistada`, `Pedido Entregado`, `CanceladaAdmin`. `typeOrder`: `Normal` | `Curva` (curva usa `detalleCurva` "qty/talla, ...").
- `Stock`: por `modelId` + `size` (talla numérica) con `quantity`.
- `Prestamo.state`: `Activo` | `Cerrado`; un `PrestamoItem` = un par.
- Productos → Modelos → (Stock, Image). IDs `uuid` (`@db.Uuid`).

## Prisma

- Schema en [prisma/schema.prisma](../../../prisma/schema.prisma). Modelos con `id String @id @default(uuid()) @db.Uuid`, `createdAt DateTime @default(now())`, `updatedAt DateTime? @updatedAt`; FKs `String? @db.Uuid`.
- Comentarios en español junto a campos (`// Activo, Cerrado`).
- No hay carpeta `migrations`: tras cambiar el schema, confirmar con el usuario antes de `npx prisma db push` (afecta la BD real) y luego `npx prisma generate`.

## Correos

Plantillas en [app/api/v1/mailer.js](../../../app/api/v1/mailer.js): exportar una función que retorna el objeto de mensaje y enviarlo con `await transporter.sendMail(mensaje)` desde el controller.

## Checklist al terminar

1. `npx eslint app/api/v1/<recurso>` sin errores.
2. `node --check` en los archivos nuevos.
3. Router registrado en `app/api/v1/index.js`.
4. Responder al usuario con tabla de endpoints (método, ruta, qué hace) + ejemplo de body, y avisar si algo no se probó contra la BD.
