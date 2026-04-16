import axiosInstance from "../axiosInstance.js";

const BASE_URL = "/inventory/production/";

class ProductionService {
  async list({ page = 1, limit = 20, search = "" }) {
    const response = await axiosInstance.get(BASE_URL, {
      params: { page, limit, search },
    });

    const items = response.data.results || response.data.data || [];
    const transformedData = items.map((item) => ({
      ...item,
      warehouseId: item.warehouse?.id,
      productId: item.product?.id,
    }));

    return {
      data: transformedData,
      total: response.data.total || 0,
      page: response.data.page || page,
      limit: response.data.limit || limit,
    };
  }

  async getById(id) {
    const response = await axiosInstance.get(`${BASE_URL}${id}/`);
    return {
      ...response.data,
      warehouseId: response.data.warehouse?.id,
      productId: response.data.product?.id,
    };
  }

  async create(data) {
    const payload = {
      date: data.date,
      warehouse_id: data.warehouseId,
      product_id: data.productId,
      quantity: Number(data.quantity),
    };

    const response = await axiosInstance.post(BASE_URL, payload);
    const transformedData = response.data.data || response.data;

    return {
      data: {
        ...transformedData,
        warehouseId: transformedData.warehouse?.id,
        productId: transformedData.product?.id,
        previousAvailability: transformedData.previous_availability,
        currentAvailability: transformedData.current_availability,
        availableQuantity: transformedData.available_quantity,
      },
      message: response.data.message || "Production created successfully",
    };
  }

  async update(id, data) {
    const payload = {
      date: data.date,
      warehouse_id: data.warehouseId,
      product_id: data.productId,
      quantity: Number(data.quantity),
    };

    const response = await axiosInstance.put(`${BASE_URL}${id}/`, payload);
    const transformedData = response.data || response.data.data;

    return {
      data: {
        ...transformedData,
        warehouseId: transformedData.warehouse?.id,
        productId: transformedData.product?.id,
        previousAvailability: transformedData.previous_availability,
        currentAvailability: transformedData.current_availability,
        availableQuantity: transformedData.available_quantity,
      },
      message: "Production updated successfully",
    };
  }

  async remove(id) {
    const response = await axiosInstance.delete(`${BASE_URL}${id}/`);
    return {
      data: null,
      message: response.data.message || "Production deleted successfully",
    };
  }
}

export default new ProductionService();
