import axiosInstance from "./axiosInstance";
import { createAcrossDimensions } from "./createAcrossDimensions";

/**
 * @param {string} resource - inventory API path segment
 * @param {{ createAcrossTenants?: boolean, mutateCreatePayloadPerTenant?: (payload: object, tenantId: string) => object }} [options]
 */
export const createMasterService = (resource, options = {}) => {
  const { createAcrossTenants = false, mutateCreatePayloadPerTenant } = options;

  const tenantHeader = (tenantId = "") => {
    if (!tenantId) {
      return {};
    }
    if (Array.isArray(tenantId)) {
      const codes = [...new Set(tenantId.filter(Boolean))];
      if (!codes.length) {
        return {};
      }
      return {
        "x-tenant-id": codes[0],
        "x-tenant-ids": codes.join(","),
      };
    }
    return {
      "x-tenant-id": tenantId,
      "x-tenant-ids": tenantId,
    };
  };

  return {
    async list(params, tenantId = "") {
      const response = await axiosInstance.get(`/inventory/${resource}`, {
        params,
        headers: tenantHeader(tenantId),
      });
      return response.data;
    },
    async getById(id) {
      const response = await axiosInstance.get(`/inventory/${resource}/${id}`);
      return response.data;
    },
    async create(payload) {
      if (!createAcrossTenants) {
        const response = await axiosInstance.post(`/inventory/${resource}/`, payload);
        return response.data;
      }

      const { response } = await createAcrossDimensions((tenantId) =>
        axiosInstance.post(
          `/inventory/${resource}/`,
          mutateCreatePayloadPerTenant ? mutateCreatePayloadPerTenant(payload, tenantId) : payload,
          {
            headers: tenantId ? { "x-tenant-id": tenantId } : {},
          }
        )
      );
      return response.data;
    },
    async update(id, payload) {
      const response = await axiosInstance.put(`/inventory/${resource}/${id}/`, payload);
      return response.data;
    },
    async remove(id) {
      const response = await axiosInstance.delete(`/inventory/${resource}/${id}/`);
      return response.data;
    },
  };
};
