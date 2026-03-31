# ERP System — Cursor Rules (Phase 1)

## Project Overview

A full-stack ERP system built with **React** (frontend) and **Node.js / Express** (backend), serving two tenants:
- **SAMS Traders**
- **AM Traders**

Each tenant's data is scoped and isolated, but both operate within the same application.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18+, React Router v6, Axios, TailwindCSS |
| Backend | Node.js, Express.js |
| Database | PostgreSQL (via Prisma ORM) |
| Auth | JWT-based authentication with tenant context |
| State | React Context + useReducer (or Zustand) |
| Validation | Zod (backenvd) + React Hook Form (frontend) |

---

## Multi-Tenant Architecture

- Every database table that holds tenant-specific data **must** include a `tenant_id` column.
- Valid tenant identifiers: `SAMS_TRADERS` | `AM_TRADERS`
- All API routes must extract `tenant_id` from the authenticated JWT and apply it as a filter on every query — never trust the client to send it.
- Shared/global data (e.g. Units, Brands, Sizes, Categories) is **also** tenant-scoped unless explicitly marked global.

---

## Folder Structure

```
/
├── client/                        # React frontend
│   ├── src/
│   │   ├── api/                   # Axios service files per module
│   │   ├── components/            # Shared UI components
│   │   ├── pages/
│   │   │   ├── masters/           # Unit, Brand, Size, Category
│   │   │   ├── rawMaterial/
│   │   │   ├── product/
│   │   │   ├── warehouse/
│   │   │   └── inventory/         # Opening Stock
│   │   ├── context/               # Auth + Tenant context
│   │   ├── hooks/                 # Custom hooks
│   │   └── utils/
│   └── ...
│
├── server/                        # Node.js + Express backend
│   ├── src/
│   │   ├── routes/                # One file per module
│   │   ├── controllers/           # Business logic
│   │   ├── middlewares/           # Auth, tenant guard, error handler
│   │   ├── validations/           # Zod schemas
│   │   ├── prisma/                # Prisma schema + migrations
│   │   └── utils/
│   └── ...
```

---

## Phase 1 Modules

### 1. Master Data

Each master has its **own dedicated route file, controller, service, Zod validation schema, and Prisma model**. They are completely independent of each other.

#### Unit of Measure
| Field | Type | Rules |
|---|---|---|
| `name` | string | required, unique per tenant |

- Route file: `server/src/routes/unit.routes.js`
- Controller: `server/src/controllers/unit.controller.js`
- Service: `server/src/services/unit.service.js`
- Validation: `server/src/validations/unit.validation.js`
- Prisma model: `Unit`

---

#### Size
| Field | Type | Rules |
|---|---|---|
| `name` | string | required, unique per tenant |

- Route file: `server/src/routes/size.routes.js`
- Controller: `server/src/controllers/size.controller.js`
- Service: `server/src/services/size.service.js`
- Validation: `server/src/validations/size.validation.js`
- Prisma model: `Size`

---

#### Category
| Field | Type | Rules |
|---|---|---|
| `name` | string | required, unique per tenant |

- Route file: `server/src/routes/category.routes.js`
- Controller: `server/src/controllers/category.controller.js`
- Service: `server/src/services/category.service.js`
- Validation: `server/src/validations/category.validation.js`
- Prisma model: `Category`

---

#### Brand
| Field | Type | Rules |
|---|---|---|
| `name` | string | required, unique per tenant |

- Route file: `server/src/routes/brand.routes.js`
- Controller: `server/src/controllers/brand.controller.js`
- Service: `server/src/services/brand.service.js`
- Validation: `server/src/validations/brand.validation.js`
- Prisma model: `Brand`

---

> **Coding rule:** Each master is fully independent — separate route, controller, service, validation schema, and Prisma model. Do not share or merge any of these layers across the four masters.

---

### 2. Raw Material

| Field | Type | Rules |
|---|---|---|
| `name` | string | required |
| `brand` | FK → Brand | required |
| `category` | FK → Category | required |
| `size` | FK → Size | required |
| `purchase_unit` | FK → Unit | required |
| `selling_unit` | FK → Unit | required |
| `quantity` | decimal | required, ≥ 0 |
| `purchase_price` | decimal | required, ≥ 0 |
| `selling_price` | decimal | required, ≥ 0 |

---

### 3. Product

Products are of **two types**:

| Type | Description |
|---|---|
| `READY_MADE` | Pre-made product; raw materials are NOT consumed |
| `MANUFACTURED` | Assembled from raw materials; raw materials ARE consumed |

