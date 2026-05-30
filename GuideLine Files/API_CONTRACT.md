# OpeningStock API Contract

## Endpoint: `/inventory/opening-stock/`

### Authentication
- **Required**: Yes
- **Method**: Bearer Token in `Authorization` header
- **Format**: `Authorization: Bearer <token>`
- **Tenant Isolation**: Automatic via `request.user.tenant_id`

---

## 1. LIST - Get All Opening Stock Entries

### Request
```http
GET /inventory/opening-stock/?page=1&limit=10&search=warehouse
```

### Query Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | integer | 1 | Page number (1-indexed) |
| `limit` | integer | 20 | Records per page (max 100) |
| `search` | string | "" | Search by warehouse name or raw material name |

### Response (Success: 200 OK)
```json
{
  "count": 25,
  "next": "http://api/inventory/opening-stock/?page=2",
  "previous": null,
  "results": [
    {
      "id": "550e8400-e29b-41d4-a716-446655440000",
      "date": "2024-04-06",
      "warehouse": {
        "id": "550e8400-e29b-41d4-a716-446655440001",
        "name": "Main Warehouse"
      },
      "raw_material": {
        "id": "550e8400-e29b-41d4-a716-446655440002",
        "name": "Cotton Fabric",
        "brand": {
          "id": "550e8400-e29b-41d4-a716-446655440003",
          "name": "Brand A"
        },
        "category": {
          "id": "550e8400-e29b-41d4-a716-446655440004",
          "name": "Fabric"
        },
        "size": {
          "id": "550e8400-e29b-41d4-a716-446655440005",
          "name": "Standard"
        },
        "purchase_unit": {
          "id": "550e8400-e29b-41d4-a716-446655440006",
          "name": "Kg"
        },
        "selling_unit": {
          "id": "550e8400-e29b-41d4-a716-446655440007",
          "name": "Meter"
        },
        "quantity": 500.50
      },
      "quantity": 100.00,
      "previous_availability": 0,
      "current_availability": 100.00,
      "available_quantity": 100.00,
      "created_at": "2024-04-06T10:30:45.123456Z",
      "updated_at": "2024-04-06T10:30:45.123456Z"
    }
  ]
}
```

### Response (Error: 401 Unauthorized)
```json
{
  "detail": "Authentication credentials were not provided."
}
```

---

## 2. CREATE - Add New Opening Stock Entry

### Request
```http
POST /inventory/opening-stock/
Content-Type: application/json

{
  "date": "2024-04-06",
  "warehouse_id": "550e8400-e29b-41d4-a716-446655440001",
  "raw_material_id": "550e8400-e29b-41d4-a716-446655440002",
  "quantity": 100.00
}
```

### Request Body
| Field | Type | Required | Description | Validation |
|-------|------|----------|-------------|-----------|
| `date` | string | Yes | Date in YYYY-MM-DD format | Must be valid date |
| `warehouse_id` | string (UUID) | Yes | Warehouse UUID | Must exist in tenant |
| `raw_material_id` | string (UUID) | Yes | Raw material UUID | Must exist in tenant |
| `quantity` | number | Yes | Purchase quantity | Must be ≥ 0 |

### Response (Success: 201 Created)
```json
{
  "data": {
    "id": "550e8400-e29b-41d4-a716-446655440008",
    "date": "2024-04-06",
    "warehouse": {
      "id": "550e8400-e29b-41d4-a716-446655440001",
      "name": "Main Warehouse"
    },
    "raw_material": {
      "id": "550e8400-e29b-41d4-a716-446655440002",
      "name": "Cotton Fabric",
      "brand": { "id": "...", "name": "Brand A" },
      "category": { "id": "...", "name": "Fabric" },
      "size": { "id": "...", "name": "Standard" },
      "purchase_unit": { "id": "...", "name": "Kg" },
      "selling_unit": { "id": "...", "name": "Meter" },
      "quantity": 100.00
    },
    "quantity": 100.00,
    "previous_availability": 0,
    "current_availability": 100.00,
    "available_quantity": 100.00,
    "created_at": "2024-04-06T10:30:45.123456Z",
    "updated_at": "2024-04-06T10:30:45.123456Z"
  },
  "message": "Opening stock created successfully"
}
```

