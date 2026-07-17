import axiosInstance from "../axiosInstance";

const globalSearchService = {
  async search(query, { limit = 5 } = {}) {
    const response = await axiosInstance.get("/search/", {
      params: { q: query, limit },
    });
    return {
      query: response.data?.query || query,
      results: Array.isArray(response.data?.results) ? response.data.results : [],
    };
  },
};

export default globalSearchService;
