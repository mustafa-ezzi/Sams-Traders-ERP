# Frontend-Backend Integration Setup Guide

## Quick Start

### Step 1: Backend Setup (Django)

1. **Run Migrations** (from `samspython/` directory):
   ```bash
   python manage.py makemigrations inventory
   python manage.py migrate
   ```

2. **Verify the OpeningStock model** was created:
   ```bash
   python manage.py dbshell
   ```
   Then check: `.tables` (should see `inventory_openingstock`)

3. **Test the API** (if running on http://localhost:8000):
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
        http://localhost:8000/inventory/opening-stock/
   ```

### Step 2: Frontend Verification

1. **Service Configuration** ✅
   - File: `frontend/src/api/services/openingStockService.js`
   - Uses custom OpeningStockService (not generic factory)
   - Handles snake_case → camelCase conversion
   - Endpoint: `/inventory/opening-stock/`

2. **Page Component** ✅
   - File: `frontend/src/pages/inventory/OpeningStockPage.jsx`
   - Includes data transformation for API responses
   - Handles pagination, search, create, update, delete
   - Displays availability calculations

### Step 3: Test the Integration

1. **Start Frontend** (port 5173):
   ```bash
   cd frontend
   npm run dev
   ```

2. **Start Backend** (port 8000):
   ```bash
   cd samspython
   python manage.py runserver
   ```

3. **Navigate to** Opening Stock page:
   - Menu → Inventory → Opening Stock
   - Or directly: `http://localhost:5173/inventory/opening-stock`

4. **Test Operations**:
   - ✅ List: Should load empty or existing entries
   - ✅ Create: Add warehouse, raw material, date, quantity
   - ✅ Check: Raw material quantity updates automatically
   - ✅ Edit: Modify existing entry
   - ✅ Delete: Soft delete entry
   - ✅ Search: Filter by warehouse or material name

---

## Data Flow Diagram

```
Frontend Form Input (camelCase)
     ↓
openingStockService.create()
     ↓
Transform to snake_case
     ↓
POST /inventory/opening-stock/
     ↓
Django ViewSet
     ↓
Validate & Create OpeningStock
     ↓
Sync RawMaterial.quantity (auto)
     ↓
Serialize Response with Enrichment
     ↓
Transform to camelCase in Service
     ↓
Frontend receives & displays
     ↓
Update table & show toast
```

---

## Key Features Implemented

### ✅ Automatic Quantity Sync
When opening stock is created/updated/deleted, raw material quantity is automatically recalculated as:
```
RawMaterial.quantity = SUM(OpeningStock.purchase_quantity) 
                       WHERE tenant_id = X 
                       AND deleted_at IS NULL
```

### ✅ Availability Calculations
Response includes pre-calculated availability:
- `previous_availability`: Stock level before this entry
- `current_availability`: Cumulative total after this entry
- `available_quantity`: Same as current (for convenience)

### ✅ Unique Entries
Each (date, warehouse, raw_material) combination per tenant is unique. Duplicate attempts either:
- Create new entry (if no prior entry exists)
- Update existing entry (if same combo exists and deleted_at is set)
- Throw error (if same combo exists and not deleted)

### ✅ Soft Deletes
All deletes are soft deletes (set `deleted_at` field). Restoration is automatic when creating same combo.

### ✅ Tenant Isolation
All queries are filtered by tenant. User cannot access other tenant's data.

---

## Common Issues & Solutions

### Issue: "Warehouse not found for this tenant"
**Solution**: Ensure warehouse is created in same tenant
- Create warehouse first: Inventory → Warehouses
- Then create opening stock

### Issue: "Raw material not found for this tenant"
**Solution**: Ensure raw material is created first
- Create raw material: Inventory → Raw Materials
- Then create opening stock

### Issue: "Opening stock already exists for this date, warehouse, and raw material"
**Solution**: This validates uniqueness
- Edit the existing entry instead of creating new one
- Or use different date/warehouse/material combination

### Issue: API returns 401 Unauthorized
**Solution**: Check authentication
- Ensure user is logged in
- Token is valid and sent in Authorization header
- Token is not expired

### Issue: Frontend shows "Failed to load" error
**Solution**: Check network
- Backend is running on correct port (8000)
- CORS is configured correctly
- API endpoint is correct

### Issue: Quantity not syncing to raw material
**Solution**: Verify creation succeeded
- Check response includes `id` field
- Check raw material quantity field after creation
- Check database directly: `SELECT quantity FROM inventory_rawmaterial WHERE id = 'xxx'`

---

## API Endpoint Reference

### List Opening Stock
```
GET /inventory/opening-stock/?page=1&limit=10&search=warehouse
```
**Response**: DRF Paginated with `count`, `results`, `next`, `previous`

### Get Single
```
GET /inventory/opening-stock/{id}/
```

### Create
```
POST /inventory/opening-stock/
Content-Type: application/json

{
  "date": "2024-04-06",
  "warehouse_id": "uuid",
  "raw_material_id": "uuid",
  "quantity": 100.50
}
```

### Update
```
PUT /inventory/opening-stock/{id}/
Content-Type: application/json

{
  "date": "2024-04-07",
  "warehouse_id": "uuid",
  "raw_material_id": "uuid",
  "quantity": 150.00
}
```

### Delete
```
DELETE /inventory/opening-stock/{id}/
```

---

## Database Schema

```sql
CREATE TABLE inventory_openingstock (
  id UUID PRIMARY KEY,
  tenant_id VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  warehouse_id UUID NOT NULL REFERENCES inventory_warehouse(id),
  raw_material_id UUID NOT NULL REFERENCES inventory_rawmaterial(id),
  purchase_quantity DECIMAL(12,2) DEFAULT 0,
  selling_quantity DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMP AUTO_ADD,
  updated_at TIMESTAMP AUTO_UPDATE,
  deleted_at TIMESTAMP NULL,
  
  UNIQUE(tenant_id, date, warehouse_id, raw_material_id),
  INDEX(tenant_id, deleted_at, raw_material_id),
  INDEX(tenant_id, deleted_at, date)
);
```

---

## Monitoring & Debugging

### Check OpeningStock Entries Created
```bash
python manage.py shell
>>> from inventory.models import OpeningStock
>>> OpeningStock.objects.filter(deleted_at__isnull=True).count()
```

### Check Raw Material Quantity After Sync
```bash
>>> from inventory.models import RawMaterial
>>> rm = RawMaterial.objects.get(id='uuid')
>>> print(f"Quantity: {rm.quantity}")
```

### View Historical Entries (Including Deleted)
```bash
>>> OpeningStock.objects.filter(raw_material_id='uuid').order_by('-date')
```

### Clear All Entries (For Testing)
```bash
>>> OpeningStock.objects.all().delete()  # Hard delete for testing only!
```

---

## Files Modified

| File | Purpose | Changes |
|------|---------|---------|
| `samspython/inventory/models.py` | Database | Added OpeningStock model with indexes |
| `samspython/inventory/serializers.py` | API | Added OpeningStockSerializer with enrichment |
| `samspython/inventory/views.py` | API Logic | Added OpeningStockViewSet with auto-sync |
| `samspython/inventory/urls.py` | Routing | Registered opening-stock endpoint |
| `frontend/src/api/services/openingStockService.js` | Frontend API | Custom service with transformation |
| `frontend/src/pages/inventory/OpeningStockPage.jsx` | Frontend UI | Updated data transformation logic |

---

## Next Steps

1. ✅ Run migrations
2. ✅ Test API endpoints manually (Postman/curl)
3. ✅ Test frontend UI
4. ✅ Verify automatic quantity sync works
5. ✅ Test edge cases (duplicates, soft deletes, etc.)
6. 📝 Update frontend navigation if needed
7. 📝 Add to production deployment checklist
