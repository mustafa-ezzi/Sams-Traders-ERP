import axiosInstance from "../axiosInstance.js";

const BASE_URL = "/inventory/opening-stock/";

class OpeningStockService {
    /**
     * List opening stock entries with pagination and search
     * Transforms snake_case from API to camelCase for frontend
     */
    async list({ page = 1, limit = 20, search = "" }) {
        try {
            const response = await axiosInstance.get(BASE_URL, {
                params: { page, limit, search },
            });

            // Handle both paginated and non-paginated responses
            const items = response.data.results || response.data.data || [];

            // Transform API response to frontend format
            const transformedData = items.map(item => ({
                ...item,
                warehouseId: item.warehouse?.id,
                rawMaterialId: item.raw_material?.id,
            }));

            return {
                data: transformedData,
                total: response.data.total || 0,
                page: response.data.page || page,
                limit: response.data.limit || limit,
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Get single opening stock entry by ID
     */
    async getById(id) {
        try {
            const response = await axiosInstance.get(`${BASE_URL}${id}/`);
            return {
                ...response.data,
                warehouseId: response.data.warehouse?.id,
                rawMaterialId: response.data.raw_material?.id,
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Create new opening stock entry
     * Transforms camelCase to snake_case for API
     */
    async create(data) {
        try {
            const payload = {
                date: data.date,
                warehouse_id: data.warehouseId,
                raw_material_id: data.rawMaterialId,
                quantity: Number(data.quantity),
            };

            const response = await axiosInstance.post(BASE_URL, payload);

            const transformedData = response.data.data || response.data;
            return {
                data: {
                    ...transformedData,
                    warehouseId: transformedData.warehouse?.id,
                    rawMaterialId: transformedData.raw_material?.id,
                    previousAvailability: transformedData.previous_availability,
                    currentAvailability: transformedData.current_availability,
                    availableQuantity: transformedData.available_quantity,
                },
                message: response.data.message || "Opening stock created successfully",
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Update existing opening stock entry
     */
    async update(id, data) {
        try {
            const payload = {
                date: data.date,
                warehouse_id: data.warehouseId,
                raw_material_id: data.rawMaterialId,
                quantity: Number(data.quantity),
            };

            const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);

            const transformedData = response.data || response.data.data;
            return {
                data: {
                    ...transformedData,
                    warehouseId: transformedData.warehouse?.id,
                    rawMaterialId: transformedData.raw_material?.id,
                    previousAvailability: transformedData.previous_availability,
                    currentAvailability: transformedData.current_availability,
                    availableQuantity: transformedData.available_quantity,
                },
                message: "Opening stock updated successfully",
            };
        } catch (error) {
            throw error;
        }
    }

    /**
     * Delete (soft delete) opening stock entry
     */
    async remove(id) {
        try {
            const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
            return {
                data: null,
                message: response.data.message || "Opening stock deleted successfully",
            };
        } catch (error) {
            throw error;
        }
    }
}

export default new OpeningStockService();