**Side Effect**: `RawMaterial.quantity` is automatically updated to the sum of all opening stock quantities for this material.

### Response (Error: 400 Bad Request - Duplicate)
```json
{
  "detail": "Opening stock already exists for this date, warehouse, and raw material"
}
```

### Response (Error: 400 Bad Request - Invalid Ref)
```json
{
  "warehouse_id": ["Warehouse not found for this tenant"]
}
```

---

## 3. RETRIEVE - Get Single Opening Stock Entry

### Request
```http
GET /inventory/opening-stock/{id}/
```

### URL Parameters
| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string (UUID) | Opening stock entry ID |

### Response (Success: 200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440008",
  "date": "2024-04-06",
  "warehouse": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Main Warehouse"
  },
  "raw_material": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "name": "Cotton Fabric",
    ...
  },
  "quantity": 100.00,
  "previous_availability": 0,
  "current_availability": 100.00,
  "available_quantity": 100.00,
  "created_at": "2024-04-06T10:30:45.123456Z",
  "updated_at": "2024-04-06T10:30:45.123456Z"
}
```

### Response (Error: 404 Not Found)
```json
{
  "detail": "Not found."
}
```

---

## 4. UPDATE - Modify Existing Entry

### Request
```http
PUT /inventory/opening-stock/{id}/
Content-Type: application/json

{
  "date": "2024-04-07",
  "warehouse_id": "550e8400-e29b-41d4-a716-446655440001",
  "raw_material_id": "550e8400-e29b-41d4-a716-446655440002",
  "quantity": 150.00
}
```

### Request Body
Same as CREATE (all fields required for full update)

### Response (Success: 200 OK)
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440008",
  "date": "2024-04-07",
  "warehouse": {
    "id": "550e8400-e29b-41d4-a716-446655440001",
    "name": "Main Warehouse"
  },
  "raw_material": {
    "id": "550e8400-e29b-41d4-a716-446655440002",
    "name": "Cotton Fabric",
    ...
  },
  "quantity": 150.00,
  "previous_availability": 0,
  "current_availability": 150.00,
  "available_quantity": 150.00,
  "created_at": "2024-04-06T10:30:45.123456Z",
  "updated_at": "2024-04-06T10:45:30.654321Z"
}
```

**Side Effects**: 
- If `raw_material_id` changed: Both old and new material quantities are resynced
- Otherwise: Only updated material quantity is synced

### Response (Error: 400 Bad Request - Duplicate After Update)
```json
{
  "non_field_errors": ["Opening stock already exists for this date, warehouse, and raw material"]
}
```

---

## 5. DELETE - Soft Delete Entry

### Request
```http
DELETE /inventory/opening-stock/{id}/
```

### Response (Success: 200 OK)
```json
{
  "data": null,
  "message": "Opening stock deleted successfully"
}
```

