import axiosInstance from "../axiosInstance";
import { createMasterService } from "../masterServiceFactory";

const categoryService = {
  ...createMasterService("categories"),
  async applyCoaDefaults(id) {
    const response = await axiosInstance.post(
      `/inventory/categories/${id}/apply-coa-defaults/`
    );
    return response.data;
  },
};
export default categoryService;
