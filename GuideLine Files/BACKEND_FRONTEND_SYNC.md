# Backend-Frontend Sync: Opening Stock Module

## Overview
Successfully synced Django backend OpeningStock API with React frontend. All CRUD operations are now properly integrated.

---

## Backend API Endpoints

### `GET /inventory/opening-stock/`
**List all opening stock entries with pagination and search**
- Query params: `page`, `limit`, `search`
- Response format: DRF paginated response with `results`, `count`, `next`, `previous`

### `POST /inventory/opening-stock/`
**Create new opening stock**
- Request body (snake_case):
  ```json
  {
    "date": "2024-04-06",
    "warehouse_id": "uuid",
    "raw_material_id": "uuid",
    "quantity": 100.50
  }
  ```
- Response includes enriched data with availability calculations

### `PUT /inventory/opening-stock/{id}/`
**Update existing opening stock**
- Same request format as POST
- Auto-syncs raw material quantity if changed

### `DELETE /inventory/opening-stock/{id}/`
**Soft delete opening stock**
- Auto-syncs raw material quantity after deletion

---

## Data Model Mapping

### Serializer Fields (API Response)
```javascript
{
  id: UUID,
  date: "2024-04-06",
  warehouse: {
    id: UUID,
    name: "Warehouse A"
  },
  raw_material: {
    id: UUID,
    name: "Material A",
    brand: { id, name },
    category: { id, name },
    size: { id, name },
    purchase_unit: { id, name },
    selling_unit: { id, name },
    quantity: 500.00  // current stock after sync
  },
  quantity: 100.50,  // mapped from purchase_quantity
  previous_availability: 0,  // old stock before this entry
  current_availability: 100.50,  // new cumulative stock
  available_quantity: 100.50,  // same as current_availability
  created_at: "2024-04-06T10:30:00Z",
  updated_at: "2024-04-06T10:30:00Z"
}
```

---

## Frontend Service Transformation

### Case Conversion
- **API uses**: `snake_case` (warehouse_id, raw_material_id, previous_availability)
- **Frontend uses**: `camelCase` (warehouseId, rawMaterialId, previousAvailability)

### Service Methods

#### `list({ page, limit, search })`
Handles DRF paginated response and transforms to camelCase:
```javascript
{
  data: [...transformed items...],
  total: 25,
  page: 1,
  limit: 10
}
```

#### `create(data)`
Creates new entry with automatic quantity sync:
```javascript
// Frontend sends
{ date, warehouseId, rawMaterialId, quantity }

// API receives
{ date, warehouse_id, raw_material_id, quantity }

// Response includes availability calculations
```

#### `update(id, data)`
Updates with automatic sync if raw_material_id changes

#### `remove(id)`
Soft delete with quantity resync

---

## Frontend Page: OpeningStockPage.jsx

### Features Implemented
✅ List with search & pagination
✅ Create new entries
✅ Edit existing entries with pre-filled form
✅ Delete with confirmation modal
✅ Automatic availability calculations display
✅ Error handling & loading states
✅ Toast notifications for user feedback

### Key Fields Displayed
- Date (formatted YYYY-MM-DD)
- Warehouse name & location
- Raw Material name with full details
- Previous Stock (before this entry)
- Opening Quantity (this entry)
- Available Stock (cumulative total)

### Form Validation
- Date: Required, parsed as date
- Warehouse: Required UUID
- Raw Material: Required UUID
- Quantity: Required, min 0

---

## Important Implementation Details

### 1. **Automatic Quantity Sync**
When opening stock is created/updated/deleted, the backend automatically updates `RawMaterial.quantity` to the sum of all opening stock entries for that material.

```python
# Backend logic (in ViewSet)
self._sync_raw_material_quantity(tenant_id, raw_material_id)
```

### 2. **Unique Constraint**
Each combination of (date, warehouse, raw_material) per tenant is unique. Updating same entry soft-restores it.

### 3. **Enriched Response**
The response includes calculated fields for inventory availability:
- `previous_availability` = stock before this entry
- `current_availability` = total stock after this entry
- `available_quantity` = current total

### 4. **Tenant Isolation**
All queries are filtered by `request.user.tenant_id` with soft deletes (`deleted_at__isnull=True`)

### 5. **Related Model Loading**
Query uses `select_related()` and `prefetch_related()` for performance:
```python
.select_related("warehouse", "raw_material__brand", "raw_material__category", ...)
```

---

## Migration Requirements

Run these commands to create the database table:

```bash
# From samspython root directory
python manage.py makemigrations
python manage.py migrate
```

This creates the `inventory_openingstock` table with:
- Unique constraint on (tenant_id, date, warehouse, raw_material)
- Database indexes on frequently queried fields
- Soft delete support via deleted_at field

---

## Testing Checklist

- [ ] Backend migrations run successfully
- [ ] API endpoints respond correctly
- [ ] Frontend loads warehouse and raw material dropdowns
- [ ] Can create new opening stock entry
- [ ] Quantity appears in raw material list after creation
- [ ] Can edit existing entry
- [ ] Can delete with soft delete
- [ ] Search filters by warehouse or material name
- [ ] Pagination works correctly
- [ ] Date format is correct in form and table
- [ ] Error messages display properly
- [ ] Toast notifications appear on success/failure
- [ ] Multiple entries for same material shows cumulative quantity

---

## API Response Examples

### List Response (Paginated)
```json
{
  "count": 25,
  "next": "http://api/inventory/opening-stock/?page=2",
  "previous": null,
  "results": [
    {
      "id": "uuid-123",
      "date": "2024-04-06",
      "warehouse": { "id": "uuid-w", "name": "Main Warehouse" },
      "raw_material": { "id": "uuid-rm", "name": "Cotton", ... },
      "quantity": 100.50,
      "previous_availability": 0,
      "current_availability": 100.50,
      "available_quantity": 100.50,
      "created_at": "2024-04-06T10:30:00Z",
      "updated_at": "2024-04-06T10:30:00Z"
    }
  ]
}
```

### Create Response
```json
{
  "data": {
    "id": "uuid-123",
    "date": "2024-04-06",
    "warehouse": { "id": "uuid-w", "name": "Main Warehouse" },
    "raw_material": { ... },
    "quantity": 100.50,
    "previous_availability": 0,
    "current_availability": 100.50,
    "available_quantity": 100.50,
    "created_at": "2024-04-06T10:30:00Z",
    "updated_at": "2024-04-06T10:30:00Z"
  },
  "message": "Opening stock created successfully"
}
```

---

## Files Modified

### Backend
- [samspython/inventory/models.py](../../samspython/inventory/models.py) - Added OpeningStock model
- [samspython/inventory/serializers.py](../../samspython/inventory/serializers.py) - Added OpeningStockSerializer with nested details
- [samspython/inventory/views.py](../../samspython/inventory/views.py) - Added OpeningStockViewSet with auto-sync
- [samspython/inventory/urls.py](../../samspython/inventory/urls.py) - Registered opening-stock endpoint

### Frontend
- [frontend/src/api/services/openingStockService.js](../../frontend/src/api/services/openingStockService.js) - Replaced generic service with custom implementation
- [frontend/src/pages/inventory/OpeningStockPage.jsx](../../frontend/src/pages/inventory/OpeningStockPage.jsx) - Updated data transformation for snake_case/camelCase conversion