#### Product Fields

| Field | Type | Rules |
|---|---|---|
| `name` | string | required |
| `product_type` | enum: `READY_MADE` \| `MANUFACTURED` | required |
| `packaging_cost` | decimal | required, ≥ 0 |
| `net_amount` | decimal | calculated: sum of raw material amounts + packaging_cost |

#### Product Raw Material (line items — only for `MANUFACTURED`)

| Field | Type | Rules |
|---|---|---|
| `raw_material` | FK → Raw Material | required |
| `quantity` | decimal | required, > 0 |
| `rate` | decimal | required, ≥ 0 |
| `amount` | decimal | calculated: quantity × rate |

> **Coding rule:** `net_amount` and line-item `amount` must always be computed server-side, never trusted from the client.

---

### 4. Warehouse

| Field | Type | Rules |
|---|---|---|
| `name` | string | required, unique per tenant |
| `location` | string | required |

---

### 5. Opening Stock (Inventory)

| Field | Type | Rules |
|---|---|---|
| `date` | date | required |
| `warehouse` | FK → Warehouse | required |
| `raw_material` | FK → Raw Material | required |
| `purchase_quantity` | decimal | required, ≥ 0 |
| `selling_quantity` | decimal | required, ≥ 0 |

> Opening stock represents the initial inventory snapshot for a warehouse. It feeds into the inventory ledger.

---

## API Design Rules

- All routes are prefixed: `/api/v1/`
- Every protected route must pass through the `authenticateTenant` middleware.
- Standard REST conventions:
  - `GET /units` — list
  - `POST /units` — create
  - `PUT /units/:id` — update
  - `DELETE /units/:id` — soft delete (add `deleted_at` column, never hard delete)
- All list endpoints must support:
  - `?search=` — name-based search
  - `?page=` and `?limit=` — pagination
- Return shape for lists:
  ```json
  {
    "data": [...],
    "total": 100,
    "page": 1,
    "limit": 20
  }
  ```
- Return shape for errors:
  ```json
  {
    "error": true,
    "message": "Human-readable message",
    "details": {}
  }
  ```

---

## Database Rules

- Use **Prisma ORM** exclusively — no raw SQL except for complex reporting queries.
- Every table must have: `id` (UUID), `tenant_id`, `created_at`, `updated_at`, `deleted_at` (nullable for soft delete).
- Foreign key names follow the pattern: `<relation>_id` (e.g. `brand_id`, `warehouse_id`).
- Decimal fields must use Prisma `Decimal` type (maps to `NUMERIC` in PostgreSQL).
- Run migrations with `prisma migrate dev` — never edit the database manually.

---

## Frontend Rules

- Use **React Hook Form** + **Zod** for all forms.
- All API calls go through a centralised Axios instance (`/client/src/api/axiosInstance.js`) that automatically attaches the JWT and tenant headers.
- Each module has its own service file, e.g. `rawMaterialService.js`, `productService.js`.
- Use a `<TenantGuard>` component to show/hide UI sections based on the active tenant.
- Loading, error, and empty states must be handled on every data-fetching component.
- Amounts and quantities must be displayed with proper decimal formatting (2 decimal places minimum).

---

## Naming Conventions

| Context | Convention |
|---|---|
| React components | PascalCase |
| JS variables & functions | camelCase |
| Database columns | snake_case |
| API route segments | kebab-case |
| Constants | UPPER_SNAKE_CASE |
| Environment variables | UPPER_SNAKE_CASE |

---

## Environment Variables

```env
# Server
DATABASE_URL=
JWT_SECRET=
PORT=5000
NODE_ENV=development

# Client
VITE_API_BASE_URL=http://localhost:5000/api/v1
```

---

## Out of Scope for Phase 1

The following are explicitly deferred to later phases:
- Purchase Orders / Sales Orders
- Stock movements / Stock transfers
- Reporting & dashboards
- Role-based permissions beyond tenant isolation
- Notifications / alerts
- PDF / Excel exports

---

## Definition of Done (Phase 1)

A module is considered complete when:
1. Prisma schema is defined and migrated.
2. All CRUD API endpoints are implemented with validation and tenant scoping.
3. Frontend pages exist for list, create, edit, and delete.
4. Tenant isolation is verified — SAMS Traders cannot see AM Traders data.
5. Soft delete is working — deleted records do not appear in lists.
6. All calculated fields (amounts, net_amount) are computed server-side.