**Side Effect**: 
- Entry's `deleted_at` is set to current timestamp
- `RawMaterial.quantity` is recalculated (this entry's quantity is effectively removed)

### Response (Error: 404 Not Found)
```json
{
  "detail": "Not found."
}
```

---

## Field Definitions

### OpeningStock Model Fields
| Field | Type | Read-Only | Description |
|-------|------|-----------|-------------|
| `id` | UUID | Yes | Unique identifier |
| `date` | Date | No | Opening stock date (normalized to date only) |
| `warehouse_id` | UUID | No | Reference to warehouse |
| `warehouse` | Object | Yes | Full warehouse object (nested) |
| `raw_material_id` | UUID | No | Reference to raw material |
| `raw_material` | Object | Yes | Full raw material with related objects |
| `purchase_quantity` | Decimal | No | Quantity (exposed as `quantity` in API) |
| `selling_quantity` | Decimal | No | Currently unused, reserved for future |
| `quantity` | Decimal (calculated) | Yes | Alias for purchase_quantity in requests |
| `created_at` | ISO DateTime | Yes | Record creation timestamp |
| `updated_at` | ISO DateTime | Yes | Last update timestamp |
| `deleted_at` | ISO DateTime | Yes | Soft delete timestamp (null if active) |

### Calculated Fields (Read-Only)
| Field | Description | Calculation |
|-------|-------------|-----------|
| `previous_availability` | Stock level before this entry | CurrentTotal - Quantity |
| `current_availability` | Stock level after adding this entry | SUM(all quantities) |
| `available_quantity` | Alias for current_availability | Same as current_availability |

---

## Error Responses

### 400 Bad Request - Validation Error
```json
{
  "quantity": ["Quantity must be at least 0"],
  "date": ["Date is required"]
}
```

### 400 Bad Request - Duplicate
```json
{
  "detail": "Opening stock already exists for this date, warehouse, and raw material"
}
```

### 401 Unauthorized
```json
{
  "detail": "Authentication credentials were not provided."
}
```

### 403 Forbidden
```json
{
  "detail": "You do not have permission to perform this action."
}
```

### 404 Not Found
```json
{
  "detail": "Not found."
}
```

### 500 Internal Server Error
```json
{
  "detail": "Internal server error occurred."
}
```

---

## Rate Limiting
- ⚠️ Not currently implemented (can be added via Django throttling)
- Recommended: 1000 requests per hour per user

## Pagination
- Default limit: 20 records
- Max limit: 100 records
- Uses offset-limit pagination (page-based)

## Sorting
- Default: `-date, -created_at` (newest first)
- Not customizable via query params

## Filtering
- Only supports search param (searches warehouse name and raw material name)
- Case-insensitive search

---

## Response Headers

All successful responses include:
```
Content-Type: application/json
X-Total-Count: 25
```

---

## Example cURL Commands

### List
```bash
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:8000/inventory/opening-stock/?page=1&limit=10&search=warehouse"
```

### Create
```bash
curl -X POST \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "date": "2024-04-06",
       "warehouse_id": "550e8400-e29b-41d4-a716-446655440001",
       "raw_material_id": "550e8400-e29b-41d4-a716-446655440002",
       "quantity": 100
     }' \
     http://localhost:8000/inventory/opening-stock/
```

### Update
```bash
curl -X PUT \
     -H "Authorization: Bearer TOKEN" \
     -H "Content-Type: application/json" \
     -d '{
       "date": "2024-04-06",
       "warehouse_id": "550e8400-e29b-41d4-a716-446655440001",
       "raw_material_id": "550e8400-e29b-41d4-a716-446655440002",
       "quantity": 150
     }' \
     http://localhost:8000/inventory/opening-stock/550e8400-e29b-41d4-a716-446655440008/
```

### Delete
```bash
curl -X DELETE \
     -H "Authorization: Bearer TOKEN" \
     http://localhost:8000/inventory/opening-stock/550e8400-e29b-41d4-a716-446655440008/
```

---

## Implementation Notes

### Automatic Quantity Sync
When an opening stock entry is created, updated, or deleted, the system automatically recalculates the raw material quantity:

```
UPDATE inventory_rawmaterial 
SET quantity = (
  SELECT SUM(purchase_quantity)
  FROM inventory_openingstock
  WHERE raw_material_id = X 
    AND tenant_id = Y
    AND deleted_at IS NULL
)
WHERE id = X AND tenant_id = Y
```

### Uniqueness Constraint
Database enforces unique constraint on:
```
UNIQUE(tenant_id, date, warehouse_id, raw_material_id)
WHERE deleted_at IS NULL
```

This allows soft-restored entries to reuse the same combination.

### Query Optimization
All list queries include:
- `select_related()` for warehouse and raw_material FK
- `prefetch_related()` for brand, category, size, unit objects  
- Database indexes on frequently filtered fields
- Aggregation queries for quantity calculations

### Pagination Performance
- Default page size: 20 records
- Indexed on (tenant_id, deleted_at, date)
- Should handle 100k+ records without issues

---

## Changelog

### v1.0.0 (2024-04-06)
- Initial release
- Full CRUD operations
- Automatic quantity sync
- Availability calculations
- Soft delete support
- Tenant isolation
